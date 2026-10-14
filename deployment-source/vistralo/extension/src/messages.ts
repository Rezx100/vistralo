// Every message the extension's parts send each other, and the checks a receiver runs before
// acting on one. Nothing here trusts a message because of its shape alone: senders are checked too.
import type { Mode, Phase, Snapshot } from "./session";

export interface StartOptions {
  mode: Mode;
  /** A microphone's deviceId, "default", or null for no microphone. */
  microphone: string | null;
  /** A camera's deviceId, "default", or null for no camera. */
  camera: string | null;
  /** Show the camera bubble on the page being recorded. */
  bubble: boolean;
  /** Record the tab's own sound (tab mode) or system sound where Chrome's chooser offers it. */
  systemAudio: boolean;
  countdown: boolean;
  /** Hand the recording to Vistralo as soon as it is ready. */
  openWhenDone: boolean;
}

export type ControlAction = "pause" | "resume" | "stop" | "restart" | "cancel";

/** To the service worker. */
export type BackgroundRequest =
  | { to: "background"; type: "start"; tabId: number | null; options: StartOptions }
  | { to: "background"; type: "control"; action: ControlAction }
  | { to: "background"; type: "snapshot"; snapshot: Snapshot }
  | { to: "background"; type: "finished"; sessionId: string; open: boolean }
  | { to: "background"; type: "staged"; sessionId: string };

/** To the offscreen document that records. */
export type EngineRequest =
  | {
      to: "engine";
      type: "begin";
      sessionId: string;
      /** From tabCapture for a tab; null for a window or screen (Chrome's chooser) or the camera. */
      streamId: string | null;
      options: StartOptions;
      snapshot: Snapshot;
    }
  | { to: "engine"; type: "control"; sessionId: string; action: ControlAction };

const MODES: readonly Mode[] = ["tab", "screen", "camera"];
const PHASES: readonly Phase[] = ["idle", "requesting", "countdown", "recording", "paused", "stopping", "finalizing", "ready", "cancelled", "failed"];
const ACTIONS: readonly ControlAction[] = ["pause", "resume", "stop", "restart", "cancel"];
const ID = /^[0-9a-f-]{36}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const device = (v: unknown) => v === null || (typeof v === "string" && v.length > 0 && v.length <= 256);
const bool = (v: unknown) => typeof v === "boolean";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || num(v);
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;

export const isSessionId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

export function isStartOptions(v: unknown): v is StartOptions {
  return (
    isObject(v) &&
    MODES.includes(v.mode as Mode) &&
    device(v.microphone) &&
    device(v.camera) &&
    bool(v.bubble) &&
    bool(v.systemAudio) &&
    bool(v.countdown) &&
    bool(v.openWhenDone) &&
    // Camera-only needs a camera.
    (v.mode !== "camera" || v.camera !== null)
  );
}

export function isSnapshot(v: unknown): v is Snapshot {
  return (
    isObject(v) &&
    isSessionId(v.id) &&
    MODES.includes(v.mode as Mode) &&
    PHASES.includes(v.phase as Phase) &&
    num(v.elapsedMs) &&
    numOrNull(v.runningSince) &&
    numOrNull(v.countdownEndsAt) &&
    num(v.take) &&
    numOrNull(v.sourceTabId) &&
    numOrNull(v.recorderTabId) &&
    bool(v.microphone) &&
    bool(v.camera) &&
    num(v.bytes) &&
    text(v.error, 500) &&
    text(v.title, 2000) &&
    text(v.url, 4000) &&
    num(v.updatedAt)
  );
}

export function isBackgroundRequest(v: unknown): v is BackgroundRequest {
  if (!isObject(v) || v.to !== "background") return false;
  switch (v.type) {
    case "start":
      return (v.tabId === null || Number.isInteger(v.tabId)) && isStartOptions(v.options);
    case "control":
      return ACTIONS.includes(v.action as ControlAction);
    case "snapshot":
      return isSnapshot(v.snapshot);
    case "finished":
      return isSessionId(v.sessionId) && bool(v.open);
    case "staged":
      return isSessionId(v.sessionId);
    default:
      return false;
  }
}

export function isEngineRequest(v: unknown): v is EngineRequest {
  if (!isObject(v) || v.to !== "engine" || !isSessionId(v.sessionId)) return false;
  switch (v.type) {
    case "begin":
      return (
        (v.streamId === null || (typeof v.streamId === "string" && v.streamId.length > 0 && v.streamId.length < 512)) &&
        isStartOptions(v.options) &&
        isSnapshot(v.snapshot) &&
        v.snapshot.id === v.sessionId
      );
    case "control":
      return ACTIONS.includes(v.action as ControlAction);
    default:
      return false;
  }
}

/**
 * Who sent a runtime message. Extension pages, the offscreen document and the service worker
 * have this extension's origin. Content scripts run in a website's tab: they may send controls,
 * and the bridge in Vistralo's own app may report that it has a recording, but nothing else.
 */
export function senderKind(sender: { id?: string; url?: string }, ownId: string, ownOrigin: string) {
  if (sender.id !== ownId) return "foreign" as const;
  if (sender.url?.startsWith(ownOrigin)) return "extension" as const;
  return "content" as const;
}

// The web app and the extension speak through window.postMessage in the app's own tab.
export const APP_SOURCE = "vistralo-app";
export const EXTENSION_SOURCE = "vistralo-extension";

export type AppToExtension =
  | { source: typeof APP_SOURCE; type: "import"; id: string; nonce: string }
  | { source: typeof APP_SOURCE; type: "staged"; id: string; nonce: string }
  | { source: typeof APP_SOURCE; type: "ping" };

export function isAppMessage(v: unknown): v is AppToExtension {
  if (!isObject(v) || v.source !== APP_SOURCE) return false;
  if (v.type === "ping") return true;
  return (
    (v.type === "import" || v.type === "staged") &&
    isSessionId(v.id) &&
    typeof v.nonce === "string" &&
    /^[0-9a-f]{32}$/.test(v.nonce)
  );
}
