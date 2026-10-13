import React from "react";
import type { Project, WorkspaceAdapter } from "../../contracts";
import type { ProjectAction } from "./useProjectDetail";

export function ScriptEditor({
  project,
  adapter,
  processing,
  script,
  setScript,
  scriptDirty,
  setScriptDirty,
  dirtyScript,
  action,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  processing: boolean;
  script: string;
  setScript: (value: string) => void;
  scriptDirty: boolean;
  setScriptDirty: (value: boolean) => void;
  dirtyScript: React.RefObject<boolean>;
  action: ProjectAction;
}) {
  return (
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
  );
}
