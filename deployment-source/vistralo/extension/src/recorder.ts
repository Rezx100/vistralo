// The recordings page: the recording under way (with the camera on show in camera-only mode),
// a finished recording to play, download, save to Vistralo or discard, and every recording this
// browser still holds. The recording itself runs in the offscreen document, not here.
import type { ControlAction } from "./messages";
import { elapsed, formatClock, isActive, type Snapshot } from "./session";
import { currentSnapshot, importUrl, onSnapshot, savedOptions, writeSnapshot } from "./settings";
import { deleteSession, fileName, getSession, listSessions, takeBlob, type StoredSession } from "./store";
import { $, button, show } from "./ui";

let sessionId = location.hash.slice(1);
let snapshot: Snapshot | null = null;
let tick: number | undefined;
let cameraPreview: MediaStream | null = null;
let shown = "";

const control = (action: ControlAction) => void chrome.runtime.sendMessage({ to: "background", type: "control", action });

function statusText(s: Snapshot | null) {
  switch (s?.phase) {
    case "requesting":
      return s.mode === "screen" ? "Choose what to share in Chrome's dialog" : "Starting…";
    case "countdown":
      return "Recording starts in a moment";
    case "recording":
      return s.mode === "camera" ? "Recording your camera" : "Recording";
    case "paused":
      return "Paused";
    case "stopping":
    case "finalizing":
      return "Finishing the recording…";
    case "ready":
      return "Your recording is ready";
    case "cancelled":
      return "Recording discarded";
    case "failed":
      return "The recording stopped";
    default:
      return "";
  }
}

async function showCamera(on: boolean) {
  const video = $("live-preview", HTMLVideoElement);
  if (on && !cameraPreview) {
    const options = await savedOptions();
    try {
      cameraPreview = await navigator.mediaDevices.getUserMedia({
        video: options.camera && options.camera !== "default" ? { deviceId: { exact: options.camera } } : true,
        audio: false,
      });
      video.srcObject = cameraPreview;
      void video.play().catch(() => {});
    } catch {
      /* The recording does not depend on this preview. */
    }
  } else if (!on && cameraPreview) {
    cameraPreview.getTracks().forEach((t) => t.stop());
    cameraPreview = null;
    video.srcObject = null;
  }
}

function render() {
  const s = snapshot && snapshot.id === sessionId ? snapshot : null;
  const phase = s?.phase ?? "idle";
  document.body.dataset.phase = phase;
  $("status", HTMLElement).textContent = statusText(s);
  // With nothing recording and nothing open, the list below is the page; it has its own heading.
  show("status-line", !!statusText(s));
  const live = !!s && isActive(phase);
  $("clock", HTMLElement).hidden = !live;
  $("clock", HTMLElement).textContent = s ? formatClock(elapsed(s, Date.now())) : "0:00";
  const running = phase === "recording" || phase === "paused";
  show("controls", live);
  $("pause", HTMLButtonElement).textContent = phase === "paused" ? "Resume" : "Pause";
  for (const id of ["pause", "restart", "stop"]) $(id, HTMLButtonElement).disabled = !running;
  show("live", live && s.mode === "camera");
  void showCamera(live && s!.mode === "camera");
  const notice = s?.error ?? "";
  $("notice", HTMLElement).textContent = notice;
  show("notice", !!notice);
  clearInterval(tick);
  if (phase === "recording") tick = window.setInterval(() => ($("clock", HTMLElement).textContent = formatClock(elapsed(s!, Date.now()))), 250);
  document.title = phase === "recording" ? "● Recording · Vistralo" : phase === "paused" ? "Paused · Vistralo" : "Vistralo recordings";
  if (!live) void showStored();
}

let resultUrl = "";
async function showStored() {
  const stored = sessionId ? await getSession(sessionId).catch(() => undefined) : undefined;
  if (stored && stored.state !== "recording") {
    if (shown !== stored.id) await showResult(stored);
  } else show("result", false);
  await showLibrary();
}

async function showResult(stored: StoredSession) {
  shown = stored.id;
  const blob = await takeBlob(stored);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(blob);
  $("result-video", HTMLVideoElement).src = resultUrl;
  const download = $("download", HTMLAnchorElement);
  download.href = resultUrl;
  download.download = fileName(stored);
  $("result-meta", HTMLElement).textContent = [
    formatClock(stored.durationMs),
    `${(blob.size / 1024 / 1024).toFixed(1)} MB`,
    stored.state === "interrupted" ? "Interrupted: plays up to the last second saved" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  $("save", HTMLButtonElement).onclick = () => void chrome.tabs.create({ url: importUrl(stored.id) });
  $("discard", HTMLButtonElement).onclick = async () => {
    if (!confirm("Discard this recording? It is deleted from this browser.")) return;
    await deleteSession(stored.id);
    if ((await currentSnapshot())?.id === stored.id) await writeSnapshot(null);
    shown = "";
    sessionId = "";
    history.replaceState(null, "", "#");
    show("result", false);
    URL.revokeObjectURL(resultUrl);
    await showLibrary();
  };
  show("result", true);
}

async function showLibrary() {
  const sessions = (await listSessions().catch(() => [] as StoredSession[]))
    .filter((s) => s.id !== sessionId && !(snapshot && isActive(snapshot.phase) && s.id === snapshot.id))
    .sort((a, b) => b.created.localeCompare(a.created));
  const list = $("library-list", HTMLUListElement);
  list.replaceChildren();
  for (const s of sessions) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent =
      s.state === "complete"
        ? `${new Date(s.created).toLocaleString()} · ${formatClock(s.durationMs)}`
        : `${new Date(s.created).toLocaleString()} · about ${formatClock(s.durationMs)} · interrupted`;
    item.append(
      label,
      button("Open", () => {
        sessionId = s.id;
        history.replaceState(null, "", `#${s.id}`);
        render();
        window.scrollTo(0, 0);
      }),
    );
    list.append(item);
  }
  show("library", sessions.length > 0);
  show("empty", sessions.length === 0 && $("result", HTMLElement).hidden);
}

$("pause", HTMLButtonElement).onclick = () => control(snapshot?.phase === "paused" ? "resume" : "pause");
$("stop", HTMLButtonElement).onclick = () => control("stop");
$("restart", HTMLButtonElement).onclick = () => control("restart");
$("cancel", HTMLButtonElement).onclick = () => {
  if (confirm("Discard this recording?")) control("cancel");
};

void (async () => {
  snapshot = await currentSnapshot();
  render();
  onSnapshot((s) => {
    snapshot = s;
    render();
  });
})();
