// Turns ordered screenshots into a silent video that reads like one long page. The walkthrough
// director finds screens by following vertical scroll and does not reliably see a cut between two
// similar dark screens, so the screenshots are stacked and each move is a scroll of at least
// most of a screen, followed by a hold long enough to become one spoken stop.
import { WebmWriter } from "./webm";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const HOLD_SECONDS = 2.6;
const SCROLL_SECONDS = 1;
const MAX_SCREENS_PER_IMAGE = 6;
// The director counts a new screen after most of a screen (0.8) has scrolled by, and stops
// waiting for a hold once more than a full screen has passed. Every scroll moves 0.9 of the
// frame: the picture sits in a window between two thin bars, and screens are one window apart.
const BAND = Math.round(HEIGHT * 0.05);
const PITCH = HEIGHT - 2 * BAND;
export const MAX_SCREENSHOTS = 36;
export const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function validateScreenshot(file: File) {
  if (!IMAGE_TYPES.includes(file.type))
    throw new Error(`${file.name} is not a PNG, JPEG or WebP image.`);
  if (file.size > MAX_SCREENSHOT_BYTES)
    throw new Error(`${file.name} is larger than 25 MB.`);
}

export function orderScreenshots(files: File[]) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...files].sort((a, b) => collator.compare(a.name, b.name));
}

/** One screenshot placed in the strip: `top` is where its slot starts, `x`/`y` place the image inside it. */
type Slot = { image: ImageBitmap; top: number; height: number; x: number; y: number; width: number; drawnHeight: number };
type Segment = { from: number; to: number; seconds: number };

function strip(images: ImageBitmap[]) {
  const slots: Slot[] = [];
  const stops: number[] = [];
  let top = 0;
  for (const image of images) {
    const fitWidth = WIDTH / image.width;
    const extra = Math.min(
      MAX_SCREENS_PER_IMAGE - 1,
      Math.floor((image.height * fitWidth - PITCH) / PITCH),
    );
    if (extra > 0) {
      // A full-page capture is sized to a whole number of screens so every scroll is exactly one pitch.
      const height = PITCH * (extra + 1);
      const width = image.width * (height / image.height);
      slots.push({ image, top, height, x: (WIDTH - width) / 2, y: 0, width, drawnHeight: height });
      for (let n = 0; n <= extra; n++) stops.push(top + n * PITCH);
      top += height;
    } else {
      const scale = Math.min(fitWidth, PITCH / image.height);
      const width = image.width * scale;
      const drawnHeight = image.height * scale;
      slots.push({ image, top, height: PITCH, x: (WIDTH - width) / 2, y: (PITCH - drawnHeight) / 2, width, drawnHeight });
      stops.push(top);
      top += PITCH;
    }
  }
  const segments: Segment[] = [];
  stops.forEach((stop, index) => {
    if (index) segments.push({ from: stops[index - 1], to: stop, seconds: SCROLL_SECONDS });
    segments.push({ from: stop, to: stop, seconds: HOLD_SECONDS });
  });
  return { slots, segments };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function offsetAt(segments: Segment[], time: number) {
  for (const segment of segments) {
    if (time <= segment.seconds) {
      const t = segment.from === segment.to ? 0 : ease(time / segment.seconds);
      return Math.round(segment.from + (segment.to - segment.from) * t);
    }
    time -= segment.seconds;
  }
  return segments.at(-1)?.to ?? 0;
}

function recorderType() {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function")
    return undefined;
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
}

async function encoderConfig() {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  for (const codec of ["vp09.00.40.08", "vp8"]) {
    const config: VideoEncoderConfig = { codec, width: WIDTH, height: HEIGHT, bitrate: 6_000_000, framerate: FPS };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    } catch {
      // An unknown codec string can throw instead of reporting unsupported.
    }
  }
  return null;
}

type Render = {
  canvas: HTMLCanvasElement;
  draw: (offset: number) => void;
  segments: Segment[];
  total: number;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
};

const stopped = () => new DOMException("Stopped", "AbortError");

