import type { Project, WorkspaceAdapter } from "./contracts";
import { stills } from "./poster";
import { projectTitle } from "./utils";
import { formatDuration, safeFilename } from "./features/flow-utils";
import { zip, type ZipEntry } from "./zip";

type Confidence = "confirmed" | "likely";
interface Library {
  name: string;
  role?: string;
  confidence?: Confidence;
}
interface Stop {
  viewport: number;
  label?: string;
  sourceAt?: number;
  filmAt?: number | null;
  effect?: string;
  technique?: string;
  agent_prompt?: string;
}
interface Brief {
  url?: string | null;
  stack?: { framework?: string; libraries?: Library[]; fonts?: string[] };
  closingStack?: string;
  stops?: Stop[];
}

const SYSTEM = ["palette", "typography", "shape", "spacing", "iconography", "imagery", "motion"];
const REPEAT = /^same as (?:viewport|stop|screen) \d+[.,]?\s*/i;
const STILL = /^(?:none|static|same as)\b/i;

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "screen";

const sentence = (text: string) => {
  const t = text.trim().replace(/^[a-z]/, (c) => c.toUpperCase());
  return !t || /[.!?]$/.test(t) ? t : `${t}.`;
};

interface Section {
  label: string;
  at: number;
  prompt: string;
  motion: string;
  still?: string;
}

/** One entry per distinct screen; "same as viewport N" stops only add their extra detail to the screen they repeat. */
function sections(stops: Stop[], narrated: boolean): Section[] {
  const out: Section[] = [];
  for (const stop of stops) {
    const at = Number((narrated ? stop.filmAt : stop.sourceAt) ?? stop.sourceAt ?? 0);
    const raw = (stop.agent_prompt || "").trim();
    const repeat = REPEAT.test(raw) || REPEAT.test(stop.effect || "");
    const extra = raw.replace(REPEAT, "").trim();
    if (repeat && out.length) {
      if (extra) out[out.length - 1].prompt += ` ${sentence(extra)}`;
      continue;
    }
    const effect = (stop.effect || "").trim();
    out.push({
      label: stop.label || `Screen ${stop.viewport}`,
      at: Number.isFinite(at) ? at : 0,
      prompt: sentence(extra),
      motion: effect && !STILL.test(effect) ? sentence(effect) : "",
    });
  }
  return out;
}

function prompt(
  project: Project,
  brief: Brief | null,
  list: Section[],
  files: { video?: string; captions?: string },
  notes: string,
) {
  const url = brief?.url || project.url;
  const lines = [
    `# Build: ${projectTitle(project)}`,
    "",
    `Rebuild the ${url ? `website ${url}` : "interface"} shown in this folder as a working front end. Match the layout, sizes, colours, type and motion; use placeholder copy and images where the originals are not included.`,
    "",
    "## Files",
  ];
  if (files.video)
    lines.push(
      `- \`${files.video}\`: the narrated walkthrough. It pauses on each screen while the narrator explains how it looks and moves.`,
    );
  if (files.captions) lines.push(`- \`${files.captions}\`: the narration as timed text.`);
  if (list.some((s) => s.still)) lines.push("- `screens/`: one still per section, in page order.");
  const stack = brief?.stack;
  if (stack) {
    const libraries = stack.libraries ?? [];
    const named = (confidence: Confidence) =>
      libraries
        .filter((l) => (l.confidence || "likely") === confidence)
        .map((l) => (l.role ? `${l.name} (${l.role})` : l.name))
        .join(", ");
    lines.push("", "## Stack");
    lines.push(`- Framework: ${stack.framework || "your choice"}`);
    if (named("confirmed")) lines.push(`- Seen in the site's code: ${named("confirmed")}`);
    if (named("likely")) lines.push(`- Looks like: ${named("likely")}`);
    if (stack.fonts?.length) lines.push(`- Fonts: ${stack.fonts.join(", ")}`);
  }
  const system = project.data.designSystem as Record<string, unknown> | undefined;
  const tokens = SYSTEM.filter((key) => typeof system?.[key] === "string" && String(system[key]).trim());
  if (tokens.length) {
    lines.push("", "## Design system");
    for (const key of tokens)
      lines.push(`- ${key[0].toUpperCase()}${key.slice(1)}: ${String(system![key]).trim()}`);
  }
  if (list.length) {
    lines.push("", "## Sections, top to bottom");
    list.forEach((section, i) => {
      const where = [section.still, files.video ? `video ${formatDuration(section.at)}` : ""]
        .filter(Boolean)
        .join(", ");
      lines.push(
        "",
        `${i + 1}. **${section.label}**${where ? ` (${where})` : ""}`,
        ...(section.prompt ? [`   ${section.prompt}`] : []),
        ...(section.motion ? [`   Motion: ${section.motion}`] : []),
      );
    });
  } else if (typeof project.data.script === "string" && project.data.script.trim()) {
    lines.push("", "## Narration", "", project.data.script.trim());
  }
  if (notes.trim()) lines.push("", "## Brief", "", notes.trim());
  lines.push(
    "",
    "## Done when",
    "- Every section above exists, in order, and matches its still at the same width.",
    "- Motion and scroll behaviour match the video.",
    "- It builds and runs with no console errors.",
    "",
  );
  return lines.join("\n");
}

