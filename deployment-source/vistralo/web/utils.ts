import type { Project } from "./contracts";
export const sourceText = (p: Project) =>
  p.sourceLabel ||
  (p.url
    ? new URL(p.url).hostname.replace(/^www\./, "")
    : p.source === "screen"
      ? "Screen recording"
      : p.source === "upload"
        ? "Uploaded video"
        : "Website");
// Browser recordings are saved as "Screen recording 2026-09-27T13-31-22-370Z".
const recordingStamp =
  /^(Screen recording|Screenshots) (\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;
export function projectTitle(p: Pick<Project, "name">, locale?: string) {
  const stamp = p.name.match(recordingStamp);
  if (!stamp) return p.name;
  const at = new Date(
    `${stamp[2]}T${stamp[3]}:${stamp[4]}:${stamp[5]}.${stamp[6]}Z`,
  );
  if (Number.isNaN(at.getTime())) return p.name;
  return `${stamp[1] === "Screenshots" ? "Screenshots" : "Recording"} · ${new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at)}`;
}
export const typeText = (p: Project) =>
  p.type === "brief" ? "Visual brief" : "Walkthrough";
export function durationText(s = 0) {
  s = Math.floor(s);
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const durationLabel = (s = 0) =>
  `${Math.floor(s / 3600) ? Math.floor(s / 3600) + " hours " : ""}${Math.floor(s / 60) % 60} minutes ${Math.floor(s) % 60} seconds`;
export function relativeTime(date: string, locale = "en") {
  const delta = (new Date(date).getTime() - Date.now()) / 1000;
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, n] of [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ] as const)
    if (Math.abs(delta) >= n) return fmt.format(Math.round(delta / n), unit);
  return fmt.format(Math.round(delta), "second");
}
export const absoluteTime = (date: string, locale = "en") =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date(date));
export const statusText = (p: Project) =>
  ({
    ready: "Ready",
    draft: "Draft",
    queued: "Queued",
    processing: p.type === "brief" ? "Analyzing site" : "Processing video",
    uploading: `Uploading ${p.progress || 0}%`,
    failed:
      p.type === "brief"
        ? "Couldn't analyze"
        : p.video
          ? "Needs attention"
          : "Upload failed",
  })[p.status];
/** What the status means and what moves the project on, in one sentence. */
export const statusHint = (p: Project) => {
  if (p.status === "uploading")
    return "Keep this page open until the upload finishes.";
  if (p.status === "queued") return "Waiting for the worker to pick this up.";
  if (p.status === "processing")
    return p.type === "brief"
      ? "Capturing the website. You can leave this page."
      : "Working on this video. You can leave this page.";
  if (p.status === "failed") return p.error || "The last job did not finish.";
  if (p.type === "brief")
    return p.status === "ready"
      ? "The visual brief is ready to read and share."
      : "Analyze a website to create the brief.";
  if (p.status === "ready")
    return p.data?.narratedVideo
      ? "Narrated with an AI voice. Ready to watch, download and share."
      : "The output video is ready to download and share.";
  if (!p.video) return "Add a recording to start.";
  return p.data?.microphone
    ? "Saved with your own voice. Trim it or create an MP4 to finish."
    : "Saved without narration. Add an AI voice-over to finish it.";
};
export const statusIcon = (p: Project) =>
  ({
    ready: "check",
    draft: "edit",
    queued: "clock",
    processing: "spinner",
    uploading: "upload",
    failed: "warning",
  })[p.status];
export const accessText = (p: Project) =>
  ({
    private: "Only you",
    workspace: "Workspace",
    link: "Anyone with the link",
  })[p.access];
export const accessIcon = (p: Project) =>
  ({ private: "lock", workspace: "people", link: "link" })[p.access];
export function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest('input,textarea,select,[contenteditable="true"]')
  );
}
export async function copyText(text: string) {
  if (!navigator.clipboard)
    throw Error(
      "Clipboard is unavailable. Select and copy the link shown in the dialog.",
    );
  await navigator.clipboard.writeText(text);
}
