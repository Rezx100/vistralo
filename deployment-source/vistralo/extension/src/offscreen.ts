// The recording engine, in Chrome's offscreen document. It owns every stream and the
// MediaRecorder and writes each second of video to IndexedDB as it arrives. Offscreen documents
// may use only chrome.runtime, so the session snapshot is sent to the service worker to store.
import { isEngineRequest, senderKind, type ControlAction, type EngineRequest, type StartOptions } from "./messages";
import { elapsed, reduce, type SessionEvent, type Snapshot } from "./session";
import { deleteSession, dropChunks, getSession, putChunk, putSession, type StoredSession } from "./store";

const COUNTDOWN_MS = 3000;
const SLICE_MS = 1000;
const STOP_GRACE_MS = 4000;
const OWN_ORIGIN = chrome.runtime.getURL("");

let snapshot: Snapshot | null = null;
let options: StartOptions | null = null;
let media: {
  video: MediaStream;
  microphone: MediaStream | null;
  context: AudioContext | null;
  recorded: MediaStream;
  /** Silences the microphone in the recording without stopping it. */
  micGain: GainNode | null;
  /** Reads the microphone before the mute, so the meter still shows speech while muted. */
  micLevel: AnalyserNode | null;
} | null = null;
let meter: ReturnType<typeof setInterval> | undefined;
let recorder: MediaRecorder | null = null;
let intent: "save" | "restart" | "cancel" = "save";
let writes: Promise<unknown> = Promise.resolve();
let writeFailed: Error | null = null;
let cancelCount: (() => void) | null = null;
let finishTake: (() => void) | null = null;

const now = () => Date.now();
const toBackground = (message: object) => chrome.runtime.sendMessage({ to: "background", ...message }).catch(() => {});

/** Applies an event and hands the new snapshot to the service worker, which stores it for everyone else. */
async function apply(event: SessionEvent) {
  if (!snapshot) return false;
  const next = reduce(snapshot, event);
  if (!next) return false;
  snapshot = next;
  await toBackground({ type: "snapshot", snapshot: next });
  return true;
}

export function recorderMime(withAudio: boolean, supported: (type: string) => boolean) {
  const types = withAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find(supported) ?? "";
}

const exactDevice = (id: string | null) => (id && id !== "default" ? { deviceId: { exact: id } } : {});

async function source(request: Extract<EngineRequest, { type: "begin" }>): Promise<MediaStream> {
  const opts = request.options;
  if (opts.mode === "camera")
    return navigator.mediaDevices.getUserMedia({
      video: { ...exactDevice(opts.camera), width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: false,
    });
  if (opts.mode === "tab") {
    if (!request.streamId) throw new Error("Chrome did not hand over the tab to record.");
    const mandatory = { chromeMediaSource: "tab", chromeMediaSourceId: request.streamId };
    // Size limits in the legacy "mandatory" block make Chrome 155 refuse the tab ("Requested
    // device not found"), so the tab is asked for plainly and limited once it is open.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { mandatory } as MediaTrackConstraints,
      audio: opts.systemAudio ? ({ mandatory } as MediaTrackConstraints) : false,
    });
    // 1080p at 30 frames at most, never upscaled: a smaller tab records at its own size.
    await stream
      .getVideoTracks()[0]
      ?.applyConstraints({ width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } })
      .catch(() => {});
    return stream;
  }
  // Chrome's own chooser: a tab, a window or a whole screen, with system sound where it offers it.
  return navigator.mediaDevices.getDisplayMedia({
    video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { ideal: 30, max: 30 } },
    audio: opts.systemAudio,
    systemAudio: opts.systemAudio ? "include" : "exclude",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    monitorTypeSurfaces: "include",
  } as DisplayMediaStreamOptions);
}

