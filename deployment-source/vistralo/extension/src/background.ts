// The service worker starts sessions, stores the snapshot the recording engine reports, and routes
// controls. It holds no media and nothing that is not also in chrome.storage.session, because
// Chrome may stop it at any moment; the offscreen document keeps recording when it does.
import {
  isBackgroundRequest,
  senderKind,
  type BackgroundRequest,
  type ControlAction,
  type EngineRequest,
  type StartOptions,
} from "./messages";
import { isActive, newSession, type Snapshot } from "./session";
import { currentSnapshot, importUrl, onSnapshot, savedOptions, writeSnapshot } from "./settings";
import { deleteSession, getSession, listSessions, putSession } from "./store";

const OWN_ORIGIN = chrome.runtime.getURL("");
const ENGINE = "offscreen.html";

// Content scripts read the snapshot to draw the page controls; only extension contexts can
// write storage, and only this worker writes the snapshot.
const openStorageToPages = () =>
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }).catch(() => {});
openStorageToPages();
chrome.runtime.onInstalled.addListener((details) => {
  openStorageToPages();
  if (details.reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});
chrome.runtime.onStartup.addListener(() => void markInterrupted());

/** A take still marked "recording" when Chrome starts again was cut off by a quit or crash. */
async function markInterrupted() {
  for (const s of await listSessions().catch(() => [])) if (s.state === "recording") await putSession({ ...s, state: "interrupted" }).catch(() => {});
}

async function engineOpen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return contexts.length > 0;
}

async function openEngine() {
  if (await engineOpen()) await chrome.offscreen.closeDocument().catch(() => {});
  await chrome.offscreen.createDocument({
    url: ENGINE,
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
    justification: "Records the tab, window, screen, camera and microphone the user chose, and keeps recording while they browse.",
  });
}

const toEngine = (message: EngineRequest) => chrome.runtime.sendMessage(message).catch(() => {});

/**
 * Pages Chrome does not let an extension record or draw on. An unknown address (no click on the
 * toolbar button gave access to the tab) is not treated as restricted: Chrome itself will refuse.
 */
export function restrictedUrl(url: string | undefined) {
  if (!url) return false;
  return !/^(https?|file):/i.test(url) || /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i.test(url);
}

async function showControls(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["controls.js"] }).catch(() => {
    // No access to this page (a Chrome page, or the tab moved to a site Vistralo was not given).
    // The popup, the toolbar badge and the keyboard shortcuts still control the recording.
  });
}

let starting = false;

async function start(options: StartOptions, tabId: number | null): Promise<{ ok: true } | { error: string }> {
  // Two clicks, or a click and a shortcut, must not start two recordings.
  if (starting) return { error: "A recording is already starting." };
  const existing = await currentSnapshot();
  if (existing && isActive(existing.phase) && (await engineOpen())) return { error: "A recording is already in progress." };
  starting = true;
  try {
    const source = tabId === null ? null : await chrome.tabs.get(tabId).catch(() => null);
    if (options.mode === "tab" && (!source?.id || restrictedUrl(source.url)))
      return { error: "Chrome does not allow recording this page. Open a website, or record a window or screen instead." };
    const known = !!source?.url && !restrictedUrl(source.url);
    const s: Snapshot = newSession(
      {
        id: crypto.randomUUID(),
        mode: options.mode,
        sourceTabId: source?.id ?? null,
        microphone: options.microphone !== null,
        camera: options.camera !== null,
        title: known ? (source!.title ?? "") : "",
        url: known ? source!.url! : "",
      },
      Date.now(),
    );
    // The tab's stream id is asked for first, while the click that started this still counts.
    const streamId = options.mode === "tab" ? await chrome.tabCapture.getMediaStreamId({ targetTabId: source!.id! }) : null;
    await writeSnapshot(s);
    await openEngine();
    await toEngine({ to: "engine", type: "begin", sessionId: s.id, streamId, options, snapshot: s });
    if (options.mode === "camera") void chrome.tabs.create({ url: chrome.runtime.getURL(`recorder.html#${s.id}`) });
    else if (source?.id && !restrictedUrl(source.url)) await showControls(source.id);
    return { ok: true };
  } catch (failure) {
    const error = failure instanceof Error ? failure.message : "The recording could not start.";
    return { error: /activeTab|invoked/.test(error) ? "Click Vistralo in the toolbar on the tab you want to record, then start again." : error };
  } finally {
    starting = false;
  }
}

