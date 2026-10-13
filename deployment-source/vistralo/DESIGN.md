---
name: Vistralo
description: Recordings shown as the screens Vistralo found in them, each with its spoken line.
colors:
  paper: "#f4f5f7"
  surface: "#ffffff"
  ink: "#12141a"
  ink-2: "#454a57"
  ink-3: "#5c6270"
  hairline: "#e1e3e8"
  control-border: "#868c9b"
  rebate: "#0c0d10"
  edge-print: "#d7dae2"
  edge-print-dim: "#9aa0ae"
  pencil: "#4b52cf"
  pencil-hover: "#3f46b8"
  pencil-pressed: "#343aa4"
  pencil-deep: "#3a40ad"
  pencil-wash: "#edeefa"
  on-pencil: "#ffffff"
  record: "#d42a1f"
  record-text: "#c0261c"
  success-fg: "#15703a"
  success-bg: "#dff7e7"
  warning-fg: "#7a4f00"
  warning-bg: "#fdf0cd"
  danger-fg: "#b01c1c"
  danger-bg: "#fde4e4"
  dark-paper: "#0b0d12"
  dark-rail: "#101319"
  dark-surface: "#171a22"
  dark-elevated: "#1e222c"
  dark-ink: "#f4f5f8"
  dark-ink-2: "#b9bdc8"
  dark-ink-3: "#9ea3b2"
  dark-hairline: "#2a2d38"
  dark-control-border: "#747a91"
  dark-pencil-soft: "#a8adfd"
  dark-focus: "#8b8fff"
  dark-record-text: "#ff6b61"
typography:
  display:
    fontFamily: "Archivo, Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 4.5rem)"
    fontWeight: 620
    lineHeight: 1.02
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 112"
  title:
    fontFamily: "Archivo, Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "34px"
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "26px"
  body:
    fontFamily: "Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  edge:
    fontFamily: "Archivo, Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 560
    lineHeight: "16px"
    letterSpacing: "0.03em"
    fontVariation: "'wdth' 78"
    fontFeature: "'tnum'"
rounded:
  frame: "4px"
  control: "8px"
  surface: "12px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.pencil}"
    textColor: "{colors.on-pencil}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.pencil-hover}"
  button-record:
    backgroundColor: "{colors.record}"
    textColor: "{colors.on-pencil}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 12px"
  frame:
    backgroundColor: "{colors.rebate}"
    textColor: "{colors.edge-print}"
    rounded: "{rounded.frame}"
  pill-tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
---

<!-- SEED: written 13 October 2026, before the build, because the owner asked for DESIGN.md as a foundation. The owner was not interviewed; the direction was derived from the briefing files (see PRODUCT.md). Values here are the plan. Re-record this file from the built app when the redesign phases land. -->

# Design System: Vistralo

## Overview

**Creative North Star: "The contact sheet"**

A photographer's contact sheet prints every frame of a roll on one page, numbered along the edge, so an editor can see the whole shoot and mark the frames that matter. Vistralo does the same thing to a recording: it finds every distinct screen, numbers it, and writes a line for it. The interface shows that. A project opens as a sheet of numbered screens with the spoken line beside each one, and the library is frames laid on paper with a line of edge print under each.

The structure follows the screen recorders people already know: a rail on the left, a library, one Record button, a page per recording with the share link at the top. What sits inside that structure is Vistralo's own. The owner pinned light theme first, the existing indigo and the emblem; the contact sheet was fitted inside those, so its paper is cool white, its marking pencil is Vistralo's indigo, and its darkroom is the dark theme.

Light is the default because of where the work happens: someone at a desk in daylight, switching from a design tool or an editor to explain a page before a review. The dark theme is the same sheet on a lightbox that has been switched off, for people who work that way.

The public site uses the same world at a larger scale. Whole sections are ink or indigo fields, and the frames are big enough to read the screens in them.

**Key Characteristics:**
- Frames sit on the paper with no card box around them.
- Media always sits in a thin black film edge, and the facts about it (number, length, type) are printed along that edge in condensed tabular type.
- One indigo pencil marks what is selected and what to do next. Red means a recording is live and appears nowhere else.
- Flat at rest. Only menus, dialogs and toasts lift, and nothing is blurred.
- Motion advances one step and holds, the way the walkthrough itself does.

## Colors

Cool neutrals with one accent. The paper is tinted slightly toward the indigo so the two belong together, and semantic colours are kept for states.

### Primary
- **Marking Pencil** (`pencil`): the primary action, the selection ring around a frame, the current item in the rail, links, the focus ring in the light theme. `pencil-hover` and `pencil-pressed` are its states, `pencil-wash` is the fill behind a selected row, and `pencil-deep` is for indigo text on that wash.

