export const MAX_UPLOAD_BYTES = 20 * 1024 ** 3;
export const MAX_CLOUD_UPLOAD_BYTES = 50 * 1024 ** 3;
export const MAX_BROWSER_RECORDING_BYTES = 1024 ** 3;

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const value = Math.floor(seconds),
    h = Math.floor(value / 3600),
    m = Math.floor(value / 60) % 60,
    s = value % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function validateVideo(file: File, cloud = false): void {
  if (!file.size) throw new Error("Choose a video that is not empty.");
  if (!/\.(mp4|webm|mov|mkv)$/i.test(file.name))
    throw new Error("Choose an MP4, WebM, MOV or MKV video.");
  if (file.size > (cloud ? MAX_CLOUD_UPLOAD_BYTES : MAX_UPLOAD_BYTES))
    throw new Error(
      `This video exceeds the ${cloud ? 50 : 20} GB upload limit.`,
    );
}

export function publicWebsite(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(
      "Enter a complete website URL, such as https://example.com.",
    );
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP or HTTPS URL without a username or password.");
  if (
    url.hostname === "localhost" ||
    /^(127\.|10\.|192\.168\.|0\.)/.test(url.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname) ||
    url.hostname.includes(":") ||
    !url.hostname.includes(".")
  )
    throw new Error(
      "Enter a public website. Private network addresses cannot be analyzed by the server.",
    );
  return url.href;
}

export function downloadText(
  text: string,
  filename: string,
  type = "text/markdown;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._ -]/g, "")
      .trim()
      .slice(0, 100) || "Vistralo project"
  );
}

/** Validate the user's reviewable trim plan before it reaches the media API. */
export function buildClipPlan(
  source: string,
  duration: number | null,
  clips: { start: string | number; end: string | number }[],
) {
  if (!source.trim()) throw new Error("Choose a source recording first.");
  if (!duration || !Number.isFinite(duration) || duration < 0)
    throw new Error(
      "Wait for the source duration to be verified before saving a trim plan.",
    );
  if (!clips.length || clips.length > 200)
    throw new Error("Provide between 1 and 200 clips.");
  let previousEnd = 0;
  return {
    version: 1 as const,
    source,
    clips: clips.map((part, index) => {
      const start = Number(part.start),
        end = Number(part.end);
      if (
        !String(part.start).trim() ||
        !String(part.end).trim() ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end > duration
      )
        throw new Error(
          `Clip ${index + 1} must start at or after 0, end after its start, and stay within ${duration.toFixed(3)} seconds.`,
        );
      if (start < previousEnd)
        throw new Error(
          `Clip ${index + 1} overlaps an earlier clip. Keep clips in chronological order without overlap.`,
        );
      previousEnd = end;
      return { start, end };
    }),
  };
}
