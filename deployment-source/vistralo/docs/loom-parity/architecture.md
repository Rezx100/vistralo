# Chrome extension architecture

Source: `extension/` (Manifest V3, TypeScript, bundled by `scripts/build-extension.cjs`). Minimum Chrome 116.

## Who owns what

| Part | File | Owns | Never holds |
| --- | --- | --- | --- |
| Offscreen document (the engine) | `src/offscreen.ts` | Every stream (tab, display, camera, microphone), the audio mix, the MediaRecorder, writing each second to IndexedDB, the session state machine | Account data; it can use only `chrome.runtime` |
| Service worker | `src/background.ts` | Starting a session (tab stream id, opening the engine), storing the snapshot the engine reports in `chrome.storage.session`, routing controls, shortcuts, toolbar badge, deleting a recording the app has taken | Media, the only copy of any state |
| Popup | `src/popup.ts` | Choices and Start; live clock and controls | The recording: closing it changes nothing |
| Recordings page | `src/recorder.ts` (`recorder.html`) | Camera preview in camera-only mode; a finished recording (play, download, save, discard); every recording this browser holds | The recording itself |
| Page controls | `src/controls.ts` (content script, closed shadow root) | Clock, pause, stop, start over, discard, hide, count-in overlay, camera bubble frame | Streams, tokens; it reads the snapshot and sends controls |
| Camera bubble | `src/camera.ts` (`camera.html`, an extension frame) | The camera preview on the page | The page never receives the camera stream |
| Bridge | `src/bridge.ts` (content script on the app's origin only) | Telling the app the extension is there; inserting the hand-over frame | The app's session or tokens |
| Hand-over frame | `src/handoff.ts` (`handoff.html`, web-accessible to the app's origin only) | Reading one finished recording and posting it to the app as a `Blob` | Anything for an origin other than the app's |
| Web app | `web/app/useExtensionImport.ts`, `CreateProject.tsx` | Staging the file in its recovery store, the save sheet, upload, project, AI job, sharing | |

### Why an offscreen document and not a pinned recording tab

Tested in Chrome for Testing 155 (`sources.md`, C4): a tab stream id from `tabCapture.getMediaStreamId` could not be consumed by an extension page open in a tab, with or without `consumerTabId`; the offscreen document consumed it. Chrome documents the offscreen route from Chrome 116, and `getDisplayMedia` also works there under the `DISPLAY_MEDIA` reason, so one engine serves every mode. Loom's pinned tab (handoff, S1) is not needed.

## Session state

`src/session.ts` is one pure reducer, unit tested in `tests/extension.test.cjs`:

```
idle ─start→ requesting ─(count-in on)→ countdown ─→ recording ⇄ paused
                         └─(count-in off)────────────↗      │
recording/paused ─restart→ countdown (take + 1)             │
recording/paused ─stop→ stopping → finalizing → ready       │
requesting/countdown/recording/paused/stopping ─cancel→ cancelled
any active ─fail→ failed (time so far and the reason kept)
```

The clock is `elapsedMs + (now − runningSince)`, so every view computes the same time and pauses and count-ins are never counted. Events that do not apply (a second Stop, Pause after Stop) return null and are ignored: controls are idempotent. A second Start while a session is active is refused; a Start already in progress refuses another.

## Messages

All checked in `src/messages.ts` before use:

| Message | From → to | Accepted from |
| --- | --- | --- |
| `start {tabId, options}` | popup → worker | extension pages only |
| `control {action}` | popup, page controls, recordings page → worker → engine | this extension (pages or content scripts) |
| `snapshot {snapshot}` / `finished {sessionId, open}` | engine → worker | the offscreen document's URL only; the snapshot must be for the current session |
| `begin` / `control` | worker → engine | this extension's pages; `begin` must carry its own session |
| `staged {sessionId}` | bridge → worker | the bridge; a session still recording is never deleted |
| `import` / `staged` / `ping` (window messages) | app ↔ bridge | same window and origin; ids are UUIDs, nonces 32 hex characters |
| `recording` (window message) | hand-over frame → app | the app checks the extension origin, the nonce it sent and the id |

## Media

- **Tab:** the worker asks `tabCapture.getMediaStreamId({targetTabId})` right after the toolbar click; the engine opens it with `chromeMediaSource: "tab"`, then limits it to 1920×1080 at 30 fps with `applyConstraints` (never upscaled). Tab sound is mixed into the recording and played back, because capture mutes the tab.
- **Window or screen:** `getDisplayMedia` in the engine shows Chrome's own chooser (tab, window or screen; system audio where Chrome offers it). System sound is not played back (it was never muted).
- **Camera only:** `getUserMedia` with the chosen camera, ideal 1080p30.
- **Microphone:** mixed in with echo cancellation, noise suppression and auto gain; never played back.
- **Codec:** VP9 (VP8 fallback) with Opus when there is any audio, video-only codecs otherwise (an audio codec with no audio track stalls some recorders). 6 Mbit/s video, 128 kbit/s audio.
- **Storage:** `MediaRecorder.start(1000)`; each piece is written to IndexedDB (`vistralo-extension`, stores `sessions` and `chunks` keyed `[session, take, seq]`) before the next. Memory holds about one second. `unlimitedStorage` keeps Chrome from evicting it. A write failure stops the take and keeps what was written.
- **Finishing:** all pieces of the last take, in order, form one WebM stream; earlier takes are deleted. Stop always ends the take, even if Chrome never fires the recorder's stop event (4 s grace).
- **Crash:** a take still marked `recording` when Chrome starts again is marked `interrupted` and listed on the recordings page. It plays up to its last stored second (pieces from one recorder join as one stream). Its duration field may be missing until the worker probes it.
- **Release:** on stop, cancel or failure every track is stopped, the audio graph closed, and the offscreen document closed.

## Hand-over to the web app

1. Stop → the worker opens `https://app.vistralo.com/#import/<id>` (setting "Open the recording in Vistralo when I stop", on by default) or the recordings page, whose "Save to Vistralo" opens the same address.
2. The app, once signed in, posts `{type: "import", id, nonce}` in its own window. If an unsaved browser recording is already waiting, it is shown instead and the new one stays in the extension.
3. The bridge inserts the hidden `handoff.html` frame. The frame checks its real parent (`location.ancestorOrigins`) is the app origin compiled into the build, reads the take and posts a `File` to that origin only.
4. The app stages it in its recovery store, posts `staged`, and opens the usual save sheet (AI walkthrough, or talk-through when the microphone was recorded) with the recorded page's address (no query or fragment) filled in.
5. The extension deletes its copy. From here everything is the web app's existing code: create project, resumable upload, job, share link.

The app's Content Security Policy did not block the extension frame (tested against `vercel.json`'s headers via `scripts/static-server.cjs`).

## Permissions

| Permission | Why | When |
| --- | --- | --- |
| `tabCapture` | Record the current tab | Install |
| `offscreen` | The recording engine | Install |
| `activeTab` | Capture and draw controls on the tab the user clicked Vistralo on | Granted per click |
| `scripting` | Draw the controls and bubble on that tab | Install |
| `storage` | Settings and the live session snapshot | Install |
| `unlimitedStorage` | Long recordings kept until saved | Install |
| Content script on `app.vistralo.com` | The bridge to the app | Install |
| `host_permissions` for the local app host | **Dev builds saving to a local app only**, for tests | Never in release |

Not requested: `tabs` (no browsing-history access), `desktopCapture` (Chrome's chooser via `getDisplayMedia` is used), `downloads` (an ordinary download link), `identity`, `<all_urls>`. Controls disappear after navigating to a different site until the user clicks Vistralo there; an optional host permission to keep them is in the roadmap (C2) and must be asked for explicitly.

## Builds

`npm run build:extension` writes `extension-dist/dev/` and `extension-dist/vistralo-extension-<version>-<target>.zip`.

- `VISTRALO_EXTENSION_TARGET=release`: no fixed key, minified, must save to `https://app.vistralo.com`, no demo.
- Dev builds carry `extension/dev-key.json`'s public key so the id stays `nlkamhkdgkdfifjpjeapgakihglpihmn` for tests. The matching private key was never kept; it is not needed to load an unpacked build.