async function control(action: ControlAction) {
  const s = await currentSnapshot();
  if (!s || !isActive(s.phase)) return;
  if (!(await engineOpen())) {
    // The engine is gone (Chrome closed it or crashed): nothing is recording any more.
    await writeSnapshot({ ...s, phase: "failed", runningSince: null, countdownEndsAt: null, error: "The recording stopped unexpectedly. What was recorded is kept.", updatedAt: Date.now() });
    await markInterrupted();
    return;
  }
  await toEngine({ to: "engine", type: "control", sessionId: s.id, action });
}

async function finished(id: string, open: boolean) {
  await chrome.offscreen.closeDocument().catch(() => {});
  const s = await currentSnapshot();
  if (s?.id !== id) return;
  if (s.phase === "ready" || s.phase === "failed") {
    const stored = await getSession(id).catch(() => undefined);
    if (!stored) return;
    void chrome.tabs.create({ url: open ? importUrl(id) : chrome.runtime.getURL(`recorder.html#${id}`) });
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!isBackgroundRequest(message)) return false;
  const kind = senderKind(sender, chrome.runtime.id, OWN_ORIGIN);
  if (kind === "foreign") return false;
  const request = message as BackgroundRequest;
  const fromEngine = kind === "extension" && !!sender.url?.startsWith(OWN_ORIGIN + ENGINE);
  switch (request.type) {
    case "start":
      if (kind !== "extension") return false;
      void start(request.options, request.tabId).then(respond);
      return true;
    case "control":
      void control(request.action).then(() => respond({ ok: true }));
      return true;
    case "snapshot":
      // Only the engine reports the snapshot, and only for the session under way.
      if (!fromEngine) return false;
      void currentSnapshot().then((s) => {
        if (s?.id === request.snapshot.id) void writeSnapshot(request.snapshot);
      });
      return false;
    case "finished":
      if (!fromEngine) return false;
      void finished(request.sessionId, request.open);
      return false;
    case "staged":
      // The web app has its own copy now (reported by the bridge in the app's tab).
      void staged(request.sessionId);
      return false;
  }
});

async function staged(id: string) {
  const stored = await getSession(id).catch(() => undefined);
  // Never delete a take still being recorded, whatever a page says.
  if (!stored || stored.state === "recording") return;
  await deleteSession(id).catch(() => {});
  const s = await currentSnapshot();
  if (s?.id === id && !isActive(s.phase)) await writeSnapshot(null);
}

chrome.commands.onCommand.addListener((command, tab) => {
  void (async () => {
    const s = await currentSnapshot();
    const live = !!s && isActive(s.phase);
    if (command === "toggle-recording") {
      if (!live) {
        const result = await start(await savedOptions(), tab?.id ?? null);
        if ("error" in result) await flashBadge("!");
      } else if (s.phase === "recording" || s.phase === "paused") await control("stop");
      else if (s.phase === "countdown" || s.phase === "requesting") await control("cancel");
    } else if (command === "pause-resume" && live) await control(s.phase === "paused" ? "resume" : "pause");
    else if (command === "cancel-recording" && live) await control("cancel");
  })();
});

// A page that was navigated loses the controls drawn on it; draw them again where Chrome lets us.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete") return;
  void currentSnapshot().then((s) => {
    if (s && isActive(s.phase) && s.mode !== "camera" && s.sourceTabId === tabId) void showControls(tabId);
  });
});

async function flashBadge(text: string) {
  await chrome.action.setBadgeText({ text });
  setTimeout(() => void syncBadge(), 3000);
}

async function syncBadge(s?: Snapshot | null) {
  const snap = s === undefined ? await currentSnapshot() : s;
  const text = snap?.phase === "recording" ? "REC" : snap?.phase === "paused" ? "II" : snap?.phase === "countdown" ? "…" : "";
  await chrome.action.setBadgeText({ text });
  // The badge takes a colour value, not a stylesheet: these are the record and muted tokens' values.
  await chrome.action.setBadgeBackgroundColor({ color: snap?.phase === "paused" ? "#5c6270" : "#d42a1f" });
  await chrome.action.setTitle({
    title: snap?.phase === "recording" ? "Vistralo is recording" : snap?.phase === "paused" ? "Vistralo recording paused" : "Record with Vistralo",
  });
}
onSnapshot((s) => void syncBadge(s));
void syncBadge();
