'use strict';
// Browser journey through the built web app in demo mode, served with the production headers.
// Run npm run build:server first. Needs ffmpeg on PATH for the synthetic upload.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {serve} = require('./static-server.cjs');
const {run} = require('../src/media.cjs');

async function main() {
  assert(fs.readFileSync('server-ui/index.html', 'utf8').includes('id="root"'), 'Run npm run build:server first');
  const evidence = path.resolve('evidence/web-journey');
  fs.mkdirSync(evidence, {recursive:true});
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vistralo-journey-'));
  const app = await serve(Number(process.env.VISTRALO_UI_TEST_PORT || 8788));
  const checks = [];
  let browser;
  try {
    browser = await chromium.launch({headless:true, ...(process.env.VISTRALO_TEST_CHROMIUM ? {executablePath:process.env.VISTRALO_TEST_CHROMIUM} : {})});
    const page = await browser.newPage({viewport:{width:1440, height:900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Content Security Policy/i.test(message.text())) errors.push(message.text()); });
    page.setDefaultTimeout(15000);

    await page.goto(app.origin + '/#demo/projects');
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    const before = await page.locator('.project-card').count();
    assert.ok(before > 0, 'Demo projects are listed');
    checks.push('demo Projects workspace renders with its sample projects');

    // Synthetic footage is the only input; no user recording is used.
    const fixture = path.join(temp, 'test-upload.mp4');
    await run('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','2','-c:v','libx264','-pix_fmt','yuv420p',fixture]);
    await page.getByRole('button', {name:'New project', exact:true}).click();
    await page.getByRole('menuitem', {name:/^Narrate a video/}).click();
    const dialog = page.getByRole('dialog', {name:'Narrate a video', exact:true});
    await dialog.getByLabel(/Project name/).fill('Journey upload');
    await dialog.locator('input[type="file"]').setInputFiles(fixture);
    await dialog.getByRole('button', {name:'Create Walkthrough', exact:true}).click();
    await page.getByRole('heading', {name:'Journey upload', level:1, exact:true}).waitFor({timeout:60000});
    checks.push('Narrate a video creates a project from an uploaded file');

    await page.getByRole('navigation', {name:'Breadcrumb', exact:true}).getByRole('button', {name:'Projects', exact:true}).click();
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    assert.equal(await page.locator('.project-card').count(), before + 1, 'The new project joins the list');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No desktop horizontal overflow');
    await page.screenshot({path:path.join(evidence, 'dashboard-desktop.png'), fullPage:true});
    await page.setViewportSize({width:390, height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
    await page.screenshot({path:path.join(evidence, 'dashboard-mobile.png'), fullPage:true});
    checks.push('no horizontal overflow at 1440x900 and 390x844');

    // The upload hash worker must agree with Node across its 1 MiB chunk boundary.
    const expected = crypto.createHash('sha256').update(Buffer.alloc(2 * 1024 * 1024 + 7, 0x61)).digest('hex');
    const actual = await page.evaluate(() => new Promise((resolve, reject) => {
      const worker = new Worker('/hash-worker.js');
      worker.onmessage = event => {
        if (event.data.digest) { worker.terminate(); resolve(event.data.digest); }
        else if (event.data.error) { worker.terminate(); reject(new Error(event.data.error)); }
      };
      worker.onerror = () => { worker.terminate(); reject(new Error('Browser hash worker failed')); };
      worker.postMessage(new File([new Uint8Array(2 * 1024 * 1024 + 7).fill(0x61)], 'hash.bin'));
    }));
    assert.equal(actual, expected, 'Multi-chunk browser SHA-256 matches Node');
    checks.push('multi-chunk browser hash worker matches Node');

    assert.deepEqual(errors, [], 'No uncaught exceptions or CSP violations');
    checks.push('no uncaught exceptions or CSP violations');
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({passed:true, at:new Date().toISOString(), checks}, null, 2));
    console.log('Web journey passed: ' + checks.length + ' checks');
  } catch (error) {
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({passed:false, error:error.message, checks}, null, 2));
    throw error;
  } finally {
    await browser?.close();
    await app.close();
    fs.rmSync(temp, {recursive:true, force:true});
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
