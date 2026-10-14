'use strict';
// Loads the built extension into Chrome for Testing and records with it. These runs prove the
// extension's wiring and the files it writes. They do not prove a real camera, microphone or
// Chrome's real "Choose what to share" dialog: those need a person at a normal Chrome.
//
// Two browser sessions are used, because Chrome's fake media switches break tab capture:
//   - real tab capture, tab sound, no microphone;
//   - fake camera, microphone and screen (Chrome's own test devices), for camera and screen modes.
//
//   VISTRALO_TEST_CHROMIUM   Chrome for Testing or Chromium (branded Chrome ignores --load-extension)
//   VISTRALO_EVIDENCE        Folder for screenshots and recorded files (default evidence/extension)
//   VISTRALO_HEADFUL=1       Show the browser
// It builds the dev extension itself (saving to the local app's demo); build the app first with npm run build:server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { serve } = require('./static-server.cjs');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'extension-dist', 'dev');
const evidence = path.resolve(process.env.VISTRALO_EVIDENCE || path.join(root, 'evidence', 'extension'));
const APP_PORT = 4387;
const extensionId = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'dev-key.json'), 'utf8')).id;
const ACTIVE = ['requesting', 'countdown', 'recording', 'paused', 'stopping', 'finalizing'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

const fixture = (title) => `<!doctype html><html><head><title>${title}</title><style>
body{margin:0;font:20px system-ui;background:#f6f6f2}main{padding:48px}
.bar{height:80px;background:linear-gradient(90deg,#4b52cf,#d42a1f,#4b52cf);background-size:400px 80px;animation:slide 2s linear infinite}
@keyframes slide{from{background-position:0}to{background-position:400px}}</style></head>
<body><main><h1>${title}</h1><p>A synthetic page for recording tests.</p><div class="bar"></div>
<p><a id="next" href="/two">Next page</a> <button id="beep">Play a tone</button></p></main>
<script>document.getElementById('beep').onclick=()=>{const c=new AudioContext();const o=c.createOscillator();o.frequency.value=440;o.connect(c.destination);o.start();setTimeout(()=>o.stop(),4000)};</script>
</body></html>`;

function ffprobe(file) {
  try {
    return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
  } catch (error) {
    return { error: String(error.message || error) };
  }
}

/** Decodes the whole file; a broken WebM stream fails here even when its header looks fine. */
function decodes(file) {
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Peak level of the audio in a file, in dB; silence is about -91. */
function peakDb(file) {
  let text = '';
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    text = String(error.stderr || '');
  }
  if (!text) {
    const r = require('node:child_process').spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    text = r.stderr || '';
  }
  return Number((/max_volume: (-?[\d.]+) dB/.exec(text) || [])[1]);
}

async function step(name, run) {
  const started = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`ok   ${name}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String((error && error.stack) || error) });
    console.log(`FAIL ${name}\n     ${String((error && error.message) || error)}`);
  }
}

async function browser(fakeDevices, site, run) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vistralo-ext-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.VISTRALO_TEST_CHROMIUM,
    headless: process.env.VISTRALO_HEADFUL !== '1',
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      // Grant the permission prompts, pick the first screen in Chrome's chooser, and use Chrome's
      // test camera and microphone. Both switches break tab capture, so the tab session has neither.
      ...(fakeDevices ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : []),
      // Stands in for the click on the toolbar button that lets an extension capture a tab.
      `--allowlisted-extension-id=${extensionId}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker', { timeout: 15000 }));
    assert.equal(new URL(worker.url()).host, extensionId, 'The extension id must be the fixed dev id.');
    // An extension page to talk to the service worker from, as the popup does.
    const control = await context.newPage();
    await control.goto(`chrome-extension://${extensionId}/popup.html`);
    const snapshot = () => control.evaluate(async () => (await chrome.storage.session.get('session')).session ?? null);
    // Reads the extension's IndexedDB from an extension page. Extension pages forbid eval, so the
    // query is picked by name rather than passed as code.
    const idb = (query, id) =>
      control.evaluate(
        async ([which, sessionId]) => {
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open('vistralo-extension', 1);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
          const ask = (store, method, key) =>
            new Promise((res, rej) => {
              const r = db.transaction(store).objectStore(store)[method](key);
              r.onsuccess = () => res(r.result);
              r.onerror = () => rej(r.error);
            });
          try {
            const session = await ask('sessions', 'get', sessionId);
            if (which === 'stored') {
              const chunks = await ask('chunks', 'count', IDBKeyRange.bound([sessionId, 0, 0], [sessionId, 1e9, Number.MAX_SAFE_INTEGER]));
              return { session: session ?? null, chunks };
            }
            const chunks = await ask('chunks', 'getAll', IDBKeyRange.bound([sessionId, session.take, 0], [sessionId, session.take, Number.MAX_SAFE_INTEGER]));
            chunks.sort((a, b) => a.seq - b.seq);
            return Array.from(new Uint8Array(await new Blob(chunks.map((c) => c.blob)).arrayBuffer()));
          } finally {
            db.close();
          }
        },
        [query, id],
      );
    const t = {
      context,
      control,
      snapshot,
      send: (message) => control.evaluate((m) => chrome.runtime.sendMessage(m), message),
      // Without the "tabs" permission an extension page cannot read other tabs' addresses, so the
      // tab to record is found as the active one, which is what the toolbar button sees too.
      tabOf: async (page) => {
        await page.bringToFront();
        return control.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id ?? null);
      },
      until: async (test, ms = 15000, label = 'condition') => {
        const end = Date.now() + ms;
        let last;
        while (Date.now() < end) {
          last = await snapshot();
          if (test(last)) return last;
          await wait(200);
        }
        throw new Error(`Timed out waiting for ${label}; last snapshot ${JSON.stringify(last)}`);
      },
      options: (over) => ({ mode: 'tab', microphone: null, camera: null, bubble: false, systemAudio: true, countdown: true, openWhenDone: false, ...over }),
      stored: (id) => idb('stored', id),
      exportTake: async (id, file) => fs.writeFileSync(file, Buffer.from(await idb('take', id))),
    };
    t.idle = () => t.until((x) => !x || !ACTIVE.includes(x.phase), 15000, 'no recording under way');
    t.page = await context.newPage();
    await t.page.goto(site.origin + '/');
    await run(t);
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

async function findPage(context, url) {
  for (let i = 0; i < 50; i++) {
    const found = context.pages().find((p) => p.url() === url);
    if (found) return found;
    await wait(200);
  }
  return null;
}

async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  execFileSync(process.execPath, [path.join(__dirname, 'build-extension.cjs')], {
    stdio: 'inherit',
    env: { ...process.env, VISTRALO_EXTENSION_TARGET: 'dev', VISTRALO_EXTENSION_APP_ORIGIN: `http://127.0.0.1:${APP_PORT}`, VISTRALO_EXTENSION_DEMO: '1' },
  });
  assert.ok(fs.existsSync(path.join(root, 'server-ui', 'app.js')), 'Build the web app first (npm run build:server).');
  assert.ok(process.env.VISTRALO_TEST_CHROMIUM && fs.existsSync(process.env.VISTRALO_TEST_CHROMIUM), 'Set VISTRALO_TEST_CHROMIUM to Chrome for Testing.');
  const app = await serve(APP_PORT);
  const site = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(fixture(req.url === '/two' ? 'Fixture shop, page two' : 'Fixture shop'));
    });
    server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });

  try {
    await browser(false, site, async (t) => {
      let first = null;
      await step('tab: count-in, tab sound, pause, resume, survive navigation, stop; the file plays', async () => {
        const tabId = await t.tabOf(t.page);
        assert.deepEqual(await t.send({ to: 'background', type: 'start', tabId, options: t.options() }), { ok: true });
        await t.until((x) => x && x.phase === 'countdown', 15000, 'countdown');
        await wait(600);
        await t.page.screenshot({ path: path.join(evidence, 'tab-countdown.png') });
        let s = await t.until((x) => x && x.phase === 'recording', 8000, 'recording');
        await t.page.click('#beep');
        await wait(2500);
        await t.page.screenshot({ path: path.join(evidence, 'tab-recording-controls.png') });
        await t.send({ to: 'background', type: 'control', action: 'pause' });
        s = await t.until((x) => x.phase === 'paused', 5000, 'paused');
        const held = s.elapsedMs;
        await wait(1500);
        assert.equal((await t.snapshot()).elapsedMs, held, 'the clock holds while paused');
        await t.send({ to: 'background', type: 'control', action: 'resume' });
        await t.until((x) => x.phase === 'recording', 5000, 'resumed');
        await t.page.click('#next');
        await t.page.waitForURL('**/two');
        await wait(2500);
        assert.equal((await t.snapshot()).phase, 'recording', 'recording survives navigating the tab');
        // Stop twice: the second must change nothing.
        await t.send({ to: 'background', type: 'control', action: 'stop' });
        await t.send({ to: 'background', type: 'control', action: 'stop' });
        s = await t.until((x) => x.phase === 'ready', 20000, 'ready');
        assert.ok(s.elapsedMs > 4500 && s.elapsedMs < 9000, `recorded ${s.elapsedMs} ms, without the pause`);
        const file = path.join(evidence, 'tab.webm');
        await t.exportTake(s.id, file);
        const probe = ffprobe(file);
        fs.writeFileSync(path.join(evidence, 'tab.ffprobe.json'), JSON.stringify(probe, null, 2));
        assert.deepEqual((probe.streams || []).map((x) => x.codec_type).sort(), ['audio', 'video'], JSON.stringify(probe));
        assert.ok(decodes(file), 'the whole file decodes');
        const peak = peakDb(file);
        // Headless Chrome captures a tab's sound as silence, so the tone is checked in a visible browser only.
        if (process.env.VISTRALO_HEADFUL === '1') assert.ok(peak > -40, `the tab's tone is in the recording (peak ${peak} dB)`);
        else console.log(`     note: tab sound not checked headless (peak ${peak} dB); run with VISTRALO_HEADFUL=1`);
        const resultPage = await findPage(t.context, `chrome-extension://${extensionId}/recorder.html#${s.id}`);
        assert.ok(resultPage, 'the recordings page opens on the result');
        await resultPage.waitForSelector('#result:not([hidden])');
        await resultPage.setViewportSize({ width: 1100, height: 900 });
        await resultPage.screenshot({ path: path.join(evidence, 'result-page.png') });
        first = { id: s.id };
      });

      await step('save to Vistralo: the app stages the recording, then the extension deletes its copy', async () => {
        assert.ok(first, 'needs the tab recording');
        const appPage = await t.context.newPage();
        await appPage.goto(`${app.origin}/#demo/import/${first.id}`);
        await appPage.waitForSelector('dialog[open] video.flow-recording-preview', { timeout: 20000 });
        await appPage.screenshot({ path: path.join(evidence, 'app-import.png') });
        let left;
        for (let i = 0; i < 50; i++) {
          left = await t.stored(first.id);
          if (!left.session && !left.chunks) break;
          await wait(300);
        }
        assert.deepEqual(left, { session: null, chunks: 0 }, 'the extension let go of the recording once the app had it');
        await appPage.close();
      });

      await step('start over keeps only the new take; discard deletes everything', async () => {
        await t.idle();
        const tabId = await t.tabOf(t.page);
        assert.deepEqual(await t.send({ to: 'background', type: 'start', tabId, options: t.options({ countdown: false }) }), { ok: true });
        await t.until((x) => x && x.phase === 'recording', 15000, 'recording');
        await wait(2000);
        await t.send({ to: 'background', type: 'control', action: 'restart' });
        const s = await t.until((x) => x.phase === 'recording' && x.take === 2, 10000, 'second take');
        assert.ok(s.elapsedMs === 0, 'the new take starts at zero');
        await wait(1500);
        await t.send({ to: 'background', type: 'control', action: 'cancel' });
        await t.until((x) => x.phase === 'cancelled', 10000, 'cancelled');
        assert.deepEqual(await t.stored(s.id), { session: null, chunks: 0 }, 'nothing of a discarded recording remains');
      });

      await step('a second start while recording is refused', async () => {
        await t.idle();
        const tabId = await t.tabOf(t.page);
        assert.deepEqual(await t.send({ to: 'background', type: 'start', tabId, options: t.options({ countdown: false }) }), { ok: true });
        await t.until((x) => x && x.phase === 'recording', 15000, 'recording');
        const again = await t.send({ to: 'background', type: 'start', tabId, options: t.options({ countdown: false }) });
        assert.match(again.error || '', /already/);
        await t.send({ to: 'background', type: 'control', action: 'stop' });
        await t.until((x) => x.phase === 'ready', 20000, 'ready');
      });

      await step('closing the recorded tab ends the recording and keeps what was recorded', async () => {
        await t.idle();
        const extra = await t.context.newPage();
        await extra.goto(site.origin + '/');
        const tabId = await t.tabOf(extra);
        assert.deepEqual(await t.send({ to: 'background', type: 'start', tabId, options: t.options({ countdown: false }) }), { ok: true });
        await t.until((x) => x && x.phase === 'recording', 15000, 'recording');
        await wait(2500);
        await extra.close();
        const s = await t.until((x) => x.phase === 'ready', 20000, 'ready after the tab closed');
        const file = path.join(evidence, 'tab-closed.webm');
        await t.exportTake(s.id, file);
        assert.ok(decodes(file), 'the kept part decodes');
      });
    });

    await browser(true, site, async (t) => {
      await step('camera only, with the microphone: the file has the camera and the voice', async () => {
        const tabId = await t.tabOf(t.page);
        assert.deepEqual(await t.send({ to: 'background', type: 'start', tabId, options: t.options({ mode: 'camera', camera: 'default', microphone: 'default', countdown: false }) }), { ok: true });
        await t.until((x) => x && x.phase === 'recording', 15000, 'recording');
        await wait(3000);
        await t.send({ to: 'background', type: 'control', action: 'stop' });
        const s = await t.until((x) => x.phase === 'ready', 20000, 'ready');
        const file = path.join(evidence, 'camera.webm');
        await t.exportTake(s.id, file);
        const probe = ffprobe(file);
        fs.writeFileSync(path.join(evidence, 'camera.ffprobe.json'), JSON.stringify(probe, null, 2));
        assert.deepEqual((probe.streams || []).map((x) => x.codec_type).sort(), ['audio', 'video']);
        assert.ok(decodes(file));
        // Chrome's fake microphone beeps, so a silent voice track means the mix is broken.
        const peak = peakDb(file);
        assert.ok(peak > -40, `the microphone is in the recording (peak ${peak} dB)`);
      });

      await step("window or screen through Chrome's chooser, with the microphone", async () => {
        await t.idle();
        const tabId = await t.tabOf(t.page);
        assert.deepEqual(await t.send({ to: 'background', type: 'start', tabId, options: t.options({ mode: 'screen', microphone: 'default', countdown: false }) }), { ok: true });
        await t.until((x) => x && x.phase === 'recording', 20000, 'recording');
        await wait(3000);
        await t.page.screenshot({ path: path.join(evidence, 'screen-recording-controls.png') });
        await t.send({ to: 'background', type: 'control', action: 'stop' });
        const s = await t.until((x) => x.phase === 'ready', 20000, 'ready');
        const file = path.join(evidence, 'screen.webm');
        await t.exportTake(s.id, file);
        const probe = ffprobe(file);
        fs.writeFileSync(path.join(evidence, 'screen.ffprobe.json'), JSON.stringify(probe, null, 2));
        assert.ok((probe.streams || []).some((x) => x.codec_type === 'video'));
        assert.ok(decodes(file));
      });

      await step('camera bubble on the recorded page', async () => {
        await t.idle();
        const tabId = await t.tabOf(t.page);
        const options = t.options({ mode: 'screen', camera: 'default', bubble: true, countdown: false });
        await t.control.evaluate((o) => chrome.storage.local.set({ options: o }), options);
        assert.deepEqual(await t.send({ to: 'background', type: 'start', tabId, options }), { ok: true });
        await t.until((x) => x && x.phase === 'recording', 20000, 'recording');
        await wait(2500);
        const frames = t.page.frames().map((f) => f.url());
        await t.page.screenshot({ path: path.join(evidence, 'camera-bubble.png') });
        await t.send({ to: 'background', type: 'control', action: 'cancel' });
        await t.until((x) => x.phase === 'cancelled', 10000, 'cancelled');
        assert.ok(frames.some((u) => u.startsWith(`chrome-extension://${extensionId}/camera.html`)), `the bubble frame is on the page (${frames.join(', ')})`);
      });

      await step('popup and setup page render', async () => {
        await t.control.setViewportSize({ width: 420, height: 760 });
        await t.control.reload();
        await t.control.waitForSelector('#start');
        await t.control.screenshot({ path: path.join(evidence, 'popup.png') });
        const welcome = await t.context.newPage();
        await welcome.goto(`chrome-extension://${extensionId}/welcome.html`);
        await welcome.waitForSelector('#allow-mic');
        await welcome.screenshot({ path: path.join(evidence, 'welcome.png'), fullPage: true });
      });
    });
  } finally {
    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(evidence, 'extension-journey.json'), JSON.stringify({ when: new Date().toISOString(), passed, total: results.length, results }, null, 2));
    await app.close();
    site.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
