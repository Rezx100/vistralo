'use strict';
// The Chrome extension's state machine and message checks, and the web app's side of the hand-over.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

function load(file, globals = {}) {
  const bundled = buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, write: false, platform: 'browser', format: 'cjs' }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(bundled, { module, exports: module.exports, URL, Date, setTimeout, clearTimeout, ...globals });
  return module.exports;
}

const session = load('extension/src/session.ts');
const messages = load('extension/src/messages.ts');
const { recordedPage } = load('web/app/useExtensionImport.ts', { window: {}, crypto: {}, location: {} });

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const fresh = (over = {}) =>
  session.newSession({ id: ID, mode: 'tab', sourceTabId: 7, microphone: true, camera: false, title: 'Shop', url: 'https://shop.example/' }, 1000);

function run(events, start = fresh()) {
  let s = start;
  for (const e of events) {
    const next = session.reduce(s, e);
    if (next) s = next;
  }
  return s;
}

test('a take counts only recorded time: the count-in and pauses are left out', () => {
  const s = run([
    { type: 'countdown', at: 1000, countdownMs: 3000 },
    { type: 'started', at: 4000 },
    { type: 'pause', at: 9000 },
    { type: 'resume', at: 15000 },
    { type: 'stop', at: 17000 },
  ]);
  assert.equal(s.phase, 'stopping');
  assert.equal(s.elapsedMs, 7000);
  assert.equal(s.runningSince, null);
  assert.equal(session.elapsed(s, 99999), 7000, 'a stopped take does not keep counting');
});

test('the clock is read live while recording and held while paused', () => {
  const recording = run([{ type: 'started', at: 2000 }]);
  assert.equal(session.elapsed(recording, 5000), 3000);
  const paused = run([{ type: 'pause', at: 6000 }], recording);
  assert.equal(session.elapsed(paused, 60000), 4000);
});

test('repeated and late controls change nothing', () => {
  const stopping = run([{ type: 'started', at: 0 }, { type: 'stop', at: 1000 }]);
  for (const e of [{ type: 'stop', at: 2000 }, { type: 'pause', at: 2000 }, { type: 'resume', at: 2000 }, { type: 'restart', at: 2000, countdownMs: 0 }, { type: 'started', at: 2000 }])
    assert.equal(session.reduce(stopping, e), null, e.type);
  const ready = run([{ type: 'finalizing', at: 3000 }, { type: 'ready', at: 3500, bytes: 42 }], stopping);
  assert.equal(ready.phase, 'ready');
  assert.equal(session.reduce(ready, { type: 'cancel', at: 4000 }), null, 'a finished recording cannot be cancelled into nothing');
  assert.equal(session.reduce(ready, { type: 'fail', at: 4000, error: 'x' }), null);
  assert.equal(session.isActive(ready.phase), false);
});

test('start over begins a new take at zero with its own count-in', () => {
  const s = run([{ type: 'started', at: 0 }, { type: 'bytes', at: 500, bytes: 900 }, { type: 'restart', at: 5000, countdownMs: 3000 }]);
  assert.equal(s.phase, 'countdown');
  assert.equal(s.take, 2);
  assert.equal(s.elapsedMs, 0);
  assert.equal(s.bytes, 0);
  assert.equal(s.countdownEndsAt, 8000);
  assert.equal(run([{ type: 'started', at: 8000 }], s).phase, 'recording');
});

test('cancel works during the count-in and while recording, not while finishing', () => {
  assert.equal(run([{ type: 'countdown', at: 0, countdownMs: 3000 }, { type: 'cancel', at: 1 }]).phase, 'cancelled');
  assert.equal(run([{ type: 'started', at: 0 }, { type: 'cancel', at: 1 }]).phase, 'cancelled');
  const finishing = run([{ type: 'started', at: 0 }, { type: 'stop', at: 1 }, { type: 'finalizing', at: 2 }]);
  assert.equal(session.reduce(finishing, { type: 'cancel', at: 3 }), null);
});

test('a failure keeps the time recorded so far and says why', () => {
  const s = run([{ type: 'started', at: 0 }, { type: 'fail', at: 4000, error: 'Storage is full.' }]);
  assert.equal(s.phase, 'failed');
  assert.equal(s.elapsedMs, 4000);
  assert.equal(s.error, 'Storage is full.');
});

test('clock text', () => {
  assert.equal(session.formatClock(0), '0:00');
  assert.equal(session.formatClock(65_400), '1:05');
  assert.equal(session.formatClock(3_725_000), '1:02:05');
});

const options = { mode: 'tab', microphone: 'default', camera: null, bubble: true, bubbleSize: 'medium', systemAudio: true, countdown: true, openWhenDone: true };

test('start options are checked field by field', () => {
  assert.equal(messages.isStartOptions(options), true);
  assert.equal(messages.isStartOptions({ ...options, mode: 'desktop' }), false);
  assert.equal(messages.isStartOptions({ ...options, mode: 'camera' }), false, 'camera only needs a camera');
  assert.equal(messages.isStartOptions({ ...options, mode: 'camera', camera: 'abc' }), true);
  assert.equal(messages.isStartOptions({ ...options, microphone: '' }), false);
  assert.equal(messages.isStartOptions({ ...options, microphone: 'x'.repeat(300) }), false);
  assert.equal(messages.isStartOptions({ ...options, countdown: 'yes' }), false);
});

