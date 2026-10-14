import type { StartOptions } from "./messages";
import { isStartOptions } from "./messages";
import type { Snapshot } from "./session";

export const DEFAULT_OPTIONS: StartOptions = {
  mode: "tab",
  microphone: "default",
  camera: null,
  bubble: true,
  bubbleSize: "medium",
  systemAudio: true,
  countdown: true,
  openWhenDone: true,
};

/** The choices made last time, which the popup and the keyboard shortcut start with. */
export async function savedOptions(): Promise<StartOptions> {
  const { options } = await chrome.storage.local.get("options");
  const merged = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  return isStartOptions(merged) ? merged : DEFAULT_OPTIONS;
}

export const saveOptions = (options: StartOptions) => chrome.storage.local.set({ options });

export async function currentSnapshot(): Promise<Snapshot | null> {
  const { session } = await chrome.storage.session.get("session");
  return (session as Snapshot | undefined) ?? null;
}

export const writeSnapshot = (session: Snapshot | null) =>
  session ? chrome.storage.session.set({ session }) : chrome.storage.session.remove("session");

export function onSnapshot(listener: (s: Snapshot | null) => void) {
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "session" && "session" in changes) listener((changes.session.newValue as Snapshot) ?? null);
  };
  chrome.storage.onChanged.addListener(changed);
  return () => chrome.storage.onChanged.removeListener(changed);
}

declare const VISTRALO_APP_ORIGIN: string;
/** Where recordings are saved: app.vistralo.com, or a local build of the app in development. */
export const APP_ORIGIN = VISTRALO_APP_ORIGIN;
declare const VISTRALO_APP_DEMO: boolean;
export const importUrl = (id: string) => `${APP_ORIGIN}/#${VISTRALO_APP_DEMO ? "demo/" : ""}import/${id}`;
