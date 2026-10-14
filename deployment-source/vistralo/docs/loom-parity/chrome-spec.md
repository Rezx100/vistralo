# Chrome extension specification

Vistralo's own behaviour requirements, written independently of any Loom implementation. IDs match `feature-matrix.csv`. "Must" items are release criteria for the Chrome phase.

## Capture

- **CX-010** Must record the tab the toolbar button was clicked on, with that tab's sound when chosen, at up to 1920×1080 and 30 fps, never upscaled. The tab's sound must stay audible to the person while recording.
- **CX-011** Must offer Chrome's own chooser for a tab, window or screen, with system audio where Chrome offers it, and must treat cancelling the chooser as cancelling, not as an error.
- **CX-012** Must show the camera in a movable round bubble on the page being recorded when chosen, using an extension frame so the page never receives the camera. Must say plainly that the bubble is not drawn on Chrome's own pages or other applications.
- **CX-013** Must record the camera alone, with the microphone when chosen.
- **CX-020/021** Must record the microphone and camera chosen by the person; "No microphone" records none.
- **CX-005** Must never leave a session stuck when a permission is refused; the next Start must work once it is allowed.

## Control

- **CX-030** A 3-second count-in by default, shown on the page, cancellable with Esc.
- **CX-040** Pause and resume; the clock and the file exclude paused time.
- **CX-041** Stop from the page bar, popup, shortcut, Chrome's Stop sharing, or by closing the tab, always ends the take and keeps it, and never runs twice.
- **CX-042** Start over discards only the current take and counts in again on the same source.
- **CX-043** Discard keeps nothing.
- **CX-044** The page bar can be hidden and shown again.
- **CX-045** Recording continues while the tab navigates; only one recording at a time.
- Every control must work from the popup and the keyboard as well as the page bar.

## Data

- Recordings stay in the browser (IndexedDB) until the person saves, downloads or discards them, or the web app confirms it has its own copy.
- **CX-080** A take interrupted by a crash must remain playable up to its last stored second and be listed for recovery.
- **CX-081** Running out of storage must stop the take and keep what was stored.
- Nothing recorded leaves the browser except through the web app's own save flow, which applies the account's privacy defaults (projects private; share links read-only and expiring).

## Hand-over and the web app

- **CX-071** The extension hands a finished recording only to Vistralo's own app origin (compiled into the build), only on that app's request, with a nonce, and only after the app is signed in.
- The app must never overwrite an unsaved recording already waiting; the extension must keep its copy until the app confirms it has staged its own.
- The recorded page's address goes to the app without query string or fragment.
- The extension must hold no account token, password or provider key.

## Website walkthrough (Vistralo's own, C5)

Not built yet. Requirements are in the handoff, section 8: an opt-in mode capturing timed, sanitised navigation, click, scroll and viewport events; never passwords, cookies, hidden inputs, raw keystrokes or query strings; reviewable and redactable steps before AI processing.

## Accessibility and states

- Every control is a labelled button; the popup works by keyboard; the live region announces phase changes on the recordings page.
- Light and dark themes follow the system on extension pages; the page bar is always dark for contrast on any site.
- Empty, loading, error and finished states exist for the popup and recordings page (`chrome-flows.md`).
