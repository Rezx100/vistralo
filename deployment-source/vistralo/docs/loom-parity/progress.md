# Progress

Updated 14 October 2026.

## Where things stand

| Item | Value |
| --- | --- |
| Repository | `Rezx100/vistralo`, app in `deployment-source/vistralo` |
| Branch | `feat/chrome-extension`, worktree `E:\PostAI\vistralo-wt-chrome`, draft PR #25 (the owner's checkout at `E:\PostAI\vistralo` has its own uncommitted `docs/BILLING.md`; leave it) |
| Base | `main` `94fc688` |
| Phase | Chrome: C0, C1 and C2 built and tested automatically; C3 (screenshots) next |

## Done

- **C0:** audit, toolchain, sources, feature matrix, architecture, flows, spec, test plan, roadmap.
- **C1:** MV3 extension in `extension/` with the offscreen recording engine.
  - Modes: tab, window/screen, camera only, with microphone and camera choice.
  - Controls: count-in; pause, stop, start over, discard, hide; page bar and camera bubble.
  - Recording keeps going when the tab navigates; IndexedDB storage a second at a time.
  - Recordings page: play, download, save, discard, and interrupted takes; keyboard shortcuts; toolbar badge.
  - Hand-over to the web app's save flow through `#import/<id>`.
- **C2:**
  - Mute, and a microphone meter in the popup and the page bar.
  - Three bubble sizes.
  - Opt-in "Keep the controls on every site" (optional host permission).
  - Free-space check before starting.
  - Interrupted takes detected whenever the worker starts; their stored length is updated every 2 s.
  - A crash test, and a measured 30-minute recording.
- **Web app:** `web/app/useExtensionImport.ts`; `CreateProject` accepts an imported recording and its page address.

Verification for each feature is in `feature-matrix.csv`.

**Tested with real capture** in Chrome for Testing 155 on Windows 11:
- Tab recording, pause, stop, start over, discard, navigation, closed tab.
- The hand-over to the app.
- Crash recovery: Chrome killed 7 s into a take; the recovered take plays 7.3 s.
- The 30-minute recording below.

**Tested with mocks** (Chrome's fake devices, and the chooser auto-picking a screen):
- Window/screen, camera, microphone, mute, the meter, and the bubble.

**Not run:**
- Shortcuts.
- A failed storage write.
- Device removal.
- Sleep/wake and offline.
- Every real-device check.

### 30-minute recording (`scripts/extension-long-recording.cjs`)

A tab take of a page that flashes white and plays a 1 kHz tone every 5 s. The browser window was off screen and visible (not headless). The file was saved with the Download button.

| Measure | Result |
| --- | --- |
| Recorded | 1843.5 s (30 min 43 s), 9.5 MB (the page is mostly black and still) |
| Decode | Whole file decodes; ffmpeg reported 6 repeated audio timestamps as warnings |
| Sound after picture, first 5 markers | 151, 120, 124, 107, 105 ms |
| Sound after picture, last 5 markers | 100, 98, 106, 111, 114 ms |
| Drift | None measurable. The ~0.1 s offset includes the marker page's own timing: the tone is scheduled on the audio clock, the flash with a timer |
| Markers | 368 tones found; 355 flashes found, all matched to a tone; 13 of the 200 ms flashes are not in the picture |
| Seek | A frame 10 s before the end decodes directly |
| Memory (all Chrome processes, each minute) | 1002 MB at the start, 255 MB at the end; no growth |

What this does not show: real camera and microphone, a busy page (heavier encoding), or bitrate at 1080p with motion. The 13 missing flashes suggest Chrome's tab capture can skip a frame of a short change; watch for it in M2.

## Defects found and fixed in C2

- **Empty camera takes.** A camera-only take started while the camera was still warming up could stop with no data, and was still shown as ready (seen in 2 of 10 repeated takes in a fresh browser, with and without the microphone). Fixed:
  - In camera mode the engine waits up to 8 s for the first frame, read from a copy of the track; a `<video>` element does not work in an offscreen document, which is never painted.
  - A take that captured nothing is reported as failed and deleted.
  - Tab and screen modes do not wait: a still page sends no second frame until it changes.
  - After the fix, 12 of 12 repeated takes recorded, and the full journey passed three times in a row.
- **Test fragility.** The recorded-time check now uses loose bounds (message delays vary). The crash test waits until every killed process has exited.

## Commands

```sh
cd deployment-source/vistralo
npm ci
npm run build:server
npm test
npm run typecheck:web && npm run typecheck:extension && npm run lint:design
VISTRALO_TEST_CHROMIUM=%USERPROFILE%\.cache\vistralo-cft\155.0.8059.79\chrome-win64\chrome.exe npm run test:extension
VISTRALO_LONG_MINUTES=30 node scripts/extension-long-recording.cjs   # after test:extension built the dev extension
npm run build:extension          # extension-dist/dev and the dev zip, saving to app.vistralo.com
```

## Open defects and gaps

- The page bar and bubble are recorded in tab mode, because they are page content. Hiding the bar works; the bubble is meant to be recorded.
- Headless Chrome records a captured tab's sound as silence, so that check runs in a visible browser.
- Loom's help pages were read only through search summaries; reread them directly when `support.atlassian.com` resolves.
- The repeated audio timestamps in long takes should be checked against the worker's import (`probe` job) once a real long recording is uploaded.

## Next executable step

C3, screenshots:
- Visible-tab capture (`chrome.tabs.captureVisibleTab`, device pixels) and area selection.
- An editor with text, arrow, rectangle, blur that changes the pixels, and crop.
- Download, and save to Vistralo as a screenshot project.

## Needs the owner

- Load `extension-dist/dev` in your own Chrome and run manual checks M1–M6 (`test-plan.md`). M7–M8 need this branch deployed.
