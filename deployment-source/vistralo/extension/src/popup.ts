// The toolbar popup: choose what to record and start, or control the recording under way.
// Closing it changes nothing; the recording belongs to the recording tab.
import { isMeterMessage, type BubbleSize, type ControlAction, type StartOptions } from "./messages";
import { elapsed, formatClock, isActive, type Mode, type Snapshot } from "./session";
import { APP_ORIGIN, currentSnapshot, onSnapshot, saveOptions, savedOptions } from "./settings";
import { $, devices, permission, show } from "./ui";

let options: StartOptions;
let tab: chrome.tabs.Tab | undefined;
let snapshot: Snapshot | null = null;
let tick: number | undefined;

const restricted = (url?: string) => !url || !/^(https?|file):/i.test(url) || /chromewebstore\.google\.com/.test(url);

function fill(select: HTMLSelectElement, list: { id: string; label: string }[], none: string, chosen: string | null) {
  select.replaceChildren();
  const off = new Option(none, "");
  select.append(off);
  for (const d of list) select.append(new Option(d.label, d.id));
  if (list.length && chosen === "default") select.value = list[0].id;
  else select.value = chosen && list.some((d) => d.id === chosen) ? chosen : chosen ? (list[0]?.id ?? "") : "";
}

async function loadDevices() {
  const [mics, cams] = await Promise.all([devices("audioinput"), devices("videoinput")]);
  fill($("microphone", HTMLSelectElement), mics, "No microphone", options.microphone);
  fill($("camera", HTMLSelectElement), cams, "No camera", options.camera);
  const [mic, cam] = await Promise.all([permission("microphone"), permission("camera")]);
  // Chrome asks for the microphone and camera in a page, not in this popup, so the setup page asks.
  const needs = (options.microphone !== null && mic !== "granted") || (options.camera !== null && cam !== "granted");
  show("permission", needs);
}

function readForm(): StartOptions {
  const mode = (document.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value ?? "tab") as Mode;
  const microphone = $("microphone", HTMLSelectElement).value || null;
  const camera = $("camera", HTMLSelectElement).value || null;
  return {
    mode,
    microphone,
    camera,
    bubble: $("bubble", HTMLInputElement).checked,
    bubbleSize: $("bubble-size", HTMLSelectElement).value as BubbleSize,
    systemAudio: $("system-audio", HTMLInputElement).checked,
    countdown: $("countdown", HTMLInputElement).checked,
    openWhenDone: $("open-when-done", HTMLInputElement).checked,
  };
}

function syncForm() {
  const o = readForm();
  const tabBlocked = o.mode === "tab" && restricted(tab?.url);
  show("tab-blocked", tabBlocked);
  show("bubble-row", o.camera !== null && o.mode !== "camera");
  show("bubble-size-row", o.camera !== null && o.mode !== "camera" && o.bubble);
  show("every-site-row", o.mode !== "camera");
  $("system-audio-label", HTMLElement).textContent = o.mode === "tab" ? "Record the tab's sound" : "Record system sound when offered";
  show("system-audio-row", o.mode !== "camera");
  const noCamera = o.mode === "camera" && o.camera === null;
  show("camera-needed", noCamera);
  $("start", HTMLButtonElement).disabled = tabBlocked || noCamera;
}

async function start() {
  const o = readForm();
  options = o;
  await saveOptions(o);
  $("start", HTMLButtonElement).disabled = true;
  show("error", false);
  const result = await chrome.runtime.sendMessage({ to: "background", type: "start", tabId: tab?.id ?? null, options: o });
  if (result && "error" in result) {
    $("error", HTMLElement).textContent = result.error;
    show("error", true);
    $("start", HTMLButtonElement).disabled = false;
    return;
  }
  // A tab recording begins behind this popup; the popup steps aside so the count-in can be seen.
  if (o.mode === "tab") window.close();
}

function control(action: ControlAction) {
  void chrome.runtime.sendMessage({ to: "background", type: "control", action });
}

