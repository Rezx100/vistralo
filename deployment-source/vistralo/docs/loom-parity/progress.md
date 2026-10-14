# Progress

Updated 14 October 2026.

## Where things stand

| Item | Value |
| --- | --- |
| Repository | `Rezx100/vistralo`, app in `deployment-source/vistralo` |
| Branch | `feat/chrome-extension`, worktree `E:\PostAI\vistralo-wt-chrome` (the owner's checkout at `E:\PostAI\vistralo` has its own uncommitted `docs/BILLING.md`; leave it) |
| Base | `main` `94fc688` |
| Phase | Chrome, C1 built and tested automatically; C2 next |

## Done

- C0: audit, toolchain, sources, feature matrix, architecture, flows, spec, test plan, roadmap.
- C1: MV3 extension in `extension/` with the offscreen recording engine; tab, window/screen, camera only; microphone and camera choice; count-in; pause, stop, start over, discard, hide; page bar and camera bubble; navigation survival; IndexedDB storage a second at a time; recordings page with play, download, save, discard and interrupted takes; keyboard shortcuts; toolbar badge; hand-over to the web app's save flow through `#import/<id>`.
- Web app: `web/app/useExtensionImport.ts`; `CreateProject` accepts an imported recording and its page address.

Verification per feature: `feature-matrix.csv`. In short: tab capture, pause, stop, start over, discard, navigation, closed tab and the app hand-over are **tested with real capture** in Chrome for Testing 155; window/screen, camera, microphone and the bubble are **tested with mocks** (Chrome's fake devices and auto-picked chooser); shortcuts, crash recovery, storage-full, device loss, 30-minute recording and every real-device check are **not run**.

## Commands

```sh
cd deployment-source/vistralo
npm ci
npm run build:server
npm test
npm run typecheck:web && npm run typecheck:extension && npm run lint:design
VISTRALO_TEST_CHROMIUM=%USERPROFILE%\.cache\vistralo-cft\155.0.8059.79\chrome-win64\chrome.exe npm run test:extension
npm run build:extension          # extension-dist/dev and the dev zip
```

## Open defects and gaps

- The page bar and bubble are recorded in tab mode (they are page content). Hiding the bar works; the bubble is meant to be recorded.
- After navigating to a different site the bar is not redrawn until Vistralo is clicked there (no broad host permission by design).
- Headless Chrome records a captured tab's sound as silence; the check runs in a visible browser.
- Loom's help pages were read only through search summaries; reread them directly when `support.atlassian.com` resolves.

## Next executable step

C2: bubble sizes, microphone meter and mute, the optional "keep controls on every site" permission, and a scripted crash-recovery test (kill the browser process mid-take, reopen, play the interrupted take).

## Needs the owner

- Load `extension-dist/dev` in your own Chrome and run manual checks M1–M6 (`test-plan.md`); M7–M8 need this branch deployed.
- Say whether Alt+Shift+V / Alt+Shift+K suit you as default shortcuts.
