const POSTER_WIDTH = 960;
const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 18;

function once(target: HTMLVideoElement, event: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer);
      target.removeEventListener(event, ok);
      target.removeEventListener("error", failed);
      if (error) reject(error);
      else resolve();
    };
    const ok = () => done();
    const failed = () => done(new Error("The video could not be read."));
    const timer = setTimeout(
      () => done(new Error(`The video did not respond (${event}).`)),
      ms,
    );
    target.addEventListener(event, ok);
    target.addEventListener("error", failed);
  });
}

async function seek(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.01) return;
  const seeked = once(video, "seeked", 20000);
  video.currentTime = time;
  await seeked;
}

// MediaRecorder WebM files have no duration in their header until the end is read.
async function knownDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration)) return video.duration;
  try {
    const changed = once(video, "durationchange", 15000);
    video.currentTime = Number.MAX_SAFE_INTEGER;
    await changed;
  } catch {
    return 0;
  }
  return Number.isFinite(video.duration) ? video.duration : 0;
}

// Opening screens are often black or a single flat colour while a tab is picked.
function looksBlank(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const pixels = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
  let sum = 0;
  let squares = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    const luma =
      0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    sum += luma;
    squares += luma * luma;
  }
  const mean = sum / count;
  const spread = Math.sqrt(Math.max(0, squares / count - mean * mean));
  return mean < 12 || spread < 6;
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}

/** Full-width JPEG stills of a remote video at the given times; a time that cannot be read yields null. */
export async function stills(
  url: string,
  times: number[],
  onEach?: (done: number) => void,
): Promise<(Blob | null)[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  try {
    const loaded = once(video, "loadeddata", 30000);
    video.src = url;
    await loaded;
    const width = Math.min(1920, video.videoWidth);
    const height = Math.round((width * video.videoHeight) / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context || !width) throw new Error("This browser cannot draw the video.");
    const end = Number.isFinite(video.duration) ? video.duration - 0.1 : Infinity;
    const out: (Blob | null)[] = [];
    for (const [index, time] of times.entries()) {
      try {
        await seek(video, Math.max(0, Math.min(time, end)));
        context.drawImage(video, 0, 0, width, height);
        out.push(await encode(canvas, "image/jpeg", 0.86));
      } catch {
        out.push(null);
      }
      onEach?.(index + 1);
    }
    return out;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

/** Draws one representative frame of a video into a small WebP (JPEG where WebP encoding is missing). */
export async function posterFrame(source: Blob | string): Promise<Blob> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const remote = typeof source === "string";
  if (remote) video.crossOrigin = "anonymous";
  const url = remote ? source : URL.createObjectURL(source);
  try {
    const loaded = once(video, "loadeddata", 30000);
    video.src = url;
    await loaded;
    if (!video.videoWidth || !video.videoHeight)
      throw new Error("The recording has no picture.");
    const duration = await knownDuration(video);
    const candidates = duration
      ? [
          Math.min(Math.max(duration * 0.08, 0.5), 6),
          Math.min(duration * 0.3, 30),
          duration * 0.5,
        ]
      : [0.5];
    for (const [index, time] of candidates.entries()) {
      await seek(video, Math.min(time, Math.max(duration - 0.1, 0)));
      if (index === candidates.length - 1 || !looksBlank(video)) break;
    }
    const width = Math.min(POSTER_WIDTH, video.videoWidth);
    const height = Math.round((width * video.videoHeight) / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot draw a thumbnail.");
    context.drawImage(video, 0, 0, width, height);
    const webp = await encode(canvas, "image/webp", 0.82);
    if (webp?.type === "image/webp") return webp;
    const jpeg = await encode(canvas, "image/jpeg", 0.84);
    if (!jpeg) throw new Error("This browser cannot encode a thumbnail.");
    return jpeg;
  } finally {
    video.removeAttribute("src");
    video.load();
    if (!remote) URL.revokeObjectURL(url);
  }
}
