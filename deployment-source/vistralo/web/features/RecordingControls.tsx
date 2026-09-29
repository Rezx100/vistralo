import React, { useEffect, useRef } from "react";
import { Icon } from "../components/Icon";
import { formatDuration } from "./flow-utils";
import type { CaptureArea } from "./capture";

const meterBars = [0.55, 0.85, 1, 0.75, 0.5];

export function RecordingTray({
  paused,
  elapsed,
  micLevel,
  microphone,
  microphoneLive,
  areaLabel,
  floating = false,
  canPopOut = false,
  notice,
  onPause,
  onStop,
  onPopOut,
}: {
  paused: boolean;
  elapsed: number;
  micLevel: number;
  microphone: boolean;
  microphoneLive: boolean;
  areaLabel: string;
  floating?: boolean;
  canPopOut?: boolean;
  /** Shown instead of the controls before recording starts. */
  notice?: string;
  onPause: () => void;
  onStop: () => void;
  onPopOut?: () => void;
}) {
  const level = microphoneLive && !paused ? Math.min(1, micLevel / 60) : 0;
  if (notice)
    return (
      <div
        className={`rec-tray is-waiting ${floating ? "is-floating" : ""}`}
        role="status"
        aria-label="Recording controls"
      >
        <p className="rec-status">
          <span className="rec-dot" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      </div>
    );
  return (
    <div
      className={`rec-tray ${floating ? "is-floating" : ""} ${paused ? "is-paused" : ""}`}
      role="group"
      aria-label="Recording controls"
    >
      <p className="rec-status">
        <span className="rec-dot" aria-hidden="true" />
        <span className="sr-only">{paused ? "Paused" : "Recording"}</span>
        <time aria-label={`Elapsed ${formatDuration(elapsed)}`}>
          {formatDuration(elapsed)}
        </time>
      </p>
      <div className="rec-tray-more">
        <div>
          {microphone && (
            <span
              className={`rec-meter ${microphoneLive ? "" : "is-off"}`}
              style={{ "--level": level.toFixed(2) } as React.CSSProperties}
              role="img"
              aria-label={
                microphoneLive
                  ? level > 0.07
                    ? "Microphone hears you"
                    : "Microphone on"
                  : "Microphone off"
              }
            >
              {meterBars.map((scale, index) => (
                <span
                  key={index}
                  style={{ "--bar": scale } as React.CSSProperties}
                />
              ))}
            </span>
          )}
          <span className="rec-area-label">{areaLabel}</span>
          <span className="rec-divider" aria-hidden="true" />
          <button
            type="button"
            className="rec-icon-button"
            onClick={onPause}
            aria-label={paused ? "Resume recording" : "Pause recording"}
            title={paused ? "Resume" : "Pause"}
          >
            <Icon name={paused ? "play" : "pause"} />
          </button>
          {canPopOut && onPopOut && (
            <button
              type="button"
              className="rec-icon-button"
              onClick={onPopOut}
              aria-label="Float controls above other windows"
              title="Float controls above other windows"
            >
              <Icon name="external" />
            </button>
          )}
        </div>
      </div>
      <button type="button" className="rec-stop" onClick={onStop}>
        <span aria-hidden="true" />
        Stop
      </button>
    </div>
  );
}

type Drag =
  | { mode: "draw"; anchorX: number; anchorY: number }
  | { mode: "move"; offsetX: number; offsetY: number };

const MIN_AREA = 0.04;
const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function between(ax: number, ay: number, bx: number, by: number): CaptureArea {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

export function AreaSelector({
  stream,
  width,
  height,
  area,
  selecting,
  onChange,
}: {
  stream: MediaStream;
  width: number;
  height: number;
  area: CaptureArea | null;
  selecting: boolean;
  onChange: (area: CaptureArea | null) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    surface = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = stream;
    void video.current.play().catch(() => {});
  }, [stream]);

  function point(event: React.PointerEvent) {
    const box = surface.current!.getBoundingClientRect();
    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    };
  }

  function start(event: React.PointerEvent, next: Drag) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    surface.current?.setPointerCapture(event.pointerId);
    drag.current = next;
  }

  function move(event: React.PointerEvent) {
    const current = drag.current;
    if (!current) return;
    const at = point(event);
    if (current.mode === "draw") {
      onChange(between(current.anchorX, current.anchorY, at.x, at.y));
    } else if (area) {
      onChange({
        ...area,
        x: clamp(at.x - current.offsetX, 0, 1 - area.width),
        y: clamp(at.y - current.offsetY, 0, 1 - area.height),
      });
    }
  }

  function end() {
    if (!drag.current) return;
    drag.current = null;
    if (area && (area.width < MIN_AREA || area.height < MIN_AREA)) onChange(null);
  }

  function nudge(event: React.KeyboardEvent) {
    if (!area) return;
    const step = event.altKey ? 0.002 : 0.01;
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (event.key === "Escape") {
      event.preventDefault();
      onChange(null);
      return;
    }
    const delta = keys[event.key];
    if (!delta) return;
    event.preventDefault();
    if (event.shiftKey) {
      onChange({
        ...area,
        width: clamp(area.width + delta[0], MIN_AREA, 1 - area.x),
        height: clamp(area.height + delta[1], MIN_AREA, 1 - area.y),
      });
    } else {
      onChange({
        ...area,
        x: clamp(area.x + delta[0], 0, 1 - area.width),
        y: clamp(area.y + delta[1], 0, 1 - area.height),
      });
    }
  }

  const corners = [
    ["nw", 1, 1],
    ["ne", 0, 1],
    ["sw", 1, 0],
    ["se", 0, 0],
  ] as const;
  const size = area
    ? `${Math.round(area.width * width)} × ${Math.round(area.height * height)}`
    : "";
  return (
    <div
      className={`rec-stage ${selecting ? "is-selecting" : ""}`}
      style={{ "--ratio": width && height ? `${width} / ${height}` : "16 / 9" } as React.CSSProperties}
    >
      <video ref={video} muted playsInline aria-label="Live preview of what will be recorded" />
      <div
        ref={surface}
        className="rec-stage-surface"
        onPointerDown={(event) => {
          if (!selecting) return;
          const at = point(event);
          start(event, { mode: "draw", anchorX: at.x, anchorY: at.y });
          onChange({ x: at.x, y: at.y, width: 0, height: 0 });
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {selecting && !area && (
          <p className="rec-stage-hint">Drag over the part you want to record</p>
        )}
        {selecting && area && (
          <div
            className="rec-area"
            tabIndex={0}
            role="group"
            aria-label={`Selected area ${size} pixels. Arrow keys move it, Shift with arrow keys resizes it, Escape clears it.`}
            style={
              {
                "--ax": `${area.x * 100}%`,
                "--ay": `${area.y * 100}%`,
                "--aw": `${area.width * 100}%`,
                "--ah": `${area.height * 100}%`,
              } as React.CSSProperties
            }
            onKeyDown={nudge}
            onPointerDown={(event) => {
              const at = point(event);
              start(event, { mode: "move", offsetX: at.x - area.x, offsetY: at.y - area.y });
            }}
          >
            {corners.map(([name, fixX, fixY]) => (
              <span
                key={name}
                className={`rec-handle rec-handle-${name}`}
                aria-hidden="true"
                onPointerDown={(event) =>
                  start(event, {
                    mode: "draw",
                    anchorX: area.x + area.width * fixX,
                    anchorY: area.y + area.height * fixY,
                  })
                }
              />
            ))}
            <span className="rec-area-size" aria-hidden="true">
              {size}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