async function acquire(request: Extract<EngineRequest, { type: "begin" }>) {
  const opts = request.options;
  const video = await source(request);
  let microphone: MediaStream | null = null;
  if (opts.microphone !== null) {
    try {
      microphone = await navigator.mediaDevices.getUserMedia({
        audio: { ...exactDevice(opts.microphone), echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (failure) {
      video.getTracks().forEach((t) => t.stop());
      throw new Error(
        failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "Vistralo is not allowed to use the microphone. Open Vistralo's setup page from the popup to allow it, or record without the microphone."
          : "The microphone could not be started. Choose another microphone, or record without it.",
      );
    }
  }
  const sourceAudio = video.getAudioTracks();
  const micTrack = microphone?.getAudioTracks()[0] ?? null;
  let context: AudioContext | null = null;
  let micGain: GainNode | null = null;
  let micLevel: AnalyserNode | null = null;
  const recorded = new MediaStream(video.getVideoTracks());
  if (sourceAudio.length || micTrack) {
    context = new AudioContext();
    const mix = context.createMediaStreamDestination();
    if (sourceAudio.length) {
      const sound = context.createMediaStreamSource(new MediaStream(sourceAudio));
      sound.connect(mix);
      // Capturing a tab silences it for the person recording; play it back so they still hear it.
      // A window's or screen's system sound is not silenced, so playing it back would double it.
      if (opts.mode === "tab") sound.connect(context.destination);
    }
    // The microphone is mixed in but never played back, so the person does not hear themselves.
    if (micTrack) {
      const voice = context.createMediaStreamSource(new MediaStream([micTrack]));
      micGain = context.createGain();
      micLevel = context.createAnalyser();
      micLevel.fftSize = 1024;
      voice.connect(micLevel);
      voice.connect(micGain).connect(mix);
    }
    recorded.addTrack(mix.stream.getAudioTracks()[0]);
    if (context.state === "suspended") await context.resume().catch(() => {});
  }
  return { video, microphone, context, recorded, micGain, micLevel };
}

/** Sends the microphone's level ten times a second to the popup and the page bar's meter frame. */
function startMeter() {
  clearInterval(meter);
  const analyser = media?.micLevel;
  if (!analyser) return;
  const samples = new Uint8Array(analyser.fftSize);
  meter = setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) sum += ((value - 128) / 128) ** 2;
    const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
    void chrome.runtime.sendMessage({ to: "meter", level: Math.round(level * 100) / 100, muted: !!snapshot?.muted }).catch(() => {});
  }, 100);
}

function release() {
  clearInterval(meter);
  cancelCount?.();
  if (media) {
    for (const stream of [media.video, media.microphone, media.recorded]) stream?.getTracks().forEach((t) => t.stop());
    if (media.context && media.context.state !== "closed") void media.context.close();
  }
  media = null;
}

/**
 * Resolves once the source delivers its first frame, or after `ms`. A camera can take a few
 * seconds to warm up; a recorder started before then can stop with nothing in it. The frame is
 * read from a copy of the track: an offscreen document is never painted, so a <video> would not do.
 */
async function firstFrame(stream: MediaStream, ms: number) {
  const source = stream.getVideoTracks()[0];
  if (!source) return false;
  const copy = source.clone();
  const Processor = (globalThis as { MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<{ close(): void }> } }).MediaStreamTrackProcessor;
  if (!Processor) {
    copy.stop();
    return true;
  }
  const reader = new Processor({ track: copy }).readable.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const frame = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms))),
    ]);
    if (frame && !frame.done) frame.value.close();
    return !!frame && !frame.done;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    copy.stop();
  }
}

function countIn(ms: number) {
  return new Promise<boolean>((resolve) => {
    if (ms <= 0) return resolve(true);
    const timer = setTimeout(() => finish(true), ms);
    const finish = (go: boolean) => {
      clearTimeout(timer);
      cancelCount = null;
      resolve(go);
    };
    cancelCount = () => finish(false);
  });
}

function stored(mime: string): StoredSession {
  const s = snapshot!;
  return {
    id: s.id,
    mode: s.mode,
    created: new Date().toISOString(),
    take: s.take,
    mime,
    title: s.title,
    url: s.url,
    microphone: s.microphone,
    durationMs: 0,
    bytes: 0,
    state: "recording",
  };
}

