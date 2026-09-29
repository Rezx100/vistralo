/** A part of the captured surface, as fractions of its width and height. */
export interface CaptureArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DisplaySurface = "monitor" | "window" | "browser" | "";

/** Layout of this browser window around the moment sharing starts. */
export interface SharingBarWindow {
  outerWidth: number;
  outerHeight: number;
  /** Viewport height before the sharing bar appeared. */
  innerBefore: number;
  /** Viewport height after the sharing bar appeared. */
  innerAfter: number;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  availLeft: number;
  availTop: number;
  devicePixelRatio: number;
}

const globals = globalThis as any;

export const areaCaptureSupported =
  typeof globals.MediaStreamTrackProcessor === "function" &&
  typeof globals.MediaStreamTrackGenerator === "function" &&
  typeof globals.VideoFrame === "function";

export const floatingControlsSupported =
  typeof window !== "undefined" && "documentPictureInPicture" in window;

/** Video encoders and 4:2:0 frames need even offsets and sizes. */
export function areaPixels(area: CaptureArea, width: number, height: number) {
  const even = (value: number) => Math.floor(value / 2) * 2;
  const x = even(area.x * width);
  const y = even(area.y * height);
  return {
    x,
    y,
    width: Math.max(2, even(Math.min(area.width * width, width - x))),
    height: Math.max(2, even(Math.min(area.height * height, height - y))),
  };
}

/**
 * Crops every frame of a live video track. Frames are cropped as they arrive,
 * not on a timer, so capture keeps full frame rate while this tab is hidden.
 */
export function cropVideoTrack(source: MediaStreamTrack, area: CaptureArea) {
  const processor = new globals.MediaStreamTrackProcessor({ track: source });
  const generator: MediaStreamTrack & { writable: WritableStream } =
    new globals.MediaStreamTrackGenerator({ kind: "video" });
  const abort = new AbortController();
  // Not VideoFrame's visibleRect: Chrome's MediaRecorder encodes frames with an
  // offset visible rectangle as solid black.
  const canvas = new OffscreenCanvas(2, 2);
  const context = canvas.getContext("2d", { alpha: false })!;
  const transform = new TransformStream<any, any>({
    transform(frame, controller) {
      const rect = areaPixels(area, frame.displayWidth, frame.displayHeight);
      try {
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
        context.drawImage(
          frame,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          rect.width,
          rect.height,
        );
        controller.enqueue(
          new globals.VideoFrame(canvas, {
            timestamp: frame.timestamp,
            ...(frame.duration ? { duration: frame.duration } : {}),
          }),
        );
      } finally {
        frame.close();
      }
    },
  });
  processor.readable
    .pipeThrough(transform, { signal: abort.signal })
    .pipeTo(generator.writable, { signal: abort.signal })
    .catch(() => {});
  source.addEventListener("ended", () => generator.stop(), { once: true });
  return {
    track: generator as MediaStreamTrack,
    stop() {
      abort.abort();
      generator.stop();
    },
  };
}

function closeTo(actual: number, expected: number) {
  return Math.abs(actual - expected) <= Math.max(24, Math.abs(expected) * 0.02);
}

/**
 * Where Chrome's "Stop sharing" bar sits inside a captured frame.
 * The bar is browser chrome: it shrinks this window's viewport when sharing
 * starts. A shared tab records the page below the bar. A shared window or
 * screen records the bar itself, so the caller cuts that band out.
 */