// Encodes frame by frame with exact timestamps, so a hidden tab's throttled timers cannot drop frames.
async function encode(config: VideoEncoderConfig, { canvas, draw, segments, total, signal, onProgress }: Render) {
  const writer = new WebmWriter(config.codec.startsWith("vp09") ? "V_VP9" : "V_VP8", WIDTH, HEIGHT);
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk) => writer.add(chunk),
    error: (error) => (failure = error),
  });
  encoder.configure(config);
  const dequeues = "ondequeue" in VideoEncoder.prototype;
  const frames = Math.ceil(total * FPS);
  try {
    for (let index = 0; index < frames; index++) {
      if (signal?.aborted) throw stopped();
      if (failure) throw failure;
      draw(offsetAt(segments, index / FPS));
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((index * 1_000_000) / FPS),
        duration: Math.round(1_000_000 / FPS),
      });
      encoder.encode(frame, { keyFrame: index % (FPS * 2) === 0 });
      frame.close();
      if (encoder.encodeQueueSize > 4) {
        if (dequeues)
          await new Promise((resolve) => encoder.addEventListener("dequeue", resolve, { once: true }));
        else await encoder.flush();
      }
      if (index % FPS === FPS - 1) onProgress?.(Math.min(99, Math.round((index / frames) * 100)));
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  return writer.finish(total * 1000);
}

async function record(type: string, { canvas, draw, segments, total, signal, onProgress }: Render) {
  draw(0);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const ended = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  try {
    recorder.start(1000);
    const started = performance.now();
    await new Promise<void>((resolve, reject) => {
      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer);
          reject(stopped());
          return;
        }
        const elapsed = (performance.now() - started) / 1000;
        onProgress?.(Math.min(99, Math.round((elapsed / total) * 100)));
        if (elapsed >= total) {
          clearInterval(timer);
          resolve();
          return;
        }
        draw(offsetAt(segments, elapsed));
      }, 1000 / FPS);
    });
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    await ended;
    stream.getTracks().forEach((track) => track.stop());
  }
  return new Blob(chunks, { type: type.split(";")[0] });
}

export async function screenshotsVideo(
  files: File[],
  {
    signal,
    onProgress,
  }: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {},
): Promise<File> {
  if (!files.length) throw new Error("Add at least one screenshot.");
  if (files.length > MAX_SCREENSHOTS)
    throw new Error(`Use up to ${MAX_SCREENSHOTS} screenshots in one walkthrough.`);
  const config = await encoderConfig();
  const type = config ? undefined : recorderType();
  if (!config && !type)
    throw new Error("This browser cannot turn screenshots into a video. Use Chrome, Edge or Firefox.");
  const images: ImageBitmap[] = [];
  for (const file of files) {
    validateScreenshot(file);
    try {
      images.push(await createImageBitmap(file));
    } catch {
      images.forEach((image) => image.close());
      throw new Error(`${file.name} could not be opened as an image.`);
    }
  }
  const { slots, segments } = strip(images);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    images.forEach((image) => image.close());
    throw new Error("This browser cannot draw the screenshots.");
  }
  const backdrop =
    getComputedStyle(document.documentElement).getPropertyValue("--bg-page").trim() || "black";
  const draw = (offset: number) => {
    context.fillStyle = backdrop;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.save();
    context.beginPath();
    context.rect(0, BAND, WIDTH, PITCH);
    context.clip();
    for (const slot of slots)
      if (slot.top < offset + PITCH && slot.top + slot.height > offset)
        context.drawImage(slot.image, slot.x, BAND + slot.top - offset + slot.y, slot.width, slot.drawnHeight);
    context.restore();
  };
  const total = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  const render: Render = { canvas, draw, segments, total, signal, onProgress };
  let video: Blob;
  try {
    video = config ? await encode(config, render) : await record(type!, render);
  } finally {
    images.forEach((image) => image.close());
  }
  onProgress?.(100);
  const extension = video.type === "video/mp4" ? "mp4" : "webm";
  return new File([video], `Screenshots ${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, {
    type: video.type,
  });
}