/** Counts in, then records a take on the streams already open. */
async function recordTake() {
  if (!media || !snapshot) return;
  const countdown = options?.countdown ? COUNTDOWN_MS : 0;
  if (snapshot.phase === "requesting" && countdown) await apply({ type: "countdown", at: now(), countdownMs: countdown });
  if (!(await countIn(snapshot.countdownEndsAt ? Math.max(0, snapshot.countdownEndsAt - now()) : 0))) return;
  if (!media || !snapshot || !["countdown", "requesting"].includes(snapshot.phase)) return;
  const type = recorderMime(media.recorded.getAudioTracks().length > 0, (t) => MediaRecorder.isTypeSupported(t));
  const capture = new MediaRecorder(media.recorded, {
    ...(type ? { mimeType: type } : {}),
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 128_000,
  });
  recorder = capture;
  intent = "save";
  writeFailed = null;
  const take = snapshot.take;
  const id = snapshot.id;
  let seq = 0;
  let bytes = 0;
  await putSession(stored(capture.mimeType || type || "video/webm"));
  capture.ondataavailable = (event) => {
    if (!event.data.size) return;
    const n = seq++;
    bytes += event.data.size;
    const total = bytes;
    writes = writes
      .then(() => putChunk(id, take, n, event.data))
      // Every few seconds the stored session learns its length, so a take cut off by a crash
      // still shows roughly how long it is.
      .then(() => (n % 2 === 1 && snapshot ? updateProgress(id, take, total) : undefined))
      .then(() => apply({ type: "bytes", at: now(), bytes: total }))
      .catch((failure: unknown) => {
        writeFailed = failure instanceof Error ? failure : new Error(String(failure));
        // Storage is full or gone: stop now, keeping every second already written.
        if (capture.state !== "inactive") {
          void apply({ type: "stop", at: now() });
          end(capture);
        }
      });
  };
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    if (finishTake === done) finishTake = null;
    void afterStop(capture, take);
  };
  finishTake = done;
  capture.onstop = done;
  capture.onerror = () => {
    void apply({ type: "stop", at: now() });
    end(capture);
  };
  capture.start(SLICE_MS);
  await apply({ type: "started", at: now() });
}

async function updateProgress(id: string, take: number, bytes: number) {
  const kept = await getSession(id);
  if (kept && kept.take === take && kept.state === "recording")
    await putSession({ ...kept, durationMs: snapshot ? elapsed(snapshot, now()) : kept.durationMs, bytes });
}

/** Stops the recorder and ends the take even if Chrome never reports that it stopped. */
function end(capture: MediaRecorder) {
  const finish = finishTake;
  if (capture.state !== "inactive") capture.stop();
  if (finish) setTimeout(finish, STOP_GRACE_MS);
}

async function afterStop(capture: MediaRecorder, take: number) {
  await writes;
  if (recorder === capture) recorder = null;
  const id = snapshot!.id;
  if (intent === "restart") {
    await dropChunks(id, take + 1).catch(() => {});
    void recordTake();
    return;
  }
  if (intent === "cancel") {
    release();
    await deleteSession(id).catch(() => {});
    await apply({ type: "cancel", at: now() });
    await toBackground({ type: "finished", sessionId: id, open: false });
    return;
  }
  release();
  await apply({ type: "finalizing", at: now() });
  const kept = await getSession(id).catch(() => undefined);
  if (!kept) {
    await apply({ type: "fail", at: now(), error: "The recording could not be read back from this browser's storage." });
    await toBackground({ type: "finished", sessionId: id, open: false });
    return;
  }
  const s = snapshot!;
  if (!s.bytes) {
    // Nothing reached storage: an empty file would only look like a recording.
    await deleteSession(id).catch(() => {});
    await apply({ type: "fail", at: now(), error: "No video was captured. Try again; if it happens again, choose another camera or screen." });
    await toBackground({ type: "finished", sessionId: id, open: false });
    return;
  }
  const final: StoredSession = { ...kept, take, durationMs: s.elapsedMs, bytes: s.bytes, state: "complete" };
  await putSession(final);
  await dropChunks(id, take).catch(() => {});
  if (writeFailed)
    await apply({ type: "fail", at: now(), error: `The recording stopped early: ${writeFailed.message} Everything recorded until then is kept.` });
  else await apply({ type: "ready", at: now(), bytes: final.bytes });
  await toBackground({ type: "finished", sessionId: id, open: !!options?.openWhenDone && final.bytes > 0 && !writeFailed });
}

