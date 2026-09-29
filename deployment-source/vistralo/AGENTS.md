# Vistralo

- Production is three parts: the web app in `web/` (Vercel, https://app.vistralo.com), Supabase (auth, storage, jobs), and the worker `scripts/local-admin-worker.cjs` on the VPS. Change only what the task needs, and keep each part deployable on its own.
- `web/styles/tokens.css` holds every colour, size and spacing value; `npm run lint:design` rejects raw values elsewhere.
- The CSP in `vercel.json` must list every host the browser talks to (for example a new Supabase host).
- Worker claims about a site (libraries, fonts, effects) must come from the build read's evidence; say "likely" when only the video frames suggest it.
- Paid providers (OpenAI, HeyGen) are only called for real user jobs. Do not queue a paid job to test without the owner's yes.
- Keep credentials out of projects, logs, prompts and Git.
- Before committing, run `npm run build:server`, `npm test`, `npm run typecheck:web` and `npm run lint:design`.