export function sharingBarPixels(
  surface: DisplaySurface,
  frameWidth: number,
  frameHeight: number,
  metrics: SharingBarWindow,
): { y: number; height: number } | null {
  if (surface !== "monitor" && surface !== "window" && surface !== "browser") return null;
  if (!(frameWidth >= 2 && frameHeight >= 2)) return null;
  const barCss = metrics.innerBefore - metrics.innerAfter;
  // One toolbar row. Ignore noise and unrelated chrome such as devtools.
  if (barCss < 24 || barCss > 96) return null;
  const dpr = metrics.devicePixelRatio > 0 ? metrics.devicePixelRatio : 1;
  const barPx = barCss * dpr;
  let y = 0;
  let height = barPx;

  if (surface === "browser") {
    const page = metrics.innerAfter * dpr;
    const withBar = metrics.innerBefore * dpr;
    const extra = frameHeight - page;
    // The tab capture is the page. Crop only when the frame still contains the bar.
    if (closeTo(frameHeight, page)) return null;
    if (!closeTo(frameHeight, withBar) && (extra < barPx * 0.65 || extra > barPx + 8)) return null;
    y = 0;
    height = closeTo(frameHeight, withBar) ? barPx : extra;
  } else if (surface === "window") {
    if (
      !closeTo(frameWidth, metrics.outerWidth * dpr) ||
      !closeTo(frameHeight, metrics.outerHeight * dpr)
    )
      return null;
    const scale = frameWidth / metrics.outerWidth;
    y = (metrics.outerHeight - metrics.innerBefore) * scale;
    height = barCss * scale;
  } else {
    if (
      !closeTo(frameWidth, metrics.screenWidth * dpr) ||
      !closeTo(frameHeight, metrics.screenHeight * dpr)
    )
      return null;
    const localX = metrics.screenX - metrics.availLeft;
    const localY = metrics.screenY - metrics.availTop;
    const spans =
      metrics.outerWidth >= metrics.screenWidth * 0.85 && localX <= 16 && localX >= -16;
    if (!spans) return null;
    const scale = frameWidth / metrics.screenWidth;
    y = (localY + metrics.outerHeight - metrics.innerBefore) * scale;
    height = barCss * scale;
  }

  if (height > frameHeight * 0.2 || height < 2 || y > frameHeight) return null;
  if (y < 0) {
    height += y;
    y = 0;
  }
  if (y + height > frameHeight + 2) return null;
  const even = (value: number) => Math.floor(Math.max(0, value) / 2) * 2;
  const top = even(y);
  const bottom = even(Math.min(frameHeight, y + height));
  const cut = bottom - top;
  const remain = even(frameHeight - cut);
  if (cut < 2 || remain < 2) return null;
  return { y: top, height: cut };
}

/** Drops a full-width horizontal band and joins the picture above and below it. */
export function dropHorizontalBand(
  source: MediaStreamTrack,
  band: { y: number; height: number; frameHeight: number },
) {
  const processor = new globals.MediaStreamTrackProcessor({ track: source });
  const generator: MediaStreamTrack & { writable: WritableStream } =
    new globals.MediaStreamTrackGenerator({ kind: "video" });
  if ("contentHint" in generator) generator.contentHint = "detail";
  const abort = new AbortController();
  const canvas = new OffscreenCanvas(2, 2);
  const context = canvas.getContext("2d", { alpha: false })!;
  const even = (value: number) => Math.floor(value / 2) * 2;
  const transform = new TransformStream<any, any>({
    transform(frame, controller) {
      const width = even(frame.displayWidth);
      const height = frame.displayHeight;
      const scale = band.frameHeight > 0 ? height / band.frameHeight : 1;
      const top = Math.min(even(band.y * scale), even(height));
      const cut = Math.min(even(band.height * scale), even(height - top));
      const outHeight = even(height - cut);
      if (width < 2 || cut < 2 || outHeight < 2 || top >= height) {
        controller.enqueue(frame);
        return;
      }
      try {
        if (canvas.width !== width || canvas.height !== outHeight) {
          canvas.width = width;
          canvas.height = outHeight;
        }
        if (top > 0)
          context.drawImage(frame, 0, 0, width, top, 0, 0, width, top);
        const below = height - top - cut;
        if (below > 0)
          context.drawImage(frame, 0, top + cut, width, below, 0, top, width, below);
        controller.enqueue(
          new globals.VideoFrame(canvas, {
            timestamp: frame.timestamp,
            ...(frame.duration ? { duration: frame.duration } : {}),
          }),
        );
      } finally {
        frame.close();
      }
    },
  });
  processor.readable
    .pipeThrough(transform, { signal: abort.signal })
    .pipeTo(generator.writable, { signal: abort.signal })
    .catch(() => {});
  source.addEventListener("ended", () => generator.stop(), { once: true });
  return {
    track: generator as MediaStreamTrack,
    stop() {
      abort.abort();
      generator.stop();
    },
  };
}

async function viewportAfterShare(before: number) {
  const started = performance.now();
  let height = window.innerHeight;
  let stable = 0;
  while (performance.now() - started < 400) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const next = window.innerHeight;
    stable = next === height ? stable + 1 : 0;
    height = next;
    const elapsed = performance.now() - started;
    if (height !== before && stable >= 2) break;
    if (height === before && elapsed > 160 && stable >= 2) break;
  }
  return height;
}

/**
 * Asks for a capture with the picker opened on Chrome Tab where supported.
 * `focusTab` switches to a shared tab right away; off keeps Vistralo in front.
 */
