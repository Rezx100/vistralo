// Recording controls and the camera bubble, drawn on the page being recorded. They live in a
// closed shadow root so the page's styles and scripts do not reach them. They hold no media and
// no account data: they read the session snapshot and send controls to the service worker.
import { BUBBLE_SIZES, type ControlAction, type StartOptions } from "./messages";
import { elapsed, formatClock, isActive, type Snapshot } from "./session";

declare global {
  interface Window {
    __vistraloControls?: boolean;
  }
}

if (!window.__vistraloControls) {
  window.__vistraloControls = true;
  void mount();
}

async function mount() {
  const host = document.createElement("vistralo-controls");
  host.setAttribute("data-vistralo", "");
  const root = host.attachShadow({ mode: "closed" });
  try {
    const css = await (await fetch(chrome.runtime.getURL("controls.css"))).text();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch {
    /* Unstyled controls still work. */
  }
  root.innerHTML = `
    <div class="count" part="count" hidden><span></span><p>Esc to cancel</p></div>
    <div class="bar" role="toolbar" aria-label="Vistralo recording" hidden>
      <span class="dot" aria-hidden="true"></span>
      <time class="clock" aria-live="off">0:00</time>
      <iframe class="meter" title="Microphone level" hidden></iframe>
      <button type="button" data-action="mute" aria-label="Mute microphone" title="Mute microphone" hidden>🎙</button>
      <button type="button" data-action="size" aria-label="Change camera size" title="Camera size" hidden>◐</button>
      <button type="button" data-action="pause" aria-label="Pause recording" title="Pause">❚❚</button>
      <button type="button" data-action="restart" aria-label="Start over" title="Start over">↺</button>
      <button type="button" data-action="cancel" aria-label="Discard recording" title="Discard">✕</button>
      <button type="button" class="stop" data-action="stop">Stop</button>
      <button type="button" class="hide" aria-label="Hide controls" title="Hide controls">–</button>
    </div>
    <button type="button" class="reveal" aria-label="Show recording controls" hidden>●</button>`;
  document.documentElement.append(host);

  const q = <T extends Element>(s: string) => root.querySelector(s) as T;
  const bar = q<HTMLElement>(".bar");
  const count = q<HTMLElement>(".count");
  const clock = q<HTMLElement>(".clock");
  const pause = q<HTMLButtonElement>('[data-action="pause"]');
  const reveal = q<HTMLButtonElement>(".reveal");
  const mute = q<HTMLButtonElement>('[data-action="mute"]');
  const size = q<HTMLButtonElement>('[data-action="size"]');
  const meter = q<HTMLIFrameElement>(".meter");
  let hidden = false;
  let bubble: HTMLElement | null = null;
  let snapshot: Snapshot | null = null;
  let tick: number | undefined;

  const send = (action: ControlAction) => void chrome.runtime.sendMessage({ to: "background", type: "control", action }).catch(() => {});
  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest("button");
    if (!target) return;
    if (target === reveal || target.classList.contains("hide")) {
      hidden = !hidden;
      paint();
      return;
    }
    const action = target.dataset.action;
    if (action === "pause") send(snapshot?.phase === "paused" ? "resume" : "pause");
    else if (action === "mute") send(snapshot?.muted ? "unmute" : "mute");
    else if (action === "size") void nextBubbleSize();
    else if (action === "cancel") {
      if (confirm("Discard this recording?")) send("cancel");
    } else if (action) send(action as ControlAction);
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && snapshot?.phase === "countdown") {
        event.preventDefault();
        send("cancel");
      }
    },
    true,
  );

  /** Small, medium, large, and round again; remembered for the next recording too. */
  async function nextBubbleSize() {
    const { options } = (await chrome.storage.local.get("options")) as { options?: StartOptions };
    if (!options) return;
    const next = BUBBLE_SIZES[(BUBBLE_SIZES.indexOf(options.bubbleSize ?? "medium") + 1) % BUBBLE_SIZES.length];
    await chrome.storage.local.set({ options: { ...options, bubbleSize: next } });
  }

  async function ensureBubble(s: Snapshot) {
    const { options } = (await chrome.storage.local.get("options")) as { options?: StartOptions };
    const want = s.camera && s.mode !== "camera" && options?.bubble !== false && !!options?.camera;
    if (want && !bubble) {
      // The camera is used by an extension page in a frame: the page itself never gets the camera.
      const frame = document.createElement("iframe");
      frame.src = chrome.runtime.getURL(`camera.html#${encodeURIComponent(options!.camera!)}`);
      frame.allow = "camera";
      frame.title = "Your camera";
      bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.append(frame);
      root.append(bubble);
      draggable(bubble);
    } else if (!want && bubble) {
      bubble.remove();
      bubble = null;
    }
    if (bubble) bubble.dataset.size = options?.bubbleSize ?? "medium";
    size.hidden = !bubble;
  }

  function paint() {
    const s = snapshot;
    const live = !!s && isActive(s.phase) && s.phase !== "finalizing";
    if (!live) {
      host.remove();
      window.__vistraloControls = false;
      clearInterval(tick);
      chrome.storage.onChanged.removeListener(changed);
      return;
    }
    mute.hidden = !s.microphone;
    mute.classList.toggle("is-off", s.muted);
    mute.setAttribute("aria-label", s.muted ? "Unmute microphone" : "Mute microphone");
    mute.title = s.muted ? "Unmute microphone" : "Mute microphone";
    if (s.microphone && meter.hidden) {
      meter.src = chrome.runtime.getURL("meter.html");
      meter.hidden = false;
    }
    count.hidden = s.phase !== "countdown";
    bar.hidden = hidden || s.phase === "countdown" || s.phase === "requesting";
    reveal.hidden = !hidden;
    pause.textContent = s.phase === "paused" ? "▶" : "❚❚";
    pause.setAttribute("aria-label", s.phase === "paused" ? "Resume recording" : "Pause recording");
    bar.classList.toggle("is-paused", s.phase === "paused");
    clock.textContent = formatClock(elapsed(s, Date.now()));
    if (s.phase === "countdown" && s.countdownEndsAt)
      count.querySelector("span")!.textContent = String(Math.max(1, Math.ceil((s.countdownEndsAt - Date.now()) / 1000)));
  }

  function update(s: Snapshot | null) {
    snapshot = s;
    paint();
    clearInterval(tick);
    if (s && (s.phase === "recording" || s.phase === "countdown")) tick = window.setInterval(paint, 250);
    if (s && isActive(s.phase)) void ensureBubble(s);
  }

  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === "session" && "session" in changes) update((changes.session.newValue as Snapshot) ?? null);
    if (area === "local" && "options" in changes && snapshot) void ensureBubble(snapshot);
  }
  const { session } = await chrome.storage.session.get("session").catch(() => ({ session: null }));
  chrome.storage.onChanged.addListener(changed);
  update((session as Snapshot) ?? null);
}

/** Lets the bubble be moved out of the way; it stays inside the window. */
function draggable(element: HTMLElement) {
  let start: { x: number; y: number; left: number; top: number } | null = null;
  element.addEventListener("pointerdown", (event) => {
    const box = element.getBoundingClientRect();
    start = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", (event) => {
    if (!start) return;
    const left = Math.min(window.innerWidth - element.offsetWidth, Math.max(0, start.left + event.clientX - start.x));
    const top = Math.min(window.innerHeight - element.offsetHeight, Math.max(0, start.top + event.clientY - start.y));
    element.style.setProperty("left", `${left}px`);
    element.style.setProperty("top", `${top}px`);
    element.style.setProperty("bottom", "auto");
  });
  element.addEventListener("pointerup", () => (start = null));
}
