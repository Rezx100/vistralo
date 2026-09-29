import type { Project } from "./contracts";

export const DEMO_VERSION = 1;
export const DEMO_STORAGE_KEY = `vistralo-demo-workspace:v${DEMO_VERSION}`;
export const DEMO_DISCLOSURE =
  "Demo workspace. Fictional projects and simulated jobs are saved only in this browser. Sample videos are short previews.";
export const SAMPLE_VIDEO = "/assets/sample-walkthrough.mp4";
export const SAMPLE_POSTER = "/assets/walkthrough-poster.webp";

export function demoBrief(
  title: string,
  source = "Fictional example website",
): string {
  return `# ${title}\n\nDemo visual brief · ${source}\n\nThis is a fictional, editable example. No website was analyzed to produce these observations.\n\n## Overview\nA storefront that makes the path from product discovery to checkout easy to follow. The primary action stays visible alongside concise product information.\n\n## Structure and hierarchy\nUse one page heading, short section titles and clear spacing between product details. Keep product options next to the primary action.\n\n## Motion and interaction\nKeep hover feedback brief and preserve the user's position when a panel opens. Give keyboard focus the same clear feedback as pointer hover. Respect reduced motion.\n\n## Accessibility references\nCheck text contrast, visible focus, error descriptions, keyboard order and reflow at narrow widths. Pair each visual reference with a written observation.\n\n## Implementation notes\nThese sample notes are editable. Replace them with evidence from your own authorized website capture before treating them as project requirements.\n`;
}

/** Fresh timestamps are generated only on first initialization of the versioned demo. */
export function createDemoFixtures(now = Date.now()): Project[] {
  const ago = (hours: number) =>
    new Date(now - hours * 3_600_000).toISOString();
  const base = (id: string, name: string, hours: number): Project => ({
    id,
    name,
    type: "walkthrough",
    source: "screen",
    status: "draft",
    created: ago(hours + 24),
    updated: ago(hours),
    eventAt: ago(hours),
    eventLabel: "Edited",
    access: "private",
    data: { demo: true, fictional: true },
  });
  const video = { video: SAMPLE_VIDEO, thumbnail: SAMPLE_POSTER };
  return [
    {
      ...base("demo-homepage-motion", "Homepage motion study", 2),
      ...video,
      status: "ready",
      duration: 272,
      moments: 9,
      eventLabel: "Recorded",
      pinned: true,
      data: {
        demo: true,
        fictional: true,
        video: SAMPLE_VIDEO,
        sampleVideo: true,
        sampleVideoNotice:
          "Short sample preview; 4:32 is fictional project metadata.",
      },
    },
    {
      ...base("demo-storefront-review", "Storefront design review", 3),
      type: "brief",
      source: "web",
      sourceLabel: "fernhillgoods.com",
      status: "ready",
      references: 14,
      sections: 5,
      eventLabel: "Analyzed",
      access: "workspace",
      collaborators: [
        { name: "Maya Chen", initials: "MC" },
        { name: "Alex Morgan", initials: "AM" },
      ],
      data: {
        demo: true,
        fictional: true,
        brief: demoBrief(
          "Storefront design review",
          "fernhillgoods.com — fictional source label",
        ),
        owner: "Maya Chen",
        sharedWithMe: true,
      },
    },
    {
      ...base("demo-product-references", "Product demo references", 0.2),
      type: "brief",
      source: "web",
      sourceLabel: "brightloom.io",
      status: "processing",
      data: {
        demo: true,
        fictional: true,
        simulationState:
          "Static example of an analysis in progress. Start a new demo analysis to see the simulated workflow.",
      },
    },
    {
      ...base("demo-design-handoff", "Design system handoff", 0.1),
      source: "upload",
      status: "uploading",
      progress: 42,
      data: {
        demo: true,
        fictional: true,
        simulationState:
          "Static example of an upload at 42%. Upload your own file to test local demo storage.",
      },
    },
    {
      ...base("demo-onboarding-breakdown", "Onboarding flow breakdown", 26),
      type: "brief",
      source: "web",
      sourceLabel: "halden.app",
      sections: 5,
      references: 8,
      data: {
        demo: true,
        fictional: true,
        brief: demoBrief(
          "Onboarding flow breakdown",
          "halden.app — fictional source label",
        ),
      },
    },
    {
      ...base("demo-video-workflow", "Video editing workflow", 72),
      ...video,
      duration: 727,
      eventLabel: "Recorded",
      moments: 18,
      data: {
        demo: true,
        fictional: true,
        video: SAMPLE_VIDEO,
        sampleVideo: true,
        sampleVideoNotice:
          "Short sample preview; 12:07 is fictional project metadata.",
      },
    },
    {
      ...base("demo-pricing-teardown", "Pricing page teardown", 4),
      type: "brief",
      source: "web",
      sourceLabel: "orbitforms.app",
      status: "failed",
      eventLabel: "Updated",
      error:
        "The website blocked automated access. Try another public page or upload a recording.",
      data: { demo: true, fictional: true },
    },
    {
      ...base(
        "demo-checkout-audit",
        "Checkout flow accessibility audit for the spring campaign landing pages",
        6,
      ),
      ...video,
      source: "web",
      sourceLabel: "tidepool.studio",
      status: "ready",
      duration: 3930,
      eventLabel: "Recorded",
      moments: 32,
      data: {
        demo: true,
        fictional: true,
        video: SAMPLE_VIDEO,
        sampleVideo: true,
        sampleVideoNotice:
          "Short sample preview; 1:05:30 is fictional project metadata.",
      },
    },
  ];
}

export const PROJECT_STATUSES = [
  "uploading",
  "queued",
  "processing",
  "failed",
  "draft",
  "ready",
] as const;

/** Counts are derived from the same searched/type/source-filtered records as the view. */
export function projectStatusCounts(projects: Project[]) {
  return {
    all: projects.length,
    drafts: projects.filter((p) => p.status === "draft").length,
    ready: projects.filter((p) => p.status === "ready").length,
    attention: projects.filter((p) => p.status === "failed").length,
  };
}
