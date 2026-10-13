---
version: 1
slug: "web-app-tsx"
primary_target: "web/App.tsx"
related_targets: ["web/features/Projects.tsx","web/features/CreateProject.tsx","web/features/ProjectDetail.tsx"]
---

# Surface brief: the Vistralo app (shell, library, create and record, project page)

Scope: every signed-in screen of the web app in `web/`. Visitor mode: Operate.

Audience and job: someone at a desk who needs to explain what is on a screen to a person who was not there. They start a recording in one click, get a share link when it stops, and come back later to check a job that takes minutes.

Content the surface must carry: project status (draft, queued, processing, ready, failed, stuck), two project types (walkthrough, Visual brief), six ways to start, and the narration script beside the screens it describes.

Constraints: light theme first with dark kept; German, right-to-left, forced colours, reduced motion, keyboard shortcuts, demo mode and recording recovery keep working; every raw value lives in `web/styles/tokens.css`; no `'unsafe-inline'`.

Memorable moment: the three-two-one film leader before a recording starts, and a project opening as a sheet of numbered screens with the line spoken over each.

Unresolved: whether the worker can report how many screens it found before a job ends (the library can only show a screen count where the project already stores one).

## Direction contract

THESIS: A recording is shown as the screens Vistralo found in it: numbered frames on a sheet, each with its spoken line. It refuses the violet card grid with one thumbnail per video.

OWN-WORLD: Cool paper ground, near-black ink. Media sits in thin black film-rebate frames with condensed edge print (frame number, timecode). One indigo pencil marks selection and the primary action. Red appears only while recording. No card boxes, no glass, no shadows at rest.

STORY: The visitor sees recordings as explained screens, records in one click, and is handed a link when it stops.

FIRST VIEWPORT: Library at 1280: 232px rail; one header row with a wide-set title, search, and Record at the far end; pill filters; frames laid straight on the paper with edge print and a title beneath each.

FORM: Contact sheet, candidate 6 of 7 grounded candidates; seed key b2f4b32e (degraded roll, no challengers).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
