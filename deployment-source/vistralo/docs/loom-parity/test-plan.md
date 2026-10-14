# Test plan

## Automated

| Check | Command | What it proves | Status (14 Oct 2026) |
| --- | --- | --- | --- |
| Unit: state machine, message validation, page-address cleaning | `npm test` (`tests/extension.test.cjs`) | Clock maths, idempotent controls, restart, cancel, failure; every message shape and sender rule | 13/13 pass |
| Types | `npm run typecheck:extension`, `npm run typecheck:web` | | pass |
| Design tokens | `npm run lint:design` (now includes `extension/styles`) | No raw colours or sizes | pass |
| Browser journey | `npm run test:extension` (`scripts/extension-journey.cjs`), Chrome for Testing via `VISTRALO_TEST_CHROMIUM` | Real tab capture with tab sound; pause excluded from time; survives navigation; double Stop; file decodes fully (ffmpeg); tone audible; recordings page; save hand-over to the app under its real CSP and deletion afterwards; start over and discard leave nothing; second Start refused; closing the tab keeps the take; camera-only and screen with Chrome's fake devices and microphone audible; camera bubble frame on the page; popup and setup page render | 9/9 in a visible browser. Headless: 8/9, the tab-sound check fails because headless Chrome captures silence |

Evidence (screenshots, recorded files, ffprobe output, `extension-journey.json`) is written to `evidence/extension/`, which Git ignores.

### Limits of the automated run

- Chrome's fake media switches break tab capture, so the tab session has no microphone; the microphone mix is proven in camera and screen modes with Chrome's fake microphone.
- `--allowlisted-extension-id` stands in for the toolbar click that grants tab capture; the real click path is manual.
- `--use-fake-ui-for-media-stream` picks the first screen in Chrome's chooser; the real chooser, window choice and system audio are manual.
- Browser commands (keyboard shortcuts) cannot be pressed from Playwright.
- No cloud upload: the hand-over is tested in the app's demo mode. The cloud save path is the app's existing, separately tested code.

## Manual, on a normal Chrome (needs a person)

Run on Windows first, then macOS. Record OS, Chrome version, devices, duration and what was seen.

| # | Scenario | Pass when |
| --- | --- | --- |
| M1 | Load unpacked (`extension/README.md`), first-run page, allow mic and camera | Prompts appear once; states read Allowed |
| M2 | Tab with microphone and tab sound, 2 minutes, with navigation | Voice and page sound both audible, in sync; nothing doubled; no echo |
| M3 | Window, then entire screen, with "share system audio" | Correct source; system sound present where Chrome offered it |
| M4 | Camera bubble on a normal site, drag it, hide the bar | Bubble round and smooth in the recording; bar absent while hidden |
| M5 | Stop with Chrome's "Stop sharing" bar | Recording saved, not lost |
| M6 | Deny the microphone, then allow it | Clear message; no stuck badge; next Start works |
| M7 | Save to Vistralo while signed in to app.vistralo.com (after this branch is deployed) | Save sheet opens with the file and page address; upload completes; the project plays; extension copy gone |
| M8 | Same while signed out | Sign-in first, then the save sheet |
| M9 | Kill Chrome mid-recording (Task Manager), reopen | Recordings page lists it as interrupted; it plays to near the kill time |
| M10 | 30-minute tab recording | File plays and seeks start to end; A/V offset measured near start and end; extension memory in Chrome's Task Manager stays flat |
| M11 | Shortcuts Alt+Shift+V and Alt+Shift+K | Start, stop, pause, resume work from any tab |
| M12 | Popup and pages with keyboard only, in dark mode | Everything reachable and readable |

## Release criteria for the Chrome review

All automated checks pass; M1–M8 pass on Windows; M9–M12 recorded with results (a failure documented, not hidden). Long-recording, sleep/wake and offline behaviour stay "not run" until measured.
