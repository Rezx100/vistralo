import React from "react";
import type {
  Project,
  ProjectDetail as ProjectInfo,
  UploadProgress,
  WorkspaceAdapter,
} from "../../contracts";
import { formatDuration, publicWebsite } from "../flow-utils";
import { LiveFrame, Playback } from "./Player";
import type { ProjectAction } from "./useProjectDetail";

export function OverviewTab({
  project,
  adapter,
  info,
  active,
  processing,
  output,
  original,
  previewFile,
  voiceText,
  mediaError,
  websiteUrl,
  setWebsiteUrl,
  uploadProgress,
  uploadController,
  sessions,
  frames,
  action,
  uploadVideo,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  info: ProjectInfo | null;
  active: boolean;
  processing: boolean;
  output: string | undefined;
  original: string | undefined;
  previewFile: string | undefined;
  voiceText: string;
  mediaError: string;
  websiteUrl: string;
  setWebsiteUrl: (value: string) => void;
  uploadProgress: UploadProgress | null;
  uploadController: React.RefObject<AbortController | null>;
  sessions: any;
  frames: any;
  action: ProjectAction;
  uploadVideo: (file: File) => Promise<void>;
}) {
  return (
    <>
      {previewFile ? (
        <div className="flow-overview">
          <div className="flow-video">
            <Playback
              src={adapter.media(project.id, previewFile)}
              label={`${project.name} recording`}
              duration={
                project.duration || project.data.mediaInfo?.duration
              }
            />
            {mediaError && <p className="flow-notice">{mediaError}</p>}
            {project.data.sampleVideoNotice && (
              <p className="flow-caption flow-muted">
                {project.data.sampleVideoNotice}
              </p>
            )}
          </div>
          <aside className="flow-side" aria-label="Walkthrough details">
            <dl className="flow-facts">
              <div>
                <dt>Playing</dt>
                <dd>
                  {output
                    ? project.data.narratedVideo
                      ? "Narrated walkthrough"
                      : "Output video"
                    : "Original recording"}
                </dd>
              </div>
              {voiceText && (
                <div>
                  <dt>Voice</dt>
                  <dd>{voiceText}</dd>
                </div>
              )}
              {project.data.mediaInfo?.width && (
                <div>
                  <dt>Size</dt>
                  <dd>
                    {project.data.mediaInfo.width} ×{" "}
                    {project.data.mediaInfo.height}
                  </dd>
                </div>
              )}
              <div>
                <dt>Updated</dt>
                <dd>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(project.updated))}
                </dd>
              </div>
            </dl>
            {original && !output && (
              <button
                className="button"
                disabled={processing}
                onClick={() =>
                  void action(
                    "Creating MP4",
                    () =>
                      adapter.rpc("process", {
                        id: project.id,
                        action: "remux",
                      }),
                    adapter.mode === "demo"
                      ? "Demo processing simulated; no MP4 was produced."
                      : "Creating an MP4 preview. The source file is preserved.",
                  )
                }
              >
                Create MP4 preview
              </button>
            )}
            {project.data.narratedVideo && project.data.script && (
              <section className="flow-script" aria-label="Narration">
                <h2>Narration</h2>
                <ol>
                  {(Array.isArray(project.data.scriptParts)
                    ? project.data.scriptParts
                    : [{ at: 0, text: String(project.data.script) }]
                  ).map((part: { at: number; text: string }) => (
                    <li key={part.at}>
                      <time>{formatDuration(part.at)}</time>
                      <p>{part.text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </aside>
        </div>
      ) : active && info?.progress?.previewUrl ? (
        <figure className="flow-live">
          <LiveFrame
            src={info.progress.previewUrl}
            alt={`Live capture of ${project.url || "the site"}`}
          />
          <figcaption className="flow-caption flow-muted">
            Live frame from the capture browser, updated as it scrolls
            and interacts with the page.
          </figcaption>
        </figure>
      ) : (
        <div className="flow-empty">
          <h2>
            {active
              ? "Your project is being prepared"
              : project.type === "brief"
                ? "Start with website evidence"
                : "Add a recording to get started"}
          </h2>
          <p className="flow-muted">
            {active
              ? "Captured evidence and media will appear here as the job completes."
              : project.type === "brief"
                ? "Capture a public URL to collect screenshots, observed behavior and an editable Visual brief."
                : "Upload your source video to review, trim and export a Walkthrough."}
          </p>
        </div>
      )}
      {!active && !original && project.source !== "web" && (
        <label className="flow-dropzone">
          Upload source video
          <input
            className="field"
            type="file"
            accept=".mp4,.webm,.mov,.mkv"
            disabled={processing || !adapter.capabilities.upload}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void uploadVideo(selected);
              event.target.value = "";
            }}
          />
          <span className="flow-caption flow-muted">
            MP4, WebM, MOV or MKV, up to{" "}
            {adapter.mode === "cloud" ? 50 : 20} GB.
          </span>
        </label>
      )}
      {!active && !info?.evidence && project.source === "web" && (
        <form
          className="flow-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void action(
              "Starting capture",
              async () => {
                const url = publicWebsite(websiteUrl);
                await adapter.update(project.id, { url });
                await adapter.rpc("walkthrough", {
                  id: project.id,
                  url,
                  viewports: [{ width: 1440, height: 900 }],
                });
              },
              adapter.mode === "demo"
                ? "Demo capture simulation started."
                : "Website capture started.",
            );
          }}
        >
          <label className="flow-field">
            Website URL
            <input
              type="url"
              className="field"
              required
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://example.com"
              disabled={processing}
            />
          </label>
          <div>
            <button
              className="button button-primary"
              disabled={processing}
            >
              Analyze website
            </button>
          </div>
        </form>
      )}
      {uploadProgress && (
        <div className="flow-stack">
          <label htmlFor="detail-upload">
            {uploadProgress.phase === "hashing"
              ? "Checking source"
              : uploadProgress.phase === "verifying"
                ? "Verifying source"
                : "Uploading"}
            : {uploadProgress.percent}%
          </label>
          <progress
            id="detail-upload"
            max={100}
            value={uploadProgress.percent}
          />
          {uploadProgress.phase !== "verifying" && (
            <button
              className="button"
              onClick={() => uploadController.current?.abort()}
            >
              Pause upload
            </button>
          )}
        </div>
      )}
      {frames.length > 0 && (
        <section className="flow-stack">
          <h2>Captured references</h2>
          <div className="flow-evidence-grid">
            {frames.map((frame: any) => (
              <a
                className="flow-evidence"
                key={frame.file}
                href={adapter.media(project.id, frame.file, true)}
                download
              >
                <img
                  src={adapter.media(project.id, frame.file)}
                  alt={`${frame.title}, captured at ${(frame.at / 1000).toFixed(1)} seconds`}
                  loading="lazy"
                  decoding="async"
                />
                <span>
                  {frame.viewport?.width} × {frame.viewport?.height} ·{" "}
                  {(frame.at / 1000).toFixed(1)}s
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      {info?.evidence && (
        <section className="flow-stack">
          <h2>Capture details</h2>
          <dl className="flow-metadata">
            <div>
              <dt>Source</dt>
              <dd>{info.evidence.url || project.url}</dd>
            </div>
            <div>
              <dt>Captured</dt>
              <dd>
                {info.evidence.created
                  ? new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(info.evidence.created))
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Coverage</dt>
              <dd>
                {info.evidence.coverage?.filter(
                  (item: any) => item.state === "captured",
                ).length ?? 0}{" "}
                captured interactions,{" "}
                {info.evidence.coverage?.filter(
                  (item: any) => item.state === "blocked",
                ).length ?? 0}{" "}
                blocked
              </dd>
            </div>
          </dl>
          {sessions.some((session: any) => session.error) && (
            <p className="flow-error">
              Some pages could not be captured:{" "}
              {sessions
                .filter((session: any) => session.error)
                .map((session: any) => session.error)
                .join("; ")}
            </p>
          )}
          <details>
            <summary>Scope and limitations</summary>
            <ul>
              {(info.evidence.limits || []).map(
                (limit: string, index: number) => (
                  <li key={index}>{limit}</li>
                ),
              )}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}
