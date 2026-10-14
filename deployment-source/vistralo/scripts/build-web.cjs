"use strict";
const esbuild = require("esbuild"),
  fs = require("node:fs"),
  path = require("node:path");
const { billingDefines } = require("./billing-env.cjs");
// The browser tests build a second copy with plans switched on; everything else writes to server-ui.
const out = process.env.VISTRALO_WEB_OUT || "server-ui";
(async () => {
  fs.mkdirSync(out, { recursive: true });
  // A build that fails must not leave the last good bundle behind for the browser tests to pass against.
  fs.rmSync(path.join(out, "app.js"), { force: true });
  fs.rmSync(path.join(out, "watch.js"), { force: true });
  await esbuild.build({
    entryPoints: ["web/main.tsx"],
    bundle: true,
    minify: true,
    // Matches tsconfig.web.json (react-jsx). The classic transform needed `import React` in every
    // file, which the typecheck could not see was missing.
    jsx: "automatic",
    loader: { ".css": "empty" },
    target: ["es2022"],
    outfile: path.join(out, "app.js"),
    define: { "process.env.NODE_ENV": '"production"', VISTRALO_SUPABASE_URL: JSON.stringify(process.env.VISTRALO_SUPABASE_URL || ""), VISTRALO_SUPABASE_KEY: JSON.stringify(process.env.VISTRALO_SUPABASE_PUBLISHABLE_KEY || ""), ...billingDefines(process.env) },
    legalComments: "external",
  });
  // The page a share link opens (/watch): one small script, no React, so it loads fast on a phone.
  await esbuild.build({
    entryPoints: ["web/share/watch.ts"],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2022"],
    outfile: path.join(out, "watch.js"),
    define: { VISTRALO_SUPABASE_URL: JSON.stringify(process.env.VISTRALO_SUPABASE_URL || "") },
  });
  fs.copyFileSync("web/share/watch.css", path.join(out, "watch.css"));
  fs.writeFileSync(
    path.join(out, "watch.html"),
    '<!doctype html>\n<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark"><title>Shared with you · Vistralo</title><link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/watch.css"><script src="/watch.js"></script></head><body>\n<header class="watch-bar"><a class="watch-brand" href="https://vistralo.com/"><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M4 4H24L20 8H8V20L4 24Z M28 8V28H8L12 24H24V12Z"/></svg>vistralo</a><span class="watch-edge">Shared with you · Read only</span></header>\n<main id="watch" class="watch-main" aria-busy="true"><p class="watch-status" role="status">Opening the shared link…</p></main>\n<footer class="watch-foot"><p>Made with <a href="https://vistralo.com/">Vistralo</a>, which turns a screen recording into a narrated walkthrough.</p><p>Something wrong with this page? Write to <a href="mailto:contact@vistralo.com">contact@vistralo.com</a>.</p></footer>\n</body></html>\n',
  );
  fs.copyFileSync("web/styles/tokens.css", path.join(out, "tokens.css"));
  // Published so the pricing page on vistralo.com can be built from the same plan table.
  fs.copyFileSync("web/billing/plans.json", path.join(out, "plans.json"));
  fs.writeFileSync(
    path.join(out, "style.css"),
    ["web/styles/app.css", "web/styles/library.css", "web/features/features.css", "web/styles/project.css", "web/styles/states.css", "web/billing/billing.css"]
      .filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n"),
  );
  fs.writeFileSync(
    path.join(out, "index.html"),
    '<!doctype html>\n<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F4F5F7"><title>Vistralo</title><link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/style.css"><script defer src="/app.js"></script></head><body><div id="root"></div></body></html>\n',
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