const extension = (file: string) => (file.match(/\.[a-z0-9]+$/i)?.[0] || ".mp4").toLowerCase();

async function fetchBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`A project file could not be downloaded (HTTP ${response.status}).`);
  return response.blob();
}

/** Everything a coding agent needs in one ZIP: a compact prompt, the narrated video, its captions and a still per section. */
export async function downloadAgentKit(
  adapter: WorkspaceAdapter,
  project: Project,
  onStage: (text: string) => void,
  notes = "",
): Promise<void> {
  const data = project.data;
  const has = (file: unknown): file is string => typeof file === "string" && !!data.files?.[file];
  const videoFile = [data.narratedVideo, data.output?.file, project.video, data.video].find(has);
  const captionsFile = has(data.captions) ? data.captions : undefined;
  onStage("Reading the build notes");
  let brief: Brief | null = null;
  if (has(data.buildBrief?.json)) {
    try {
      brief = JSON.parse(await adapter.readText(project.id, data.buildBrief.json)) as Brief;
    } catch {
      brief = null;
    }
  }
  const narrated = !!videoFile && videoFile === data.narratedVideo;
  const list = sections(brief?.stops ?? [], narrated);
  const names = {
    video: videoFile ? `walkthrough${extension(videoFile)}` : undefined,
    captions: captionsFile ? "walkthrough.srt" : undefined,
  };
  const entries: ZipEntry[] = [];
  if (videoFile && list.length) {
    const url = adapter.media(project.id, videoFile);
    onStage(`Capturing screens 0 of ${list.length}`);
    const shots = await stills(
      url,
      list.map((s) => s.at + 0.4),
      (done) => onStage(`Capturing screens ${done} of ${list.length}`),
    ).catch(() => [] as (Blob | null)[]);
    shots.forEach((shot, i) => {
      if (!shot) return;
      const name = `screens/${String(i + 1).padStart(2, "0")}-${slug(list[i].label)}.jpg`;
      list[i].still = name;
      entries.push({ name, data: shot });
    });
  }
  const text = prompt(project, brief, list, names, notes);
  entries.unshift({ name: "PROMPT.md", data: new Blob([text], { type: "text/markdown" }) });
  if (captionsFile)
    entries.push({ name: names.captions!, data: new Blob([await adapter.readText(project.id, captionsFile)], { type: "text/plain" }) });
  if (videoFile) {
    onStage("Downloading the video");
    entries.push({ name: names.video!, data: await fetchBlob(adapter.media(project.id, videoFile)) });
  }
  const archive = await zip(entries, (done, total) =>
    onStage(`Packing ${Math.round((done / Math.max(total, 1)) * 100)}%`),
  );
  const href = URL.createObjectURL(archive);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${safeFilename(projectTitle(project))} - build kit.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
