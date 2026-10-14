'use strict';
// A long tab recording with the extension, measured. The page flashes white and plays a tone at the
// same moment every 5 seconds; the recorded file is then searched for both, near its start and its
// end, to measure how far sound and picture drift apart. Memory of the browser's processes is
// sampled every minute.
//
//   VISTRALO_TEST_CHROMIUM     Chrome for Testing
//   VISTRALO_LONG_MINUTES      Length of the take (default 30)
//   VISTRALO_EVIDENCE          Output folder (default evidence/extension-long)
//
// It runs a visible browser, because headless Chrome records a tab's sound as silence; the window
// is placed off screen. Build first: npm run build:server, then the dev extension for the local app
// (npm run test:extension does both, or see extension/README.md).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'extension-dist', 'dev');
const evidence = path.resolve(process.env.VISTRALO_EVIDENCE || path.join(root, 'evidence', 'extension-long'));
const minutes = Number(process.env.VISTRALO_LONG_MINUTES || 30);
const extensionId = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'dev-key.json'), 'utf8')).id;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PERIOD = 5;

// White flash and a 1 kHz tone, both 200 ms, scheduled on the audio clock so they start together.
const page = `<!doctype html><html><head><title>Sync marker</title><style>
html,body{margin:0;height:100%;background:#000}#f{position:fixed;inset:0;background:#fff;display:none}
p{color:#888;font:16px system-ui;padding:16px;margin:0}</style></head><body><div id="f"></div><p id="t">waiting</p><script>
const f=document.getElementById('f');let c;
document.addEventListener('click',()=>{if(c)return;c=new AudioContext();
 const start=c.currentTime+0.5;let n=0;
 const plan=()=>{const at=start+n*${PERIOD};const o=c.createOscillator();o.frequency.value=1000;const g=c.createGain();g.gain.value=0.5;o.connect(g).connect(c.destination);o.start(at);o.stop(at+0.2);
  const ms=(at-c.currentTime)*1000;setTimeout(()=>{f.style.display='block';setTimeout(()=>f.style.display='none',200)},Math.max(0,ms));n++;};
 plan();setInterval(()=>{while(start+n*${PERIOD}<c.currentTime+${PERIOD}*2)plan();document.getElementById('t').textContent='markers '+n},1000);});
</script></body></html>`;

function memoryMb(profile) {
  try {
    if (process.platform === 'win32') {
      const quoted = profile.replace(/'/g, "''");
      const out = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*${quoted}*' } | Measure-Object -Property WorkingSetSize -Sum).Sum`], { encoding: 'utf8' });
      return Math.round(Number(out.trim()) / 1024 / 1024);
    }
    const out = execFileSync('bash', ['-c', `ps -eo rss,args | grep -F -- '${profile}' | grep -v grep | awk '{s+=$1} END {print s}'`], { encoding: 'utf8' });
    return Math.round(Number(out.trim()) / 1024);
  } catch {
    return null;
  }
}

/** Times (seconds) where the picture turns white. */
function flashTimes(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', 'scale=64:36,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 30 });
  const times = [];
  let t = null;
  let lit = false;
  for (const line of (r.stderr || '').split('\n')) {
    const pts = /pts_time:([\d.]+)/.exec(line);
    if (pts) t = Number(pts[1]);
    const y = /YAVG=([\d.]+)/.exec(line);
    if (y && t !== null) {
      const bright = Number(y[1]) > 128;
      if (bright && !lit) times.push(t);
      lit = bright;
    }
  }
  return times;
}

/** Times (seconds) where the tone starts. */
function toneTimes(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'silencedetect=noise=-30dB:d=0.05', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 30 });
  return [...(r.stderr || '').matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
}

/** For each flash, the nearest tone start; positive means the sound comes after the picture. */
function offsets(flashes, tones) {
  return flashes
    .map((f) => {
      const near = tones.reduce((best, t) => (Math.abs(t - f) < Math.abs(best - f) ? t : best), Infinity);
      return Math.abs(near - f) < 1 ? { at: Number(f.toFixed(2)), ms: Math.round((near - f) * 1000) } : null;
    })
    .filter(Boolean);
}

