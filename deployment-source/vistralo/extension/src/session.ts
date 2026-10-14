// The recording session as one value, changed only through `reduce`. The recorder tab owns the
// media and is the only writer; every other part of the extension reads the snapshot it stores.

export type Mode = "tab" | "screen" | "camera";

export type Phase =
  | "idle"
  | "requesting"
  | "countdown"
  | "recording"
  | "paused"
  | "stopping"
  | "finalizing"
  | "ready"
  | "cancelled"
  | "failed";

export interface Snapshot {
  id: string;
  mode: Mode;
  phase: Phase;
  /** Recorded time before `runningSince`. Pauses and countdowns are not counted. */
  elapsedMs: number;
  /** When the current stretch of recording began, or null while not recording. */
  runningSince: number | null;
  countdownEndsAt: number | null;
  /** Start over begins a new take; only the last take is kept. */
  take: number;
  sourceTabId: number | null;
  recorderTabId: number | null;
  microphone: boolean;
  camera: boolean;
  bytes: number;
  error: string;
  title: string;
  url: string;
  updatedAt: number;
}

export type SessionEvent =
  | { type: "countdown"; at: number; countdownMs: number }
  | { type: "started"; at: number }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "stop"; at: number }
  | { type: "finalizing"; at: number }
  | { type: "ready"; at: number; bytes: number }
  | { type: "restart"; at: number; countdownMs: number }
  | { type: "cancel"; at: number }
  | { type: "fail"; at: number; error: string }
  | { type: "bytes"; at: number; bytes: number };

/** A session in one of these phases holds the screen, camera or microphone, or is about to. */
export const ACTIVE_PHASES: readonly Phase[] = [
  "requesting",
  "countdown",
  "recording",
  "paused",
  "stopping",
  "finalizing",
];

export const isActive = (phase: Phase) => ACTIVE_PHASES.includes(phase);

export function newSession(
  input: Pick<Snapshot, "id" | "mode" | "sourceTabId" | "microphone" | "camera" | "title" | "url">,
  at: number,
): Snapshot {
  return {
    ...input,
    phase: "requesting",
    elapsedMs: 0,
    runningSince: null,
    countdownEndsAt: null,
    take: 1,
    recorderTabId: null,
    bytes: 0,
    error: "",
    updatedAt: at,
  };
}

/** Recorded milliseconds at `now`. */
export function elapsed(s: Snapshot, now: number) {
  return s.elapsedMs + (s.runningSince === null ? 0 : Math.max(0, now - s.runningSince));
}

/**
 * The next snapshot, or null when the event does not apply in this phase. A null is not an
 * error: a second Stop, a Pause after Stop, or a message repeated after a restart is ignored.
 */
export function reduce(s: Snapshot, e: SessionEvent): Snapshot | null {
  const next = (patch: Partial<Snapshot>): Snapshot => ({ ...s, ...patch, updatedAt: e.at });
  switch (e.type) {
    case "countdown":
      return s.phase === "requesting"
        ? next({ phase: "countdown", countdownEndsAt: e.at + e.countdownMs })
        : null;
    case "started":
      return s.phase === "countdown" || (s.phase === "requesting")
        ? next({ phase: "recording", runningSince: e.at, countdownEndsAt: null })
        : null;
    case "pause":
      return s.phase === "recording"
        ? next({ phase: "paused", elapsedMs: elapsed(s, e.at), runningSince: null })
        : null;
    case "resume":
      return s.phase === "paused" ? next({ phase: "recording", runningSince: e.at }) : null;
    case "stop":
      return s.phase === "recording" || s.phase === "paused"
        ? next({ phase: "stopping", elapsedMs: elapsed(s, e.at), runningSince: null })
        : null;
    case "finalizing":
      return s.phase === "stopping" ? next({ phase: "finalizing" }) : null;
    case "ready":
      return s.phase === "finalizing" ? next({ phase: "ready", bytes: e.bytes }) : null;
    case "restart":
      return s.phase === "recording" || s.phase === "paused"
        ? next({
            phase: "countdown",
            take: s.take + 1,
            elapsedMs: 0,
            runningSince: null,
            bytes: 0,
            countdownEndsAt: e.at + e.countdownMs,
          })
        : null;
    case "cancel":
      return isActive(s.phase) && s.phase !== "finalizing"
        ? next({ phase: "cancelled", runningSince: null, countdownEndsAt: null })
        : null;
    case "fail":
      return isActive(s.phase)
        ? next({
            phase: "failed",
            elapsedMs: elapsed(s, e.at),
            runningSince: null,
            countdownEndsAt: null,
            error: e.error,
          })
        : null;
    case "bytes":
      return s.phase === "recording" || s.phase === "paused" || s.phase === "stopping"
        ? next({ bytes: e.bytes })
        : null;
  }
}

export function formatClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}
