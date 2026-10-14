import React, { useState } from "react";
import type { Project, ProjectFile, WorkspaceAdapter } from "../../contracts";
import { Button, Field } from "../../components/Controls";
import { Icon } from "../../components/Icon";
import { ToolButton } from "../../components/Primitives";
import { formatDuration } from "../flow-utils";
import { asSeconds, clip, clipProblem, keptSpans } from "./clips";
import type { Clip } from "./clips";
import { Playback } from "./Player";
import type { ProjectAction } from "./useProjectDetail";

/**
 * Trim: the recording in its frame, a strip of what stays, and the parts as a numbered sheet.
 * Each part's start and end can be typed or taken from where the player is.
 */
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
  const [playhead, setPlayhead] = useState(0);
  const [seek, setSeek] = useState<{ at: number; n: number } | null>(null);
  const sources = [
    ...new Set([...videoFiles.map((item) => item.file), ...(source ? [source] : [])]),
  ];
  const spans = keptSpans(clips, duration);
  const kept = spans.reduce((total, span) => total + span.length, 0);
  const locked = processing || !duration;
  const edit = (key: string, change: Partial<Clip>) =>
    updateClips(clips.map((item) => (item.key === key ? { ...item, ...change } : item)));
  const at = formatDuration(playhead);
  const fileName = (file: string) => file.split("/").pop() || file;

  return (
    <div className="trim">
      <header className="flow-heading">
        <div>
          <h2>Trim the recording</h2>
          <p className="flow-muted">
            Keep the parts you want, in order. Rendering makes a new video; the recording
            itself is kept as it is.
          </p>
        </div>
      </header>
      {source && (
        <Playback
          src={adapter.media(project.id, source)}
          label="Recording to trim"
          duration={duration ?? undefined}
          seek={seek}
          onTime={setPlayhead}
        />
      )}
      {duration ? (
        <div className="trim-strip-wrap">
          <div className="trim-strip" aria-hidden="true">
            {spans.map((span) => (
              <span
                key={span.key}
                className="trim-span"
                style={{ "--from": span.from, "--to": span.to } as React.CSSProperties}
              >
                <span className="trim-span-number">{String(span.number).padStart(2, "0")}</span>
              </span>
            ))}
            <span
              className="trim-playhead"
              style={{ "--at": Math.min(playhead / duration, 1) } as React.CSSProperties}
            />
          </div>
          <p className="edge trim-summary" role="status">
            {spans.length
              ? `Keeps ${spans.length} ${spans.length === 1 ? "part" : "parts"} · ${formatDuration(kept)} of ${formatDuration(duration)}`
              : `Nothing marked yet · Recording ${formatDuration(duration)}`}
          </p>
        </div>
      ) : (
        <p className="flow-caption flow-muted" role="status">
          {durationError ||
            (source
              ? "Measuring the recording…"
              : "Add a recording on the Overview tab to trim it.")}
        </p>
      )}
      {(sources.length > 1 || !source) && sources.length > 0 && (
        <Field label="Recording" className="trim-source">
          <select
            value={source}
            disabled={processing}
            onChange={(event) => {
              setSource(event.target.value);
              updateClips([clip()]);
            }}
          >
            {!source && <option value="">Choose a recording</option>}
            {sources.map((file) => (
              <option value={file} key={file}>
                {fileName(file)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <ol className="trim-parts" aria-label="Parts to keep">
        {clips.map((part, index) => {
          const number = index + 1;
          const problem = clipProblem(clips, index, duration);
          const length =
            !problem && part.end.trim() ? Number(part.end) - Number(part.start) : null;
          return (
            <li key={part.key} className={problem ? "is-invalid" : undefined}>
              <fieldset disabled={locked}>
                {/* A rendered legend sits outside the fieldset's grid, so the visible number is a span. */}
                <legend className="sr-only">Part {number}</legend>
                <span className="edge trim-number" aria-hidden="true">
                  Part {String(number).padStart(2, "0")}
                </span>
                <div className="trim-times">
                  {(["start", "end"] as const).map((edge) => (
                    <div className="trim-time" key={edge}>
                      <div className={`field ${problem ? "is-invalid" : ""}`.trim()}>
                        <label htmlFor={`trim-${part.key}-${edge}`}>
                          {edge === "start" ? "Starts at (seconds)" : "Ends at (seconds)"}
                        </label>
                        <input
                          id={`trim-${part.key}-${edge}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max={duration ?? undefined}
                          step="0.001"
                          value={part[edge]}
                          aria-invalid={problem ? true : undefined}
                          aria-describedby={problem ? `trim-${part.key}-problem` : undefined}
                          onChange={(event) => edit(part.key, { [edge]: event.target.value })}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        className="trim-mark"
                        disabled={locked}
                        aria-label={`Use ${at} as the ${edge} of part ${number}`}
                        onClick={() => edit(part.key, { [edge]: asSeconds(playhead) })}
                      >
                        Use {at}
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="trim-part-end">
                  <span className="edge trim-length">
                    {length !== null ? formatDuration(length) : "–:––"}
                  </span>
                  <ToolButton
                    icon="play"
                    label={`Play part ${number}`}
                    disabled={!duration || !part.start.trim() || !Number.isFinite(Number(part.start))}
                    onClick={() => setSeek({ at: Number(part.start), n: Date.now() })}
                  />
                  <ToolButton
                    icon="trash"
                    label={`Remove part ${number}`}
                    disabled={locked || clips.length === 1}
                    onClick={() => updateClips(clips.filter((item) => item.key !== part.key))}
                  />
                </div>
                {problem && (
                  <p id={`trim-${part.key}-problem`} className="field-error trim-problem">
                    <Icon name="warning" />
                    {problem}
                  </p>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="flow-actions trim-actions">
        <Button
          icon="add"
          variant="ghost"
          disabled={locked || clips.length >= 100}
          onClick={() => updateClips([...clips, clip(clips.at(-1)?.end || "0")])}
        >
          Add a part
        </Button>
        <span className="trim-actions-gap" />
        <Button disabled={locked} onClick={() => void savePlan()}>
          Save trim plan
        </Button>
        <Button variant="primary" disabled={locked} onClick={() => void savePlan(true)}>
          Save and render
        </Button>
      </div>
      <details className="trim-transcript">
        <summary>Cut from a timed transcript</summary>
        <p className="flow-caption flow-muted">
          A JSON list of words, or an object with a <code>words</code> list. Each word needs
          <code>text</code>, <code>start</code> and <code>end</code> in seconds. The parts it
          proposes appear above for you to check before rendering. Up to 2 MB.
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
    </div>
  );
}