async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  assert.ok(fs.existsSync(path.join(dist, 'manifest.json')), 'Build the dev extension first.');
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(page);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vistralo-long-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.VISTRALO_TEST_CHROMIUM,
    headless: false,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--allowlisted-extension-id=${extensionId}`,
      '--autoplay-policy=no-user-gesture-required',
      '--window-position=-2400,0',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  const report = { when: new Date().toISOString(), minutes, periodSeconds: PERIOD, memoryMb: [], browser: 'Chrome for Testing', os: `${os.type()} ${os.release()}` };
  try {
    const control = await context.newPage();
    await control.goto(`chrome-extension://${extensionId}/popup.html`);
    const marker = await context.newPage();
    await marker.goto(origin);
    await marker.click('body');
    await marker.bringToFront();
    const tabId = await control.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id);
    const options = { mode: 'tab', microphone: null, camera: null, bubble: false, bubbleSize: 'medium', systemAudio: true, countdown: false, openWhenDone: false };
    const started = await control.evaluate((m) => chrome.runtime.sendMessage(m), { to: 'background', type: 'start', tabId, options });
    assert.deepEqual(started, { ok: true });
    const snapshot = () => control.evaluate(async () => (await chrome.storage.session.get('session')).session ?? null);
    const t0 = Date.now();
    report.memoryMb.push({ minute: 0, mb: memoryMb(profile) });
    while (Date.now() - t0 < minutes * 60000) {
      await wait(60000);
      const s = await snapshot();
      const entry = { minute: Math.round((Date.now() - t0) / 60000), mb: memoryMb(profile), phase: s?.phase, bytes: s?.bytes };
      report.memoryMb.push(entry);
      console.log(JSON.stringify(entry));
      fs.writeFileSync(path.join(evidence, 'long-recording.json'), JSON.stringify(report, null, 2));
      if (s?.phase !== 'recording') throw new Error(`The recording stopped by itself: ${JSON.stringify(s)}`);
    }
    await control.evaluate(() => chrome.runtime.sendMessage({ to: 'background', type: 'control', action: 'stop' }));
    let s;
    for (let i = 0; i < 300; i++) {
      s = await snapshot();
      if (s?.phase === 'ready') break;
      await wait(1000);
    }
    assert.equal(s?.phase, 'ready');
    report.recordedSeconds = s.elapsedMs / 1000;
    report.bytes = s.bytes;
    // Save it the way a person does: the Download button on the recordings page.
    let result;
    for (let i = 0; i < 50 && !result; i++) {
      result = context.pages().find((p) => p.url() === `chrome-extension://${extensionId}/recorder.html#${s.id}`);
      if (!result) await wait(200);
    }
    await result.waitForSelector('#result:not([hidden])', { timeout: 120000 });
    const [download] = await Promise.all([result.waitForEvent('download', { timeout: 120000 }), result.click('#download')]);
    const file = path.join(evidence, 'long-recording.webm');
    await download.saveAs(file);
    report.fileBytes = fs.statSync(file).size;
  } finally {
    await context.close().catch(() => {});
    server.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }

  const file = path.join(evidence, 'long-recording.webm');
  const decode = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 30 });
  report.decodeErrors = (decode.stderr || '').split('\n').filter(Boolean).slice(0, 20);
  const flashes = flashTimes(file);
  const tones = toneTimes(file);
  const all = offsets(flashes, tones);
  report.markers = { flashes: flashes.length, tones: tones.length, matched: all.length, expected: Math.floor((report.recordedSeconds || 0) / PERIOD) };
  report.syncStartMs = all.slice(0, 5);
  report.syncEndMs = all.slice(-5);
  report.lastFlashSeconds = flashes.at(-1) ?? null;
  // Seeking: decode one frame near the end directly.
  const seek = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-ss', String(Math.max(0, (report.recordedSeconds || 0) - 10)), '-i', file, '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8' });
  report.seekNearEnd = seek.status === 0;
  fs.writeFileSync(path.join(evidence, 'long-recording.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, memoryMb: report.memoryMb.map((m) => m.mb) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
