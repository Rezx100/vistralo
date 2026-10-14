'use strict';
// Builds the Chrome extension into extension-dist/<target>/ and a versioned zip beside it.
//   VISTRALO_EXTENSION_TARGET     dev (default) or release. Dev keeps a fixed id (extension/dev-key.json)
//                                 so a local build of the app can be tested against it; release has no key.
//   VISTRALO_EXTENSION_APP_ORIGIN Where recordings are saved. Default https://app.vistralo.com.
//   VISTRALO_EXTENSION_DEMO       "1" to hand recordings to the app's demo mode (#demo/), for tests.
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'extension');
const target = process.env.VISTRALO_EXTENSION_TARGET === 'release' ? 'release' : 'dev';
const appOrigin = new URL(process.env.VISTRALO_EXTENSION_APP_ORIGIN || 'https://app.vistralo.com').origin;
const demo = process.env.VISTRALO_EXTENSION_DEMO === '1';
if (target === 'release' && (appOrigin !== 'https://app.vistralo.com' || demo))
  throw new Error('A release build saves to https://app.vistralo.com and not to the demo.');
const out = path.join(root, 'extension-dist', target);

const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
// Match patterns ignore the port, so a local app on any port is matched by its host.
const app = new URL(appOrigin);
const appMatch = `${app.protocol}//${app.hostname}/*`;
manifest.content_scripts[0].matches = [appMatch];
manifest.web_accessible_resources[1].matches = [appMatch];
if (target === 'dev') manifest.key = JSON.parse(fs.readFileSync(path.join(src, 'dev-key.json'), 'utf8')).key;
// A dev build saving to a local app may draw its controls on local pages without a toolbar click,
// which is how the browser tests reach them. Release builds rely on the click (activeTab) alone.
if (target === 'dev' && ['127.0.0.1', 'localhost'].includes(app.hostname)) manifest.host_permissions = [appMatch];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
fs.mkdirSync(path.join(out, 'assets', 'fonts'), { recursive: true });

const entries = ['background', 'offscreen', 'recorder', 'popup', 'controls', 'camera', 'welcome', 'bridge', 'handoff', 'theme'];
esbuild.buildSync({
  entryPoints: entries.map((name) => path.join(src, 'src', `${name}.ts`)),
  bundle: true,
  minify: target === 'release',
  format: 'iife',
  target: ['chrome116'],
  outdir: out,
  define: {
    VISTRALO_APP_ORIGIN: JSON.stringify(appOrigin),
    VISTRALO_APP_ORIGINS: JSON.stringify([appOrigin]),
    VISTRALO_APP_DEMO: JSON.stringify(demo),
  },
  legalComments: 'none',
});

for (const page of fs.readdirSync(path.join(src, 'pages'))) fs.copyFileSync(path.join(src, 'pages', page), path.join(out, page));
for (const icon of fs.readdirSync(path.join(src, 'icons'))) fs.copyFileSync(path.join(src, 'icons', icon), path.join(out, 'icons', icon));
const tokens = fs.readFileSync(path.join(root, 'web', 'styles', 'tokens.css'), 'utf8');
fs.writeFileSync(path.join(out, 'tokens.css'), tokens);
fs.copyFileSync(path.join(src, 'styles', 'extension.css'), path.join(out, 'extension.css'));
// The controls live in a shadow root on other sites. Tokens declared on :root do not reach a shadow
// tree, so they are declared on its host; the sites do not serve Vistralo's fonts, so those go.
const hostTokens = tokens
  .replace(/@font-face\s*\{[^}]*\}/g, '')
  .replace(/:root\[data-theme="dark"\]/g, ':host([data-theme="dark"])')
  .replace(/:root/g, ':host');
fs.writeFileSync(path.join(out, 'controls.css'), hostTokens + '\n' + fs.readFileSync(path.join(src, 'styles', 'controls.css'), 'utf8'));
const fonts = path.join(root, 'server-ui', 'assets', 'fonts');
for (const file of ['inter-latin-wght-normal.woff2', 'archivo-latin-wdth-normal.woff2', 'OFL.txt', 'OFL-Archivo.txt'])
  fs.copyFileSync(path.join(fonts, file), path.join(out, 'assets', 'fonts', file));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

/** A zip of the folder (deflate, fixed dates so the same input gives the same archive). */
function zip(dir, file) {
  const files = [];
  const walk = (d) => {
    for (const item of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, item.name);
      if (item.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  const parts = [];
  const central = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const full of files) {
    const name = Buffer.from(path.relative(dir, full).split(path.sep).join('/'));
    const data = fs.readFileSync(full);
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(dosTime, 12);
    entry.writeUInt16LE(dosDate, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + packed.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...parts, ...central, end]));
}
const archive = path.join(root, 'extension-dist', `vistralo-extension-${manifest.version}-${target}.zip`);
zip(out, archive);
console.log(`Built ${path.relative(root, out)} and ${path.relative(root, archive)} (saves to ${appOrigin}${demo ? ', demo' : ''})`);
