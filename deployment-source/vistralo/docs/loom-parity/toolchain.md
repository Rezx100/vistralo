# Toolchain

What was set up for the Chrome extension work, what was reviewed and left out, and why. Versions are the ones resolved on 14 October 2026.

| Tool | Version / revision | Purpose | Where | Verified |
| --- | --- | --- | --- | --- |
| Playwright (library) | 1.58.2, already a dependency in `package.json` | Loads the extension into a persistent Chromium context and drives it | `node_modules/playwright` | Yes: `scripts/extension-journey.cjs`, 9/9 |
| Chrome for Testing | 155.0.8059.79 (Stable channel), win64 | The browser the tests load the unpacked extension into. Branded Chrome no longer honours `--load-extension` | `%USERPROFILE%\.cache\vistralo-cft\155.0.8059.79\chrome-win64\chrome.exe`, set as `VISTRALO_TEST_CHROMIUM` | Yes |
| `@types/chrome` | 0.3.4 (exact) | Types for the extension APIs | devDependency | Yes: `npm run typecheck:extension` |
| esbuild | 0.28.2, already a dependency | Bundles the extension | `scripts/build-extension.cjs` | Yes |
| ffmpeg / ffprobe | 9.0.2 (winget Gyan.FFmpeg) | Checks every recorded file: streams, full decode, audio level | on `PATH` | Yes |
| Claude built-in browser and Chrome tools | session tools | Reading documentation pages | n/a | Partly: Atlassian's help site did not resolve from this network |

## Why Chrome for Testing was fetched by hand

`npx playwright install chromium` failed: this network does not resolve `cdn.playwright.dev`. The same build family is published by Google at `storage.googleapis.com/chrome-for-testing-public`, which resolves. The Stable 155 build was downloaded from there (207 MB zip, extracted, version read from the file's properties). No other source was used.

To set it up on another machine:

```sh
npx playwright install chromium   # or download Chrome for Testing from googlechromelabs.github.io/chrome-for-testing
```

## Reviewed and not installed

| Resource | Decision |
| --- | --- |
| [replica-skill](https://github.com/Jakeschincariol/replica-skill) (MIT, one unpinned commit) | Not installed. Its pipeline is built to clone an app and includes rebrand, launch and deploy skills plus Python tools; this assignment forbids cloning, rebranding and publishing, and the evidence → spec → build → compare cycle it offers is covered by `.claude/skills/loom-parity/SKILL.md` and these documents. Can be installed later if the owner wants it, after pinning a commit |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Not configured. The Playwright library already in the repository drives the browser for tests, and the session's own browser tools cover interactive inspection. Adding an MCP server would change the owner's Claude configuration for no new capability |
| [anthropics/skills webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) | Not installed: its examples are Python and would duplicate the JavaScript test stack |
| [GoogleChrome/chrome-extensions-samples](https://github.com/GoogleChrome/chrome-extensions-samples) | Reference only, through Chrome's documentation pages; no sample code was copied |
| Greenfield, ArtCraft method, Ghidra and binary-analysis packs | Not used, as the handoff allows |
