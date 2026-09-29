import {
  NavigationProgress,
  ToolButton,
  confirmDialog,
} from "../components/Primitives";
import { StatusBadge } from "../components/ProjectCard";
import { projectTitle, statusHint } from "../utils";
import React, { useEffect, useRef, useState } from "react";
import type {
  Project,
  ProjectDetail as ProjectInfo,
  UploadProgress,
  WorkspaceAdapter,
} from "../contracts";
import { Icon } from "../components/Icon";
import { uuid } from "../id";
import {
  buildClipPlan,
  errorMessage,
  formatBytes,
  formatDuration,
  publicWebsite,
  validateVideo,
} from "./flow-utils";
import { BuildBrief } from "./BuildBrief";
import { downloadAgentKit } from "../agent-kit";
import "./features.css";

interface Props {
  project: Project;
  adapter: WorkspaceAdapter;
  onBack: () => void;
  onChanged: (project?: Project) => void;
  notify: (message: string, error?: boolean) => void;
}
type Tab = "overview" | "editor" | "brief" | "files";

// The capture publishes a new frame every second or so. Decoding the next one
// off-screen and swapping only when it is ready keeps the panel from blanking
// or resizing between frames.
const FRAME_STEP = 1 / 30;

function Playback({
  src,
  label,
  duration: known,
}: {
  src: string;
  label: string;
  duration?: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const held = useRef(src);
  const file = src.split("?")[0];
  if (held.current.split("?")[0] !== file) held.current = src;
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [playing, setPlaying] = useState(false);
  const shown = held.current.split("?")[0] === file ? held.current : src;
  // Browser-recorded WebM reports an infinite duration, but the browser can
  // still seek in it, so fall back to the length the worker measured.
  const total = length || (known && Number.isFinite(known) ? known : 0);
  const seekable = total > 0;

  function step(direction: number) {
    const node = video.current;
    if (!node || !seekable) return;
    node.pause();
    node.currentTime = Math.min(Math.max(0, node.currentTime + direction * FRAME_STEP), total);
  }
  function toggle() {
    const node = video.current;
    if (!node) return;
    if (node.paused) void node.play();
    else node.pause();
  }
  function measured() {
    const node = video.current;
    if (node && Number.isFinite(node.duration) && node.duration > 0)
      setLength(node.duration);
  }

  return (
    <figure className="flow-stage">
      <video
        ref={video}
        src={shown}
        playsInline
        preload="auto"
        aria-label={label}
        onClick={toggle}
        onTimeUpdate={() => setTime(video.current?.currentTime || 0)}
        onLoadedMetadata={measured}
        onDurationChange={measured}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="flow-transport" role="group" aria-label="Playback">
        <ToolButton
          icon={playing ? "pause" : "play"}
          label={playing ? "Pause" : "Play"}
          onClick={toggle}
        />
        <ToolButton
          icon="arrowLeft"
          label="Previous frame"
          onClick={() => step(-1)}
          disabled={!seekable}
        />
        <ToolButton
          icon="arrowRight"
          label="Next frame"
          onClick={() => step(1)}
          disabled={!seekable}
        />
        <label className="flow-scrub">
          <span className="sr-only">Position</span>
          <input
            type="range"
            min={0}
            max={total || 0}
            step={FRAME_STEP}
            value={total ? Math.min(time, total) : 0}
            disabled={!seekable}
            onChange={(event) => {
              const node = video.current;
              if (!node) return;
              node.currentTime = Number(event.target.value);
              setTime(node.currentTime);
            }}
          />
        </label>
        <span className="flow-time">
          {formatDuration(time)} / {total ? formatDuration(total) : "–:––"}
        </span>
        <ToolButton
          icon="fullscreen"
          label="Full screen"
          onClick={() => void video.current?.requestFullscreen?.()}
        />
      </div>
    </figure>
  );
}

function LiveFrame({ src, alt }: { src: string; alt: string }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const next = new Image();
    next.src = src;
    void next
      .decode()
      .then(() => {
        if (!cancelled) setShown(src);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);
  return shown ? (
    <img className="flow-live-frame" src={shown} alt={alt} />
  ) : (
    <div className="flow-live-frame" aria-hidden="true" />
  );
}
type Clip = { key: string; start: string; end: string };
const clip = (start = "0", end = ""): Clip => ({ key: uuid(), start, end });
const isVideo = (file: string) => /\.(mp4|webm|mov|mkv)$/i.test(file);

function MarkdownPreview({ text }: { text: string }) {
  // Text is rendered as React nodes, never as untrusted HTML or executable links.
  return (
    <div className="flow-markdown">
      {text.split("\n").map((line, index) => {
        if (/^#{1,2} /.test(line))
          return <h3 key={index}>{line.replace(/^#+ /, "")}</h3>;
        if (/^#{3,6} /.test(line))
          return <h4 key={index}>{line.replace(/^#+ /, "")}</h4>;
        if (/^- /.test(line))
          return (
            <p className="flow-markdown-bullet" key={index}>
              {line.slice(2)}
            </p>
          );
        return line.trim() ? (
          <p key={index}>{line}</p>
        ) : (
          <div className="flow-markdown-break" key={index} />
        );
      })}
    </div>
  );
}

export function ProjectDetail({
  project: initial,
  adapter,
  onBack,
  onChanged,
  notify,
}: Props) {
  const [info, setInfo] = useState<ProjectInfo | null>(null),
    [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [kitStage, setKitStage] = useState("");
  const [brief, setBrief] = useState(""),
    [briefDirty, setBriefDirty] = useState(false),
    [briefMode, setBriefMode] = useState<"edit" | "preview">("preview");
  const [script, setScript] = useState(""),
    [scriptDirty, setScriptDirty] = useState(false);
  const [source, setSource] = useState(""),
    [duration, setDuration] = useState<number | null>(null),
    [durationError, setDurationError] = useState("");
  const [clips, setClips] = useState<Clip[]>([clip()]),
    [planDirty, setPlanDirty] = useState(false),
    [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState(initial.url || ""),
    [mediaError, setMediaError] = useState("");
  const dirtyBrief = useRef(false),
    dirtyScript = useRef(false),
    dirtyPlan = useRef(false),
    uploadController = useRef<AbortController | null>(null),
    polling = useRef(false),
    live = useRef(false),
    version = useRef(0);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]),
    briefFile = useRef("");
  const project = info?.project ?? initial,
    files = info?.files ?? [];
  const active = ["processing", "queued"].includes(project.status),
    processing = active || !!busy;
  const output = project.data.output?.file as string | undefined;
  const original = (project.video || project.data.video) as
    | string
    | undefined;
  const previewFile = output || original;
  const sourceFile = (project.data.sourceMaster ||
    project.data.walkthroughVideo ||
    project.data.video ||
    original) as string | undefined;
  const canVoiceover =
    adapter.mode === "cloud" &&
    adapter.capabilities.providers &&
    project.type === "walkthrough" &&
    project.source !== "web" &&
    !!sourceFile;
  const voiceText =
    project.type !== "walkthrough" || !original
      ? ""
      : project.data.narratedVideo
        ? "AI voice-over"
        : project.data.microphone
          ? "Your voice"
          : "No voice-over";
  const videoFiles = files.filter((file) => isVideo(file.file));
  const tabs: { id: Tab; name: string }[] = [
    { id: "overview", name: "Overview" },
    ...(project.type === "walkthrough" || original
      ? [{ id: "editor" as Tab, name: "Editor" }]
      : []),
    ...(project.type === "brief" || info?.brief || project.data.brief
      ? [{ id: "brief" as Tab, name: "Visual brief" }]
      : []),
    { id: "files", name: `Files${files.length ? ` (${files.length})` : ""}` },
  ];

  async function refresh(initialLoad = false, quiet = false) {
    const requestVersion = ++version.current;
    if (initialLoad) setLoading(true);
    try {
      const next = await adapter.project(initial.id);
      if (requestVersion !== version.current) return;
      setInfo(next);
      live.current = !!next.progress?.previewUrl;
      const plan = next.project.data.editPlan;
      if (!dirtyPlan.current && plan?.source) {
        setSource(plan.source);
        setClips(
          plan.clips.map((part: any) =>
            clip(String(part.start), String(part.end)),
          ),
        );
      } else if (!dirtyPlan.current)
        setSource(
          next.project.video || next.project.data.video || "",
        );
      if (!dirtyScript.current)
        setScript(String(next.project.data.script || ""));
      if (!dirtyBrief.current) {
        const file = next.files.find((item) =>
          /(?:visual|implementation)-brief\.md$/i.test(item.file),
        )?.file;
        briefFile.current = file || "";
        if (typeof next.brief === "string") setBrief(next.brief);
        else if (file) {
          const text = await adapter.readText(initial.id, file);
          if (requestVersion === version.current && !dirtyBrief.current)
            setBrief(text);
        }
      }
      setError("");
    } catch (failure) {
      if (requestVersion !== version.current) return;
      // A dropped background poll is not a broken project. Keep the last good
      // view on screen and let the caller decide how long to back off.
      if (quiet) throw failure;
      setError(errorMessage(failure));
    } finally {
      if (requestVersion === version.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(true);
    return () => {
      ++version.current;
      uploadController.current?.abort();
    };
  }, [initial.id, adapter]);
  useEffect(() => {
    if (info && initial.updated !== info.project.updated) void refresh();
  }, [initial.updated]);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer = 0;
    let misses = 0;
    const tick = async () => {
      if (!stop && document.visibilityState !== "hidden" && !polling.current) {
        polling.current = true;
        try {
          await refresh(false, true);
          misses = 0;
        } catch {
          misses = Math.min(misses + 1, 4);
        } finally {
          polling.current = false;
        }
      }
      if (stop) return;
      // Match the capture's frame rate while it is streaming, idle back when it
      // is not, and back off hard on failure so a blip cannot become a stampede.
      const base = live.current ? 1500 : 4000;
      timer = window.setTimeout(
        tick,
        misses ? Math.min(20000, base * 2 ** misses) : base,
      );
    };
    const wake = () => {
      if (stop || document.visibilityState === "hidden") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, 0);
    };
    timer = window.setTimeout(tick, 0);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [active, initial.id, adapter]);
  useEffect(() => {
    if (!source) {
      setDuration(null);
      return;
    }
    let cancelled = false;
    setDuration(null);
    setDurationError("");
    adapter
      .rpc("mediaInfo", { id: project.id, file: source })
      .then((result) => {
        const measured = Number(
          result.duration ??
            result.format?.duration ??
            result.media?.format?.duration,
        );
        if (!cancelled) {
          if (Number.isFinite(measured) && measured > 0) {
            setDuration(measured);
            setClips((current) =>
              current.length === 1 && !current[0].end
                ? [{ ...current[0], end: String(measured) }]
                : current,
            );
          } else
            setDurationError(
              "This file has no finite duration. Choose another source before creating a trim plan.",
            );
        }
      })
      .catch((failure) => {
        if (!cancelled) setDurationError(errorMessage(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [source, project.id, adapter]);
  useEffect(() => {
    if (!briefDirty && !planDirty && !uploadProgress) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [briefDirty, planDirty, uploadProgress]);

  async function action(
    label: string,
    run: () => Promise<unknown>,
    message: string | (() => string),
  ) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await run();
      await refresh();
      onChanged();
      notify(typeof message === "function" ? message() : message);
    } catch (failure) {
      const message = errorMessage(failure);
      setError(message);
      notify(message, true);
    } finally {
      setBusy("");
    }
  }

  async function back() {
    if (uploadProgress) {
      setError("Pause the upload before leaving this project.");
      return;
    }
    if (
      (briefDirty || planDirty) &&
      !(await confirmDialog({
        title: "Discard unsaved edits?",
        message: "You have edits in this project that are not saved yet.",
        confirmLabel: "Discard and leave",
        cancelLabel: "Keep editing",
        tone: "danger",
      }))
    )
      return;
    onBack();
  }

  function updateClips(next: Clip[]) {
    setClips(next);
    dirtyPlan.current = true;
    setPlanDirty(true);
  }
  async function savePlan(render = false) {
    await action(
      render ? "Rendering" : "Saving plan",
      async () => {
        const next = buildClipPlan(source, duration, clips);
        await adapter.rpc("plan", { id: project.id, plan: next });
        dirtyPlan.current = false;
        setPlanDirty(false);
        if (render)
          await adapter.rpc("process", { id: project.id, action: "render" });
      },
      render
        ? "Rendering started. The source recording is preserved."
        : "Trim plan saved.",
    );
  }

  async function uploadVideo(file: File) {
    await action(
      "Uploading",
      async () => {
        validateVideo(file, adapter.mode === "cloud");
        uploadController.current = new AbortController();
        try {
          await adapter.upload(project.id, file, {
            signal: uploadController.current.signal,
            onProgress: setUploadProgress,
          });
          dirtyPlan.current = false;
          setPlanDirty(false);
        } finally {
          setUploadProgress(null);
        }
      },
      () =>
        adapter.mode === "demo"
          ? "Video saved in this browser demo."
          : "Video uploaded. The worker checks its checksum before processing it.",
    );
  }

  function tabKey(event: React.KeyboardEvent, index: number) {
    let next = index;
    const rtl = document.documentElement.dir === "rtl";
    if (event.key === "ArrowRight")
      next = (index + (rtl ? tabs.length - 1 : 1)) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index + (rtl ? 1 : tabs.length - 1)) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next].id);
    tabButtons.current[next]?.focus();
  }

  const sessions = info?.evidence?.sessions ?? [];
  const frames = sessions
    .flatMap((session: any) => {
      const all = session.frames ?? [];
      const stride = Math.max(1, Math.floor(all.length / 6));
      return all
        .filter((_: unknown, index: number) => index % stride === 0)
        .slice(0, 6)
        .map((frame: any) => ({
          ...frame,
          title: session.title || session.url,
          viewport: session.viewport,
        }));
    })
    .slice(0, 18);
  const canDownload = !!(
    previewFile ||
    project.data.buildBrief?.json ||
    (project.type === "brief" && brief.trim())
  );
  async function downloadKit() {
    if (kitStage) return;
    setKitStage("Preparing");
    try {
      await downloadAgentKit(adapter, project, setKitStage, project.type === "brief" ? brief : "");
      notify("Build kit downloaded: prompt, video, captions and screens.");
    } catch (failure) {
      notify(errorMessage(failure), true);
    } finally {
      setKitStage("");
    }
  }

  return (
    <div className="project-detail flow-stack">
      <header className="flow-detail-heading">
        <div className="flow-stack">
          <nav className="flow-breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <button className="button button-ghost" onClick={back}>
                  Projects
                </button>
              </li>
              <li aria-current="page">
                <Icon name="chevronRight" size={16} />
                <span>{projectTitle(project)}</span>
              </li>
            </ol>
          </nav>
          <div className="flow-title-row">
            <h1>{projectTitle(project)}</h1>
            <StatusBadge project={project} />
          </div>
          <p className="flow-caption flow-muted">
            {project.type === "brief" ? "Visual brief" : "Walkthrough"} ·{" "}
            {project.source === "web"
              ? project.sourceLabel || project.url || "Website"
              : project.source === "screen"
                ? "Screen recording"
                : "Uploaded recording"}
            {project.duration ? ` · ${formatDuration(project.duration)}` : ""}
            {voiceText ? ` · ${voiceText}` : ""}
          </p>
        </div>
        <div className="flow-actions">
          {canDownload && (
            <button
              type="button"
              className="button"
              disabled={!!kitStage || active}
              aria-live="polite"
              title="One ZIP for a coding agent: a compact prompt, the narrated video, captions and a still of each section"
              onClick={() => void downloadKit()}
            >
              {kitStage ? `${kitStage}…` : "Download files"}
            </button>
          )}
        </div>
      </header>
      {!active && !project.error && project.type === "walkthrough" && (
        <div className="flow-next" role="status">
          <Icon
            name={project.status === "ready" ? "checkCircle" : "info"}
            size={16}
          />
          <span>{statusHint(project)}</span>
          {canVoiceover && (
            <button
              className={`button ${project.data.narratedVideo ? "" : "button-primary"}`}
              disabled={processing}
              onClick={() =>
                void action(
                  "Adding voice-over",
                  () => adapter.rpc("voiceover", { id: project.id }),
                  "Voice-over started. Vistralo is writing the narration from the video.",
                )
              }
            >
              {project.data.narratedVideo
                ? "Redo AI voice-over"
                : "Add AI voice-over"}
            </button>
          )}
        </div>
      )}
      {adapter.mode === "demo" && (
        <p className="flow-notice">
          Demo workspace. Sample evidence is illustrative; website analysis is a
          local simulation. Video rendering needs a Vistralo cloud workspace. Uploaded
          videos stay in this browser.
        </p>
      )}
      {error && (
        <p className="flow-error" role="alert">
          {error}
          <button
            className="button button-ghost"
            onClick={() => void refresh()}
            disabled={!!busy}
          >
            Refresh project
          </button>
        </p>
      )}
      {project.error && (
        <div className="flow-error">
          <p>{project.error}</p>
          <div className="flow-actions">
            {canVoiceover && info?.jobs?.[0]?.kind === "narrate" && (
              <button
                className="button"
                disabled={processing}
                onClick={() =>
                  void action(
                    "Adding voice-over",
                    () => adapter.rpc("voiceover", { id: project.id }),
                    "Voice-over restarted. The recording is preserved.",
                  )
                }
              >
                Retry AI voice-over
              </button>
            )}
            {project.source === "web" && project.url && (
              <button
                className="button"
                disabled={processing}
                onClick={() =>
                  void action(
                    "Retrying capture",
                    () =>
                      adapter.rpc("walkthrough", {
                        id: project.id,
                        url: project.url,
                        viewports: [{ width: 1440, height: 900 }],
                      }),
                    "Website capture restarted.",
                  )
                }
              >
                Retry website capture
              </button>
            )}
            {project.data.editPlan && (
              <button
                className="button"
                disabled={processing}
                onClick={() =>
                  void action(
                    "Retrying render",
                    () =>
                      adapter.rpc("process", {
                        id: project.id,
                        action: "render",
                      }),
                    "Rendering restarted.",
                  )
                }
              >
                Retry render
              </button>
            )}
          </div>
        </div>
      )}
      {active && (
        <section className="flow-job" aria-label="Project processing">
          <div>
            <strong>
              {info?.progress?.stage ||
                (project.source === "web" ? "Analyzing site" : "Processing video")}
            </strong>
            <p className="flow-caption flow-muted">
              {info?.progress?.detail ||
                (adapter.mode === "demo"
                  ? project.data.simulationState ||
                    "A local demo simulation is in progress. No website is being captured."
                  : "The job continues on the server when you leave this page.")}
            </p>
            {typeof info?.progress?.sessions === "number" &&
              info.progress.sessions > 1 && (
                <p className="flow-caption flow-muted">
                  Viewport {info.progress.session} of {info.progress.sessions}
                </p>
              )}
          </div>
          {typeof info?.progress?.percent === "number" ? (
            <>
              <progress
                aria-label="Processing project"
                value={info.progress.percent}
                max={100}
              />
              <span className="flow-job-percent">{info.progress.percent}%</span>
            </>
          ) : (
            <progress aria-label="Processing project" />
          )}
          <button
            className="button"
            disabled={!!busy}
            onClick={() =>
              void action(
                "Cancelling",
                () => adapter.rpc("cancel", { id: project.id }),
                "Cancellation requested. Source files are preserved.",
              )
            }
          >
            Cancel job
          </button>
        </section>
      )}
      <div className="flow-tabs" role="tablist" aria-label="Project sections">
        {tabs.map((item, index) => (
          <button
            ref={(element) => {
              tabButtons.current[index] = element;
            }}
            key={item.id}
            id={`project-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`project-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => tabKey(event, index)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {tabs
        .filter((item) => item.id !== tab)
        .map((item) => (
          <section
            key={item.id}
            id={`project-panel-${item.id}`}
            role="tabpanel"
            aria-labelledby={`project-tab-${item.id}`}
            hidden
          />
        ))}
      <NavigationProgress pending={loading && !info} />
      {loading && !info ? (
        <div className="flow-panel flow-stack" aria-busy="true">
          <div className="flow-skeleton" />
          <p>Loading project…</p>
        </div>
      ) : (
        <section
          className="flow-panel flow-stack"
          role="tabpanel"
          id={`project-panel-${tab}`}
          aria-labelledby={`project-tab-${tab}`}
          tabIndex={0}
        >
          {tab === "overview" && (
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
          )}
          {tab === "editor" && (
            <>
              <div>
                <h2>Trim your Walkthrough</h2>
                <p className="flow-muted">
                  Choose the parts to keep in chronological order. Rendering
                  creates a new output and preserves your source.
                </p>
              </div>
              {source && (
                <Playback
                  src={adapter.media(project.id, source)}
                  label="Trim source recording"
                />
              )}
              <label className="flow-field">
                Source recording
                <select
                  className="field"
                  value={source}
                  disabled={processing}
                  onChange={(event) => {
                    setSource(event.target.value);
                    updateClips([clip()]);
                  }}
                >
                  {!source && <option value="">Choose a source</option>}
                  {[
                    ...new Set([
                      ...videoFiles.map((item) => item.file),
                      ...(source ? [source] : []),
                    ]),
                  ].map((file) => (
                    <option value={file} key={file}>
                      {file}
                    </option>
                  ))}
                </select>
              </label>
              {duration ? (
                <p className="flow-caption flow-muted">
                  Source duration: {formatDuration(duration)} (
                  {duration.toFixed(3)} seconds)
                </p>
              ) : (
                <p className="flow-caption flow-muted">
                  {durationError ||
                    (source
                      ? "Checking source duration…"
                      : "Upload a recording in Overview to enable editing.")}
                </p>
              )}
              <div className="flow-stack">
                {clips.map((part, index) => (
                  <fieldset
                    className="flow-clip"
                    key={part.key}
                    disabled={processing || !duration}
                  >
                    <legend>Clip {index + 1}</legend>
                    <label className="flow-field">
                      Start (seconds)
                      <input
                        className="field"
                        type="number"
                        min="0"
                        max={duration ?? undefined}
                        step="0.001"
                        value={part.start}
                        onChange={(event) =>
                          updateClips(
                            clips.map((item) =>
                              item.key === part.key
                                ? { ...item, start: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="flow-field">
                      End (seconds)
                      <input
                        className="field"
                        type="number"
                        min="0"
                        max={duration ?? undefined}
                        step="0.001"
                        value={part.end}
                        onChange={(event) =>
                          updateClips(
                            clips.map((item) =>
                              item.key === part.key
                                ? { ...item, end: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      className="button button-ghost"
                      disabled={clips.length === 1}
                      onClick={() =>
                        updateClips(
                          clips.filter((item) => item.key !== part.key),
                        )
                      }
                      aria-label={`Remove clip ${index + 1}`}
                    >
                      Remove
                    </button>
                  </fieldset>
                ))}
              </div>
              <div className="flow-actions">
                <button
                  className="button"
                  disabled={processing || !duration || clips.length >= 100}
                  onClick={() => updateClips([...clips, clip()])}
                >
                  Add clip
                </button>
                <button
                  className="button"
                  disabled={processing || !duration}
                  onClick={() => void savePlan()}
                >
                  Save trim plan
                </button>
                <button
                  className="button button-primary"
                  disabled={processing || !duration}
                  onClick={() => void savePlan(true)}
                >
                  Save and render
                </button>
              </div>
              <details className="flow-stack">
                <summary>Import a timed transcript</summary>
                <p className="flow-caption flow-muted">
                  Import a JSON array of words, or an object with a words array.
                  Each word needs text, start and end fields in seconds. Review
                  the resulting cuts before rendering. Maximum 2 MB.
                </p>
                <input
                  className="field"
                  type="file"
                  accept=".json,application/json"
                  disabled={processing || !source || !duration}
                  aria-label="Import transcript JSON"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void action(
                      "Importing transcript",
                      async () => {
                        if (file.size > 2_000_000)
                          throw new Error("Transcript must be under 2 MB.");
                        const parsed = JSON.parse(await file.text()),
                          words = Array.isArray(parsed) ? parsed : parsed.words;
                        if (
                          !Array.isArray(words) ||
                          !words.length ||
                          words.length > 50000 ||
                          words.some(
                            (word) =>
                              !word ||
                              typeof word.text !== "string" ||
                              !Number.isFinite(word.start) ||
                              !Number.isFinite(word.end) ||
                              word.start < 0 ||
                              word.end <= word.start ||
                              (duration && word.end > duration + 0.001),
                          )
                        )
                          throw new Error(
                            "Every transcript word needs text and valid start/end seconds within the source duration.",
                          );
                        await adapter.rpc("transcript", {
                          id: project.id,
                          source,
                          words,
                        });
                        dirtyPlan.current = false;
                        setPlanDirty(false);
                      },
                      "Transcript imported. Review the proposed trim plan before rendering.",
                    );
                  }}
                />
              </details>
            </>
          )}
          {tab === "brief" && (
            <>
              <header className="flow-heading">
                <div>
                  <h2>Visual brief</h2>
                  <p className="flow-muted">
                    Review observed evidence and add your implementation notes.
                  </p>
                </div>
                <div className="flow-actions">
                  <button
                    className="button"
                    aria-pressed={briefMode === "edit"}
                    onClick={() =>
                      setBriefMode(briefMode === "edit" ? "preview" : "edit")
                    }
                  >
                    {briefMode === "edit" ? "Preview" : "Edit brief"}
                  </button>
                </div>
              </header>
              {!brief.trim() && briefMode === "preview" ? (
                <div className="flow-empty">
                  <h3>
                    {active
                      ? "Your brief is being prepared"
                      : "Add a project brief"}
                  </h3>
                  <p className="flow-muted">
                    {active
                      ? "The generated evidence report will appear after website capture finishes."
                      : "Write a brief from your reviewed evidence. No AI interpretation has been requested."}
                  </p>
                  <button
                    className="button"
                    onClick={() => {
                      setBrief(
                        `# ${project.name}\n\n## Overview\n\n## Observations\n\n## Implementation notes\n`,
                      );
                      dirtyBrief.current = true;
                      setBriefDirty(true);
                      setBriefMode("edit");
                    }}
                    disabled={processing}
                  >
                    Start a brief
                  </button>
                </div>
              ) : briefMode === "edit" ? (
                <label className="flow-field">
                  Brief in Markdown
                  <textarea
                    className="field flow-brief-editor"
                    value={brief}
                    maxLength={500000}
                    onChange={(event) => {
                      setBrief(event.target.value);
                      dirtyBrief.current = true;
                      setBriefDirty(true);
                    }}
                    disabled={processing}
                    spellCheck
                  />
                </label>
              ) : (
                <MarkdownPreview text={brief} />
              )}
              {briefMode === "edit" && (
                <div className="flow-actions">
                  <button
                    className="button button-primary"
                    disabled={processing || !briefDirty}
                    onClick={() =>
                      void action(
                        "Saving brief",
                        async () => {
                          await adapter.rpc("briefSave", {
                            id: project.id,
                            text: brief,
                          });
                          dirtyBrief.current = false;
                          setBriefDirty(false);
                        },
                        "Visual brief saved.",
                      )
                    }
                  >
                    Save brief
                  </button>
                  {briefDirty && (
                    <span className="flow-caption flow-muted">
                      Unsaved changes
                    </span>
                  )}
                </div>
              )}
              {adapter.capabilities.providers &&
                project.data.walkthroughVideo && (
                  <section className="flow-stack">
                    <header className="flow-heading">
                      <div>
                        <h3>AI narration</h3>
                        <p className="flow-muted">
                          {project.data.narratedVideo
                            ? "A narrated video has been generated from this script."
                            : "Review and edit the draft before any voice is generated. Nothing is sent to the speech provider until you approve it."}
                        </p>
                      </div>
                    </header>
                    {project.data.scriptError && !script.trim() && (
                      <p className="flow-notice" role="status">
                        The draft could not be written: {project.data.scriptError}{" "}
                        The capture and its video are unaffected. You can write
                        the narration yourself below, or fix the setting and run
                        the analysis again.
                      </p>
                    )}
                    <label className="flow-field">
                      Narration script
                      <textarea
                        className="field flow-brief-editor"
                        value={script}
                        maxLength={5000}
                        placeholder="Write the narration, or re-run the analysis to draft one."
                        onChange={(event) => {
                          setScript(event.target.value);
                          dirtyScript.current = true;
                          setScriptDirty(true);
                        }}
                        disabled={processing}
                        spellCheck
                      />
                    </label>
                    <p className="flow-caption flow-muted">
                      {script.length} of 5000 characters. Generating the voice
                      is a paid request and must fit the per-job cost cap in
                      Preferences.
                    </p>
                    <div className="flow-actions">
                      <button
                        className="button"
                        disabled={processing || !scriptDirty}
                        onClick={() =>
                          void action(
                            "Saving script",
                            async () => {
                              await adapter.rpc("scriptSave", {
                                id: project.id,
                                text: script,
                              });
                              dirtyScript.current = false;
                              setScriptDirty(false);
                            },
                            "Narration script saved.",
                          )
                        }
                      >
                        Save script
                      </button>
                      <button
                        className="button button-primary"
                        disabled={processing || !script.trim()}
                        onClick={() =>
                          void action(
                            "Generating narration",
                            async () => {
                              await adapter.rpc("narrate", {
                                id: project.id,
                                text: script,
                              });
                              dirtyScript.current = false;
                              setScriptDirty(false);
                            },
                            "Approved. Narration is being generated.",
                          )
                        }
                      >
                        Approve and generate narrated video
                      </button>
                    </div>
                  </section>
                )}
            </>
          )}
          {tab === "files" && (
            <>
              <div>
                <h2>Project files</h2>
                <p className="flow-muted">
                  Download files, at the top of the page, packs everything a coding
                  agent needs into one ZIP.
                </p>
              </div>
              <BuildBrief project={project} adapter={adapter} />
              {files.length ? (
                <details>
                  <summary>Individual files ({files.length})</summary>
                <div className="flow-table-wrap">
                  <table className="flow-files">
                    <thead>
                      <tr>
                        <th scope="col">File</th>
                        <th scope="col">Size</th>
                        <th scope="col">
                          <span className="sr-only">Download</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr key={file.file}>
                          <th scope="row">{file.file}</th>
                          <td>{formatBytes(file.size)}</td>
                          <td>
                            <a
                              className="button button-ghost"
                              href={adapter.media(project.id, file.file, true)}
                              download
                              aria-label={`Download ${file.file}`}
                            >
                              Download
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </details>
              ) : (
                <div className="flow-empty">
                  <h3>No files yet</h3>
                  <p className="flow-muted">
                    Uploaded recordings and captured website evidence will
                    appear here.
                  </p>
                </div>
              )}
              {!!info?.events.length && (
                <details>
                  <summary>Recent project activity</summary>
                  <ol className="flow-activity">
                    {info.events
                      .slice(-12)
                      .reverse()
                      .map((event: any, index) => (
                        <li key={event.id || index}>
                          <strong>
                            {String(
                              event.kind ||
                                event.type ||
                                event.name ||
                                "Project updated",
                            ).replace(/-/g, " ")}
                          </strong>
                          {(event.at || event.created) && (
                            <time dateTime={event.at || event.created}>
                              {new Date(
                                event.at || event.created,
                              ).toLocaleString()}
                            </time>
                          )}
                          {event.data?.error && (
                            <p className="flow-error">{event.data.error}</p>
                          )}
                        </li>
                      ))}
                  </ol>
                </details>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
