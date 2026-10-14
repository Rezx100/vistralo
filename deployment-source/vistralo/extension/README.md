# Vistralo for Chrome

Records a tab, a window, the screen or the camera, with the microphone, then hands the recording to the Vistralo web app to save as a project. Design and decisions: `docs/loom-parity/architecture.md`.

## Build

From `deployment-source/vistralo`:

```sh
npm ci
npm run build:extension
```

This writes `extension-dist/dev/` and `extension-dist/vistralo-extension-<version>-dev.zip`. A dev build saves to https://app.vistralo.com and keeps a fixed extension id (`nlkamhkdgkdfifjpjeapgakihglpihmn`).

| Variable | Effect |
| --- | --- |
| `VISTRALO_EXTENSION_TARGET=release` | Minified, no fixed id, for the Chrome Web Store. Must save to app.vistralo.com |
| `VISTRALO_EXTENSION_APP_ORIGIN=http://127.0.0.1:4387` | Save to a local build of the app instead (dev only) |
| `VISTRALO_EXTENSION_DEMO=1` | Save to the app's demo mode (dev only) |

Saving to app.vistralo.com needs the app's `#import` route, which ships with this branch; until it is deployed, use Download on the recordings page.

## Load it in Chrome

1. Open `chrome://extensions` and switch on **Developer mode** (top right).
2. **Load unpacked**, and choose `extension-dist/dev` (or unzip the zip and choose that folder).
3. The setup page opens: allow the microphone and the camera.
4. Pin Vistralo from the puzzle-piece menu.

After rebuilding, press the reload arrow on Vistralo's card in `chrome://extensions`.

## Test

```sh
npm run build:server
VISTRALO_TEST_CHROMIUM=/path/to/chrome-for-testing/chrome npm run test:extension
VISTRALO_HEADFUL=1 VISTRALO_TEST_CHROMIUM=... npm run test:extension   # includes the tab-sound check
```

Branded Chrome ignores `--load-extension`, so the browser tests need Chrome for Testing or Chromium. Results and recorded files go to `evidence/extension/`.

## Files

| Path | What it is |
| --- | --- |
| `manifest.json` | Manifest V3; the build fills in the app origin and, for dev, the key |
| `src/background.ts` | Service worker: starts sessions, stores the snapshot, routes controls, shortcuts, badge |
| `src/offscreen.ts` | The recording engine (offscreen document) |
| `src/session.ts` | The session state machine |
| `src/messages.ts` | Every message and how it is checked |
| `src/store.ts` | IndexedDB storage of recordings, a second at a time |
| `src/popup.ts`, `src/recorder.ts`, `src/welcome.ts` | Popup, recordings page, setup page |
| `src/controls.ts`, `src/camera.ts` | Bar and camera bubble drawn on the recorded page |
| `src/bridge.ts`, `src/handoff.ts` | Hand-over to the web app |
| `styles/` | Styles; values come from `web/styles/tokens.css` |
| `dev-key.json` | Public key fixing the dev build's id. Not a secret |
