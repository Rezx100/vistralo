import { NavigationProgress } from "../components/Primitives";
import React, { useRef, useState } from "react";
import type { Project, WorkspaceAdapter } from "../contracts";
import { BriefTab } from "./project/BriefTab";
import { EditorTab } from "./project/EditorTab";
import { FilesTab } from "./project/FilesTab";
import { JobFailure, JobProgress } from "./project/JobProgress";
import { OverviewTab } from "./project/OverviewTab";
import { NextStep, ProjectHeader } from "./project/ProjectHeader";
import { useProjectDetail } from "./project/useProjectDetail";
import "./features.css";

interface Props {
  project: Project;
  adapter: WorkspaceAdapter;
  onBack: () => void;
  onChanged: (project?: Project) => void;
  notify: (message: string, error?: boolean) => void;
}
type Tab = "overview" | "editor" | "brief" | "files";

const isVideo = (file: string) => /\.(mp4|webm|mov|mkv)$/i.test(file);

export function ProjectDetail({
  project: initial,
  adapter,
  onBack,
  onChanged,
  notify,
}: Props) {
  const {
    info,
    project,
    files,
    active,
    processing,
    loading,
    error,
    busy,
    kitStage,
    brief,
    setBrief,
    briefDirty,
    setBriefDirty,
    briefMode,
    setBriefMode,
    script,
    setScript,
    scriptDirty,
    setScriptDirty,
    source,
    setSource,
    duration,
    durationError,
    clips,
    setPlanDirty,
    uploadProgress,
    websiteUrl,
    setWebsiteUrl,
    mediaError,
    dirtyBrief,
    dirtyScript,
    dirtyPlan,
    uploadController,
    refresh,
    action,
    back,
    updateClips,
    savePlan,
    uploadVideo,
    downloadKit,
  } = useProjectDetail(initial, adapter, onBack, onChanged, notify);
  const [tab, setTab] = useState<Tab>("overview");
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
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

  return (
    <div className="project-detail flow-stack">
      <ProjectHeader
        project={project}
        voiceText={voiceText}
        canDownload={canDownload}
        kitStage={kitStage}
        active={active}
        back={back}
        downloadKit={downloadKit}
      />
      {!active && !project.error && project.type === "walkthrough" && (
        <NextStep
          project={project}
          adapter={adapter}
          canVoiceover={canVoiceover}
          processing={processing}
          action={action}
        />
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
        <JobFailure
          project={project}
          adapter={adapter}
          info={info}
          canVoiceover={canVoiceover}
          processing={processing}
          action={action}
        />
      )}
      {active && (
        <JobProgress
          project={project}
          adapter={adapter}
          info={info}
          busy={busy}
          action={action}
        />
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
            <OverviewTab
              project={project}
              adapter={adapter}
              info={info}
              active={active}
              processing={processing}
              output={output}
              original={original}
              previewFile={previewFile}
              voiceText={voiceText}
              mediaError={mediaError}
              websiteUrl={websiteUrl}
              setWebsiteUrl={setWebsiteUrl}
              uploadProgress={uploadProgress}
              uploadController={uploadController}
              sessions={sessions}
              frames={frames}
              action={action}
              uploadVideo={uploadVideo}
            />
          )}
          {tab === "editor" && (
            <EditorTab
              project={project}
              adapter={adapter}
              processing={processing}
              source={source}
              setSource={setSource}
              duration={duration}
              durationError={durationError}
              clips={clips}
              updateClips={updateClips}
              videoFiles={videoFiles}
              dirtyPlan={dirtyPlan}
              setPlanDirty={setPlanDirty}
              action={action}
              savePlan={savePlan}
            />
          )}
          {tab === "brief" && (
            <BriefTab
              project={project}
              adapter={adapter}
              active={active}
              processing={processing}
              brief={brief}
              setBrief={setBrief}
              briefDirty={briefDirty}
              setBriefDirty={setBriefDirty}
              dirtyBrief={dirtyBrief}
              briefMode={briefMode}
              setBriefMode={setBriefMode}
              script={script}
              setScript={setScript}
              scriptDirty={scriptDirty}
              setScriptDirty={setScriptDirty}
              dirtyScript={dirtyScript}
              action={action}
            />
          )}
          {tab === "files" && (
            <FilesTab
              project={project}
              adapter={adapter}
              info={info}
              files={files}
            />
          )}
        </section>
      )}
    </div>
  );
}
