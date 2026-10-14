import { useEffect } from "react";
import type { CreateFlow } from "../features/create-flows";
import { recoverRecording, stageRecording } from "../features/recording-store";

/**
 * Opening #import/<id> asks the Vistralo Chrome extension, through its bridge in this tab, for a
 * recording it holds. The recording is put where an unsaved browser recording waits, so the usual
 * save flow (walkthrough or own voice, upload, recovery) takes it from there. The extension keeps
 * its copy until this page has staged its own.
 */
const SESSION_ID = /^[0-9a-f-]{36}$/;
const WAIT_MS = 8000;

export interface ExtensionRecording {
  file: File;
  microphone: boolean;
  url: string;
}

/** The address a recording was made on, without its query or fragment, which can carry tokens. */
export function recordedPage(raw: unknown) {
  if (typeof raw !== "string" || !raw) return "";
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : "";
  } catch {
    return "";
  }
}

export function useExtensionImport({
  path,
  active,
  notify,
  start,
  leave,
}: {
  path: string[];
  /** Signed in (or the demo): the save flow can open. */
  active: boolean;
  notify: (message: string, error?: boolean) => void;
  start: (flow: CreateFlow, recording: { url: string }) => void;
  leave: () => void;
}) {
  const id = path[0] === "import" ? path[1] : undefined;
  useEffect(() => {
    if (!id || !active) return;
    if (!SESSION_ID.test(id)) {
      notify("That recording link is not valid.", true);
      leave();
      return;
    }
    let done = false;
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    const finish = () => {
      done = true;
      window.removeEventListener("message", receive);
      clearTimeout(timer);
    };
    const receive = (event: MessageEvent) => {
      const data = event.data;
      // Only the extension's own frame answers, and only with the nonce this page sent.
      if (done || !event.origin.startsWith("chrome-extension://") || data?.source !== "vistralo-extension" || data.nonce !== nonce || data.id !== id) return;
      finish();
      if (data.type === "recording" && data.file instanceof File && data.file.size > 0) void stage(data.file, data.microphone === true, recordedPage(data.url));
      else {
        notify(data.type === "missing" ? "That recording is no longer in this browser. It may have been saved or discarded already." : "The extension could not hand over the recording. Download it from the extension instead.", true);
        leave();
      }
    };
    const stage = async (file: File, microphone: boolean, url: string) => {
      try {
        await stageRecording(file, microphone);
      } catch {
        notify("This browser's storage is full, so the recording could not be opened here. Download it from the extension instead.", true);
        leave();
        return;
      }
      // Now the app holds a copy that survives a reload, the extension may delete its own.
      window.postMessage({ source: "vistralo-app", type: "staged", id, nonce }, location.origin);
      leave();
      start(microphone ? "talk-through" : "ai-walkthrough", { url });
    };
    const timer = setTimeout(() => {
      if (done) return;
      finish();
      notify("The Vistralo extension did not answer. Open the recording from the extension in this browser.", true);
      leave();
    }, WAIT_MS);
    window.addEventListener("message", receive);
    void (async () => {
      // An unsaved recording already waiting here is never overwritten; the new one stays in the extension.
      const waiting = await recoverRecording().catch(() => null);
      if (done) return;
      if (waiting) {
        finish();
        notify("A recording made in this browser is still waiting. Save or discard it, then open the new one from the extension.", true);
        leave();
        start(waiting.microphone ? "talk-through" : "ai-walkthrough", { url: "" });
        return;
      }
      window.postMessage({ source: "vistralo-app", type: "import", id, nonce }, location.origin);
    })();
    return finish;
  }, [id, active]);
}
