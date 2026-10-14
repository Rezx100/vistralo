# Roadmap

Feature IDs are in `feature-matrix.csv`. Chrome is delivered for review before any native platform starts.

## Chrome

| Increment | Scope | State |
| --- | --- | --- |
| C0 Audit, tools, evidence | `repo-audit.md`, `toolchain.md`, `sources.md`, matrix | Done, except reading Loom's pages directly (site unreachable from this network) |
| C1 Real capture | Tab, window/screen, camera only; microphone and camera choice; count-in; pause, stop, start over, discard; page bar and bubble; navigation; local playback and download; hand-over to the app | Built; automated checks pass; manual checks M1–M8 pending |
| C2 Controls and recovery | Bubble sizes; microphone level meter and mute; optional host permission to keep the bar across sites; recovery tested by killing Chrome; storage-full test; long recording; sleep/wake | Next |
| C3 Screenshots | Visible tab and area capture (`captureVisibleTab`, device pixels); editor with text, arrow, rectangle, blur that changes pixels, crop; local save; attach to a project | Not started |
| C4 Product integration | Upload while recording (resumable session per take); progress and retry in the extension; share link right after stop; screenshot links | Not started. Today saving goes through the app's existing upload |
| C5 Website walkthrough | Opt-in event capture (navigation, clicks, scroll, viewport, sanitised labels) aligned to the take's clock; step review, rename, reorder, remove, redact; adapter into the worker's script pipeline | Not started |
| C6 Remaining Chrome features | Drawing, click highlighting, switching bubble on and off mid-take, quality choices; packaging and store material | Not started |

## Later platforms (separate phases, each with fresh research)

| Phase | Scope |
| --- | --- |
| 2 Windows | Audit the existing desktop app first; native capture, multi-monitor and DPI, cross-app camera, system audio, tray, hotkeys, screenshots, installer and updates |
| 3 macOS | Screen Recording, camera and microphone permissions; menu bar; Apple Silicon and Intel; signing and notarisation |
| 4 iOS | ReplayKit broadcast extension lifecycle, interruptions, background upload |
| 5 Android | MediaProjection, foreground service and notification, permissions, background upload |
| 6 Shared | Transcripts and captions, AI titles and summaries, chapters, comments and reactions, view counts, workspaces and roles, search, integrations, text-based editing |

## Decisions the owner may want to revisit

- No pinned recording tab; the offscreen document records.
- The extension does not sign in; the web app saves and uploads.
- Default shortcuts are Alt+Shift+V (start/stop) and Alt+Shift+K (pause/resume).
