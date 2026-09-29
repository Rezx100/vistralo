# Vistralo app

Record a flow, upload a video or screenshots, or point at a website. Vistralo finds every screen, writes one spoken line per screen with a vision model, voices it with HeyGen, and freezes the video on each screen while its line plays. For websites it also reads the page's code in headless Chrome, so the narration can name the real libraries behind each effect.

## Parts

| Part | Where | Deploy |
| --- | --- | --- |
| Web app | `web/` (React, TypeScript, esbuild), bundled by `scripts/build-web.cjs` into `server-ui/` and staged by `scripts/build-cloud.cjs` into `dist-web/` | Vercel, on merge to `main` (`vercel.json`: `npm ci --ignore-scripts`, `npm run build:cloud`) |
| Backend | Supabase: auth, bucket `vistralo-media`, tables `vistralo_projects` and `vistralo_jobs` (`supabase/migrations`), edge function `vistralo-share` | Supabase migrations and functions |
| Worker | `scripts/local-admin-worker.cjs` with `src/core.cjs`, `media.cjs`, `editor.cjs`, `viewports.cjs`, `providers.cjs`, `buildread.cjs`, `walkthrough.cjs`, `server-egress.cjs`, `service.cjs`, and `scripts/worker-secrets.cjs` | Manual, see below |

`build:cloud` needs `VISTRALO_SUPABASE_URL` and `VISTRALO_SUPABASE_PUBLISHABLE_KEY` (set in Vercel; only a publishable key may be embedded).

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
```

Without Supabase settings the built app runs in demo mode (`#demo/`), which keeps projects in the browser.

## Worker

The worker runs on the VPS as systemd unit `vistralo-worker` (`deploy/vistralo-worker.service`) from `/opt/vistralo-worker`, with its environment in `/etc/vistralo-worker.env`. It polls Supabase for jobs, then imports, detects viewports, reads the site's build, writes the script, voices it and composes the film. To deploy a change:

1. Copy the changed files to `/opt/vistralo-worker`, keeping the old ones as `<file>.bak-<date>`.
2. If `package-lock.json` changed, run `npm install --omit=dev` there (`deploy/vps-worker-install.sh` does a full install, including Chrome for Playwright).
3. `systemctl restart vistralo-worker`, then check `journalctl -u vistralo-worker` for "Capture worker signed in".
4. Roll back by restoring the `.bak` files and restarting.

Run only one worker.

## Providers

The director script uses OpenAI (`VISTRALO_DIRECTOR_MODEL`, default `gpt-5-mini`, falling back on rate limits); speech uses HeyGen. See [docs/PROVIDERS.md](docs/PROVIDERS.md). Legal notices are drafts: [docs/legal](docs/legal/README.md).
