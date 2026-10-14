import React, { useMemo } from "react";
import type { Project, WorkspaceAdapter } from "../../contracts";
import { Button } from "../../components/Controls";
import { BriefContents, BriefDocument, parseBrief } from "./BriefMarkdown";
import { ScriptEditor } from "./ScriptEditor";
import type { ProjectAction } from "./useProjectDetail";

const BRIEF_LIMIT = 500000;

export function BriefTab({
  project,
  adapter,
  active,
  processing,
  brief,
  setBrief,
  briefDirty,
  setBriefDirty,
  dirtyBrief,
  briefMode,
  setBriefMode,
  script,
  setScript,
  scriptDirty,
  setScriptDirty,
  dirtyScript,
  action,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  active: boolean;
  processing: boolean;
  brief: string;
  setBrief: (value: string) => void;
  briefDirty: boolean;
  setBriefDirty: (value: boolean) => void;
  dirtyBrief: React.RefObject<boolean>;
  briefMode: "edit" | "preview";
  setBriefMode: (value: "edit" | "preview") => void;
  script: string;
  setScript: (value: string) => void;
  scriptDirty: boolean;
  setScriptDirty: (value: boolean) => void;
  dirtyScript: React.RefObject<boolean>;
  action: ProjectAction;
}) {
  const blocks = useMemo(() => parseBrief(brief), [brief]);
  const empty = !brief.trim();
  const save = () =>
    void action(
      "Saving brief",
      async () => {
        await adapter.rpc("briefSave", { id: project.id, text: brief });
        dirtyBrief.current = false;
        setBriefDirty(false);
      },
      "Visual brief saved.",
    );

  return (
    <div className="brief">
      <header className="flow-heading brief-head">
        <div>
          <h2>Visual brief</h2>
          <p className="flow-muted">
            What the capture found on the page, and your notes beside it. It is plain
            Markdown, so it pastes anywhere.
          </p>
        </div>
        {!(empty && briefMode === "preview") && (
          <div className="brief-tools">
            {briefDirty && <span className="edge brief-unsaved">Unsaved changes</span>}
            <div className="segmented" role="group" aria-label="Brief view">
              <button
                type="button"
                aria-pressed={briefMode === "preview"}
                onClick={() => setBriefMode("preview")}
              >
                Read
              </button>
              <button
                type="button"
                aria-pressed={briefMode === "edit"}
                onClick={() => setBriefMode("edit")}
              >
                Edit
              </button>
            </div>
            <Button
              icon="copy"
              disabled={empty}
              onClick={() =>
                void action(
                  "Copying brief",
                  () => navigator.clipboard.writeText(brief),
                  "Brief copied as Markdown.",
                )
              }
            >
              Copy
            </Button>
          </div>
        )}
      </header>
      {empty && briefMode === "preview" ? (
        <div className="flow-empty brief-empty">
          <h3>{active ? "Your brief is being prepared" : "This project has no brief yet"}</h3>
          <p className="flow-muted">
            {active
              ? "It appears here when the website capture finishes."
              : "Write one from what you saw. Nothing is sent to an AI to do it."}
          </p>
          <Button
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
          </Button>
        </div>
      ) : briefMode === "edit" ? (
        <div className="brief-edit">
          <label className="sr-only" htmlFor="brief-editor">
            Brief in Markdown
          </label>
          <textarea
            id="brief-editor"
            className="brief-editor"
            value={brief}
            maxLength={BRIEF_LIMIT}
            onChange={(event) => {
              setBrief(event.target.value);
              dirtyBrief.current = true;
              setBriefDirty(true);
            }}
            disabled={processing}
            aria-describedby="brief-editor-note"
            spellCheck
          />
          <div className="flow-actions brief-edit-actions">
            <span id="brief-editor-note" className="edge brief-count">
              Markdown · {brief.length.toLocaleString()} characters
            </span>
            <Button variant="primary" disabled={processing || !briefDirty} onClick={save}>
              Save brief
            </Button>
          </div>
        </div>
      ) : (
        <div className="brief-read">
          <BriefContents blocks={blocks} />
          <BriefDocument blocks={blocks} />
        </div>
      )}
      {adapter.capabilities.providers && project.data.walkthroughVideo && (
        <ScriptEditor
          project={project}
          adapter={adapter}
          processing={processing}
          script={script}
          setScript={setScript}
          scriptDirty={scriptDirty}
          setScriptDirty={setScriptDirty}
          dirtyScript={dirtyScript}
          action={action}
        />
      )}
    </div>
  );
}
