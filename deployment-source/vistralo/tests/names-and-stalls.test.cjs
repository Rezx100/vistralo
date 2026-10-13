'use strict';
// Automatic project names, and telling a stalled project from one that is merely working.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const {buildSync} = require('esbuild');

function load(entry) {
  const output = buildSync({entryPoints:[path.join(__dirname, '../web/' + entry)], bundle:true, write:false, platform:'browser', format:'cjs'}).outputFiles[0].text;
  const module = {exports:{}};
  vm.runInNewContext(output, {module, exports:module.exports, console, URL, Date, Intl, navigator:{}, window:{}});
  return module.exports;
}
const {automaticName} = load('features/flow-utils.ts');
const {stalled, span, projectTitle} = load('utils.ts');
// Local time, so the names read the same whatever timezone the tests run in.
const now = new Date(2026, 9, 13, 18, 10);
const named = options => automaticName({now, locale:'en-GB', ...options});

test('a recording is named for what it is and when it was made, never by a raw timestamp', () => {
  const walkthrough = named({flow:'ai-walkthrough', source:'screen'});
  assert.match(walkthrough, /^Walkthrough, 13 Oct, \d{1,2}:10/);
  assert.equal(/\dT\d|Z$|-\d{3}/.test(walkthrough), false);
  assert.match(named({flow:'talk-through', source:'screen', spoken:true}), /^Talk-through, 13 Oct/);
  assert.match(named({flow:'ai-walkthrough', source:'screen', spoken:true}), /^Talk-through,/, 'a take with the person\'s voice is a talk-through');
  assert.match(named({flow:'section', source:'screen'}), /^Section, 13 Oct/);
  assert.equal(named({flow:'ai-walkthrough', source:'screen', url:'https://www.mercury.com/pricing'}), 'mercury.com walkthrough', 'a site, when one was given, says more than the time');
});

test('a website, a set of screenshots and an uploaded file each get a name that says what they are', () => {
  assert.equal(named({flow:'website', source:'web', url:'https://www.example.com/'}), 'example.com design review');
  assert.match(named({flow:'narrate-screenshots', source:'upload', shots:6, fileName:'screens.webm'}), /^6 screenshots, 13 Oct/);
  assert.match(named({flow:'narrate-screenshots', source:'upload', shots:1}), /^1 screenshot, /);
  assert.equal(named({flow:'narrate-video', source:'upload', fileName:'Q3_onboarding-demo_final.mp4'}), 'Q3 onboarding demo final');
  // A file whose own name says nothing is named by the date.
  assert.match(named({flow:'narrate-video', source:'upload', fileName:'Screen recording 2026-10-08T08-18-28-831Z.webm'}), /^Video, 13 Oct/);
  assert.match(named({flow:'narrate-video', source:'upload', fileName:'untitled.mov'}), /^Video, /);
  assert.equal(named({flow:'narrate-video', source:'upload', fileName:'x'.repeat(200) + '.mp4'}).length, 120);
});

test('names saved by the old recorder are still shown readably', () => {
  assert.match(projectTitle({name:'Screen recording 2026-10-08T08-18-28-831Z'}, 'en-GB'), /^Recording · [789] Oct, /);
  assert.equal(projectTitle({name:'Talk-through, 13 Oct, 18:10'}, 'en-GB'), 'Talk-through, 13 Oct, 18:10');
});

const project = (status, minutesAgo, extra = {}) => ({id:'p', name:'P', type:'walkthrough', source:'screen', status, access:'private', updated:new Date(now.getTime() - minutesAgo * 60000).toISOString(), data:{}, ...extra});

test('a project is stalled only after far longer than its state takes', () => {
  const at = now.getTime();
  assert.equal(stalled(project('uploading', 59), at), null);
  assert.equal(stalled(project('queued', 29), at), null);
  assert.equal(stalled(project('processing', 89), at), null);
  assert.equal(stalled(project('uploading', 61), at).action, 'upload');
  assert.equal(stalled(project('queued', 31), at).action, 'cancel');
  assert.equal(stalled(project('processing', 91), at).action, 'cancel');
  for (const status of ['draft', 'ready', 'failed']) assert.equal(stalled(project(status, 100000), at), null, status + ' is finished, not stalled');
  assert.equal(stalled(project('uploading', 5000, {trashed:true}), at), null);
});

test('a stalled project says how long, what probably happened and what to do', () => {
  const upload = stalled(project('uploading', 3 * 24 * 60), now.getTime());
  assert.equal(upload.label, 'No change for 3 days');
  assert.match(upload.reason, /^No change for 3 days\. The upload stopped/);
  assert.match(upload.next, /^Choose the same file again/);
  const queued = stalled(project('queued', 120), now.getTime());
  assert.match(queued.reason, /^No change for 2 hours\. The worker .* may be offline\.$/);
  assert.match(queued.next, /^Cancel the job/);
  assert.deepEqual([span(60000), span(40 * 60000), span(89 * 60000), span(90 * 60000), span(35 * 3600000), span(36 * 3600000), span(0)], ['1 minute', '40 minutes', '89 minutes', '2 hours', '35 hours', '2 days', '1 minute']);
});
