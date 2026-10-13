import { useRef, useState, type RefObject } from "react";
import { stageRecording } from "../recording-store";
import {
  errorMessage,
  MAX_BROWSER_RECORDING_BYTES,
  publicWebsite,
} from "../flow-utils";
import {
  areaCaptureSupported,
  areaPixels,
  chooseDisplay,
  cropVideoTrack,
  type CaptureArea,
} from "../capture";
import type { CreateFlow } from "../create-flows";
import {
  buildRecording,
  DEFAULT_AREA,
  liveMicTrack,
  openMicrophone,
  recorderMime,
  type ChosenDisplay,
} from "./recording-media";
import { useFloatingControls } from "./useFloatingControls";

interface RecorderOptions {
  flow?: CreateFlow;
  url: string;
  mounted: RefObject<boolean>;
  setError: (message: string) => void;
  setFile: (file: File | null) => void;
  /** The take was thrown away on purpose; there is nothing to save or show. */
  onDiscard: () => void;
}

/** Seconds counted before the first frame is recorded. */
export const COUNTDOWN_SECONDS = 3;

export type Recorder = ReturnType<typeof useRecorder>;

export function useRecorder({ flow, url, mounted, setError, setFile, onDiscard }: RecorderOptions) {
  const recorder = useRef<MediaRecorder | null>(null),
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
    starting = useRef(false),
    autoSave = useRef(false),
    phase = useRef("idle"),
    // What stopping the recorder is for: save the take (the default), start it again, or throw it away.
    takeIntent = useRef<"save" | "restart" | "discard">("save"),
    wholeFrameTake = useRef(false),
    countCancel = useRef<(() => void) | null>(null);
  const recordingStarted = useRef(0),
    elapsedBeforePause = useRef(0);
  const [microphone, setMicrophone] = useState(
      flow !== "ai-walkthrough" && flow !== "section",
    ),
    [microphoneLive, setMicrophoneLive] = useState(false),
    [micLevel, setMicLevel] = useState(0),
    [spoken, setSpoken] = useState(false);
  const [requestingCapture, setRequestingCapture] = useState(false);
  const [recording, setRecording] = useState<
    "idle" | "ready" | "countdown" | "recording" | "paused" | "staging" | "staged"
  >("idle");
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [display, setDisplay] = useState<ChosenDisplay | null>(null),
    [selectArea, setSelectArea] = useState(
      flow === "section" && areaCaptureSupported,
    ),
    [area, setArea] = useState<CaptureArea | null>(
      flow === "section" && areaCaptureSupported ? DEFAULT_AREA : null,
    ),
    [recordedArea, setRecordedArea] = useState("");
  const {
    floating,
    setFloating,
    trayWindow,
    trayRoot,
    closeFloating,
    popOutControls,
    releaseFloating,
  } = useFloatingControls(mounted);
  phase.current = recording;
  const counting = recording === "countdown";
  // The count-in is part of the take: the sheet has already become the tray.
  const live = counting || recording === "recording" || recording === "paused";
  const [elapsed, setElapsed] = useState(0);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const activeRecording =
    recording === "recording" ||
    recording === "paused" ||
    recording === "staging";
  const screenSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof MediaRecorder !== "undefined";
  const microphoneSupported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const trayProps = {
    paused: recording === "paused",
    elapsed,
    micLevel,
    microphone: spoken,
    microphoneLive,
    areaLabel: recordedArea,
    count: counting ? count : undefined,
    onPause: togglePause,
    onStop: stopRecording,
    onRestart: restartRecording,
    onDiscard: discardRecording,
    onCancelCount: cancelCountdown,
  };

  /** Three, two, one. Resolves false if the count was cancelled or sharing ended first. */
  function countIn(stale: () => boolean) {
    return new Promise<boolean>((resolve) => {
      let left = COUNTDOWN_SECONDS;
      setCount(left);
      setRecording("countdown");
      const finish = (go: boolean) => {
        window.clearInterval(timer);
        countCancel.current = null;
        resolve(go && !stale());
      };
      const timer = window.setInterval(() => {
        if (stale()) return finish(false);
        left -= 1;
        if (left <= 0) finish(true);
        else setCount(left);
      }, 1000);
      countCancel.current = () => finish(false);
    });
  }

  function cancelCountdown() {
    countCancel.current?.();
  }

  /** Throws this take away and counts in again on the same screen, window or tab. */
  function restartRecording() {
    const capture = recorder.current;
    if (!capture || capture.state === "inactive") return;
    takeIntent.current = "restart";
    capture.stop();
  }

  /** Throws this take away and ends the recording. Nothing is saved. */
  function discardRecording() {
    const capture = recorder.current;
    if (!capture || capture.state === "inactive") return;
    takeIntent.current = "discard";
    capture.stop();
  }

  function stopRecording() {
    // Stop is clicked in the floating window, which lets this tab come back to the front.
    window.focus();
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
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

  function captureFailed(failure: unknown, quiet = false) {
    stopCaptureTracks();
    closeFloating();
    if (mounted.current) {
      setMicrophoneLive(false);
      setSpoken(false);
      setDisplay(null);
      setRecording("idle");
    }
    spokenTake.current = false;
    if (quiet) return;
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

  /** `automatic` is the ask made as the sheet opens; if the browser refuses or the user cancels it, the form simply stays. */
  async function chooseSource(automatic = false) {
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
      // The picker needs this click's activation, so it starts here, before the
      // microphone await. The floating controls wait for Start recording: opened
      // now they would sit over the picker with nothing to control.
      // Tab audio makes Chrome stop the microphone, so voice recordings skip it.
      const pickArea = selectArea && areaCaptureSupported;
      const picking = chooseDisplay(!microphone, !pickArea);
      picking.catch(() => {});
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
          else if ((phase.current === "ready" || phase.current === "countdown") && mounted.current) {
            cancelCountdown();
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
      captureFailed(
        failure,
        automatic &&
          failure instanceof DOMException &&
          ["NotAllowedError", "InvalidStateError", "AbortError"].includes(failure.name),
      );
    } finally {
      if (mounted.current) setRequestingCapture(false);
    }
  }

  async function beginRecording(wholeFrame = false) {
    const selected = displayStream.current;
    if (!selected || phase.current !== "ready" || starting.current) return;
    starting.current = true;
    recorder.current = null;
    wholeFrameTake.current = wholeFrame;
    // A tab picked whole starts at once with no click to open a window from; Chrome's own
    // sharing bar stops it there, and the tray in this tab can still float the controls.
    if (!wholeFrame) void popOutControls();
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
        const intent = takeIntent.current;
        takeIntent.current = "save";
        if (intent === "restart") {
          // Keep the shared screen and the microphone; drop only what this take built on them.
          crop.current?.stop();
          crop.current = null;
          const graphContext = audioContext.current;
          audioContext.current = null;
          micAnalyser.current = null;
          micNodes.current = null;
          if (graphContext && graphContext.state !== "closed") void graphContext.close();
          stream.current = null;
          recorder.current = null;
          if (!mounted.current || !displayStream.current) return;
          setElapsed(0);
          setCount(COUNTDOWN_SECONDS);
          setRecording("countdown");
          phase.current = "ready";
          void beginRecording(wholeFrameTake.current);
          return;
        }
        if (intent === "discard") {
          stopCaptureTracks();
          closeFloating();
          spokenTake.current = false;
          recorder.current = null;
          if (mounted.current) {
            setMicrophoneLive(false);
            setSpoken(false);
            setDisplay(null);
            setRecording("idle");
            onDiscard();
          }
          return;
        }
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
      // The leader: three, two, one, so the first frame recorded is the one the person meant to show.
      if (!(await countIn(stale))) {
        recorder.current = null;
        if (!stale()) cancelSource();
        return;
      }
      recordingStarted.current = Date.now();
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

  return {
    recorder,
    micAnalyser,
    spokenTake,
    autoSave,
    recordingStarted,
    elapsedBeforePause,
    trayWindow,
    trayRoot,
    microphone,
    setMicrophone,
    setMicLevel,
    spoken,
    setSpoken,
    requestingCapture,
    recording,
    setRecording,
    counting,
    count,
    cancelCountdown,
    display,
    selectArea,
    setSelectArea,
    area,
    setArea,
    floating,
    setFloating,
    live,
    setElapsed,
    recoverySaved,
    setRecoverySaved,
    activeRecording,
    screenSupported,
    microphoneSupported,
    trayProps,
    closeFloating,
    popOutControls,
    stopCaptureTracks,
    cancelSource,
    chooseSource,
    beginRecording,
  };
}
