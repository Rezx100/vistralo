---
name: loom-parity
description: Use when building or reviewing Vistralo's Chrome extension or any feature modelled on Loom's behaviour. Enforces evidence, then specification, then implementation, then comparison, with honest status labels.
---

# Loom-informed features for Vistralo

Vistralo's own product, informed by Loom's visible behaviour. The plan, research and status live in `deployment-source/vistralo/docs/loom-parity/`; read `progress.md` first.

## The cycle, for every feature

1. **Evidence.** Find what Loom does in its public help pages or a person's observation of the normal UI, and add it to `sources.md` with an ID and a status: documented, documented (summary), observed, inferred or unknown. Never decompile Loom, read its bundles, copy its wording, assets, logos or code, or use its private APIs.
2. **Specification.** Write Vistralo's own requirement in `chrome-spec.md` with its feature ID from `feature-matrix.csv`.
3. **Implementation.** Build it in the existing code (`extension/`, `web/`), reusing the web app's save, upload, project and share code. Keep tokens in `web/styles/tokens.css`.
4. **Comparison.** Test it (`tests/extension.test.cjs`, `npm run test:extension`, manual checks in `test-plan.md`) and update the matrix row: implemented, tested-with-mocks, tested-with-real-capture, blocked, deferred or not-run. A button on screen is not a finished feature; a fake device is not a real one.

## Boundaries

- Vistralo's purpose is website AI walkthroughs; recording serves it.
- No merging, production deployment, store submission or paid service without the owner's yes.
- Keep every discovered feature in `feature-matrix.csv`, even when deferred to another platform.
