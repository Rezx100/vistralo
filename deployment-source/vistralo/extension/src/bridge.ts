// Runs only in Vistralo's own web app. It tells the app the extension is installed and hands over
// a finished recording when the app asks for it. The recording travels as a Blob from an
// extension frame straight to the app; nothing here reads the app's account or session.
import { APP_SOURCE, EXTENSION_SOURCE, isAppMessage } from "./messages";

const version = chrome.runtime.getManifest().version;
const announce = () => window.postMessage({ source: EXTENSION_SOURCE, type: "installed", version }, location.origin);
announce();

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin || !isAppMessage(event.data)) return;
  const message = event.data;
  if (message.type === "ping") announce();
  else if (message.type === "import") {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.src = chrome.runtime.getURL(
      `handoff.html#${new URLSearchParams({ id: message.id, nonce: message.nonce, origin: location.origin })}`,
    );
    document.documentElement.append(frame);
    // The frame posts the recording to the app itself; it is not needed after a minute.
    setTimeout(() => frame.remove(), 60000);
  } else if (message.type === "staged") {
    void chrome.runtime.sendMessage({ to: "background", type: "staged", sessionId: message.id }).catch(() => {});
  }
});
void APP_SOURCE;