export async function chooseDisplay(withTabAudio: boolean, focusTab = true) {
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  const layout = {
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    innerBefore: window.innerHeight,
    screenX: window.screenX,
    screenY: window.screenY,
    screenWidth: screen.width,
    screenHeight: screen.height,
    availLeft: screen.availLeft ?? 0,
    availTop: screen.availTop ?? 0,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
  const Controller = globals.CaptureController;
  const controller = typeof Controller === "function" ? new Controller() : null;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30, displaySurface: "browser" },
    audio: withTabAudio,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "include",
    ...(controller ? { controller } : {}),
  } as DisplayMediaStreamOptions);
  const track = stream.getVideoTracks()[0];
  const settings = (track?.getSettings() ?? {}) as MediaTrackSettings & {
    displaySurface?: DisplaySurface;
  };
  // Must run in the same task the picker resolves in. A tab recorded whole
  // starts at once, so the user goes straight to it; everything else stays on
  // Vistralo so the user can pick an area and press Start.
  try {
    controller?.setFocusBehavior(
      settings.displaySurface === "browser" && focusTab
        ? "focus-captured-surface"
        : "no-focus-change",
    );
  } catch {
    /* Entire-screen captures have no focus behavior to set. */
  }
  const surface = (settings.displaySurface ?? "") as DisplaySurface;
  const frameWidth = settings.width ?? 0;
  const frameHeight = settings.height ?? 0;
  const innerAfter = await viewportAfterShare(layout.innerBefore);
  const band =
    track && frameWidth > 0 && frameHeight > 0
      ? sharingBarPixels(surface, frameWidth, frameHeight, { ...layout, innerAfter })
      : null;
  let released = false;
  let release = () => {
    if (released) return;
    released = true;
    if (track && track.readyState === "live") track.stop();
  };
  let height = frameHeight;
  if (band && track && areaCaptureSupported) {
    const dropped = dropHorizontalBand(track, { ...band, frameHeight });
    stream.removeTrack(track);
    stream.addTrack(dropped.track);
    const stopBand = dropped.stop;
    release = () => {
      if (released) return;
      released = true;
      stopBand();
      if (track.readyState === "live") track.stop();
    };
    height = Math.floor((frameHeight - band.height) / 2) * 2;
  }
  return {
    stream,
    captureTrack: track ?? null,
    release,
    surface,
    width: frameWidth,
    height,
  };
}

/**
 * Opens an always-on-top window for recording controls. Needs a user gesture,
 * so call it first in a click handler, before any other await.
 */
export async function openFloatingWindow(width: number, height: number) {
  const api = globals.documentPictureInPicture;
  if (!api) return null;
  const floating: Window = await api.requestWindow({ width, height });
  const doc = floating.document;
  const base = doc.createElement("base");
  base.href = window.location.origin + "/";
  doc.head.append(base);
  // The window inherits the page's CSP (style-src 'self'), which blocks inline <style>.
  const loads: Promise<unknown>[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      loads.push(
        new Promise((done) => {
          link.onload = link.onerror = done;
        }),
      );
      doc.head.append(link);
      continue;
    }
    try {
      const style = doc.createElement("style");
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      doc.head.append(style);
    } catch {
      // Unreadable inline sheet; nothing to copy.
    }
  }
  await Promise.race([Promise.all(loads), new Promise((done) => setTimeout(done, 1500))]);
  for (const name of ["data-theme", "dir", "lang"]) {
    const value = document.documentElement.getAttribute(name);
    if (value) doc.documentElement.setAttribute(name, value);
  }
  doc.title = "Vistralo recording";
  doc.body.className = "floating-tray-body";
  const mount = doc.createElement("div");
  mount.id = "floating-tray";
  doc.body.append(mount);
  return floating;
}

/**
 * Turns the floating window into a "go back" prompt after recording stops while
 * the user is on another tab. Built without React so it outlives the recorder
 * sheet, which closes once the recording is saved. A click inside the floating
 * window counts as a click on Vistralo, so the button may focus this tab.
 */
export function showReturnPrompt(floating: Window) {
  if (floating.closed) return;
  const doc = floating.document;
  doc.getElementById("floating-tray")?.remove();
  const tray = doc.createElement("div");
  tray.className = "rec-tray is-floating is-done";
  tray.setAttribute("role", "status");
  const status = doc.createElement("p");
  status.className = "rec-status";
  const dot = doc.createElement("span");
  dot.className = "rec-dot";
  dot.setAttribute("aria-hidden", "true");
  const text = doc.createElement("span");
  text.textContent = "Recording stopped";
  status.append(dot, text);
  const back = doc.createElement("button");
  back.type = "button";
  back.className = "rec-return";
  back.textContent = "Back to Vistralo";
  const close = () => {
    document.removeEventListener("visibilitychange", visible);
    if (!floating.closed) floating.close();
  };
  const visible = () => {
    if (document.visibilityState === "visible") close();
  };
  back.addEventListener("click", () => {
    window.focus();
    close();
  });
  document.addEventListener("visibilitychange", visible);
  tray.append(status, back);
  doc.body.append(tray);
  back.focus();
}
