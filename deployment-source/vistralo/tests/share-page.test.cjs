'use strict';
// What a share link shows is worked out by supabase/functions/_shared/share-page.ts, which the
// vistralo-share function and the app's /watch page both use. These tests run that module in Node;
// the function's entry file, which needs Deno and the database, is not run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {buildSync} = require('esbuild');

const code = buildSync({entryPoints:[path.join(__dirname, '../supabase/functions/_shared/share-page.ts')], bundle:true, write:false, platform:'browser', format:'cjs'}).outputFiles[0].text;
const module_ = {exports:{}};
vm.runInNewContext(code, {module:module_, exports:module_.exports});
const {briefToHtml, shareContent, shareJson, shareJsonHeaders, watchUrl, SHARE_TOKEN, escapeHtml} = module_.exports;
const plain = value => JSON.parse(JSON.stringify(value));

const OWNER = '7f1c2d1e-58a4-4c5b-9a57-3f6f0a4f2b11', PROJECT = '0b0f6f8e-1c2d-4e3f-8a9b-1c2d3e4f5a6b';
const inFolder = name => `${OWNER}/${PROJECT}/${name}`;
const TOKEN = 'ab'.repeat(32);

test('a link opens the app\'s /watch page, with the token where no server sees it', () => {
  assert.equal(watchUrl('https://app.vistralo.com', TOKEN), `https://app.vistralo.com/watch#${TOKEN}`);
  assert.equal(watchUrl('https://app.vistralo.com/', TOKEN), `https://app.vistralo.com/watch#${TOKEN}`);
  assert.ok(SHARE_TOKEN.test(TOKEN));
  for (const bad of ['', 'AB'.repeat(32), 'ab'.repeat(31), 'ab'.repeat(32) + 'a', 'zz'.repeat(32)]) assert.equal(SHARE_TOKEN.test(bad), false, bad);
  // The app makes its links the same way.
  assert.match(fs.readFileSync(path.join(__dirname, '../web/cloud.ts'), 'utf8'), /url:`\$\{location\.origin\}\/watch#\$\{token\}`/);
});

test('the function answers in JSON that any page may read and nothing may cache or index', () => {
  assert.equal(shareJsonHeaders['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(shareJsonHeaders['Access-Control-Allow-Origin'], '*');
  assert.equal(shareJsonHeaders['Cache-Control'], 'no-store');
  assert.equal(shareJsonHeaders['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(shareJsonHeaders['Referrer-Policy'], 'no-referrer');
  // A browser opening an old supabase.co address is sent on to /watch, because the gateway will not serve HTML there.
  const fn = fs.readFileSync(path.join(__dirname, '../supabase/functions/vistralo-share/index.ts'), 'utf8');
  assert.match(fn, /status: 302/);
  assert.match(fn, /searchParams\.get\("format"\) !== "json"/);
  assert.equal(/text\/html/.test(fn), false, 'the function no longer returns a page');
});

test('the JSON carries what the page needs and nothing else', () => {
  const film = inFolder('job/out.mp4'), take = inFolder('take.webm');
  const files = {[film]:{size:1}, [take]:{size:1}};
  const ready = shareContent({name:'Onboarding', type:'walkthrough', status:'ready', video:take, data:{output:{file:film}, narratedVideo:film, files}}, OWNER, PROJECT);
  assert.deepEqual(plain(shareJson(ready, 'https://x.supabase.co/v.mp4', '2026-10-20T09:00:00Z')),
    {name:'Onboarding', type:'walkthrough', mediaUrl:'https://x.supabase.co/v.mp4', narrated:true, working:false, expiresAt:'2026-10-20T09:00:00Z'});
  // The storage path is never sent: only the signed address made for this request.
  assert.equal(JSON.stringify(shareJson(ready, 'https://x', 'z')).includes(OWNER), false);
  const brief = shareContent({name:'Brief', type:'brief', data:{brief:'# Hi'}}, OWNER, PROJECT);
  assert.deepEqual(plain(shareJson(brief, undefined, 'z')), {name:'Brief', type:'brief', brief:'# Hi', expiresAt:'z'});
  const huge = shareContent({name:'Big', type:'brief', data:{brief:'x'.repeat(2 * 1024 * 1024)}}, OWNER, PROJECT);
  assert.equal(shareJson(huge, undefined, 'z').brief.length, 1024 * 1024);
});

test('a brief cannot inject markup', () => {
  const html = briefToHtml('# Title <script>alert(1)</script>\n\n<b>bold</b> and [a link](javascript:alert(1)) and [ok](https://example.com/a?b=1&c="2")\n\n<img src=x onerror=alert(1)>');
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<b>'), false);
  assert.equal(html.includes('href="javascript:'), false);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('<a href="https://example.com/a?b=1&amp;c=&quot;2&quot;" rel="noopener noreferrer nofollow">ok</a>'));
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('a brief is rendered as headings, paragraphs, lists and code, one level below the page title', () => {
  const html = briefToHtml('# Storefront\n\nA calm page with **one** accent.\nSecond line.\n\n## Type\n- `Inter` for text\n- large headline\n\n1. First\n2. Second\n\n```\nconst a = "<b>";\n```\n');
  assert.equal(html, [
    '<h2>Storefront</h2>',
    '<p>A calm page with <strong>one</strong> accent. Second line.</p>',
    '<h3>Type</h3>',
    '<ul>', '<li><code>Inter</code> for text</li>', '<li>large headline</li>', '</ul>',
    '<ol>', '<li>First</li>', '<li>Second</li>', '</ol>',
    '<pre>const a = &quot;&lt;b&gt;&quot;;</pre>',
  ].join('\n'));
});

test('a link shows the finished film, or the recording until the film exists, and only from the owner\'s own folder', () => {
  const film = inFolder('job/out.mp4'), take = inFolder('take.webm');
  const files = {[film]:{size:1}, [take]:{size:1}};
  assert.deepEqual(plain(shareContent({name:'A', type:'walkthrough', status:'ready', video:take, data:{output:{file:film}, narratedVideo:film, files}}, OWNER, PROJECT)),
    {name:'A', type:'walkthrough', file:film, narrated:true, working:false, brief:''});
  assert.deepEqual(plain(shareContent({name:'A', status:'processing', video:take, data:{files}}, OWNER, PROJECT)),
    {name:'A', type:'walkthrough', file:take, narrated:false, working:true, brief:''}, 'a link made as recording stopped plays the recording');
  assert.equal(shareContent({name:'A', status:'draft', video:take, data:{files}}, OWNER, PROJECT).working, false);
  // Media outside this project's folder, or not in its file list, is never served.
  const other = `${OWNER}/another-project/secret.mp4`;
  assert.equal(shareContent({name:'A', video:other, data:{files:{[other]:{size:1}}}}, OWNER, PROJECT), null);
  assert.equal(shareContent({name:'A', video:inFolder('../../x.mp4'), data:{files:{[inFolder('../../x.mp4')]:{size:1}}}}, OWNER, PROJECT), null);
  assert.equal(shareContent({name:'A', video:take, data:{files:{}}}, OWNER, PROJECT), null);
  assert.equal(shareContent({name:'A', trashed:true, video:take, data:{files}}, OWNER, PROJECT), null, 'a project in Trash shares nothing');
  assert.equal(shareContent(null, OWNER, PROJECT), null);
  assert.deepEqual(plain(shareContent({name:'Brief', type:'brief', data:{brief:'# Hi'}}, OWNER, PROJECT)), {name:'Brief', type:'brief', file:'', narrated:false, working:false, brief:'# Hi'});
});