function control(action: ControlAction) {
  if (!snapshot) return;
  const capture = recorder;
  if (action === "cancel" && !capture && (snapshot.phase === "countdown" || snapshot.phase === "requesting")) {
    cancelCount?.();
    release();
    const id = snapshot.id;
    void deleteSession(id)
      .catch(() => {})
      .then(() => apply({ type: "cancel", at: now() }))
      .then(() => toBackground({ type: "finished", sessionId: id, open: false }));
    return;
  }
  if (action === "mute" || action === "unmute") {
    if (!media?.micGain) return;
    media.micGain.gain.value = action === "mute" ? 0 : 1;
    void apply({ type: action, at: now() });
    return;
  }
  if (!capture || capture.state === "inactive") return;
  if (action === "pause" && capture.state === "recording") {
    capture.pause();
    void apply({ type: "pause", at: now() });
  } else if (action === "resume" && capture.state === "paused") {
    capture.resume();
    void apply({ type: "resume", at: now() });
  } else if (action === "stop") {
    intent = "save";
    void apply({ type: "stop", at: now() });
    end(capture);
  } else if (action === "restart") {
    intent = "restart";
    void apply({ type: "restart", at: now(), countdownMs: options?.countdown ? COUNTDOWN_MS : 0 });
    end(capture);
  } else if (action === "cancel") {
    intent = "cancel";
    end(capture);
  }
}

async function begin(request: Extract<EngineRequest, { type: "begin" }>) {
  if (media || recorder) return;
  snapshot = request.snapshot;
  options = request.options;
  try {
    media = await acquire(request);
  } catch (failure) {
    const id = snapshot.id;
    const declined = failure instanceof DOMException && failure.name === "NotAllowedError";
    if (declined && request.options.mode === "screen") await apply({ type: "cancel", at: now() });
    else
      await apply({
        type: "fail",
        at: now(),
        error: declined
          ? "Chrome did not allow the recording. Allow Vistralo to use the camera, or choose what to share again."
          : failure instanceof Error
            ? failure.message
            : "The recording could not start.",
      });
    await toBackground({ type: "finished", sessionId: id, open: false });
    return;
  }
  media.video.getVideoTracks()[0]?.addEventListener("ended", () => {
    // The recorded tab closed, the shared window went away, or Chrome's "Stop sharing" was pressed.
    if (recorder && recorder.state !== "inactive") control("stop");
    else if (snapshot && (snapshot.phase === "countdown" || snapshot.phase === "requesting")) control("cancel");
  });
  media.microphone?.getAudioTracks()[0]?.addEventListener("ended", () => {
    if (snapshot && (snapshot.phase === "recording" || snapshot.phase === "paused"))
      void toBackground({ type: "snapshot", snapshot: { ...snapshot, error: "The microphone was disconnected. The rest of this recording has no voice.", updatedAt: now() } });
  });
  startMeter();
  // A camera can take seconds to warm up. A tab or screen sends its picture at once, and a still
  // page sends no second frame until something changes, so only the camera is waited for.
  if (request.options.mode === "camera" && !(await firstFrame(media.video, 8000)) && media) {
    const id = snapshot.id;
    release();
    await apply({ type: "fail", at: now(), error: "The camera or screen sent no picture. Check that no other app is using it, then try again." });
    await toBackground({ type: "finished", sessionId: id, open: false });
    return;
  }
  await recordTake();
}

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!isEngineRequest(message)) return false;
  if (senderKind(sender, chrome.runtime.id, OWN_ORIGIN) !== "extension") return false;
  if (message.type === "begin") void begin(message);
  else if (snapshot && message.sessionId === snapshot.id) control(message.action);
  return false;
});

// The service worker reads this to tell a live engine from one that lost its session.
(globalThis as { vistraloEngine?: () => Snapshot | null }).vistraloEngine = () =>
  snapshot ? { ...snapshot, elapsedMs: elapsed(snapshot, now()) } : null;
