// Loaded in a hidden frame inside Vistralo's web app by the bridge. It reads the finished
// recording from the extension's storage and posts it to the app, and only to an allowed origin.
import { EXTENSION_SOURCE, isSessionId } from "./messages";
import { fileName, getSession, takeBlob } from "./store";

declare const VISTRALO_APP_ORIGINS: string[];
const params = new URLSearchParams(location.hash.slice(1));
const id = params.get("id") ?? "";
const nonce = params.get("nonce") ?? "";
const origin = params.get("origin") ?? "";
// The frame's real parent, which a page cannot fake, must be the app that asked.
const parentOrigin = location.ancestorOrigins?.[0] ?? "";

void (async () => {
  if (!VISTRALO_APP_ORIGINS.includes(origin) || parentOrigin !== origin || !isSessionId(id) || !/^[0-9a-f]{32}$/.test(nonce)) return;
  const reply = (body: Record<string, unknown>) => window.parent.postMessage({ source: EXTENSION_SOURCE, nonce, id, ...body }, origin);
  try {
    const session = await getSession(id);
    if (!session) return reply({ type: "missing" });
    const blob = await takeBlob(session);
    if (!blob.size) return reply({ type: "missing" });
    reply({
      type: "recording",
      file: new File([blob], fileName(session), { type: blob.type, lastModified: Date.parse(session.created) }),
      microphone: session.microphone,
      mode: session.mode,
      title: session.title,
      url: session.url,
      durationMs: session.durationMs,
      interrupted: session.state !== "complete",
    });
  } catch (failure) {
    reply({ type: "error", message: failure instanceof Error ? failure.message : "The recording could not be read." });
  }
})();
