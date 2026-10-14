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

    // One Record button, in the same place on every page, and beside it every other way to start.
    const record = page.locator('.rail').getByRole('button', {name:'Record', exact:true});
    const create = page.getByRole('button', {name:'New project', exact:true});
    assert.equal(await record.isVisible(), true, 'Record shows without hovering');
    assert.equal(await record.getAttribute('aria-description'), 'Record an AI walkthrough');
    assert.equal(await record.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(212, 42, 31)', 'Record is the one red control');
    assert.equal(await page.locator('.create-dock').count(), 0, 'Nothing floats over the library');
    const resting = await record.boundingBox();
    await page.mouse.move(resting.x + 300, resting.y + 300);
    await page.mouse.move(resting.x + 20, resting.y + 10, {steps:5});
    assert.deepEqual(await record.boundingBox(), resting, 'Record does not move as the pointer approaches');
    await create.click();
    for (const name of [/^Record an AI walkthrough/, /^Record a talk-through/, /^Record a section/, /^Narrate a video/, /^Narrate screenshots/, /^Analyze a website/])
      await page.getByRole('menuitem', {name}).waitFor();
    await create.click();
    await page.getByRole('menu').waitFor({state:'detached'});
    assert.equal(await create.getAttribute('aria-expanded'), 'false', 'A second click closes the New project menu');
    await page.keyboard.press('n');
    await page.getByRole('menuitem', {name:/^Narrate a video/}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({state:'detached'});
    checks.push('Record is always in view and steady, and New project (or N) lists all six ways to start');

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

    // A project's page: the player first, Share in the header, then the sheet of numbered screens.
    await page.locator('.project-card', {hasText:'Homepage motion study'}).locator('.card-title').click();
    await page.getByRole('heading', {name:'Homepage motion study', level:1, exact:true}).waitFor();
    assert.equal(await page.evaluate(() => scrollY), 0, 'A page opens at its top');
    const sheetRegion = page.getByRole('region', {name:/^Screens/});
    await sheetRegion.waitFor();
    assert.equal(await sheetRegion.getByRole('listitem').count(), 3);
    const order = await page.evaluate(() => [document.querySelector('.flow-stage video'), document.querySelector('.screen-sheet')].map(node => node.getBoundingClientRect().top));
    assert.ok(order[0] < order[1], 'The player comes before the sheet');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.flow-stage video')).backgroundColor), 'rgb(12, 13, 16)', 'The film sits in the black edge');
    await page.waitForFunction(() => document.querySelector('.flow-stage video').readyState >= 1);
    await sheetRegion.getByRole('button', {name:'Play screen 2, at 0:04', exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.flow-stage video').currentTime >= 4);
    assert.equal(await sheetRegion.locator('li[aria-current="true"] .sheet-number').innerText(), '02', 'The screen being spoken is marked');
    await page.evaluate(() => document.querySelector('.flow-stage video').pause());
    await page.locator('.flow-actions').getByRole('button', {name:'Share', exact:true}).click();
    const shareSheet = page.getByRole('dialog', {name:'Share Homepage motion study', exact:true});
    await shareSheet.waitFor();
    await page.keyboard.press('Escape');
    await shareSheet.waitFor({state:'detached'});
    await page.setViewportSize({width:390, height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'The project page fits a phone');
    await page.setViewportSize({width:1440, height:900});

    // Trim: parts typed or marked from the player, drawn on the strip, and told apart when out of order.
    await page.getByRole('tab', {name:'Editor', exact:true}).click();
    await page.getByRole('heading', {name:'Trim the recording', level:2, exact:true}).waitFor();
    const parts = page.getByRole('list', {name:'Parts to keep', exact:true});
    await page.waitForFunction(() => document.querySelector('.trim .flow-stage video')?.readyState >= 1);
    // Play part 1 from where it starts, pause, and take its end from the player.
    await parts.getByLabel('Starts at (seconds)').first().fill('2');
    await page.getByRole('button', {name:'Play part 1', exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.trim .flow-stage video').currentTime >= 3);
    const paused = await page.evaluate(() => { const video = document.querySelector('.trim .flow-stage video'); video.pause(); return video.currentTime; });
    await page.getByRole('button', {name:/^Use \d:\d\d as the end of part 1$/}).click();
    assert.ok(Math.abs(Number(await parts.getByLabel('Ends at (seconds)').first().inputValue()) - paused) < 0.5, 'The end is taken from the player');
    await parts.getByLabel('Ends at (seconds)').first().fill('5');
    await page.getByRole('button', {name:'Add a part', exact:true}).click();
    assert.equal(await parts.getByLabel('Starts at (seconds)').nth(1).inputValue(), '5', 'A new part starts where the last one ended');
    await parts.getByLabel('Starts at (seconds)').nth(1).fill('4');
    await parts.getByLabel('Ends at (seconds)').nth(1).fill('8');
    await parts.getByText('This part starts before part 1 ends. Keep the parts in order.', {exact:true}).waitFor();
    assert.equal(await parts.getByLabel('Starts at (seconds)').nth(1).getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('.trim-span').count(), 1, 'Only parts that can be saved are drawn on the strip');
    await parts.getByLabel('Starts at (seconds)').nth(1).fill('6');
    await page.locator('.trim-summary', {hasText:'Keeps 2 parts · 0:05 of 0:12'}).waitFor();
    assert.equal(await page.locator('.trim-span').count(), 2);
    await page.setViewportSize({width:390, height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Trim fits a phone');
    await page.setViewportSize({width:1440, height:900});
    await page.getByRole('button', {name:'Remove part 2', exact:true}).click();
    await page.locator('.trim-summary', {hasText:'Keeps 1 part · 0:03 of 0:12'}).waitFor();

    // Leaving with a plan that was never saved asks first.
    await page.getByRole('navigation', {name:'Breadcrumb', exact:true}).getByRole('button', {name:'Projects', exact:true}).click();
    await page.getByRole('dialog', {name:'Discard unsaved edits?'}).getByRole('button', {name:'Discard and leave', exact:true}).click();
    await page.locator('.project-card').first().waitFor();
    checks.push('a project opens with the player first, Share in its header, and a sheet of screens that plays from the one chosen');
    checks.push('trim parts can be marked from the player, are drawn on a strip, and say when they are out of order');

    // The Visual brief reads as a document with its sections beside it, and is edited as Markdown.
    await page.locator('.project-card', {hasText:'Storefront design review'}).locator('.card-title').click();
    await page.getByRole('tab', {name:'Visual brief', exact:true}).click();
    const contents = page.getByRole('navigation', {name:'Sections of this brief', exact:true});
    await contents.getByRole('button', {name:'Accessibility references', exact:true}).click();
    await page.waitForFunction(() => document.activeElement?.id === 'brief-accessibility-references');
    await page.getByRole('button', {name:'Edit', exact:true}).click();
    await page.getByLabel('Brief in Markdown', {exact:true}).fill('# Storefront\n\n## Type\n- `Inter` for text\n- **one** accent\n\n```\n<script>alert(1)</script>\n```\n');
    await page.getByText('Unsaved changes', {exact:true}).waitFor();
    await page.getByRole('button', {name:'Read', exact:true}).click();
    const doc = page.locator('.brief-doc');
    assert.equal(await doc.locator('ul > li').count(), 2);
    assert.equal(await doc.locator('code', {hasText:'Inter'}).count(), 1);
    assert.equal(await doc.locator('strong', {hasText:'one'}).count(), 1);
    assert.equal(await doc.locator('script').count(), 0, 'A brief never becomes markup');
    assert.equal(await doc.locator('pre').innerText(), '<script>alert(1)</script>');
    // The sample brief is left as it was: the edit is discarded on the way out.
    await page.getByRole('navigation', {name:'Breadcrumb', exact:true}).getByRole('button', {name:'Projects', exact:true}).click();
    await page.getByRole('dialog', {name:'Discard unsaved edits?'}).getByRole('button', {name:'Discard and leave', exact:true}).click();
    await page.locator('.project-card').first().waitFor();
    checks.push('the Visual brief lists its sections and renders lists and code as text, never as markup');

    // Settings is a page with an address, not a window over the page.
    await page.locator('.rail-footer').getByRole('button', {name:'Settings', exact:true}).click();
    await page.getByRole('heading', {name:'Settings', level:1, exact:true}).waitFor();
    assert.match(new URL(page.url()).hash, /^#demo\/settings$/);
    assert.equal(await page.getByRole('dialog').count(), 0, 'Settings opens no dialog');
    await page.getByRole('button', {name:'Check', exact:true}).click();
    await page.getByRole('tabpanel').getByRole('status').filter({hasText:/^(Demo mode|Connected|Checked)/}).waitFor();
    await page.getByRole('tab', {name:'Profile', exact:true}).click();
    assert.match(new URL(page.url()).hash, /^#demo\/settings\/profile$/);
    await page.getByLabel('Name', {exact:true}).fill('Rana Ahmed');
    await page.getByRole('button', {name:'Save profile', exact:true}).click();
    await page.locator('.toast-message', {hasText:'Profile saved'}).waitFor();
    await page.locator('.account-row strong', {hasText:'Rana Ahmed'}).waitFor();
    await page.goBack();
    await page.getByRole('tab', {name:'General', exact:true, selected:true}).waitFor();
    checks.push('Settings is a page with its own address and sections, and the profile saves from it');

    // A project left uploading for days says so, counts as needing attention, and offers the way out.
    await page.evaluate(() => {
      const key = 'vistralo-demo-workspace:v1', store = JSON.parse(localStorage.getItem(key));
      const stale = store.projects.find(project => project.id === 'demo-design-handoff');
      stale.updated = stale.eventAt = new Date(Date.now() - 3 * 86400000).toISOString();
      localStorage.setItem(key, JSON.stringify(store));
      location.hash = 'demo/projects';
    });
    await page.reload();
    const stalledCard = page.locator('.project-card', {hasText:'Design system handoff'});
    await stalledCard.locator('.status-stalled', {hasText:'Stalled'}).waitFor();
    assert.equal(await stalledCard.locator('.frame-blank span').innerText(), 'No change for 3 days');
    assert.equal(await stalledCard.locator('progress:indeterminate').count(), 0, 'A stalled frame does not pretend to be working');
    assert.match(await page.getByRole('tab', {name:/^Needs attention/}).innerText(), /2$/, 'Stalled work is counted with what needs attention');
    await stalledCard.getByRole('button', {name:'Resolve', exact:true}).click();
    const stalledNotice = page.getByRole('region', {name:'This project has stalled', exact:true});
    await stalledNotice.getByText(/^No change for 3 days\. The upload stopped/).waitFor();
    await stalledNotice.getByRole('button', {name:'Choose the file again', exact:true}).waitFor();
    await stalledNotice.getByRole('button', {name:'Move to Trash', exact:true}).click();
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    // Undo belongs to the message that offered it.
    const moved = page.locator('.toast', {hasText:'Moved to Trash'});
    await moved.waitFor();
    await page.locator('.project-card', {hasText:'Design system handoff'}).waitFor({state:'detached'});
    await page.locator('.rail').getByRole('button', {name:'Trash', exact:true}).click();
    await page.locator('.project-card', {hasText:'Design system handoff'}).getByRole('button', {name:/^More actions/}).click();
    await page.getByRole('menuitem', {name:'Restore', exact:true}).click();
    await page.locator('.toast-message', {hasText:'Project restored'}).waitFor();
    assert.equal(await page.locator('.toast').getByRole('button', {name:'Undo', exact:true}).count(), 0, 'Undo is not carried onto a later message');
    await page.locator('.rail').getByRole('button', {name:'Projects', exact:true}).click();
    await page.locator('.project-card', {hasText:'Design system handoff'}).waitFor();
    checks.push('a project stalled for three days says so, counts as needing attention, and can be resolved, trashed and restored');

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

    // A real take against a stand-in screen: a canvas plays the part of the shared tab, so the
    // recorder, its count-in and its controls all run for real. Only the browser's picker is faked.
    const studio = await browser.newContext({viewport:{width:1440, height:900}, permissions:['clipboard-read', 'clipboard-write']});
    await studio.addInitScript(() => {
      window.__pickerCalls = 0;
      navigator.mediaDevices.getDisplayMedia = async () => {
        window.__pickerCalls++;
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const context = canvas.getContext('2d');
        let frame = 0;
        const draw = () => { context.fillStyle = frame++ % 2 ? '#203040' : '#402030'; context.fillRect(0, 0, 640, 360); context.fillStyle = '#ffffff'; context.font = '48px sans-serif'; context.fillText(String(frame), 40, 90); };
        draw();
        setInterval(draw, 100);
        const stream = canvas.captureStream(15), track = stream.getVideoTracks()[0], settings = track.getSettings.bind(track);
        track.getSettings = () => ({...settings(), displaySurface:'browser', width:640, height:360});
        return stream;
      };
    });
    const take = await studio.newPage();
    take.on('pageerror', error => errors.push(error.message));
    take.on('console', message => { if (/Content Security Policy/i.test(message.text())) errors.push(message.text()); });
    take.setDefaultTimeout(20000);
    await take.goto(app.origin + '/#demo/projects');
    await take.locator('.project-card').first().waitFor();
    const startRecording = () => take.locator('.rail').getByRole('button', {name:'Record', exact:true}).click();
    const tray = take.getByRole('group', {name:'Recording controls', exact:true});
    const counting = take.getByText(/^Recording starts in [123]/);
    const stop = take.getByRole('button', {name:'Stop', exact:true});
    const icon = () => take.evaluate(() => document.querySelector('link[rel="icon"]').getAttribute('href'));
    const restingIcon = await icon(), restingTitle = await take.title();

    // One click reaches the picker; then three, two, one before anything is recorded.
    const clicked = Date.now();
    await startRecording();
    await counting.waitFor();
    assert.equal(await take.evaluate(() => window.__pickerCalls), 1, 'One click on Record asks the browser what to share');
    assert.match(await take.title(), /^[123] · Recording starts$/, 'The tab says the count-in is running');
    await stop.waitFor();
    const counted = Date.now() - clicked;
    assert.ok(counted >= 2900, `Recording waits for the count-in (${counted} ms)`);
    assert.equal(await take.title(), 'Recording · Vistralo');
    assert.match(await icon(), /^data:image\/svg\+xml,/, 'The tab icon turns into a recording dot');
    await take.evaluate(require('axe-core').source);
    // Entrance animations fade in; a scan taken mid-fade would measure the fade, not the design.
    const scanTake = async () => take.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
      return (await axe.run(document, {runOnly:{type:'tag', values:['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']}})).violations.map(v => ({id:v.id, nodes:v.nodes.map(n => n.target)}));
    });
    assert.deepEqual(await scanTake(), [], 'The recording controls pass axe');
    for (const name of ['Pause recording', 'Start over', 'Discard this take'])
      assert.equal(await tray.getByRole('button', {name, exact:true}).isVisible(), true, name + ' is in view without hovering');

    await tray.getByRole('button', {name:'Pause recording', exact:true}).click();
    await tray.getByRole('button', {name:'Resume recording', exact:true}).waitFor();
    assert.equal(await take.title(), 'Paused · Vistralo');
    await tray.getByRole('button', {name:'Resume recording', exact:true}).click();
    await tray.getByRole('button', {name:'Pause recording', exact:true}).waitFor();

    // Starting over asks once, in place, and keeps recording if the answer is no.
    await tray.getByRole('button', {name:'Start over', exact:true}).click();
    const ask = take.getByRole('alertdialog', {name:'Start over?', exact:true});
    await ask.getByText('Start over? This take is not kept.', {exact:true}).waitFor();
    assert.deepEqual(await scanTake(), [], 'The start-over question passes axe');
    assert.equal(await take.evaluate(() => document.activeElement.textContent), 'Keep recording', 'The safe answer has the focus');
    await ask.getByRole('button', {name:'Keep recording', exact:true}).click();
    await stop.waitFor();
    await take.waitForFunction(() => /0:0[2-9]/.test(document.querySelector('.rec-tray time')?.textContent || ''));
    await tray.getByRole('button', {name:'Start over', exact:true}).click();
    await ask.getByRole('button', {name:'Start over', exact:true}).click();
    await counting.waitFor();
    await stop.waitFor();
    assert.equal(await take.evaluate(() => window.__pickerCalls), 1, 'Starting over keeps the same shared screen');
    assert.match(await take.locator('.rec-tray time').innerText(), /^0:0[01]$/, 'The new take starts from zero');

    // Stop saves the take and opens it, with the share link offered before anything else.
    await take.waitForTimeout(1200);
    await stop.click();
    const saved = take.getByRole('region', {name:'Your recording is saved', exact:true});
    await saved.waitFor({timeout:30000});
    assert.match(new URL(take.url()).hash, /^#demo\/project\//, 'Stopping lands on the recording\'s own page');
    // The recording names itself by what it is and when, not by a raw timestamp.
    const takeName = await take.getByRole('heading', {level:1}).innerText();
    assert.match(takeName, /^Walkthrough, /);
    assert.equal(/\dT\d\d|Z$/.test(takeName), false, takeName);
    assert.equal(await take.locator('.rail').getByRole('button', {name:takeName, exact:true}).count(), 1, 'The rail lists it under the same name');
    assert.equal(await take.title(), restingTitle, 'The tab title is put back');
    assert.equal(await icon(), restingIcon, 'The tab icon is put back');
    assert.deepEqual(await scanTake(), [], 'The saved-recording page passes axe');
    await saved.getByRole('button', {name:'Copy share link', exact:true}).click();
    await saved.getByText('Link copied.', {exact:true}).waitFor();
    const shared = await saved.getByLabel('Share link', {exact:true}).inputValue();
    assert.match(shared, /#demo\/share\/demo-share-/);
    assert.equal(await take.evaluate(() => navigator.clipboard.readText()), shared, 'The link is on the clipboard');
    await saved.getByRole('button', {name:'Dismiss', exact:true}).click();
    await saved.waitFor({state:'detached'});
    checks.push(`one click reaches the picker, recording waits ${counted} ms for the count-in, pause and start over work, and stopping opens the recording with its share link`);

    // Discard ends the take and saves nothing. Escape during the count-in stops before it starts.
    await take.getByRole('navigation', {name:'Breadcrumb', exact:true}).getByRole('button', {name:'Projects', exact:true}).click();
    await take.locator('.project-card').first().waitFor();
    const held = await take.locator('.page-count').innerText();
    await startRecording();
    await stop.waitFor();
    await tray.getByRole('button', {name:'Discard this take', exact:true}).click();
    await take.getByRole('alertdialog', {name:'Discard this take?', exact:true}).getByRole('button', {name:'Discard', exact:true}).click();
    await take.locator('dialog.flow-dialog').waitFor({state:'detached'});
    assert.equal(await take.locator('.page-count').innerText(), held, 'A discarded take leaves no project behind');
    assert.equal(await take.title(), restingTitle);
    await startRecording();
    await counting.waitFor();
    await take.keyboard.press('Escape');
    await take.getByRole('button', {name:'Choose what to record', exact:true}).waitFor();
    assert.equal(await stop.count(), 0, 'Nothing is recorded after the count-in is cancelled');
    await studio.close();
    checks.push('discarding a take saves nothing, and Escape during the count-in stops before recording starts');

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
