import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RecordingTray } from "../RecordingControls";
import type { Recorder } from "./useRecorder";

export function useRecordingMeters({
  recording,
  floating,
  micAnalyser,
  recordingStarted,
  elapsedBeforePause,
  setElapsed,
  setMicLevel,
}: Recorder) {
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
}

export function useFloatingTray({
  floating,
  setFloating,
  trayWindow,
  trayRoot,
  trayProps,
  live,
  recording,
  requestingCapture,
}: Recorder) {
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
}
