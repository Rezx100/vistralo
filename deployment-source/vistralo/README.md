# Vistralo app

Record a flow, upload a video or screenshots, or point at a website. Vistralo finds every screen, writes one spoken line per screen with a vision model, voices it with HeyGen, and freezes the video on each screen while its line plays. For websites it also reads the page's code in headless Chrome, so the narration can name the real libraries behind each effect.

## Parts

| Part | Where | Deploy |
| --- | --- | --- |
| Web app | `web/` (React, TypeScript, esbuild), bundled by `scripts/build-web.cjs` into `server-ui/` and staged by `scripts/build-cloud.cjs` into `dist-web/` | Vercel, on merge to `main` (`vercel.json`: `npm ci --ignore-scripts`, `npm run build:cloud`) |
| Backend | Supabase: auth, bucket `vistralo-media`, tables `vistralo_projects` and `vistralo_jobs` (`supabase/migrations`), edge functions `vistralo-share`, `vistralo-paddle-webhook` and `vistralo-billing` | Supabase migrations and functions |
| Worker | `scripts/local-admin-worker.cjs` with `src/core.cjs`, `media.cjs`, `editor.cjs`, `viewports.cjs`, `providers.cjs`, `buildread.cjs`, `walkthrough.cjs`, `server-egress.cjs`, `service.cjs`, `entitlements.cjs`, `included-ai.cjs`, `scripts/worker-secrets.cjs` and `web/billing/plans.json` | Manual, see below |

`build:cloud` needs `VISTRALO_SUPABASE_URL` and `VISTRALO_SUPABASE_PUBLISHABLE_KEY` (set in Vercel; only a publishable key may be embedded).

## Chrome extension

`extension/` records a tab, window, screen or camera and hands the recording to the web app's save flow. Build, load and test instructions: [extension/README.md](extension/README.md). Design, research and status: [docs/loom-parity](docs/loom-parity/progress.md).

## Develop

Use Node 24.

```sh
npm ci
npm run build:server   # web bundle into server-ui/
npm test               # unit and journey tests; media tests need ffmpeg on PATH
npm run typecheck:web
npm run lint:design
npm run test:web:a11y     # axe and viewport checks, demo mode (needs Playwright Chromium or VISTRALO_TEST_CHROMIUM)
npm run test:web:journey  # dashboard, upload, overflow, hash worker, CSP (same)
npm run test:web:billing  # plans, test checkout and billing states with VISTRALO_BILLING=on (same)
```

Without Supabase settings the built app runs in demo mode (`#demo/`), which keeps projects in the browser.

## Worker

The worker runs on the VPS as systemd unit `vistralo-worker` (`deploy/vistralo-worker.service`) from `/opt/vistralo-worker`, with its environment in `/etc/vistralo-worker.env`. It polls Supabase for jobs, then imports, detects viewports, reads the site's build, writes the script, voices it and composes the film. To deploy a change:

1. Copy the changed files to `/opt/vistralo-worker`, keeping the old ones as `<file>.bak-<date>`.
2. If `package-lock.json` changed, run `npm install --omit=dev` there (`deploy/vps-worker-install.sh` does a full install, including Chrome for Playwright).
3. `systemctl restart vistralo-worker`, then check `journalctl -u vistralo-worker` for "Capture worker signed in".
4. Roll back by restoring the `.bak` files and restarting.

Run only one worker.

### Whose AI keys a job uses

A customer's own OpenAI and HeyGen keys, saved encrypted in Settings, always come first. Without them, jobs on a plan marked `"aiIncluded": true` in `web/billing/plans.json` (Pro and Studio), and jobs on the owner's account, run on Vistralo's keys. Free jobs without their own keys are refused before anything is sent. The rule is `src/included-ai.cjs`; `tests/included-ai.test.cjs` covers it.

Vistralo's keys are set in `/etc/vistralo-worker.env` (mode 600), never in Git:

| Variable | Meaning |
| --- | --- |
| `VISTRALO_INCLUDED_OPENAI_API_KEY`, `VISTRALO_INCLUDED_HEYGEN_API_KEY` | The keys included plans use |
| `VISTRALO_INCLUDED_HEYGEN_VOICE_ID` | The voice for included narration when the customer has not chosen one |
| `VISTRALO_INCLUDED_COST_CAP_USD` | Most one job may spend on the included keys (default 1.00). A customer's own cap can lower it, never raise it |
| `VISTRALO_INCLUDED_AI_PLANS` | Optional. Comma-separated plan ids that override `aiIncluded` in the plan table, for example `free,pro,studio` |

To include Free later, set its `aiIncluded` to `true` in `plans.json` (which also changes the plans page, Settings and the site's pricing page) and deploy the app, the site and the worker. The worker logs which plans are included when it starts. It no longer reads `OPENAI_API_KEY` or `HEYGEN_API_KEY`: those once applied to every customer.

The included keys spend Vistralo's money, so switch plan limits on (`enforce_limits`, see `docs/BILLING.md`) before paid plans are sold; without them a Pro or Studio account has no monthly cap.

## Share page

A share link is `https://app.vistralo.com/watch#<token>`. The token sits in the fragment, so the browser never sends it to Vercel. The page (`web/share/watch.ts`, built to `watch.html`, `watch.js` and `watch.css`) is one small script, not the React app. It asks the Edge Function `supabase/functions/vistralo-share` for the link's content as JSON and draws it.

The function does not serve the page itself because Supabase's gateway turns any HTML a function returns on `*.supabase.co` into plain text under a sandbox policy. A browser that opens a function address directly, which is what every link made before `/watch` looks like, is redirected to `/watch`. `VISTRALO_SHARE_ORIGIN`, an optional function secret, changes where that redirect goes, for testing a preview.

What a link may show is worked out in `supabase/functions/_shared/share-page.ts`, which both sides use; `tests/share-page.test.cjs` and `npm run test:web:a11y` exercise it. Anyone with a link may open it, so deploy the function without token checks, and deploy it together with the app change that adds `/watch`:

```sh
supabase functions deploy vistralo-share --no-verify-jwt
```

Deploy it whenever either file changes. A merge to `main` deploys the web app only.

## Providers

The director script uses OpenAI (`VISTRALO_DIRECTOR_MODEL`, default `gpt-5-mini`, falling back on rate limits); speech uses HeyGen. See [docs/PROVIDERS.md](docs/PROVIDERS.md). Legal notices are drafts: [docs/legal](docs/legal/README.md).

## Plans and payments

Sign-up, plans and Paddle (sandbox) checkout are built and switched off by default. [docs/BILLING.md](docs/BILLING.md) lists what has to be supplied and how to turn it on.
