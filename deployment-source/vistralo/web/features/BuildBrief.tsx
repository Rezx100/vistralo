import React, { useEffect, useState } from "react";
import type { Project, WorkspaceAdapter } from "../contracts";
import { errorMessage } from "./flow-utils";

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

/** The worker's build brief as a short stack summary; the per-section prompts ship in the Download files kit. */
export function BuildBrief({
  project,
  adapter,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
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
  const sectionCount = (brief?.stops ?? []).filter(
    (stop, index) =>
      index === 0 ||
      !/^same as\b/i.test((stop.agent_prompt || "").trim()) &&
        !/^same as\b/i.test((stop.effect || "").trim()),
  ).length;
  const source = !brief?.url
    ? "No website address was given, so every claim comes from the video."
    : brief.evidence?.status === "ok"
      ? `Read from ${new URL(brief.url).hostname}.`
      : "The website could not be read, so every claim comes from the video.";

  return (
    <section className="build-brief" aria-labelledby="build-brief-title">
      <div className="build-brief-head">
        <div>
          <h2 id="build-brief-title">Build brief</h2>
          <p className="flow-muted">
            {source} Download files gives a coding agent one prompt covering{" "}
            {sectionCount ? `all ${sectionCount} sections` : "every section"}, with
            the video and a still of each.
          </p>
        </div>
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
    </section>
  );
}