### Secondary
- **Tally Red** (`record`, `record-text`): the Record button, the live recording indicator and the countdown. A destructive confirmation uses `danger-fg`, which is a different red, so that "recording" and "delete" never look the same.

### Neutral
- **Paper** (`paper`): the page. **Surface** (`surface`): the rail, fields, menus, dialogs.
- **Ink** (`ink`, `ink-2`, `ink-3`): text, in three steps. `ink-3` is the lightest text allowed and measures 5.6:1 on paper.
- **Hairline** (`hairline`): dividers. **Control border** (`control-border`): the outline of anything you can type in or toggle, at least 3:1 against its ground.
- **Rebate** (`rebate`): the black edge around every piece of media, the same in both themes. **Edge print** (`edge-print`, `edge-print-dim`): type printed on it.
- The `dark-*` entries are the dark theme's equivalents. In the dark theme indigo text uses `dark-pencil-soft`, and filled indigo buttons keep `pencil` with white text.

### Named Rules
**The One Pencil Rule.** Indigo marks at most one primary action per view, plus whatever is selected. If two things on a screen are indigo and neither is selected, one of them is wrong.

**The Tally Rule.** Red means "this is recording" or "press this to record". Errors and deletion use the danger colours.

**The Measured Contrast Rule.** Every text colour is paired with the ground it was measured on. A new pairing is measured before it ships; 4.5:1 for text, 3:1 for control outlines and marks that carry meaning.

## Typography

**Display Font:** Archivo, variable in weight and width, set wide (with Inter as fallback)
**Body Font:** Inter (with Segoe UI Variable, Segoe UI)
**Label/Mono Font:** Archivo set condensed with tabular figures, for edge print

**Character:** Width does the work a second typeface usually does. Titles are set wide, like the maker's name printed along a strip of film. Numbers and facts about a frame are set condensed and tabular, like the frame numbers beside it. Everything you read or press is Inter at its normal width.

Archivo is not shipped yet. It is under the SIL Open Font Licence and will be self-hosted beside Inter in `server-ui/assets/fonts`, so the Content Security Policy does not change. If it cannot be added, titles fall back to Inter at weight 650 and edge print to Inter with tabular figures.

### Hierarchy
- **Display** (620, clamp(2.5rem, 6vw, 4.5rem), 1.02, width 112): the public site's headlines only.
- **Title** (600, 28px/34px, width 112): one per app page.
- **Headline** (Inter 600, 18px/26px): section headings and dialog titles.
- **Body** (Inter 400, 14px/20px): everything read in the app. Long text on the site and in help articles is 17px/28px with lines of 60 to 72 characters.
- **Label** (Inter 500, 13px/18px): buttons, tabs, field labels, menu items.
- **Edge** (Archivo 560, 12px/16px, width 78, tabular, +0.03em): frame numbers, timecodes, counts, the type and status printed under a frame. Words in edge print are uppercase; numbers are never abbreviated.

### Named Rules
**The Edge Print Rule.** A fact about a piece of media (its number, length, type, state) is printed on or directly under its frame in edge type. It is never a coloured badge floating over the picture, with one exception: the length sits on the frame's lower edge so it survives in the list view.

**The Twelve Rule.** No text is smaller than 12px.

## Layout

The app is a rail and a sheet. The rail is 232px, collapses to 56px of icons between 768 and 1023px, and becomes a drawer below 768px. The sheet is everything else and scrolls on its own.

Each page starts with one header row: the title at the start, search in the middle where there is something to search, and the page's single primary action at the end. Record is always that action in the library and is reachable from every page.

The library is a grid of frames. Columns are at least 280px wide and as many as fit, with 24px between columns and 32px between rows. The list view is the same frames at 64px wide with their edge print set out in columns. Filters are pill tabs under the header row, with the grid and list switch at the far end.

A project page puts the player first and full width up to 1200px, the title and share link directly under it, and then the sheet: one row per screen, the frame on one side and its line on the other. Below 1024px the line sits under its frame.

Spacing uses the 4px scale in the frontmatter. Inside a group things are 8 or 12px apart; groups are 24 or 32px apart; a page's sections are 48px apart. Padding is uneven on purpose: more space above a heading than below it.

Dialogs are for decisions that block (confirm a deletion, choose what to share). Everything else that used to pop up in a small window is a panel in the page or a row that expands in place.

The public site keeps the same grid at larger sizes: a 12-column grid with 24px gutters, a 1200px text measure limit and sections separated by full-width fields of ink or indigo.

## Elevation & Depth

