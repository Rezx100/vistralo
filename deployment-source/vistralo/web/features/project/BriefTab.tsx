import React from "react";
import type { Project, WorkspaceAdapter } from "../../contracts";
import { ScriptEditor } from "./ScriptEditor";
import type { ProjectAction } from "./useProjectDetail";

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
  return (
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
    </>
  );
}
