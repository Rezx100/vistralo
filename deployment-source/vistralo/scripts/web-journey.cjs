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

    // Foundations: light is the default, the page title is set in the wide display face, and nothing is blurred.
    await page.evaluate(() => document.fonts.ready);
    const foundations = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement), title = getComputedStyle(document.querySelector('h1'));
      return {
        theme: document.documentElement.dataset.theme,
        scheme: root.colorScheme,
        page: getComputedStyle(document.body).backgroundColor,
        archivo: document.fonts.check('600 28px Archivo'),
        titleFace: title.fontFamily.split(',')[0].trim(),
        titleStretch: title.fontStretch,
        edgeFace: (() => { const probe = document.body.appendChild(Object.assign(document.createElement('span'), {className:'edge', textContent:'07'})); const style = getComputedStyle(probe); const out = [style.fontStretch, style.fontVariantNumeric, style.textTransform].join(' '); probe.remove(); return out; })(),
      };
    });
    assert.deepEqual(foundations, {theme:'light', scheme:'light', page:'rgb(244, 245, 247)', archivo:true, titleFace:'Archivo', titleStretch:'112%', edgeFace:'78% tabular-nums uppercase'});
    const blurred = async () => page.evaluate(() => Array.from(document.querySelectorAll('*')).filter(node => { const style = getComputedStyle(node); return style.backdropFilter !== 'none' || (style.filter !== 'none' && style.filter.includes('blur')); }).map(node => node.className));
    assert.deepEqual(await blurred(), [], 'Nothing on the page is blurred');
    await page.getByRole('button', {name:'More actions for Homepage motion study', exact:true}).click();
    await page.getByRole('menuitem', {name:'Rename', exact:true}).click();
    const rename = page.getByRole('dialog', {name:/^Rename/});
    assert.deepEqual(await blurred(), [], 'A dialog and its backdrop are not blurred');
    const field = rename.getByLabel('Project name', {exact:true});
    assert.equal(await field.inputValue(), 'Homepage motion study', 'The field is labelled and holds the current name');
    assert.equal(await rename.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)', 'A dialog is an opaque surface');
    assert.equal(await rename.getByRole('button', {name:'Save', exact:true}).evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(75, 82, 207)', 'The primary button is the one pencil colour');
    await page.keyboard.press('Escape');
    await rename.waitFor({state:'detached'});
    checks.push('light is the default theme, titles use the wide display face, and no surface is blurred or translucent');

    // The create bar shows its record actions at rest, stays put, and its button opens and closes the menu.
    const create = page.getByRole('button', {name:'New project', exact:true});
    const bar = page.getByRole('toolbar', {name:'Create', exact:true});
    for (const name of ['AI walkthrough', 'Talk-through', 'Section'])
      assert.equal(await bar.getByRole('button', {name, exact:true}).isVisible(), true, name + ' shows without hovering');
    await bar.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    const resting = await create.boundingBox();
    await page.mouse.move(resting.x - 60, resting.y - 60);
    await page.mouse.move(resting.x - 10, resting.y - 10, {steps:5});
    await page.waitForTimeout(400);
    assert.deepEqual(await create.boundingBox(), resting, 'The create bar does not move as the pointer approaches');
    await create.click();
    await page.getByRole('menuitem', {name:/^Record a talk-through/}).waitFor();
    await create.click();
    await page.getByRole('menu').waitFor({state:'detached'});
    assert.equal(await create.getAttribute('aria-expanded'), 'false', 'A second click closes the New project menu');
    checks.push('create bar is steady, shows record actions at rest, and New project toggles its menu');

    // The library is a sheet of frames: no box around a project, media in a black edge, facts in edge print.
    const frame = page.locator('.project-card', {hasText:'Homepage motion study'});
    const sheet = await frame.evaluate(card => {
      const own = getComputedStyle(card), thumb = getComputedStyle(card.querySelector('.thumbnail')), meta = getComputedStyle(card.querySelector('.card-meta'));
      return {box:[own.backgroundColor, own.borderTopWidth, own.boxShadow].join(' '), edge:thumb.backgroundColor, print:[meta.fontStretch, meta.textTransform].join(' '), length:card.querySelector('.duration').textContent};
    });
    assert.deepEqual(sheet, {box:'rgba(0, 0, 0, 0) 0px none', edge:'rgb(12, 13, 16)', print:'78% uppercase', length:'4:32'});
    assert.equal(await page.locator('.rail').getByRole('button', {name:'Homepage motion study', exact:true}).count(), 1, 'The rail and the frame use the same name');
    assert.equal(await page.locator('.page-count').innerText(), '8 PROJECTS');
    // Keyboard: arrows move between frames, Space selects, and the selection bar replaces the filters.
    await frame.locator('.card-title').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Homepage motion study');
    await page.keyboard.press(' ');
    await page.getByText('1 selected', {exact:true}).waitFor();
    // The ring fades in, so wait for it to arrive at the pencil colour.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.project-card.is-selected .card-frame')).outlineColor === 'rgb(75, 82, 207)');
    await page.getByRole('button', {name:'Clear selection', exact:true}).click();
    await page.getByRole('tab', {name:/^Needs attention/}).click();
    assert.equal(await page.locator('.project-card').count(), 1);
    assert.equal(await page.locator('.thumbnail.is-rejected').count(), 1, 'A failed project carries the reject mark');
    await page.getByRole('button', {name:'Retry', exact:true}).waitFor();
    assert.equal(await page.locator('.page-count').innerText(), '1 OF 8');
    await page.getByRole('tab', {name:/^All/}).click();
    await page.locator('input[aria-label="Search projects"]').fill('zzzz');
    await page.getByRole('heading', {name:"No projects match 'zzzz'.", level:2, exact:true}).waitFor();
    await page.getByRole('button', {name:'Clear search', exact:true}).last().click();
    await page.locator('.project-card').first().waitFor();
    await page.getByRole('button', {name:'List view', exact:true}).click();
    assert.equal(await page.locator('.project-table tbody tr').count(), before);
    await page.getByRole('button', {name:'Grid view', exact:true}).click();
    checks.push('the library shows frames without boxes, the same names as the rail, keyboard selection, the reject mark and both views');

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

    // A bare domain is what people type; it must not be refused for lacking https://.
    await page.setViewportSize({width:1440, height:900});
    await page.getByRole('button', {name:'New project', exact:true}).click();
    await page.getByRole('menuitem', {name:/^Analyze a website/}).click();
    const site = page.getByRole('dialog', {name:'Analyze a website', exact:true});
    await site.getByLabel(/Website URL/).fill('example.com');
    await site.getByRole('button', {name:'Analyze website', exact:true}).click();
    await page.getByRole('heading', {name:'example.com design review', level:1, exact:true}).waitFor();
    checks.push('Analyze a website accepts a bare domain');

    // A large workspace: 3,000 generated projects on top of the samples. One page of frames is ever on screen.
    const large = await browser.newPage({viewport:{width:1440, height:900}});
    large.on('pageerror', error => errors.push(error.message));
    large.setDefaultTimeout(15000);
    await large.addInitScript(() => localStorage.setItem('vistralo-demo-scale', '3000'));
    const started = Date.now();
    await large.goto(app.origin + '/#demo/projects');
    await large.locator('.project-card').first().waitFor();
    const firstFrame = Date.now() - started;
    assert.ok(firstFrame < 5000, `The first frames of a large workspace appear promptly (${firstFrame} ms)`);
    await large.locator('.page-count', {hasText:/^3,0\d\d projects$/i}).waitFor();
    const size = Number((await large.locator('.page-count').innerText()).replace(/\D/g, ''));
    assert.ok(size >= 3008, 'Every project is counted once the background read finishes');
    assert.equal(await large.locator('.project-card').count(), 48, 'One page of frames is rendered, not the whole workspace');
    assert.ok(await large.evaluate(() => document.querySelectorAll('*').length) < 6000, 'The page stays light');
    const pager = large.getByRole('navigation', {name:'Project pages', exact:true});
    await pager.getByText(/^1 to 48 of 3,0\d\d/).waitFor();
    await large.evaluate(() => document.querySelector('main').scrollIntoView({block:'end'}));
    await pager.getByRole('button', {name:'Next', exact:true}).click();
    await pager.getByText(/^49 to 96 of 3,0\d\d/).waitFor();
    assert.equal(await large.locator('.project-card').count(), 48);
    assert.equal(await pager.getByRole('button', {name:'Previous', exact:true}).isEnabled(), true);
    // Search runs over what is already in the browser, so it answers at once at this size.
    const typed = Date.now();
    await large.locator('input[aria-label="Search projects"]').fill('Invoice teardown');
    await large.locator('.page-count', {hasText:/^\d+ of 3,0\d\d$/i}).waitFor();
    const searched = Date.now() - typed;
    assert.ok(searched < 1500, `Search across a large workspace answers quickly (${searched} ms)`);
    const matches = await large.locator('.card-title').allInnerTexts();
    assert.ok(matches.length > 0 && matches.every(name => /Invoice teardown/.test(name)), 'Only matching projects are shown');
    assert.equal(await large.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await large.close();
    checks.push(`a workspace of ${size} projects shows its first frames in ${firstFrame} ms, renders one page of 48, pages and searches (${searched} ms)`);

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
