import type { ProjectSource } from "../contracts";

export type CreateFlow =
  | "ai-walkthrough"
  | "talk-through"
  | "section"
  | "narrate-video"
  | "narrate-screenshots"
  | "website";

export interface CreateFlowItem {
  flow: CreateFlow;
  source: ProjectSource;
  /** Short name for the horizontal dock. */
  dockLabel: string;
  label: string;
  description: string;
  icon: string;
  key?: string;
}

/** Record now: the three ways to capture your screen, shown on the dock. */
export const recordFlows: CreateFlowItem[] = [
  {
    flow: "ai-walkthrough",
    source: "screen",
    dockLabel: "AI walkthrough",
    label: "Record an AI walkthrough",
    description: "Record your screen. AI explains every screen after you stop.",
    icon: "sparkle",
  },
  {
    flow: "talk-through",
    source: "screen",
    dockLabel: "Talk-through",
    label: "Record a talk-through",
    description: "Record your screen and your voice as you explain it.",
    icon: "mic",
  },
  {
    flow: "section",
    source: "screen",
    dockLabel: "Section",
    label: "Record a section",
    description: "Drag a box over the part of the screen you want.",
    icon: "selectArea",
  },
];

/** Bring what you have: the three ways to start from existing material, shown in the New project menu. */
export const materialFlows: CreateFlowItem[] = [
  {
    flow: "narrate-video",
    source: "upload",
    dockLabel: "Video",
    label: "Narrate a video",
    description: "Upload a recording. AI pauses on each screen and explains it.",
    icon: "video",
    key: "U",
  },
  {
    flow: "narrate-screenshots",
    source: "upload",
    dockLabel: "Screenshots",
    label: "Narrate screenshots",
    description: "Turn a set of images into a narrated walkthrough.",
    icon: "image",
    key: "I",
  },
  {
    flow: "website",
    source: "web",
    dockLabel: "Website",
    label: "Analyze a website",
    description: "Turn a URL into a visual brief with screenshots.",
    icon: "globe",
    key: "W",
  },
];

export const createFlows = [...recordFlows, ...materialFlows];

export const flowFor = (flow: CreateFlow) =>
  createFlows.find((item) => item.flow === flow)!;
