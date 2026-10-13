import React from "react";
import type { Project, ProjectFile, WorkspaceAdapter } from "../../contracts";
import { formatDuration } from "../flow-utils";
import { clip } from "./clips";
import type { Clip } from "./clips";
import { Playback } from "./Player";
import type { ProjectAction } from "./useProjectDetail";

export function EditorTab({
  project,
  adapter,
  processing,
  source,
  setSource,
  duration,
  durationError,
  clips,
  updateClips,
  videoFiles,
  dirtyPlan,
  setPlanDirty,
  action,
  savePlan,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  processing: boolean;
  source: string;
  setSource: (value: string) => void;
  duration: number | null;
  durationError: string;
  clips: Clip[];
  updateClips: (next: Clip[]) => void;
  videoFiles: ProjectFile[];
  dirtyPlan: React.RefObject<boolean>;
  setPlanDirty: (value: boolean) => void;
  action: ProjectAction;
  savePlan: (render?: boolean) => Promise<void>;
}) {
  return (
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
  );
}
