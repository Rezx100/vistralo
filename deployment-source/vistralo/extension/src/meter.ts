// The microphone meter inside the page bar: an extension frame, because only extension contexts
// receive the engine's level messages. It draws five bars, and a struck microphone when muted.
import { isMeterMessage } from "./messages";

const ENGINE = chrome.runtime.getURL("offscreen.html");
const bars = Array.from(document.querySelectorAll<HTMLElement>(".meter span"));

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!isMeterMessage(message) || sender.url !== ENGINE) return false;
  document.body.classList.toggle("is-muted", message.muted);
  const lit = Math.round(message.level * bars.length);
  bars.forEach((bar, i) => bar.classList.toggle("is-on", i < lit));
  return false;
});
