import React from "react";
import type { Project, WorkspaceAdapter } from "../../contracts";
import { Button } from "../../components/Controls";
import { Icon } from "../../components/Icon";
import type { ProjectAction } from "./useProjectDetail";

const SCRIPT_LIMIT = 5000;

/** The words the AI voice will speak, checked and approved by a person before anything is paid for. */
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
  const near = script.length > SCRIPT_LIMIT * 0.9;
  return (
    <section className="brief-script" aria-labelledby="brief-script-title">
      <header className="flow-heading">
        <div>
          <h3 id="brief-script-title">AI narration</h3>
          <p className="flow-muted">
            {project.data.narratedVideo
              ? "A narrated video was made from this script. Approving a changed script makes a new one."
              : "Check the words before a voice speaks them. Nothing goes to the voice provider until you approve."}
          </p>
        </div>
        {scriptDirty && <span className="edge brief-unsaved">Unsaved changes</span>}
      </header>
      {project.data.scriptError && !script.trim() && (
        <p className="flow-notice" role="status">
          The draft could not be written: {project.data.scriptError} The capture and its
          video are unaffected. Write the narration yourself below, or fix the setting and
          run the analysis again.
        </p>
      )}
      <label className="sr-only" htmlFor="narration-script">
        Narration script
      </label>
      <textarea
        id="narration-script"
        className="brief-script-editor"
        value={script}
        maxLength={SCRIPT_LIMIT}
        placeholder="Write the narration, or run the analysis again to draft one."
        onChange={(event) => {
          setScript(event.target.value);
          dirtyScript.current = true;
          setScriptDirty(true);
        }}
        disabled={processing}
        aria-describedby="narration-script-note"
        spellCheck
      />
      <div className="flow-actions brief-edit-actions">
        <span id="narration-script-note" className={`edge brief-count ${near ? "is-near" : ""}`.trim()}>
          {script.length.toLocaleString()} of {SCRIPT_LIMIT.toLocaleString()} characters
        </span>
        <div className="flow-actions">
          <Button
            disabled={processing || !scriptDirty}
            onClick={() =>
              void action(
                "Saving script",
                async () => {
                  await adapter.rpc("scriptSave", { id: project.id, text: script });
                  dirtyScript.current = false;
                  setScriptDirty(false);
                },
                "Narration script saved.",
              )
            }
          >
            Save script
          </Button>
          <Button
            variant="primary"
            disabled={processing || !script.trim()}
            onClick={() =>
              void action(
                "Generating narration",
                async () => {
                  await adapter.rpc("narrate", { id: project.id, text: script });
                  dirtyScript.current = false;
                  setScriptDirty(false);
                },
                "Approved. Narration is being generated.",
              )
            }
          >
            Approve and generate narrated video
          </Button>
        </div>
      </div>
      <p className="brief-script-cost">
        <Icon name="info" />
        Making the voice is a paid request to HeyGen, on your own key or, on Pro and Studio, on
        Vistralo’s. It runs only if its estimate fits the cost cap per job in Settings, under AI
        narration.
      </p>
    </section>
  );
}
