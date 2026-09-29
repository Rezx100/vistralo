// Minimal WebM writer for one video track of WebCodecs chunks. Sizes and positions are written at a
// fixed width so the seek head and cues can be laid out before the clusters are placed.
type Part = Uint8Array;

const bytes = (value: number, length: number) => {
  const out = new Uint8Array(length);
  for (let index = length - 1; index >= 0; index--) {
    out[index] = value % 256;
    value = Math.floor(value / 256);
  }
  return out;
};
const byteWidth = (value: number) => {
  let length = 1;
  while (value >= 256 ** length) length++;
  return length;
};
const size = (parts: Part[]) => parts.reduce((sum, part) => sum + part.length, 0);
const idBytes = (id: number) => bytes(id, byteWidth(id));

function element(id: number, parts: Part[]): Part[] {
  const length = bytes(size(parts), 8);
  length[0] = 0x01;
  return [idBytes(id), length, ...parts];
}
const uint = (id: number, value: number) => element(id, [bytes(value, byteWidth(value))]);
const fixed = (id: number, value: number) => element(id, [bytes(value, 8)]);
const text = (id: number, value: string) => element(id, [new TextEncoder().encode(value)]);
const float = (id: number, value: number) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value);
  return element(id, [out]);
};

const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TRACKS = 0x1654ae6b;
const CLUSTER = 0x1f43b675;
const CUES = 0x1c53bb6b;
// Blocks store a signed 16-bit offset from their cluster's time.
const MAX_CLUSTER_MS = 30_000;

export class WebmWriter {
  private clusters: { time: number; parts: Part[] }[] = [];

  constructor(
    private codec: "V_VP9" | "V_VP8",
    private width: number,
    private height: number,
  ) {}

  add(chunk: EncodedVideoChunk) {
    const time = Math.round(chunk.timestamp / 1000);
    const key = chunk.type === "key";
    let cluster = this.clusters.at(-1);
    if (!cluster || key || time - cluster.time > MAX_CLUSTER_MS) {
      cluster = { time, parts: [] };
      this.clusters.push(cluster);
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const offset = time - cluster.time;
    const header = new Uint8Array([0x81, (offset >> 8) & 0xff, offset & 0xff, key ? 0x80 : 0]);
    cluster.parts.push(...element(0xa3, [header, data]));
  }

  finish(durationMs: number) {
    const info = element(INFO, [
      ...uint(0x2ad7b1, 1_000_000),
      ...text(0x4d80, "Vistralo"),
      ...text(0x5741, "Vistralo"),
      ...float(0x4489, durationMs),
    ]);
    const tracks = element(
      TRACKS,
      element(0xae, [
        ...uint(0xd7, 1),
        ...uint(0x73c5, 1),
        ...uint(0x83, 1),
        ...text(0x86, this.codec),
        ...element(0xe0, [...uint(0xb0, this.width), ...uint(0xba, this.height)]),
      ]),
    );
    const clusters = this.clusters.map((cluster) =>
      element(CLUSTER, [...uint(0xe7, cluster.time), ...cluster.parts]),
    );
    const seekHead = (positions: number[]) =>
      element(
        0x114d9b74,
        [INFO, TRACKS, CUES].flatMap((id, index) =>
          element(0x4dbb, [...element(0x53ab, [idBytes(id)]), ...fixed(0x53ac, positions[index])]),
        ),
      );
    const infoAt = size(seekHead([0, 0, 0]));
    const tracksAt = infoAt + size(info);
    let position = tracksAt + size(tracks);
    const clusterAt = clusters.map((cluster) => {
      const at = position;
      position += size(cluster);
      return at;
    });
    const cues = element(
      CUES,
      this.clusters.flatMap((cluster, index) =>
        element(0xbb, [
          ...uint(0xb3, cluster.time),
          ...element(0xb7, [...uint(0xf7, 1), ...fixed(0xf1, clusterAt[index])]),
        ]),
      ),
    );
    const header = element(0x1a45dfa3, [
      ...uint(0x4286, 1),
      ...uint(0x42f7, 1),
      ...uint(0x42f2, 4),
      ...uint(0x42f3, 8),
      ...text(0x4282, "webm"),
      ...uint(0x4287, 4),
      ...uint(0x4285, 2),
    ]);
    const segment = element(SEGMENT, [
      ...seekHead([infoAt, tracksAt, position]),
      ...info,
      ...tracks,
      ...clusters.flat(),
      ...cues,
    ]);
    return new Blob([...header, ...segment] as BlobPart[], { type: "video/webm" });
  }
}