Flat. The paper, the rail and the frames are all at the same level, separated by hairlines and by the black edge of the frames. Depth is used for one purpose: to show that something is temporarily above the page.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 12px 40px rgb(18 20 26 / 14%)`, with a 1px hairline border): menus, dialogs, toasts, the recording bar. In the dark theme the same shadow at 40% and a `dark-hairline` border.

### Named Rules
**The No Glass Rule.** Nothing is translucent and nothing is blurred. A surface above the page is opaque.

**The Flat At Rest Rule.** Hover and selection change an outline or a fill. They never add a shadow or move the element.

## Shapes

Three corners, each with one job. Frames have tight corners (4px), like a film gate. Controls and fields are 8px. Surfaces that lift (menus, dialogs, toasts) are 12px. Full pills are kept for filter tabs, status marks and the Record button, which is the only pill-shaped button so that it is recognisable by shape as well as colour.

Outlines are 1px. The selection ring is 2px of pencil, set 3px outside the frame so the black edge stays visible inside it. A failed frame carries one diagonal pencil stroke corner to corner, the editor's reject mark, and the reason is printed beneath it.

## Components

### Buttons
Plain and confident: a label, sometimes an icon before it, no gradient.
- **Shape:** 8px corners; 40px tall for a page's primary action, 32px elsewhere, 24px minimum for icon buttons with a 32px hit area.
- **Primary:** pencil fill, white label. One per view.
- **Record:** tally red fill, white label, pill shape, a 10px dot before the label. It reads "Record" at rest and "Stop" while live.
- **Secondary:** surface fill, control border, ink label. **Ghost:** no fill or border until hover.
- **Hover / Focus:** hover darkens the fill one step in 120ms. Focus is a 2px ring 2px outside the button, pencil in light and `dark-focus` in dark. Pressed darkens one more step with no movement.

### Pill tabs
- **Style:** 32px pills. The selected tab is ink fill with surface text (inverted in dark); the others are text only until hover. Counts are in edge type after the label.

### Frames
The signature component. A frame is a piece of media in a 1px-to-3px black rebate with 4px corners.
- **In the library:** the frame, then one line of edge print (type, length, relative date), then the title in label type on up to two lines. No box around the three.
- **In the sheet:** the frame carries its number in the top-left of the rebate, and the spoken line sits beside it.
- **States:** hover shows the selection ring at half strength; selected shows it at full strength with a tick in the top-right corner; processing shows a pale undeveloped frame whose lower edge fills as the job advances, with the stage in edge print; failed shows the reject stroke and one action.

### Inputs / Fields
- **Style:** surface fill, 1px control border, 8px corners, 40px tall; the label is above the field in label type and help text below in 12px `ink-3`.
- **Focus:** the border becomes pencil and the 2px focus ring appears. **Error:** the border becomes `danger-fg`, and the message replaces the help text with an icon so that colour is not the only signal.

### Navigation
The rail lists Projects, Shared with me and Trash, then pinned and recent projects, with the workspace switcher at the top and Help, Settings and plan usage at the foot. The current destination has a pencil-wash fill and pencil-deep text. Items are 36px tall. Below 768px the rail is a drawer opened from a button in the top bar, and it traps focus while open.

### Menus, dialogs and toasts
Opaque surface, 12px corners, overlay shadow. Menus open from their button in 120ms and close on a second press, Escape or an outside click. Dialogs are centred up to 520px wide and become full-width bottom sheets below 768px. Toasts appear at the bottom, say what happened in one sentence, and offer at most one action.

### Countdown
Before a recording starts, a film leader counts three, two, one in the centre of the page: a large wide numeral inside a ring that sweeps once per second. With reduced motion the ring does not sweep and the numerals change in place. Escape cancels it.

## Do's and Don'ts

### Do:
- **Do** put every fact about a recording in edge print on or under its frame.
- **Do** keep one primary action per view, and make Record reachable from every page.
- **Do** pair each status with what the person can do next, in words.
- **Do** measure a new text and ground pairing before using it.
- **Do** check every screen in dark, German, right-to-left and forced colours; use logical properties (`inline-start`, not `left`).
- **Do** give motion a reduced-motion form that changes state without moving.

### Don't:
- **Don't** wrap frames in bordered or shadowed cards.
- **Don't** use blur, translucency or gradients on any surface.
- **Don't** use red for anything except recording.
- **Don't** open a small floating window for something that can be a row or a panel in the page.
- **Don't** put a raw colour, size or duration anywhere except `web/styles/tokens.css`.
- **Don't** use another product's artwork, wording or layout measurements. The reference shot in `vistralo-inspiration` informed the rail and header structure only.
