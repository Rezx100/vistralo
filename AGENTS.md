# Repository agent guide

The application is in `deployment-source/vistralo`. Read its `AGENTS.md` before changing application code.

Use a branch and pull request. From the application directory run `npm ci`, `npm run build:server`, `npm test`, `npm run typecheck:web`, `npm run lint:design` and `npm audit --omit=dev` before pushing. `main` requires the "Validate source" check and linear history; a merge deploys the web app to Vercel production.

Never commit credentials, private keys, `.env` files, provider tokens, recordings or user project data. The repository is public.
