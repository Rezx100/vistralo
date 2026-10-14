// First run, and the place the popup sends people when the microphone or camera is not allowed
// yet. Chrome shows its permission prompt in a page like this one, not in the popup.
import { $, devices, permission, show } from "./ui";

async function refresh() {
  const [mic, cam] = await Promise.all([permission("microphone"), permission("camera")]);
  $("mic-state", HTMLElement).textContent = mic === "granted" ? "Allowed" : mic === "denied" ? "Blocked" : "Not asked yet";
  $("cam-state", HTMLElement).textContent = cam === "granted" ? "Allowed" : cam === "denied" ? "Blocked" : "Not asked yet";
  show("blocked", mic === "denied" || cam === "denied");
  const [mics, cams] = await Promise.all([devices("audioinput"), devices("videoinput")]);
  $("found", HTMLElement).textContent = `${mics.length} microphone${mics.length === 1 ? "" : "s"} and ${cams.length} camera${cams.length === 1 ? "" : "s"} found.`;
  show("done", mic === "granted" || cam === "granted");
}

async function ask(kind: "audio" | "video") {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(kind === "audio" ? { audio: true } : { video: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* The state line says what happened. */
  }
  await refresh();
}

$("allow-mic", HTMLButtonElement).onclick = () => void ask("audio");
$("allow-cam", HTMLButtonElement).onclick = () => void ask("video");
void refresh();
