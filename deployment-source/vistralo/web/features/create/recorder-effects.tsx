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

/** A dot in the recording colour for the tab's icon while a take is live. An image from data:, which the policy allows. */
function recordingIcon() {
  const colour = getComputedStyle(document.documentElement).getPropertyValue("--record").trim();
  if (!colour) return "";
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="${colour}"/></svg>`,
    )
  );
}

/**
 * Says in the tab strip what the recorder is doing. A whole tab is recorded from that tab,
 * so the tab strip is the one place the count-in and the recording can be seen from there.
 */
export function useRecordingSignal({ recording, count, cancelCountdown }: Recorder) {
  // The tray is not a modal dialog, so Escape has to be listened for to stop the count-in.
  useEffect(() => {
    if (recording !== "countdown") return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelCountdown();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [recording]);
  useEffect(() => {
    const text =
      recording === "countdown"
        ? `${count} · Recording starts`
        : recording === "recording"
          ? "Recording · Vistralo"
          : recording === "paused"
            ? "Paused · Vistralo"
            : "";
    if (!text) return;
    const title = document.title;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const href = icon?.getAttribute("href") ?? null;
    document.title = text;
    const dot = recording === "paused" ? "" : recordingIcon();
    if (icon && dot) icon.setAttribute("href", dot);
    return () => {
      document.title = title;
      if (icon && href !== null) icon.setAttribute("href", href);
    };
  }, [recording, count]);
}
