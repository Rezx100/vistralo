import { StatusBadge } from "../../components/ProjectCard";
import { projectTitle, statusHint } from "../../utils";
import React from "react";
import type { Project, WorkspaceAdapter } from "../../contracts";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Controls";
import { formatDuration } from "../flow-utils";
import type { ProjectAction } from "./useProjectDetail";

export function ProjectHeader({
  project,
  voiceText,
  canDownload,
  kitStage,
  active,
  back,
  downloadKit,
  onShare,
}: {
  project: Project;
  voiceText: string;
  canDownload: boolean;
  kitStage: string;
  active: boolean;
  back: () => void;
  downloadKit: () => Promise<void>;
  /** Present when there is something a link could show. */
  onShare?: () => void;
}) {
  return (
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
        <p className="flow-caption flow-muted edge">
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
        {onShare && (
          <Button variant="primary" icon="link" onClick={onShare}>
            Share
          </Button>
        )}
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
  );
}

export function NextStep({
  project,
  adapter,
  canVoiceover,
  processing,
  action,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  canVoiceover: boolean;
  processing: boolean;
  action: ProjectAction;
}) {
  return (
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
  );
}
