import React from "react";
import type {
  Project,
  ProjectDetail as ProjectInfo,
  WorkspaceAdapter,
} from "../../contracts";
import type { ProjectAction } from "./useProjectDetail";

export function JobFailure({
  project,
  adapter,
  info,
  canVoiceover,
  processing,
  action,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  info: ProjectInfo | null;
  canVoiceover: boolean;
  processing: boolean;
  action: ProjectAction;
}) {
  return (
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
  );
}

export function JobProgress({
  project,
  adapter,
  info,
  busy,
  action,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  info: ProjectInfo | null;
  busy: string;
  action: ProjectAction;
}) {
  return (
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
  );
}
