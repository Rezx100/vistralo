'use strict';
// The public share page is built by supabase/functions/_shared/share-page.ts. These tests run
// that module in Node; the function's entry file, which needs Deno and the database, is not run.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {buildSync} = require('esbuild');

const code = buildSync({entryPoints:[path.join(__dirname, '../supabase/functions/_shared/share-page.ts')], bundle:true, write:false, platform:'browser', format:'cjs'}).outputFiles[0].text;
const module_ = {exports:{}};
vm.runInNewContext(code, {module:module_, exports:module_.exports, crypto:crypto.webcrypto, TextEncoder, btoa, Date, Intl});
const {sharePage, unavailablePage, briefToHtml, styleHash, shareHeaders, shareContent, SHARE_STYLE, escapeHtml} = module_.exports;
const plain = value => JSON.parse(JSON.stringify(value));

const OWNER = '7f1c2d1e-58a4-4c5b-9a57-3f6f0a4f2b11', PROJECT = '0b0f6f8e-1c2d-4e3f-8a9b-1c2d3e4f5a6b';
const inFolder = name => `${OWNER}/${PROJECT}/${name}`;

test('the page allows one stylesheet by its hash and nothing inline, scripted or framed', async () => {
  const hash = await styleHash();
  assert.equal(hash, `'sha256-${crypto.createHash('sha256').update(SHARE_STYLE).digest('base64')}'`);
  const policy = shareHeaders(hash)['Content-Security-Policy'];
  assert.equal(policy.includes('unsafe-inline'), false);
  assert.equal(policy.includes('script-src'), false, "default-src 'none' already forbids scripts");
  assert.match(policy, /^default-src 'none'; style-src 'sha256-[A-Za-z0-9+/]+=*'; media-src https:\/\/\*\.supabase\.co; base-uri 'none'; frame-ancestors 'none'; form-action 'none'$/);
  const html = sharePage({name:'Checkout', type:'walkthrough', mediaUrl:'https://x.supabase.co/v.mp4?token=a'});
  // Exactly the hashed stylesheet is in the page, and no style attributes or scripts.
  assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], SHARE_STYLE);
  assert.equal(/<script|\son[a-z]+=|\sstyle=/i.test(html), false);
  assert.equal(shareHeaders(hash)['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(shareHeaders(hash)['Cache-Control'], 'no-store');
});

test('a project name and a brief cannot inject markup', () => {
  const html = sharePage({name:'<img src=x onerror=alert(1)>"&', type:'brief', brief:'# Title <script>alert(1)</script>\n\n<b>bold</b> and [a link](javascript:alert(1)) and [ok](https://example.com/a?b=1&c="2")'});
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<b>'), false);
  assert.equal(html.includes('href="javascript:'), false);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('<title>&lt;img src=x onerror=alert(1)&gt;&quot;&amp; · Vistralo</title>'));
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

test('the page says what the viewer is watching: an AI voice, or a recording still being narrated', () => {
  const base = {name:'Onboarding', type:'walkthrough', mediaUrl:'https://x.supabase.co/v.mp4', expiresAt:'2026-10-20T09:00:00Z'};
  const narrated = sharePage({...base, narrated:true});
  assert.ok(narrated.includes('Narrated by an AI voice.'));
  assert.ok(narrated.includes('Walkthrough · Link works until 20 October 2026'));
  assert.ok(narrated.includes('<video controls playsinline preload="metadata" src="https://x.supabase.co/v.mp4" aria-label="Onboarding">'));
  const working = sharePage({...base, working:true});
  assert.ok(working.includes('A narrated version is being prepared and will replace it at this address.'));
  assert.equal(working.includes('Narrated by an AI voice.'), false);
  const plainTake = sharePage(base);
  assert.equal(/Narrated by|being prepared/.test(plainTake), false);
  assert.equal((plainTake.match(/<h1>/g) || []).length, 1);
  assert.match(plainTake, /^<!doctype html>\n<html lang="en">/);
  assert.ok(plainTake.includes('<meta name="viewport" content="width=device-width,initial-scale=1">'));
  const gone = unavailablePage();
  assert.ok(gone.includes('<h1>This link is unavailable</h1>'));
  assert.equal(gone.includes('<video'), false);
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