test('service worker requests are validated', () => {
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'start', tabId: 3, options }), true);
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'start', tabId: '3', options }), false);
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'control', action: 'stop' }), true);
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'control', action: 'delete' }), false);
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'staged', sessionId: '../x' }), false);
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'snapshot', snapshot: fresh() }), true);
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'snapshot', snapshot: { ...fresh(), phase: 'hacked' } }), false);
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'snapshot', snapshot: { ...fresh(), url: 'x'.repeat(5000) } }), false);
  assert.equal(messages.isBackgroundRequest({ to: 'engine', type: 'control', action: 'stop' }), false);
  assert.equal(messages.isBackgroundRequest(null), false);
});

test('engine requests must carry the session they are for', () => {
  const begin = { to: 'engine', type: 'begin', sessionId: ID, streamId: 'abc', options, snapshot: fresh() };
  assert.equal(messages.isEngineRequest(begin), true);
  assert.equal(messages.isEngineRequest({ ...begin, snapshot: { ...fresh(), id: '11111111-1111-1111-1111-111111111111' } }), false);
  assert.equal(messages.isEngineRequest({ ...begin, streamId: '' }), false);
  assert.equal(messages.isEngineRequest({ to: 'engine', type: 'control', sessionId: ID, action: 'pause' }), true);
  assert.equal(messages.isEngineRequest({ to: 'engine', type: 'control', action: 'pause' }), false);
});

test('senders: only this extension counts, and content scripts are told apart from its pages', () => {
  const own = 'abcdefghijklmnopabcdefghijklmnop';
  const origin = `chrome-extension://${own}/`;
  assert.equal(messages.senderKind({ id: own, url: origin + 'popup.html' }, own, origin), 'extension');
  assert.equal(messages.senderKind({ id: own, url: 'https://shop.example/' }, own, origin), 'content');
  assert.equal(messages.senderKind({ id: 'someoneelse', url: origin + 'popup.html' }, own, origin), 'foreign');
});

test('the web app accepts only well-formed requests to the bridge', () => {
  const nonce = 'a'.repeat(32);
  assert.equal(messages.isAppMessage({ source: 'vistralo-app', type: 'import', id: ID, nonce }), true);
  assert.equal(messages.isAppMessage({ source: 'vistralo-app', type: 'import', id: ID, nonce: 'short' }), false);
  assert.equal(messages.isAppMessage({ source: 'other', type: 'import', id: ID, nonce }), false);
  assert.equal(messages.isAppMessage({ source: 'vistralo-app', type: 'ping' }), true);
  assert.equal(messages.isAppMessage({ source: 'vistralo-app', type: 'delete-all' }), false);
});

test('the recorded page is kept without its query or fragment', () => {
  assert.equal(recordedPage('https://shop.example/cart?token=secret#step-2'), 'https://shop.example/cart');
  assert.equal(recordedPage('file:///C:/private.html'), '');
  assert.equal(recordedPage('not a url'), '');
  assert.equal(recordedPage(42), '');
});

test('mute applies only to a take with a microphone, only while it is live, and only once', () => {
  const live = run([{ type: 'started', at: 0 }]);
  const muted = session.reduce(live, { type: 'mute', at: 1 });
  assert.equal(muted.muted, true);
  assert.equal(session.reduce(muted, { type: 'mute', at: 2 }), null, 'a second mute changes nothing');
  assert.equal(session.reduce(muted, { type: 'unmute', at: 3 }).muted, false);
  const silent = run([{ type: 'started', at: 0 }], session.newSession({ id: ID, mode: 'tab', sourceTabId: 1, microphone: false, camera: false, title: '', url: '' }, 0));
  assert.equal(session.reduce(silent, { type: 'mute', at: 1 }), null, 'nothing to mute without a microphone');
  const done = run([{ type: 'stop', at: 5 }, { type: 'finalizing', at: 6 }, { type: 'ready', at: 7, bytes: 1 }], muted);
  assert.equal(session.reduce(done, { type: 'unmute', at: 8 }), null);
  assert.equal(run([{ type: 'restart', at: 9, countdownMs: 0 }], muted).muted, true, 'start over keeps the microphone muted');
});

test('bubble sizes and meter messages are checked', () => {
  assert.equal(messages.isStartOptions({ ...options, bubbleSize: 'huge' }), false);
  assert.equal(messages.isStartOptions({ ...options, bubbleSize: 'small' }), true);
  assert.equal(messages.isMeterMessage({ to: 'meter', level: 0.4, muted: false }), true);
  assert.equal(messages.isMeterMessage({ to: 'meter', level: 4, muted: false }), false);
  assert.equal(messages.isMeterMessage({ to: 'meter', level: 0.4 }), false);
  assert.equal(messages.isBackgroundRequest({ to: 'background', type: 'control', action: 'mute' }), true);
});
