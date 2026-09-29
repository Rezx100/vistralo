import React, { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  Project,
  ProjectSource,
  UploadProgress,
  WorkspaceAdapter,
} from "../contracts";
import {
  clearRecording,
  recoverRecording,
  stageRecording,
} from "./recording-store";
import {
  errorMessage,
  formatBytes,
  MAX_BROWSER_RECORDING_BYTES,
  publicWebsite,
  validateVideo,
} from "./flow-utils";
import {
  areaCaptureSupported,
  areaPixels,
  chooseDisplay,
  cropVideoTrack,
  floatingControlsSupported,
  openFloatingWindow,
  showReturnPrompt,
  type CaptureArea,
  type DisplaySurface,
} from "./capture";
import { AreaSelector, RecordingTray } from "./RecordingControls";
import { flowFor, type CreateFlow } from "./create-flows";
import {
  MAX_SCREENSHOTS,
  orderScreenshots,
  screenshotsVideo,
  validateScreenshot,
} from "../slideshow";
import { Icon } from "../components/Icon";
import {
  SheetHeader,
  SheetToggle,
  confirmDialog,
} from "../components/Primitives";
import "./features.css";

const DEFAULT_AREA: CaptureArea = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };

interface ChosenDisplay {
  stream: MediaStream;
  surface: DisplaySurface;
  width: number;
  height: number;
}

function liveMicTrack(microphone: MediaStream | null) {
  return microphone?.getAudioTracks().find((track) => track.readyState === "live" && track.enabled);
}

async function openMicrophone() {
  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video: false });
  } catch (failure) {
    if (failure instanceof DOMException && failure.name === "OverconstrainedError")
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    throw failure;
  }
}

