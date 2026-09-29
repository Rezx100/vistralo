# Vistralo

Vistralo turns a screen recording, an uploaded video, a set of screenshots or a website into a spoken walkthrough. It finds each screen, writes the line a reviewer should hear, and holds the picture while that line plays.

The application is in [`deployment-source/vistralo`](deployment-source/vistralo); see its README for how it is built and run. The landing page https://vistralo.com lives in a separate repository.

## Contribution flow

1. Branch from `main` and open a pull request.
2. CI (`.github/workflows/pipeline.yml`) installs the locked dependencies, builds the web app, runs the test suite with FFmpeg, typechecks, lints design tokens, audits dependencies, and runs the browser journeys and accessibility checks. `main` requires the **Validate source** check.
3. Vercel builds a preview for every PR and deploys production when the PR merges to `main`.
4. Worker changes (`scripts/local-admin-worker.cjs` and the `src/` modules it requires) are not deployed by Vercel; see "Worker" in the app README.

No credentials, provider keys, recordings or user project data belong in Git.
