"use strict";
const esbuild = require("esbuild"),
  fs = require("node:fs");
(async () => {
  await esbuild.build({
    entryPoints: ["web/main.tsx"],
    bundle: true,
    minify: true,
    loader: { ".css": "empty" },
    target: ["es2022"],
    outfile: "server-ui/app.js",
    define: { "process.env.NODE_ENV": '"production"', VISTRALO_SUPABASE_URL: JSON.stringify(process.env.VISTRALO_SUPABASE_URL || ""), VISTRALO_SUPABASE_KEY: JSON.stringify(process.env.VISTRALO_SUPABASE_PUBLISHABLE_KEY || "") },
    legalComments: "external",
  });
  fs.copyFileSync("web/styles/tokens.css", "server-ui/tokens.css");
  fs.writeFileSync(
    "server-ui/style.css",
    ["web/styles/app.css", "web/features/features.css", "web/styles/states.css"]
      .filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n"),
  );
  fs.writeFileSync(
    "server-ui/index.html",
    '<!doctype html>\n<html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B0D12"><title>Vistralo</title><link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/style.css"><script defer src="/app.js"></script></head><body><div id="root"></div></body></html>\n',
  );
})();
