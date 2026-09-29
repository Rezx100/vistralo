import React, { useEffect, useState } from "react";
import type { Project, WorkspaceAdapter } from "../contracts";
import { errorMessage, formatDuration } from "./flow-utils";

type Confidence = "confirmed" | "likely";
interface BriefLibrary {
  name: string;
  confidence: Confidence;
  role?: string;
}
interface BriefStop {
  viewport: number;
  label?: string;
  sourceAt?: number;
  effect?: string;
  technique?: string;
  confidence?: Confidence;
  libraries?: BriefLibrary[];
  agent_prompt?: string;
}
interface Brief {
  url: string | null;
  evidence?: { status: string; reason: string | null };
  stack?: { framework?: string; libraries?: BriefLibrary[] };
  stops?: BriefStop[];
}

const names = (libraries: BriefLibrary[], confidence: Confidence) =>
  libraries
    .filter((library) => library.confidence === confidence)
    .map((library) => library.name)
    .join(", ");

/** The worker's build brief: the site stack, then a copyable coding-agent prompt per stop. */
export function BuildBrief({
  project,
  adapter,
  notify,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  notify: (message: string, error?: boolean) => void;
}) {
  const files = project.data.buildBrief as
    | { json?: string; markdown?: string }
    | null
    | undefined;
  const [brief, setBrief] = useState<Brief | null>(null),
    [error, setError] = useState("");

  useEffect(() => {
    if (!files?.json) {
      setBrief(null);
      return;
    }
    let live = true;
    adapter
      .readText(project.id, files.json)
      .then((text) => {
        if (!live) return;
        setBrief(JSON.parse(text) as Brief);
        setError("");
      })
      .catch((failure) => {
        if (live) setError(errorMessage(failure));
      });
    return () => {
      live = false;
    };
  }, [adapter, project.id, files?.json]);

  if (!files?.json) return null;
  const libraries = brief?.stack?.libraries ?? [];
  const confirmed = names(libraries, "confirmed"),
    likely = names(libraries, "likely");
  const stops = (brief?.stops ?? []).filter((stop) => stop.agent_prompt);
  const source = !brief?.url
    ? "No website address was given, so every claim comes from the video."
    : brief.evidence?.status === "ok"
      ? `Read from ${new URL(brief.url).hostname}.`
      : "The website could not be read, so every claim comes from the video.";

  async function copy(stop: BriefStop) {
    try {
      await navigator.clipboard.writeText(stop.agent_prompt || "");
      notify(`Prompt for ${stop.label || `stop ${stop.viewport}`} copied.`);
    } catch {
      notify("Could not copy. Download the brief and copy the prompt from it.", true);
    }
  }

  return (
    <section className="build-brief" aria-labelledby="build-brief-title">
      <div className="build-brief-head">
        <div>
          <h2 id="build-brief-title">Build brief</h2>
          <p className="flow-muted">
            How each effect is built, with a prompt a coding agent can rebuild it
            from. {source}
          </p>
        </div>
        {files.markdown && (
          <a
            className="button button-ghost"
            href={adapter.media(project.id, files.markdown, true)}
            download
          >
            Download
          </a>
        )}
      </div>
      {error && <p className="flow-muted">{error}</p>}
      {brief && (
        <dl className="build-brief-stack">
          <div>
            <dt>Framework</dt>
            <dd>{brief.stack?.framework || "Not detected"}</dd>
          </div>
          {confirmed && (
            <div>
              <dt>Confirmed in code</dt>
              <dd>{confirmed}</dd>
            </div>
          )}
          {likely && (
            <div>
              <dt>Looks like</dt>
              <dd>{likely}</dd>
            </div>
          )}
        </dl>
      )}
      {stops.length > 0 && (
        <ol className="build-brief-stops">
          {stops.map((stop) => (
            <li key={stop.viewport}>
              <div className="build-brief-stop">
                <strong>
                  {stop.label || `Stop ${stop.viewport}`}
                  {Number.isFinite(stop.sourceAt) && (
                    <span className="flow-muted">
                      {" "}
                      · {formatDuration(stop.sourceAt!)}
                    </span>
                  )}
                </strong>
                {stop.effect && <span>{stop.effect}</span>}
                {stop.technique && (
                  <span className="flow-muted">
                    {stop.technique} ({stop.confidence || "likely"})
                  </span>
                )}
              </div>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void copy(stop)}
                aria-label={`Copy prompt for ${stop.label || `stop ${stop.viewport}`}`}
              >
                Copy prompt
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
