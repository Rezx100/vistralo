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
  fs.copyFileSync("web/styles/tokens.css", path.join(out, "tokens.css"));
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