function recorderMime(withMicrophone: boolean) {
  const types = withMicrophone
    ? ["video/webm;codecs=vp8,opus", "video/webm"]
    : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

function buildRecording(
  display: MediaStream,
  microphone: MediaStream | null,
  video: MediaStreamTrack[] = display.getVideoTracks(),
) {
  const mic = liveMicTrack(microphone);
  const recorded = new MediaStream();
  for (const track of video) recorded.addTrack(track);
  if (!mic) {
    for (const track of display.getAudioTracks()) recorded.addTrack(track);
    return {
      recorded,
      context: null as AudioContext | null,
      analyser: null as AnalyserNode | null,
      source: null as MediaStreamAudioSourceNode | null,
      gain: null as GainNode | null,
    };
  }
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: 48000 });
  } catch {
    context = new AudioContext();
  }
  const destination = context.createMediaStreamDestination();
  const source = context.createMediaStreamSource(new MediaStream([mic]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(analyser);
  analyser.connect(destination);
  source.connect(gain);
  gain.connect(context.destination);
  const audio = destination.stream.getAudioTracks()[0];
  if (audio) recorded.addTrack(audio);
  return { recorded, context, analyser, source, gain };
}

const flowIntro: Record<CreateFlow, string> = {
  "ai-walkthrough":
    "Share a screen, window or tab. When you stop, Vistralo pauses on every screen and explains it in an AI voice.",
  "talk-through":
    "Share a screen, window or tab and explain it as you go. Your voice is the narration.",
  section:
    "Share a screen, window or tab, then drag a box over the part you want. Everything outside it is left out.",
  "narrate-video":
    "Upload a screen recording. Vistralo pauses on every screen and explains it in an AI voice.",
  "narrate-screenshots":
    "Add screenshots in the order to explain them. A tall full-page capture is read one screen at a time.",
  website:
    "Capture a public website as a Visual brief with screenshots and observed behavior.",
};

function ShotThumb({
  file,
  index,
  disabled,
  onRemove,
}: {
  file: File;
  index: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <li className="shot-thumb">
      {src && <img src={src} alt="" loading="lazy" decoding="async" />}
      <span className="shot-index" aria-hidden="true">
        {index + 1}
      </span>
      <button
        type="button"
        className="icon-button shot-remove"
        aria-label={`Remove ${file.name}`}
        title={file.name}
        disabled={disabled}
        onClick={onRemove}
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}

interface Props {
  source: ProjectSource;
  flow?: CreateFlow;
  adapter: WorkspaceAdapter;
  onCreated: (project: Project) => void;
  onClose: () => void;
  notify: (message: string, error?: boolean) => void;
}

export function CreateProject({
  source,
  flow,
  adapter,
  onCreated,
  onClose,
  notify,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    displayStream = useRef<MediaStream | null>(null),
    microphoneStream = useRef<MediaStream | null>(null),
    audioContext = useRef<AudioContext | null>(null),
    micAnalyser = useRef<AnalyserNode | null>(null),
    micNodes = useRef<{ source: MediaStreamAudioSourceNode; gain: GainNode } | null>(null),
    spokenTake = useRef(false),
    captureStopping = useRef(false),
    crop = useRef<{ stop: () => void } | null>(null),
    captureRelease = useRef<(() => void) | null>(null),
    trayWindow = useRef<Window | null>(null),
    trayRoot = useRef<Root | null>(null),
    floatingWanted = useRef(false),
    starting = useRef(false),
    autoSave = useRef(false),
    phase = useRef("idle");
  const controller = useRef<AbortController | null>(null),
    created = useRef<Project | null>(null),
    mounted = useRef(true);
  const recordingStarted = useRef(0),
    elapsedBeforePause = useRef(0);
  const [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [file, setFile] = useState<File | null>(null);
  const [narrate, setNarrate] = useState(false),
    [voiceover, setVoiceover] = useState(true),
    [microphone, setMicrophone] = useState(
      flow !== "ai-walkthrough" && flow !== "section",
    ),
    [microphoneLive, setMicrophoneLive] = useState(false),
    [micLevel, setMicLevel] = useState(0),
    [spoken, setSpoken] = useState(false);
  const [mobile, setMobile] = useState(true),
    [busy, setBusy] = useState(false);
  const [requestingCapture, setRequestingCapture] = useState(false);
  const [recording, setRecording] = useState<
    "idle" | "ready" | "recording" | "paused" | "staging" | "staged"
  >("idle");
  const [display, setDisplay] = useState<ChosenDisplay | null>(null),
    [selectArea, setSelectArea] = useState(
      flow === "section" && areaCaptureSupported,
    ),
    [area, setArea] = useState<CaptureArea | null>(
      flow === "section" && areaCaptureSupported ? DEFAULT_AREA : null,
    ),
    [recordedArea, setRecordedArea] = useState(""),
    [floating, setFloating] = useState<Window | null>(null);
  phase.current = recording;
  const live = recording === "recording" || recording === "paused";
  const [elapsed, setElapsed] = useState(0),
    [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState(""),
    [recoverySaved, setRecoverySaved] = useState(false),
    [localUrl, setLocalUrl] = useState("");
  const [storageChecked, setStorageChecked] = useState(source !== "screen");
  const activeRecording =
    recording === "recording" ||
    recording === "paused" ||
    recording === "staging";
  const screenshots = flow === "narrate-screenshots";
  const [shots, setShots] = useState<File[]>([]);
  const [building, setBuilding] = useState<number | null>(null);
  const built = useRef<{ shots: File[]; video: File } | null>(null);
  const title = flow
    ? flowFor(flow).label
    : source === "web"
      ? "Analyze website"
      : source === "screen"
        ? "Record screen"
        : "Upload recording";
  const label =
    source === "web"
      ? "Analyze website"
      : source === "screen" && spoken
        ? "Save recording"
        : "Create Walkthrough";
  const screenSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof MediaRecorder !== "undefined";
  const microphoneSupported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const offersVoiceover =
    adapter.mode === "cloud" && adapter.capabilities.providers;
  // Recordings and uploads cannot tell which page they show, so the address is asked for.
  const siteUrlField = offersVoiceover && (
    <label className="field">
      <span>
        Website URL <span className="flow-muted">(optional)</span>
      </span>
      <input
        type="url"
        inputMode="url"
        value={url}
        placeholder="https://example.com"
        onChange={(event) => setUrl(event.target.value)}
        disabled={busy || !!created.current}
        aria-describedby="site-url-help"
      />
      <small id="site-url-help">
        If this shows a public website, Vistralo reads its code to name the
        real tech behind each effect.
      </small>
    </label>
  );

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    dialog.current
      ?.querySelector<HTMLInputElement>("input:not([type=checkbox])")
      ?.focus();
    if (source === "screen")
      recoverRecording()
        .then((saved) => {
          if (saved && mounted.current) {
            setFile(saved.file);
            setSpoken(saved.microphone);
            spokenTake.current = saved.microphone;
            setRecording("staged");
            setRecoverySaved(true);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (mounted.current) setStorageChecked(true);
        });
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (recorder.current && recorder.current.state !== "inactive")
        recorder.current.stop();
      stopCaptureTracks();
      closeFloating();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (!file || source !== "screen") {
      setLocalUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setLocalUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, source]);

  // While this tab is hidden its timers slow down; the floating window stays visible.
  useEffect(() => {
    if (recording !== "recording") return;
    const host = floating ?? window;
    const timer = host.setInterval(
      () =>
        setElapsed(
          (elapsedBeforePause.current + Date.now() - recordingStarted.current) /
            1000,
        ),
      250,
    );
    return () => host.clearInterval(timer);
  }, [recording, floating]);

  useEffect(() => {
    const analyser = micAnalyser.current;
    if (recording !== "recording" || !analyser) return;
    const host = floating ?? window;
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      setMicLevel(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 400)));
      frame = host.requestAnimationFrame(tick);
    };
    frame = host.requestAnimationFrame(tick);
    return () => host.cancelAnimationFrame(frame);
  }, [recording, floating]);

  // Recording must not block the page, so the dialog becomes a non-modal tray.
  useEffect(() => {
    const element = dialog.current;
    if (!element?.open) return;
    const modal = element.matches(":modal");
    if (live && modal) {
      element.close();
      element.show();
    } else if (!live && !modal) {
      element.close();
      element.showModal();
    }
  }, [live]);

  useEffect(() => {
    if (!floating) return;
    const mount = floating.document.getElementById("floating-tray");
    if (!mount) return;
    const root = createRoot(mount);
    trayRoot.current = root;
    const closed = () => {
      trayWindow.current = null;
      setFloating(null);
    };
    floating.addEventListener("pagehide", closed, { once: true });
    return () => {
      floating.removeEventListener("pagehide", closed);
      trayRoot.current = null;
      root.unmount();
    };
  }, [floating]);

  const trayProps = {
    paused: recording === "paused",
    elapsed,
    micLevel,
    microphone: spoken,
    microphoneLive,
    areaLabel: recordedArea,
    onPause: togglePause,
    onStop: stopRecording,
  };
  useEffect(() => {
    trayRoot.current?.render(
      <RecordingTray
        {...trayProps}
        floating
        notice={
          live
            ? undefined
            : recording === "ready" && !requestingCapture
              ? "Press Start recording in Vistralo"
              : "Choose what to share"
        }
      />,
    );
  });

  useEffect(() => {
    if (recording !== "staged" || !file || !autoSave.current) return;
    autoSave.current = false;
    void save();
  }, [recording, file]);

  useEffect(() => {
    if (
      !activeRecording &&
      !busy &&
      !(source === "screen" && file && !recoverySaved)
    )
      return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [activeRecording, busy, source, file, recoverySaved]);

  async function close() {
    if (activeRecording) {
      setError(
        "Stop the recording before closing. Your recording will be saved for recovery.",
      );
      return;
    }
    if (busy) {
      setError(
        progress?.phase === "verifying"
          ? "Wait for the import to finish before closing."
          : source === "web"
            ? "Wait for website capture to start before closing."
            : "Pause the upload before closing.",
      );
      return;
    }
    if (
      source === "screen" &&
      file &&
      !recoverySaved &&
      !(await confirmDialog({
        title: "Discard this recording?",
        message:
          "A recovery copy could not be stored in this browser. Download your recording first if you want to keep it.",
        confirmLabel: "Discard and close",
        cancelLabel: "Keep recording",
        tone: "danger",
      }))
    )
      return;
    onClose();
  }

  function closeFloating() {
    floatingWanted.current = false;
    const current = trayWindow.current;
    trayWindow.current = null;
    if (current && !current.closed) current.close();
    if (mounted.current) setFloating(null);
  }

  // Uses up the click's user activation, so call it after getDisplayMedia and before any await.
  async function popOutControls() {
    if (trayWindow.current || floatingWanted.current || !floatingControlsSupported) return;
    floatingWanted.current = true;
    try {
      const opened = await openFloatingWindow(420, 72);
      if (!opened) {
        floatingWanted.current = false;
        return;
      }
      if (!mounted.current || !floatingWanted.current) {
        opened.close();
        return;
      }
      trayWindow.current = opened;
      setFloating(opened);
    } catch {
      floatingWanted.current = false;
      /* Floating controls are optional; the in-page tray stays available. */
    }
  }

  function stopRecording() {
    // Stop is clicked in the floating window, which lets this tab come back to the front.
    window.focus();
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
  }

  function releaseFloating() {
    const current = trayWindow.current;
    if (current && !current.closed && document.visibilityState === "hidden") {
      trayWindow.current = null;
      floatingWanted.current = false;
      showReturnPrompt(current);
      if (mounted.current) setFloating(null);
    } else closeFloating();
  }

  function stopCaptureTracks() {
    captureStopping.current = true;
    crop.current?.stop();
    crop.current = null;
    const release = captureRelease.current;
    captureRelease.current = null;
    release?.();
    for (const current of [
      displayStream.current,
      microphoneStream.current,
      stream.current,
    ])
      current?.getTracks().forEach((track) => track.stop());
    displayStream.current = null;
    microphoneStream.current = null;
    stream.current = null;
    micAnalyser.current = null;
    micNodes.current = null;
    const context = audioContext.current;
    audioContext.current = null;
    if (context && context.state !== "closed") void context.close();
  }

  function captureFailed(failure: unknown) {
    stopCaptureTracks();
    closeFloating();
    if (mounted.current) {
      setMicrophoneLive(false);
      setSpoken(false);
      setDisplay(null);
      setRecording("idle");
    }
    spokenTake.current = false;
    setError(
      failure instanceof DOMException && failure.name === "NotAllowedError"
        ? "Screen sharing was not allowed. Choose what to record to try again."
        : errorMessage(failure),
    );
  }

  function cancelSource() {
    stopCaptureTracks();
    closeFloating();
    setDisplay(null);
    setArea(null);
    setRecording("idle");
  }

  async function chooseSource() {
    if (requestingCapture) return;
    if (!screenSupported) {
      setError(
        "Screen recording is unavailable in this browser. Use Chrome or Edge on a computer, or upload a recording instead.",
      );
      return;
    }
    // Stop saves the project on its own, so a bad address has to be caught before recording starts.
    if (url.trim()) {
      try {
        publicWebsite(url);
      } catch (failure) {
        setError(errorMessage(failure));
        return;
      }
    }
    setRequestingCapture(true);
    setError("");
    captureStopping.current = false;
    recorder.current = null;
    autoSave.current = false;
    try {
      spokenTake.current = false;
      setSpoken(false);
      setMicrophoneLive(false);
      if (microphone && !microphoneSupported)
        throw new Error(
          "This browser cannot use a microphone here. Turn off Record my voice to capture the screen without it.",
        );
      // The picker keeps this click's activation and the floating window uses it,
      // so both start here, before the microphone await. Once a tab is picked,
      // Chrome switches to it and the floating controls are the only ones visible.
      // Tab audio makes Chrome stop the microphone, so voice recordings skip it.
      const pickArea = selectArea && areaCaptureSupported;
      const picking = chooseDisplay(!microphone, !pickArea);
      picking.catch(() => {});
      void popOutControls();
      if (microphone) {
        try {
          try {
            microphoneStream.current = await openMicrophone();
          } catch (failure) {
            throw new Error(
              failure instanceof DOMException &&
                (failure.name === "NotAllowedError" || failure.name === "NotFoundError")
                ? "Microphone access was not allowed. Allow the microphone for this site in the address bar, or turn off Record my voice."
                : "The microphone could not be started. Turn off Record my voice to capture the screen without it.",
            );
          }
          if (!liveMicTrack(microphoneStream.current))
            throw new Error(
              "No microphone was available. Turn off Record my voice to capture the screen without it.",
            );
        } catch (failure) {
          void picking.then((unused) => {
            unused.release();
            unused.stream.getTracks().forEach((track) => track.stop());
          }, () => {});
          throw failure;
        }
      }
      const chosen = await picking;
      const selected = chosen.stream;
      captureRelease.current = chosen.release;
      displayStream.current = selected;
      if (!mounted.current) {
        stopCaptureTracks();
        return;
      }
      const source = chosen.captureTrack;
      source?.addEventListener(
        "ended",
        () => {
          if (recorder.current && recorder.current.state !== "inactive")
            recorder.current.stop();
          else if (phase.current === "ready" && mounted.current) {
            cancelSource();
            setError(
              "Screen sharing stopped before recording started. Choose what to record to try again.",
            );
          }
        },
        { once: true },
      );
      setDisplay({
        stream: selected,
        surface: chosen.surface,
        width: chosen.width,
        height: chosen.height,
      });
      if (!areaCaptureSupported) setSelectArea(false);
      if (pickArea) setArea((current) => current ?? DEFAULT_AREA);
      setRecording("ready");
      if (chosen.surface === "browser" && !pickArea) {
        phase.current = "ready";
        void beginRecording(true);
      }
    } catch (failure) {
      captureFailed(failure);
    } finally {
      if (mounted.current) setRequestingCapture(false);
    }
  }

  async function beginRecording(wholeFrame = false) {
    const selected = displayStream.current;
    if (!selected || phase.current !== "ready" || starting.current) return;
    starting.current = true;
    recorder.current = null;
    void popOutControls();
    setError("");
    // Sharing can end or the sheet can close while this awaits; a late start must not record.
    const stale = () => !mounted.current || displayStream.current !== selected;
    try {
      if (microphone && !liveMicTrack(microphoneStream.current)) {
        microphoneStream.current?.getTracks().forEach((track) => track.stop());
        try {
          microphoneStream.current = await openMicrophone();
        } catch {
          throw new Error(
            "The microphone stopped when screen sharing started. Allow the microphone and choose what to record again.",
          );
        }
      }
      const mic = liveMicTrack(microphoneStream.current);
      if (microphone && !mic)
        throw new Error(
          "The microphone stopped when screen sharing started. Allow the microphone and choose what to record again.",
        );
      if (mic?.muted)
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 1500);
          mic.addEventListener(
            "unmute",
            () => {
              window.clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      if (stale()) return;
      if (mic && "contentHint" in mic) mic.contentHint = "speech";
      if (microphone && mic) {
        spokenTake.current = true;
        setSpoken(true);
        setMicrophoneLive(true);
        mic.addEventListener(
          "ended",
          () => {
            if (!mounted.current || captureStopping.current) return;
            setMicrophoneLive(false);
            setError(
              "The microphone stopped. The rest of this recording may not include your voice.",
            );
          },
          { once: true },
        );
      }
      const source = selected.getVideoTracks()[0];
      let video = selected.getVideoTracks();
      const chosenArea =
        !wholeFrame && selectArea && area && areaCaptureSupported ? area : null;
      if (chosenArea && source) {
        const settings = source.getSettings();
        const pixels = areaPixels(
          chosenArea,
          settings.width ?? display?.width ?? 0,
          settings.height ?? display?.height ?? 0,
        );
        const cropped = cropVideoTrack(source, chosenArea);
        crop.current = cropped;
        video = [cropped.track];
        setRecordedArea(`Area ${pixels.width} × ${pixels.height}`);
      } else setRecordedArea("");
      const graph = buildRecording(selected, microphoneStream.current, video);
      if (microphone && graph.recorded.getAudioTracks().length === 0)
        throw new Error(
          "Your microphone was not added to the recording. Allow the microphone and choose what to record again.",
        );
      audioContext.current = graph.context;
      micAnalyser.current = graph.analyser;
      micNodes.current = graph.source && graph.gain ? { source: graph.source, gain: graph.gain } : null;
      if (graph.context?.state === "suspended") await graph.context.resume();
      if (stale()) {
        if (graph.context && graph.context.state !== "closed") void graph.context.close();
        return;
      }
      stream.current = graph.recorded;
      const mimeType = recorderMime(microphone && graph.recorded.getAudioTracks().length > 0);
      const capture = new MediaRecorder(
          graph.recorded,
          mimeType ? { mimeType } : undefined,
        ),
        chunks: Blob[] = [];
      let total = 0;
      recorder.current = capture;
      elapsedBeforePause.current = 0;
      recordingStarted.current = Date.now();
      setElapsed(0);
      setRecoverySaved(false);
      capture.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          total += event.data.size;
        }
        if (
          total >= MAX_BROWSER_RECORDING_BYTES &&
          capture.state !== "inactive"
        ) {
          setError(
            "The 1 GB browser recording limit was reached. Your captured video is ready to save.",
          );
          capture.stop();
        }
      };
      capture.onerror = () => {
        setError(
          "The browser stopped recording unexpectedly. Save any captured video below.",
        );
        if (capture.state !== "inactive") capture.stop();
      };
      capture.onstop = async () => {
        const withVoice = spokenTake.current;
        stopCaptureTracks();
        releaseFloating();
        if (mounted.current) {
          setMicrophoneLive(false);
          setDisplay(null);
        }
        const extension = capture.mimeType.includes("mp4") ? "mp4" : "webm";
        const video = new File(
          chunks,
          `Screen recording ${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
          { type: capture.mimeType || "video/webm" },
        );
        if (!video.size) {
          if (mounted.current) {
            setSpoken(false);
            spokenTake.current = false;
            setRecording("idle");
            setError(
              "No video was captured. Choose a screen or window and try again.",
            );
          }
          return;
        }
        if (mounted.current) {
          autoSave.current = true;
          setFile(video);
          setRecording("staging");
        }
        try {
          await stageRecording(video, withVoice);
          if (mounted.current) setRecoverySaved(true);
        } catch {
          if (mounted.current)
            setError(
              "The recording is ready, but browser recovery storage is full or unavailable. Download a copy before closing this page.",
            );
        } finally {
          if (mounted.current) setRecording("staged");
        }
      };
      capture.start(1000);
      setRecording("recording");
    } catch (failure) {
      if (!stale()) captureFailed(failure);
    } finally {
      starting.current = false;
    }
  }

  function togglePause() {
    const capture = recorder.current;
    if (!capture) return;
    if (capture.state === "recording") {
      elapsedBeforePause.current += Date.now() - recordingStarted.current;
      capture.pause();
      setRecording("paused");
    } else if (capture.state === "paused") {
      recordingStarted.current = Date.now();
      capture.resume();
      setRecording("recording");
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void save();
  }

  async function save() {
    if (busy || activeRecording) return;
    setError("");
    setBusy(true);
    try {
      const sourceUrl =
        source === "web" || url.trim() ? publicWebsite(url) : undefined;
      let media = file;
      if (source !== "web") {
        if (screenshots) {
          if (!shots.length) throw new Error("Add at least one screenshot.");
          if (built.current?.shots !== shots) {
            controller.current = new AbortController();
            setBuilding(0);
            built.current = {
              shots,
              video: await screenshotsVideo(shots, {
                signal: controller.current.signal,
                onProgress: setBuilding,
              }),
            };
          }
          media = built.current.video;
        }
        if (!media) throw new Error("Choose or record a video first.");
        validateVideo(media, adapter.mode === "cloud");
      }
      const projectName = (
        name.trim() ||
        (source === "web" && sourceUrl
          ? `${new URL(sourceUrl).hostname} design review`
          : media?.name.replace(/\.[^.]+$/, "") || "Screen recording")
      ).slice(0, 120);
      const project =
        created.current ??
        (await adapter.create({
          name: projectName,
          source,
          type: source === "web" ? "brief" : "walkthrough",
          url: sourceUrl,
        }));
      created.current = project;
      if (source === "web") {
        await adapter.rpc("walkthrough", {
          id: project.id,
          url: sourceUrl,
          pages: [],
          viewports: [
            { width: 1440, height: 900 },
            ...(mobile ? [{ width: 390, height: 844 }] : []),
          ],
          narrate,
        });
        notify(
          adapter.mode === "demo"
            ? "Demo website analysis started. This is a local simulation."
            : "Website analysis started. You can leave this page while it runs.",
        );
      } else {
        controller.current = new AbortController();
        const uploaded = await adapter.upload(project.id, media!, {
          signal: controller.current.signal,
          onProgress: setProgress,
          ...(source === "screen" && spoken
            ? { voice: "microphone" as const }
            : source === "upload" && offersVoiceover
              ? {
                  voice:
                    screenshots || voiceover
                      ? ("ai" as const)
                      : ("original" as const),
                }
              : {}),
        });
        if (source === "screen") await clearRecording().catch(() => {});
        const voice = (uploaded as { voice?: string }).voice;
        notify(
          adapter.mode === "demo"
            ? "Recording saved in this browser demo."
            : voice === "microphone"
              ? "Recording saved with your voice."
              : voice === "queued"
              ? "Upload finished. Vistralo is writing the narration and adding the AI voice. This takes a few minutes."
              : voice === "offline"
                ? "Recording saved. The capture worker is offline, so the voice was not started."
              : "Recording uploaded. The worker checks its checksum before processing it.",
        );
      }
      let refreshed = project;
      try {
        refreshed = (await adapter.project(project.id)).project;
      } catch {
        /* The successful job still exists when a subsequent refresh fails. */
      }
      onCreated(refreshed);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      if (mounted.current) {
        setBusy(false);
        setProgress(null);
        setBuilding(null);
      }
    }
  }

  const progressLabel = progress?.phase === "hashing"
      ? "Checking source"
      : progress?.phase === "verifying"
        ? "Verifying source"
        : "Uploading";
  const areaSize =
    display && selectArea && area
      ? `${Math.round(area.width * display.width)} × ${Math.round(area.height * display.height)}`
      : display
        ? `${display.width} × ${display.height}`
        : "";
  const choosing = source === "screen" && !file && recording === "idle";
  const surfaceName =
    display?.surface === "monitor"
      ? "Entire screen"
      : display?.surface === "window"
        ? "Window"
        : display?.surface === "browser"
          ? "Browser tab"
          : "Shared screen";
  return (
    <dialog
      ref={dialog}
      className={
        live
          ? "flow-dialog is-tray"
          : `flow-dialog sheet ${recording === "ready" ? "sheet-wide" : "sheet-default"}`
      }
      {...(live
        ? { "aria-label": "Recording controls" }
        : {
            "aria-labelledby": "create-title",
            "aria-describedby": "create-description",
          })}
      onCancel={(event) => {
        event.preventDefault();
        void close();
      }}
    >
      {live && !floating ? (
        <div className="rec-tray-host">
          <RecordingTray
            {...trayProps}
            canPopOut={floatingControlsSupported && !floating}
            onPopOut={popOutControls}
          />
          {error && (
            <p className="rec-tray-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : live ? (
        error ? (
          <p className="rec-tray-error" role="alert">
            {error}
          </p>
        ) : null
      ) : recording === "ready" && display ? (
        <>
          <SheetHeader
            titleId="create-title"
            descriptionId="create-description"
            icon={selectArea ? "selectArea" : "fullscreen"}
            title="Set up your recording"
            description={
              selectArea
                ? "Drag over the part you want. Everything outside the box is left out."
                : "Everything you shared will be recorded."
            }
            closeLabel="Close create project"
            onClose={() => void close()}
          />
          <div className="sheet-body rec-ready">
            <AreaSelector
              stream={display.stream}
              width={display.width}
              height={display.height}
              area={area}
              selecting={selectArea}
              onChange={setArea}
            />
            <div className="rec-ready-bar">
              <fieldset className="rec-segmented">
                <legend className="sr-only">What to record</legend>
                <label>
                  <input
                    type="radio"
                    name="capture-mode"
                    checked={!selectArea}
                    onChange={() => setSelectArea(false)}
                  />
                  <Icon name="fullscreen" />
                  {display.surface === "browser"
                    ? "Whole tab"
                    : display.surface === "window"
                      ? "Whole window"
                      : "Whole screen"}
                </label>
                <label>
                  <input
                    type="radio"
                    name="capture-mode"
                    checked={selectArea}
                    disabled={!areaCaptureSupported}
                    onChange={() => {
                      setSelectArea(true);
                      setArea((current) => current ?? DEFAULT_AREA);
                    }}
                  />
                  <Icon name="selectArea" />
                  Select area
                </label>
              </fieldset>
              <p className="flow-caption flow-muted rec-ready-meta">
                {[surfaceName, areaSize].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ul className="rec-tips flow-caption flow-muted">
              {!areaCaptureSupported && <li>Selecting an area needs Chrome or Edge.</li>}
              {display.surface === "browser" && (
                <li>After you press Start recording, switch to the shared tab.</li>
              )}
              <li>
                {floatingControlsSupported
                  ? "Recording controls float above your other windows, so you can switch away from this tab."
                  : "Recording controls stay at the bottom of this tab."}
              </li>
            </ul>
            {error && (
              <p className="flow-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className="sheet-footer">
            <button
              type="button"
              className="button button-ghost sheet-footer-start"
              onClick={() => {
                cancelSource();
                void chooseSource();
              }}
            >
              Choose another source
            </button>
            <button type="button" className="button" onClick={cancelSource}>
              Back
            </button>
            <button
              type="button"
              className="button button-primary rec-start"
              onClick={() => beginRecording()}
              disabled={selectArea && !area}
              autoFocus
            >
              <span className="rec-dot" aria-hidden="true" />
              Start recording
            </button>
          </footer>
        </>
      ) : (
        <form onSubmit={submit} className="sheet-form">
          <SheetHeader
            titleId="create-title"
            descriptionId="create-description"
            icon={
              flow
                ? flowFor(flow).icon
                : source === "web"
                  ? "globe"
                  : source === "screen"
                    ? "record"
                    : "upload"
            }
            title={title}
            description={
              flow
                ? flowIntro[flow]
                : source === "web"
                ? "Capture a public website as a Visual brief with screenshots and observed behavior."
                : source === "screen"
                  ? "Choose a screen, window or tab. Save the captured video as a Walkthrough."
                  : "Turn an existing video into a Walkthrough."
            }
            closeLabel="Close create project"
            onClose={() => void close()}
          />
          <div className="sheet-body">
            {adapter.mode === "demo" && (
              <p className="sheet-note">
                <Icon name="info" />
                <span>
                  Demo workspace: projects and uploads stay in this browser.
                  Website analysis is simulated. Connect the server for real
                  website capture and rendering.
                </span>
              </p>
            )}
            <label className="field">
              <span>
                Project name <span className="flow-muted">(optional)</span>
              </span>
              <input
                autoFocus
                value={name}
                maxLength={120}
                placeholder={
                  source === "web" ? "Website design review" : "Untitled Walkthrough"
                }
                onChange={(event) => setName(event.target.value)}
                disabled={busy || !!created.current}
              />
            </label>
            {source === "web" ? (
              <>
                <label className="field">
                  Website URL
                  <input
                    type="url"
                    inputMode="url"
                    required
                    value={url}
                    placeholder="https://example.com"
                    onChange={(event) => setUrl(event.target.value)}
                    disabled={busy}
                    aria-describedby="website-help"
                  />
                  <small id="website-help">
                    Public pages only. Sign-in screens and sites that block
                    automated access may not be captured.
                  </small>
                </label>
                <div className="sheet-group">
                  <SheetToggle
                    label="Include mobile viewport"
                    checked={mobile}
                    onChange={setMobile}
                    disabled={busy}
                  />
                  {adapter.capabilities.providers && (
                    <SheetToggle
                      label="Draft an AI narration script"
                      hint={
                        narrate
                          ? "Evidence frames are sent to OpenAI to draft a script. You review and approve it before any voice is generated, and each request must fit your per-job cost cap."
                          : "No paid AI runs in this flow."
                      }
                      checked={narrate}
                      onChange={setNarrate}
                      disabled={busy}
                    />
                  )}
                </div>
              </>
            ) : screenshots ? (
              <>
                <label
                  className={`sheet-drop ${shots.length ? "has-file" : ""} ${busy || !adapter.capabilities.upload ? "is-disabled" : ""}`}
                >
                  <span className="sheet-drop-icon" aria-hidden="true">
                    <Icon name="image" />
                  </span>
                  <span className="sheet-drop-text">
                    <strong>
                      {shots.length
                        ? `${shots.length} screenshot${shots.length > 1 ? "s" : ""}`
                        : "Choose screenshots"}
                    </strong>
                    <small>
                      {shots.length
                        ? "Choose more to add them. They play in file-name order."
                        : `PNG, JPEG or WebP, up to ${MAX_SCREENSHOTS}. They play in file-name order.`}
                    </small>
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy || !adapter.capabilities.upload}
                    onChange={(event) => {
                      setError("");
                      const picked = [...(event.target.files ?? [])];
                      event.target.value = "";
                      try {
                        picked.forEach(validateScreenshot);
                        const known = new Set(
                          shots.map((shot) => `${shot.name}:${shot.size}`),
                        );
                        const next = orderScreenshots([
                          ...shots,
                          ...picked.filter(
                            (shot) => !known.has(`${shot.name}:${shot.size}`),
                          ),
                        ]);
                        if (next.length > MAX_SCREENSHOTS)
                          throw new Error(
                            `Use up to ${MAX_SCREENSHOTS} screenshots in one walkthrough.`,
                          );
                        setShots(next);
                      } catch (failure) {
                        setError(errorMessage(failure));
                      }
                    }}
                  />
                </label>
                {shots.length > 0 && (
                  <ol className="shot-strip" aria-label="Screenshots in order">
                    {shots.map((shot, index) => (
                      <ShotThumb
                        key={`${shot.name}:${shot.size}`}
                        file={shot}
                        index={index}
                        disabled={busy}
                        onRemove={() =>
                          setShots((current) =>
                            current.filter((item) => item !== shot),
                          )
                        }
                      />
                    ))}
                  </ol>
                )}
                {siteUrlField}
                {!offersVoiceover && (
                  <p className="sheet-note">
                    <Icon name="info" />
                    <span>
                      AI narration runs in the Vistralo cloud workspace. Here
                      the screenshots are saved as a video you can play and
                      download.
                    </span>
                  </p>
                )}
              </>
            ) : source === "upload" ? (
              <>
                <label
                  className={`sheet-drop ${file ? "has-file" : ""} ${busy || !adapter.capabilities.upload ? "is-disabled" : ""}`}
                >
                  <span className="sheet-drop-icon" aria-hidden="true">
                    <Icon name={file ? "video" : "upload"} />
                  </span>
                  <span className="sheet-drop-text">
                    <strong>{file ? file.name : "Choose a recording"}</strong>
                    <small>
                      {file
                        ? `${formatBytes(file.size)} · Choose another file to replace it`
                        : `Drop a file here or browse. MP4, WebM, MOV or MKV up to ${adapter.mode === "cloud" ? "50" : "20"} GB.`}
                    </small>
                  </span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mkv,.mp4,.webm,.mov"
                    disabled={busy || !adapter.capabilities.upload}
                    onChange={(event) => {
                      setError("");
                      const next = event.target.files?.[0] ?? null;
                      try {
                        if (next) validateVideo(next, adapter.mode === "cloud");
                        setFile(next);
                      } catch (failure) {
                        setFile(null);
                        setError(errorMessage(failure));
                      }
                    }}
                    aria-describedby="upload-help"
                  />
                </label>
                <p id="upload-help" className="flow-caption flow-muted">
                  {adapter.mode === "cloud"
                    ? "Keep this page open while it uploads; if the upload stops, select the same file again to resume."
                    : "Interrupted uploads can resume when you select the same file for the same project."}
                </p>
                {offersVoiceover && (
                  <div className="sheet-group">
                    <SheetToggle
                      label="Add an AI voice-over"
                      hint={
                        voiceover
                          ? "After the upload, Vistralo finds every screen in the video, pauses on each one and explains its design in an AI voice. The narrated video is longer than the recording. It uses your OpenAI and HeyGen keys within your cost cap."
                          : "The video keeps its own audio. You can add an AI voice-over later from the project."
                      }
                      checked={voiceover}
                      onChange={setVoiceover}
                      disabled={busy}
                    />
                  </div>
                )}
                {voiceover && siteUrlField}
                {!adapter.capabilities.upload && (
                  <p className="sheet-note">
                    <Icon name="info" />
                    <span>
                      Uploads are unavailable in this connection. Connect to the
                      Vistralo server to upload a recording.
                    </span>
                  </p>
                )}
              </>
            ) : (
              <section className="flow-stack" aria-label="Screen recording">
                {recording === "idle" && (
                  <>
                    <div className="sheet-group">
                      <SheetToggle
                        label="Record my voice"
                        hint={
                          (microphone
                            ? "Your microphone is the audio in the recording. Saving it keeps your voice and does not start AI narration."
                            : "Leave it off and Create Walkthrough adds an AI voice after you save.") +
                          (!microphoneSupported
                            ? " This browser cannot use a microphone here."
                            : "")
                        }
                        checked={microphone}
                        onChange={setMicrophone}
                        disabled={
                          requestingCapture || !microphoneSupported || !screenSupported
                        }
                      />
                      {areaCaptureSupported && (
                        <SheetToggle
                          label="Record only part of it"
                          hint={
                            selectArea
                              ? "After you pick, drag and resize a box over the part you want, then press Start recording."
                              : "Off: a shared tab starts recording as soon as you pick it."
                          }
                          checked={selectArea}
                          onChange={(value) => {
                            setSelectArea(value);
                            if (value) setArea((current) => current ?? DEFAULT_AREA);
                          }}
                          disabled={requestingCapture || !screenSupported}
                        />
                      )}
                    </div>
                    {!microphone && siteUrlField}
                    <ol className="sheet-steps" aria-label="How recording works">
                      <li>
                        <Icon name="fullscreen" />
                        Pick a screen, window or tab
                      </li>
                      <li>
                        <Icon name="selectArea" />
                        Record all of it or an area
                      </li>
                      <li>
                        <Icon name="record" />
                        Stop, and it saves as a project
                      </li>
                    </ol>
                    <p className="flow-caption flow-muted">
                      With Record my voice on, tab audio is left out. Maximum
                      browser capture: 1 GB.
                    </p>
                    {!screenSupported && (
                      <p className="sheet-note">
                        <Icon name="info" />
                        <span>
                          Screen sharing needs a supported desktop browser on a
                          secure connection. You can upload a video recorded with
                          Vistralo desktop instead.
                        </span>
                      </p>
                    )}
                  </>
                )}
                {recording === "staging" && (
                  <p className="sheet-status">
                    <Icon name="spinner" />
                    Saving a browser recovery copy…
                  </p>
                )}
                {recording === "staged" && (
                  <>
                    <p className={`sheet-status ${recoverySaved ? "is-success" : "is-warning"}`}>
                      <Icon name={recoverySaved ? "checkCircle" : "warning"} />
                      <span>
                        {spoken
                          ? "Your voice is in this recording. Save it to keep that audio. AI narration will not run."
                          : recoverySaved
                            ? "Your recording is saved for recovery in this browser."
                            : "Download a recovery copy before closing this page."}
                        {spoken && !recoverySaved
                          ? " Download a recovery copy before closing this page."
                          : ""}
                      </span>
                    </p>
                    {localUrl && (
                      <video
                        className="flow-recording-preview"
                        src={localUrl}
                        controls
                        playsInline
                        preload="metadata"
                        aria-label="Preview captured recording"
                      />
                    )}
                    <div className="sheet-media-bar">
                      {file && (
                        <span
                          className="flow-caption flow-muted flow-file-summary"
                          title={file.name}
                        >
                          {formatBytes(file.size)} · {file.name}
                        </span>
                      )}
                      {localUrl && (
                        <a className="button" href={localUrl} download={file?.name}>
                          <Icon name="download" />
                          Download
                        </a>
                      )}
                      <button
                        type="button"
                        className="button button-ghost danger-text"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !(await confirmDialog({
                              title: "Discard this recording?",
                              message:
                                "You will start again from the beginning. Download a copy first if you want to keep it.",
                              confirmLabel: "Discard",
                              cancelLabel: "Keep it",
                              icon: "trash",
                              tone: "danger",
                            }))
                          )
                            return;
                          await clearRecording().catch(() => {});
                          setFile(null);
                          setSpoken(false);
                          spokenTake.current = false;
                          setRecording("idle");
                          setRecoverySaved(false);
                          setError("");
                        }}
                      >
                        <Icon name="trash" />
                        Discard
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
            {busy && (
              <div className="flow-stack flow-progress">
                <label htmlFor="create-progress">
                  {building !== null
                    ? `Turning screenshots into a walkthrough video: ${building}%`
                    : progress
                      ? `${progressLabel}${progress.phase === "verifying" ? "…" : `: ${progress.percent}%`}`
                      : source === "web"
                        ? "Starting website analysis…"
                        : "Creating project…"}
                </label>
                <progress
                  id="create-progress"
                  max={100}
                  {...(building !== null
                    ? { value: building }
                    : progress && progress.phase !== "verifying"
                      ? { value: progress.percent }
                      : {})}
                />
                {building !== null && (
                  <p className="flow-caption flow-muted">
                    Each screen is held for a few seconds so it gets its own
                    explanation. Keep this tab open.
                  </p>
                )}
                {source !== "web" &&
                  (building !== null ||
                    (progress && progress.phase !== "verifying")) && (
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => controller.current?.abort()}
                    >
                      {building !== null ? "Stop" : "Pause upload"}
                    </button>
                  )}
              </div>
            )}
            {error && (
              <p className="flow-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className="sheet-footer">
            <button
              className="button"
              type="button"
              onClick={() => void close()}
              disabled={busy || activeRecording}
            >
              Cancel
            </button>
            {choosing ? (
              <button
                className="button button-primary"
                type="button"
                onClick={chooseSource}
                disabled={
                  requestingCapture ||
                  !screenSupported ||
                  !storageChecked ||
                  !adapter.capabilities.upload
                }
              >
                <Icon name="record" />
                {requestingCapture ? "Choose a source…" : "Choose what to record"}
              </button>
            ) : (
              <button
                className="button button-primary"
                type="submit"
                disabled={
                  busy ||
                  activeRecording ||
                  (source !== "web" &&
                    ((screenshots ? !shots.length : !file) ||
                      !adapter.capabilities.upload))
                }
              >
                {created.current && error ? "Try again" : label}
              </button>
            )}
          </footer>
        </form>
      )}
    </dialog>
  );
}
