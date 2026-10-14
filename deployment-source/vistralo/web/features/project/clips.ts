import { uuid } from "../../id";
import { formatDuration } from "../flow-utils";

export type Clip = { key: string; start: string; end: string };
export const clip = (start = "0", end = ""): Clip => ({ key: uuid(), start, end });

/** Seconds as the trim fields hold them: up to three decimals, no trailing zeros. */
export const asSeconds = (seconds: number) => String(Math.round(seconds * 1000) / 1000);

/**
 * Why a part cannot be saved as typed, by the same rules the save applies (`buildClipPlan`),
 * or "" when it can. A field left empty says nothing yet: the part is still being filled in.
 */
export function clipProblem(clips: Clip[], index: number, duration: number | null): string {
  const part = clips[index];
  if (!part.start.trim() || !part.end.trim()) return "";
  const start = Number(part.start), end = Number(part.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Use seconds, such as 12.5.";
  if (start < 0) return "A part cannot start before the recording.";
  if (end <= start) return "This part ends before it starts.";
  if (duration && end > duration) return `The recording ends at ${formatDuration(duration)}.`;
  const before = clips[index - 1];
  if (before && before.end.trim() && start < Number(before.end))
    return `This part starts before part ${index} ends. Keep the parts in order.`;
  return "";
}

/** The parts that are complete and valid, as fractions of the recording, for the strip. */
export function keptSpans(clips: Clip[], duration: number | null) {
  if (!duration) return [];
  return clips.flatMap((part, index) => {
    if (clipProblem(clips, index, duration) || !part.end.trim()) return [];
    const start = Number(part.start), end = Number(part.end);
    return [{ key: part.key, number: index + 1, from: start / duration, to: end / duration, length: end - start }];
  });
}
