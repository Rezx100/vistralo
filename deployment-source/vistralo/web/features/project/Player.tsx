import { ToolButton } from "../../components/Primitives";
import React, { useEffect, useRef, useState } from "react";
import { formatDuration } from "../flow-utils";

// The capture publishes a new frame every second or so. Decoding the next one
// off-screen and swapping only when it is ready keeps the panel from blanking
// or resizing between frames.
const FRAME_STEP = 1 / 30;

export function Playback({
  src,
  label,
  duration: known,
}: {
  src: string;
  label: string;
  duration?: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const held = useRef(src);
  const file = src.split("?")[0];
  if (held.current.split("?")[0] !== file) held.current = src;
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [playing, setPlaying] = useState(false);
  const shown = held.current.split("?")[0] === file ? held.current : src;
  // Browser-recorded WebM reports an infinite duration, but the browser can
  // still seek in it, so fall back to the length the worker measured.
  const total = length || (known && Number.isFinite(known) ? known : 0);
  const seekable = total > 0;

  function step(direction: number) {
    const node = video.current;
    if (!node || !seekable) return;
    node.pause();
    node.currentTime = Math.min(Math.max(0, node.currentTime + direction * FRAME_STEP), total);
  }
  function toggle() {
    const node = video.current;
    if (!node) return;
    if (node.paused) void node.play();
    else node.pause();
  }
  function measured() {
    const node = video.current;
    if (node && Number.isFinite(node.duration) && node.duration > 0)
      setLength(node.duration);
  }

  return (
    <figure className="flow-stage">
      <video
        ref={video}
        src={shown}
        playsInline
        preload="auto"
        aria-label={label}
        onClick={toggle}
        onTimeUpdate={() => setTime(video.current?.currentTime || 0)}
        onLoadedMetadata={measured}
        onDurationChange={measured}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="flow-transport" role="group" aria-label="Playback">
        <ToolButton
          icon={playing ? "pause" : "play"}
          label={playing ? "Pause" : "Play"}
          onClick={toggle}
        />
        <ToolButton
          icon="arrowLeft"
          label="Previous frame"
          onClick={() => step(-1)}
          disabled={!seekable}
        />
        <ToolButton
          icon="arrowRight"
          label="Next frame"
          onClick={() => step(1)}
          disabled={!seekable}
        />
        <label className="flow-scrub">
          <span className="sr-only">Position</span>
          <input
            type="range"
            min={0}
            max={total || 0}
            step={FRAME_STEP}
            value={total ? Math.min(time, total) : 0}
            disabled={!seekable}
            onChange={(event) => {
              const node = video.current;
              if (!node) return;
              node.currentTime = Number(event.target.value);
              setTime(node.currentTime);
            }}
          />
        </label>
        <span className="flow-time">
          {formatDuration(time)} / {total ? formatDuration(total) : "–:––"}
        </span>
        <ToolButton
          icon="fullscreen"
          label="Full screen"
          onClick={() => void video.current?.requestFullscreen?.()}
        />
      </div>
    </figure>
  );
}

export function LiveFrame({ src, alt }: { src: string; alt: string }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const next = new Image();
    next.src = src;
    void next
      .decode()
      .then(() => {
        if (!cancelled) setShown(src);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);
  return shown ? (
    <img className="flow-live-frame" src={shown} alt={alt} />
  ) : (
    <div className="flow-live-frame" aria-hidden="true" />
  );
}
