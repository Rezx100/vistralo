import React, { useRef } from "react";
import type { Project, WorkspaceAdapter } from "../../contracts";
import { Button } from "../../components/Controls";
import { Icon } from "../../components/Icon";
import type { stalled } from "../../utils";
import type { ProjectAction } from "./useProjectDetail";

/**
 * Shown in place of the progress panel when a project has sat in a working state for far
 * longer than the work takes. It says what probably happened and offers the way out.
 */
export function StalledNotice({
  project,
  stall,
  adapter,
  busy,
  action,
  uploadVideo,
  onTrashed,
}: {
  project: Project;
  stall: NonNullable<ReturnType<typeof stalled>>;
  adapter: WorkspaceAdapter;
  busy: boolean;
  action: ProjectAction;
  uploadVideo: (file: File) => Promise<void>;
  onTrashed: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <section className="stalled-notice" aria-labelledby="stalled-title">
      <span className="stalled-icon" aria-hidden="true">
        <Icon name="warning" />
      </span>
      <div className="stalled-copy">
        <h2 id="stalled-title">This project has stalled</h2>
        <p>{stall.reason}</p>
        <p>{stall.next}</p>
      </div>
      <div className="stalled-actions">
        {stall.action === "upload" ? (
          <>
            <input
              ref={picker}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              accept=".mp4,.webm,.mov,.mkv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadVideo(file);
                event.target.value = "";
              }}
            />
            <Button
              variant="primary"
              icon="upload"
              disabled={busy || !adapter.capabilities.upload}
              onClick={() => picker.current?.click()}
            >
              Choose the file again
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void action(
                "Cancelling",
                () => adapter.rpc("cancel", { id: project.id }),
                "Job cancelled. The project is a draft again.",
              )
            }
          >
            Cancel the job
          </Button>
        )}
        <Button
          variant="ghost"
          icon="trash"
          disabled={busy}
          onClick={() =>
            void action(
              "Moving to Trash",
              async () => {
                await adapter.trash([project.id]);
                onTrashed();
              },
              "Moved to Trash. You can restore it from there.",
            )
          }
        >
          Move to Trash
        </Button>
      </div>
    </section>
  );
}
