import React from "react";
import { formatDuration } from "../flow-utils";

export interface ScreenPart {
  /** Seconds into the walkthrough at which this screen's line starts. */
  at: number;
  text: string;
}

/** The parts of a narration, or the whole script as one part when it was not split by screen. */
export function screenParts(data: Record<string, any>): ScreenPart[] {
  if (Array.isArray(data.scriptParts))
    return data.scriptParts
      .filter((part: any) => part && typeof part.text === "string" && part.text.trim())
      .map((part: any) => ({ at: Number(part.at) || 0, text: part.text }));
  return typeof data.script === "string" && data.script.trim()
    ? [{ at: 0, text: data.script }]
    : [];
}

/**
 * The sheet: every screen Vistralo found, numbered, with the line spoken over it.
 * Choosing a screen plays the walkthrough from there, and the screen being spoken is marked.
 */
export function ScreenSheet({
  parts,
  time,
  onSeek,
}: {
  parts: ScreenPart[];
  /** Where the player is, in seconds. */
  time: number;
  onSeek: (at: number) => void;
}) {
  let current = -1;
  parts.forEach((part, index) => {
    if (part.at <= time + 0.05) current = index;
  });
  return (
    <section className="screen-sheet" aria-labelledby="screen-sheet-title">
      <h2 id="screen-sheet-title">
        Screens <span className="counter">{parts.length}</span>
      </h2>
      <ol>
        {parts.map((part, index) => (
          <li
            key={`${index}-${part.at}`}
            className={index === current ? "is-current" : ""}
            aria-current={index === current ? "true" : undefined}
          >
            <button
              type="button"
              className="sheet-seek edge"
              aria-label={`Play screen ${index + 1}, at ${formatDuration(part.at)}`}
              onClick={() => onSeek(part.at)}
            >
              <span className="sheet-number">{String(index + 1).padStart(2, "0")}</span>
              <time>{formatDuration(part.at)}</time>
            </button>
            <p>{part.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
