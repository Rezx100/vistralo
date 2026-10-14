# Repository audit for the Chrome extension

Written 14 October 2026 for the Chrome-first handoff (`Vistralo-Loom-Chrome-First-Claude-Handoff.md`, kept outside the repository).

## Revision and branch

| Item | Value |
| --- | --- |
| Repository | `Rezx100/vistralo` (public). The application is `deployment-source/vistralo`. The old `obs-companion` name in earlier handoffs is not this checkout's remote. |
| Base | `main` at `94fc688` ("Make recording stop in Firefox and open the typed website on Start") |
| Branch | `feat/chrome-extension`, in its own worktree, so the owner's checkout (`docs/billing-applied`, with an uncommitted `docs/BILLING.md`) is untouched |
| Deploys | A merge to `main` deploys the web app to Vercel production. Supabase functions and the worker deploy by hand. The extension is not deployed by anything. |

## What the product is today

The repository is not Electron, OBS, SQLite or FFmpeg-in-the-browser, as older handoffs described. It is:

| Part | Where | Reused by the extension |
| --- | --- | --- |
| Web app (React 19, TypeScript, esbuild) | `web/` | Yes: saving a recording, choosing walkthrough or own voice, upload, recovery, project page |
| Browser recording in the app | `web/features/create/useRecorder.ts`, `recording-media.ts`, `capture.ts` | Reference only. The extension records in its own offscreen document |
| Unsaved-recording recovery | `web/features/recording-store.ts` (`stageRecording`, `recoverRecording`) | Yes: the extension hands its file to this store |
| Save flow (create project, resumable upload, queue the job) | `web/features/create/useSaveProject.ts`, `web/cloud.ts` (`create`, `upload`, `resumable`: TUS to Supabase Storage in 6 MB parts) | Yes, unchanged |
| Auth | Supabase PKCE session in the web app (`web/cloud.ts`, `web/app/useSession.ts`) | Indirectly: the extension never holds a token. The app, already signed in, uploads |
| Projects, jobs, shares | Supabase tables `vistralo_projects`, `vistralo_jobs`, `vistralo_shares`; share page `web/share/watch.ts` and function `vistralo-share` | Yes, unchanged |
| Worker (probe, script, voice, render) | `scripts/local-admin-worker.cjs`, `src/*.cjs` on the VPS | Yes, unchanged: an extension recording is an ordinary uploaded recording |
| Design system | `web/styles/tokens.css`, `DESIGN.md`, `npm run lint:design` | Yes: the extension's pages and controls use a copy of `tokens.css`; the lint now also checks `extension/styles` |

No Chrome extension existed. `PRODUCT.md` recorded "no browser extension" as decided; the 14 October handoff replaces that decision, and `PRODUCT.md` is updated with this branch.

## Missing contracts found

- **Extension to app.** There was no way for anything outside the app to hand it a recording. Added: the `#import/<id>` route (`web/app/useExtensionImport.ts`), a content-script bridge on the app's origin, and a hidden extension frame that posts the file as a `Blob`. See `architecture.md`.
- **Website address from a recording.** The app asks for the website URL by hand. The extension now passes the recorded tab's address (without query or fragment) into the save sheet.
- **Upload while recording.** The app uploads only after recording. Loom-style streaming upload would need a new resumable session per take; not started (`roadmap.md`, C4).

## Known regressions and limits found on the way

- Chrome's `--use-fake-ui-for-media-stream` and `--use-fake-device-for-media-stream` switches break tab capture ("Requested device not found"). The browser tests use a separate session without them for tab recording.
- Legacy `mandatory` size limits (`maxWidth`, `maxHeight`, `maxFrameRate`) make Chrome 155 refuse a tab stream. The engine asks for the tab plainly, then limits it with `applyConstraints`.
- A tab stream id cannot be consumed by an extension page in a tab (tested), only by the offscreen document. That decided the architecture.
- In headless Chrome a captured tab's sound is silent; the tab-sound check passes in a visible browser only.

## Baseline checks before any change

On `94fc688`: `npm test` 110 passed, `npm run typecheck:web` and `npm run lint:design` passed (run for the Firefox fix that is now `main`).

## Machine used

Windows 11 Pro 10.0.22631, Node 24.21.0, ffmpeg/ffprobe 9.0.2. Installed: Chrome 155.0.8059.40 (the owner's; not launched by any test), Edge 155.0.4283.45, Firefox 157.0.1. Devices present but not used by tests: HP HD Camera, Intel Smart Sound microphone array, Realtek speakers. Tests ran in Chrome for Testing 155.0.8059.79.

## Smallest real flow implemented first

Tab recording with tab sound → recording kept in IndexedDB → result page → "Save to Vistralo" → the app's existing save sheet with the file staged → existing upload. It runs end to end in the browser tests (`npm run test:extension`, see `test-plan.md`).
