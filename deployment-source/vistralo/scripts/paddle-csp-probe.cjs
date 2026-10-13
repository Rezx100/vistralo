'use strict';
// Finds the hosts Paddle's sandbox checkout needs in the Content Security Policy by measuring, not guessing.
// It serves a one-file page with the policy from vercel.json in report-only mode (so nothing is blocked and
// every would-be violation is reported), loads Paddle.js the way web/billing/paddle.ts does, asks for
// prices, opens a checkout, and prints each violated directive with the host that caused it.
//
//   VISTRALO_PADDLE_CLIENT_TOKEN=test_... VISTRALO_PADDLE_PRICE_PRO_MONTH=pri_... node scripts/paddle-csp-probe.cjs
//
// Without a real sandbox token Paddle refuses the checkout early, so the list is incomplete: run it again
// with the token before turning VISTRALO_BILLING on. Set VISTRALO_TEST_CHROMIUM to use an installed Chrome.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

// --enforce applies the policy for real, to confirm the checkout still appears once the hosts are in vercel.json.
const enforce = process.argv.includes('--enforce');
const token = process.env.VISTRALO_PADDLE_CLIENT_TOKEN || '';
const price = process.env.VISTRALO_PADDLE_PRICE_PRO_MONTH || '';
if (token && !token.startsWith('test_')) throw Error('Use a sandbox client-side token (test_...). This probe never runs against live.');
const policy = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'vercel.json'), 'utf8')).headers
  .flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy').value;

const page = '<!doctype html><meta charset="utf-8"><title>Paddle CSP probe</title><link rel="stylesheet" href="/billing.css"><script src="/probe.js"></script>';
const probe = `
  window.probe = {violations: [], events: [], errors: []};
  document.addEventListener('securitypolicyviolation', e => probe.violations.push({directive: e.effectiveDirective, blocked: e.blockedURI, sample: e.sample}));
  window.run = (token, price) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.onerror = () => reject(new Error('Paddle.js could not be loaded'));
    script.onload = async () => {
      Paddle.Environment.set('sandbox');
      Paddle.Initialize({token, eventCallback: event => probe.events.push(event.name)});
      try { await Paddle.PricePreview({items: [{priceId: price, quantity: 1}]}); } catch (error) { probe.errors.push('PricePreview: ' + (error && error.message || JSON.stringify(error)).slice(0, 200)); }
      try { Paddle.Checkout.open({items: [{priceId: price, quantity: 1}], settings: {displayMode: 'overlay', theme: 'dark', locale: 'en', allowLogout: false}}); } catch (error) { probe.errors.push('Checkout.open: ' + error.message); }
      resolve();
    };
    document.head.append(script);
  });`;

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader(enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', policy);
    // The app's own rule for Paddle's frame is part of what is being checked.
    if (req.url === '/billing.css') { res.setHeader('Content-Type', 'text/css'); return res.end(fs.readFileSync(path.resolve(__dirname, '..', 'web/billing/billing.css'))); }
    res.setHeader('Content-Type', req.url === '/probe.js' ? 'text/javascript' : 'text/html; charset=utf-8');
    res.end(req.url === '/probe.js' ? probe : page);
  });
  await new Promise(resolve => server.listen(Number(process.env.VISTRALO_UI_TEST_PORT || 8792), '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless: true, ...(process.env.VISTRALO_TEST_CHROMIUM ? {executablePath: process.env.VISTRALO_TEST_CHROMIUM} : {})});
  try {
    const tab = await browser.newPage();
    const requested = new Set();
    tab.on('request', request => { const url = new URL(request.url()); if (url.origin !== origin && /^https?:$/.test(url.protocol)) requested.add(`${request.frame() === tab.mainFrame() ? 'page' : 'frame'} ${request.resourceType()} ${url.origin}`); });
    await tab.goto(origin + '/');
    await tab.evaluate(([t, p]) => window.run(t, p), [token || 'test_00000000000000000000000000', price || 'pri_01aaaaaaaaaaaaaaaaaaaaaaaa']);
    // The checkout frame keeps loading after open() returns.
    await tab.waitForTimeout(Number(process.env.VISTRALO_PROBE_WAIT_MS || 12000));
    const result = await tab.evaluate(() => window.probe);
    const frame = await tab.evaluate(() => {
      const element = document.querySelector('iframe');
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {position: getComputedStyle(element).position, width: Math.round(box.width), height: Math.round(box.height), viewport: innerWidth + 'x' + innerHeight};
    });
    const needed = {};
    for (const v of result.violations) {
      let host = v.blocked;
      try { host = new URL(v.blocked).origin; } catch { /* inline, eval, data: and blob: have no origin */ }
      (needed[v.directive] ||= new Set()).add(host);
    }
    console.log(token ? 'Sandbox token supplied.' : 'NO SANDBOX TOKEN: Paddle rejects the dummy token, so this list is incomplete.');
    console.log('\nPolicy violations (directive -> what to allow):');
    for (const [directive, hosts] of Object.entries(needed)) console.log(`  ${directive}: ${[...hosts].join(' ')}`);
    if (!Object.keys(needed).length) console.log('  none');
    const inline = result.violations.filter(v => v.blocked === 'inline');
    if (inline.length) {
      console.log('\nInline styles Paddle.js adds to the page (not a host; see docs/BILLING.md):');
      for (const v of inline) console.log('  ' + v.directive + ': ' + String(v.sample || '(no sample)').replace(/\s+/g, ' ').slice(0, 100));
    }
    console.log('\nPolicy ' + (enforce ? 'ENFORCED' : 'in report-only mode') + '. Checkout frame: ' + (frame ? JSON.stringify(frame) : 'not created'));
    console.log('\nCheckout events: '+ (result.events.join(', ') || 'none'));
    if (result.errors.length) console.log('Paddle errors: ' + result.errors.join(' | '));
    console.log('\nEvery request seen (frame requests are governed by Paddle\'s own policy, not ours):');
    for (const line of [...requested].sort()) console.log('  ' + line);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