function render() {
  const s = snapshot;
  const live = !!s && isActive(s.phase);
  show("setup", !live);
  show("session", live);
  show("last", !!s && s.phase === "ready");
  show("failed", !!s && s.phase === "failed");
  if (s?.phase === "failed") $("failed-text", HTMLElement).textContent = s.error;
  clearInterval(tick);
  if (!live || !s) return;
  const paint = () => {
    $("session-clock", HTMLElement).textContent = formatClock(elapsed(s, Date.now()));
  };
  paint();
  if (s.phase === "recording") tick = window.setInterval(paint, 250);
  $("session-status", HTMLElement).textContent =
    s.phase === "requesting" ? "Starting…" : s.phase === "countdown" ? "Counting in…" : s.phase === "paused" ? "Paused" : s.phase === "recording" ? "Recording" : "Finishing…";
  const running = s.phase === "recording" || s.phase === "paused";
  $("pause", HTMLButtonElement).textContent = s.phase === "paused" ? "Resume" : "Pause";
  for (const id of ["pause", "stop", "restart"]) $(id, HTMLButtonElement).disabled = !running;
  $("cancel", HTMLButtonElement).disabled = !(running || s.phase === "countdown" || s.phase === "requesting");
  show("mic-row", s.microphone);
  document.body.classList.toggle("is-muted", s.muted);
  $("mute", HTMLButtonElement).textContent = s.muted ? "Unmute" : "Mute";
}

function openRecorderTab() {
  const s = snapshot;
  if (s?.recorderTabId != null) void chrome.tabs.update(s.recorderTabId, { active: true }).catch(() => openLibrary());
  else openLibrary();
}
const openLibrary = () => void chrome.tabs.create({ url: chrome.runtime.getURL(`recorder.html#${snapshot?.id ?? ""}`) });

void (async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  options = await savedOptions();
  snapshot = await currentSnapshot();
  const radio = document.querySelector<HTMLInputElement>(`input[name="mode"][value="${options.mode}"]`);
  if (radio) radio.checked = true;
  $("bubble", HTMLInputElement).checked = options.bubble;
  $("bubble-size", HTMLSelectElement).value = options.bubbleSize;
  const hosts = { origins: ["http://*/*", "https://*/*"] };
  const everySite = $("every-site", HTMLInputElement);
  everySite.checked = await chrome.permissions.contains(hosts);
  // Asked for only when ticked, in the click itself, as Chrome requires.
  everySite.addEventListener("change", () => {
    void (everySite.checked ? chrome.permissions.request(hosts) : chrome.permissions.remove(hosts).then(() => false)).then(
      (granted) => (everySite.checked = granted),
      () => (everySite.checked = false),
    );
  });
  $("system-audio", HTMLInputElement).checked = options.systemAudio;
  $("countdown", HTMLInputElement).checked = options.countdown;
  $("open-when-done", HTMLInputElement).checked = options.openWhenDone;
  await loadDevices();
  syncForm();
  render();
  onSnapshot((s) => {
    snapshot = s;
    render();
  });
  document.querySelector("form")!.addEventListener("change", () => {
    syncForm();
    options = readForm();
    void loadDevices().then(syncForm);
  });
  document.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    void start();
  });
  $("allow", HTMLButtonElement).onclick = () => void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  $("pause", HTMLButtonElement).onclick = () => control(snapshot?.phase === "paused" ? "resume" : "pause");
  $("mute", HTMLButtonElement).onclick = () => control(snapshot?.muted ? "unmute" : "mute");
  const bars = Array.from(document.querySelectorAll<HTMLElement>("#mic-row .meter span"));
  const engine = chrome.runtime.getURL("offscreen.html");
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!isMeterMessage(message) || sender.url !== engine) return false;
    const lit = Math.round(message.level * bars.length);
    bars.forEach((bar, i) => bar.classList.toggle("is-on", i < lit));
    return false;
  });
  $("stop", HTMLButtonElement).onclick = () => control("stop");
  $("restart", HTMLButtonElement).onclick = () => control("restart");
  $("cancel", HTMLButtonElement).onclick = () => control("cancel");
  $("open-recorder", HTMLButtonElement).onclick = openRecorderTab;
  $("open-last", HTMLButtonElement).onclick = openLibrary;
  $("library", HTMLButtonElement).onclick = () => void chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html") });
  $("app", HTMLAnchorElement).href = APP_ORIGIN;
  $("shortcuts", HTMLButtonElement).onclick = () => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
})();
