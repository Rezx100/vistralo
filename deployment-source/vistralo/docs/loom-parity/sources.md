# Sources

Every claim about Loom in these documents carries one of these labels:

- **documented**: Loom's or Chrome's own help or developer pages say so.
- **documented (summary)**: seen only through a search engine's summary of Loom's help page, because `support.atlassian.com` did not resolve from this network on 14 October 2026. Recheck against the page itself.
- **observed**: seen in the product by a person. Nothing about Loom is observed yet: no Loom account or installation was used.
- **inferred**: our reading; may be wrong.
- **unknown**.

No Loom code, package, asset, wording or private API was looked at.

## Loom

| ID | Source | Read | Status | What it says (paraphrased) |
| --- | --- | --- | --- | --- |
| L1 | [Get started with the Loom Chrome extension](https://support.atlassian.com/loom/docs/get-started-with-the-loom-chrome-extension/) (S1) | 14 Oct 2026 | documented (summary) | The camera bubble cannot be recorded on PDFs in Chrome, nor when recording an application other than Chrome; the desktop app is suggested for that. The handoff also cites this page for a pinned recording tab under MV3: **not confirmed** here |
| L2 | [Use Loom's different capture modes](https://support.atlassian.com/loom/docs/use-looms-different-capture-modes/) | 14 Oct 2026 | documented (summary) | Three modes: screen and camera, screen only, camera only. While recording, only screen only and screen with camera can be switched |
| L3 | [Make your camera bubble visible](https://support.atlassian.com/loom/docs/make-your-camera-bubble-visible-in-loom-recordings/) | 14 Oct 2026 | documented (summary) | The bubble relies on browser permissions and is tied to the window where recording started; three bubble sizes exist |
| L4 | [Take, edit and share a screenshot](https://support.atlassian.com/loom/docs/take-edit-and-share-a-screenshot/) (S2) | 14 Oct 2026 | documented (summary) | Screenshot tab with custom area or full screen (some pages mention current tab); no scrolling capture; annotation with text, shapes and arrows; blur; crop replaces the image and cannot be undone, and annotations become fixed; a link is copied after capture; viewing permissions can be set |
| L5 | [Use Loom's keyboard shortcuts](https://support.atlassian.com/loom/docs/use-looms-keyboard-shortcuts/) | 14 Oct 2026 | documented (summary) | The extension has its own shortcuts for start, pause/resume, cancel and restart, editable at chrome://extensions/shortcuts. Vistralo uses its own key choices |
| L6 | [Restart a recording](https://support.atlassian.com/loom/docs/restart-a-recording/), [Hide the recording controls](https://support.atlassian.com/loom/docs/hide-the-recording-controls/) | 14 Oct 2026 | documented (summary) | Restart runs the countdown again; controls can be hidden, leaving shortcuts as the way to control |
| L7 | [Recording platforms](https://support.atlassian.com/loom/docs/the-loom-recording-platforms) (S3), [desktop app](https://support.atlassian.com/loom/docs/get-started-with-the-loom-desktop-app/) (S4) | not read | unknown | Platform differences: to be read when the site resolves |

**Conflict to resolve:** the handoff says Loom opens a pinned recording tab under MV3. Vistralo does not need one: an offscreen document records (C1). If a person observes Loom's pinned tab, record it here; it does not change Vistralo's design.

## Chrome

| ID | Source | Read | What it says |
| --- | --- | --- | --- |
| C1 | [Audio recording and screen capture](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture) (S5) | 14 Oct 2026 | From Chrome 116, a service worker gets a tab stream id and an offscreen document consumes it; screen recording with `getDisplayMedia` in an offscreen document (`DISPLAY_MEDIA`) survives navigation; captured tab audio must be routed back to the speakers |
| C2 | [chrome.offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen) (S6) | 14 Oct 2026 | One offscreen document per profile; only `chrome.runtime` inside it; `USER_MEDIA` and `DISPLAY_MEDIA` reasons have no lifetime limit |
| C3 | [chrome.tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) (S7) | 14 Oct 2026 | `getMediaStreamId` needs the extension to have been invoked on the tab (like activeTab); an id is single use and expires in seconds; capturing mutes the tab |
| C4 | Tests in this branch | 14 Oct 2026 | **observed** in Chrome for Testing 155: an extension page in a tab cannot consume a tab stream id (NotFoundError), the offscreen document can; legacy `maxWidth`/`maxHeight`/`maxFrameRate` make tab capture fail; the fake-media switches break tab capture; `getDisplayMedia` works from the offscreen document |
| C5 | [Playwright: Chrome extensions](https://playwright.dev/docs/chrome-extensions) (S9) | handoff | Persistent context and bundled Chromium for extension tests |
| C6 | [MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) (S10) | handoff | All executable code bundled; no remote code |
