# Vistralo

- Production is three parts: the web app in `web/` (Vercel, https://app.vistralo.com), Supabase (auth, storage, jobs), and the worker `scripts/local-admin-worker.cjs` on the VPS. Change only what the task needs, and keep each part deployable on its own.
- `PRODUCT.md` says who Vistralo is for and what must not be claimed; `DESIGN.md` is the visual system (the contact sheet). Read both before changing any screen. `docs/seo/keyword-map.md` fixes each public page's title, description, heading and links.
- `web/styles/tokens.css` holds every colour, size and spacing value; `npm run lint:design` rejects raw values elsewhere.
- The CSP in `vercel.json` must list every host the browser talks to (for example a new Supabase host).
- Worker claims about a site (libraries, fonts, effects) must come from the build read's evidence; say "likely" when only the video frames suggest it.
- Paid providers (OpenAI, HeyGen) are only called for real user jobs. Do not queue a paid job to test without the owner's yes.
- Keep credentials out of projects, logs, prompts and Git.
- Plans and Paddle are behind `VISTRALO_BILLING` (off by default) and sandbox only; read `docs/BILLING.md` before touching them. The Paddle API key and webhook secret are Supabase function secrets, never build variables.
- Before committing, run `npm run build:server`, `npm test`, `npm run typecheck:web` and `npm run lint:design`.
