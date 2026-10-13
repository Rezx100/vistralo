'use strict';
// The library reads a large workspace in chunks and then asks only for what changed.
// These tests drive web/app/projectSync.ts against a fake adapter and count what it asks for.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const {buildSync} = require('esbuild');

function load(entry) {
  const output = buildSync({entryPoints:[path.join(__dirname, '../web/' + entry)], bundle:true, write:false, platform:'browser', format:'cjs', define:{VISTRALO_SUPABASE_URL:'""', VISTRALO_SUPABASE_KEY:'""'}}).outputFiles[0].text;
  const module = {exports:{}};
  vm.runInNewContext(output, {module, exports:module.exports, console, URL, Date, setTimeout, clearTimeout, localStorage:{getItem:() => null, setItem() {}, removeItem() {}}, location:{origin:'https://vistralo.example', pathname:'/'}, window:{}, crypto:require('node:crypto').webcrypto});
  return module.exports;
}
const {ProjectSync} = load('app/projectSync.ts');

const at = minutes => new Date(Date.parse('2026-10-13T12:00:00Z') + minutes * 60000).toISOString();
const project = (id, minutes, extra = {}) => ({id, name:id, type:'walkthrough', source:'screen', status:'ready', access:'private', created:at(minutes), updated:at(minutes), eventAt:at(minutes), eventLabel:'Updated', data:{}, ...extra});

/** A workspace the fake adapter reads from, newest change first, logging every request. */
function workspace(rows) {
  const calls = [];
  const sorted = () => [...rows.values()].sort((a, b) => a.updated < b.updated ? 1 : -1);
  const adapter = {
    async list() { calls.push('list'); return sorted(); },
    async summaries({offset, limit}) { calls.push(`summaries ${offset}+${limit}`); return {items:sorted().slice(offset, offset + limit), total:rows.size, running:offset === 0 ? [...running] : undefined}; },
    async changes(since) { calls.push('changes ' + since); return {items:sorted().filter(p => p.updated > since), total:rows.size, running:[...running]}; },
  };
  const running = new Set();
  return {adapter, calls, rows, running};
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
// Values made inside the bundle's own context have that context's Array and Object, so copy them before comparing.
const plain = value => JSON.parse(JSON.stringify(value));

test('the first read is one chunk, shown at once, and the rest arrives in the background', async () => {
  const rows = new Map(Array.from({length:1234}, (_, i) => [`p${i}`, project(`p${i}`, -i)]));
  const space = workspace(rows), states = [];
  const sync = new ProjectSync(space.adapter, state => states.push({shown:state.projects.length, total:state.total, complete:state.complete}), {first:200, chunk:500});
  const first = await sync.refresh();
  assert.equal(first.projects.length, 200, 'the first screen does not wait for the whole workspace');
  assert.equal(first.projects[0].id, 'p0', 'newest change first');
  assert.deepEqual(states[0], {shown:200, total:1234, complete:false});
  await settle();
  assert.deepEqual(space.calls, ['summaries 0+200', 'summaries 200+500', 'summaries 700+500', 'summaries 1200+500']);
  assert.deepEqual(states.at(-1), {shown:1234, total:1234, complete:true});
  assert.equal(space.calls.includes('list'), false, 'whole projects are never listed');
});

test('a poll asks only for what changed since the newest change seen, with an overlap for clock skew', async () => {
  const rows = new Map([['a', project('a', -10)], ['b', project('b', -5)]]);
  const space = workspace(rows);
  const sync = new ProjectSync(space.adapter, () => {}, {overlapMs:120000});
  await sync.refresh();
  await settle();
  space.calls.length = 0;
  rows.set('c', project('c', 1));
  rows.set('a', project('a', 2, {name:'renamed'}));
  const next = await sync.refresh();
  assert.deepEqual(space.calls, ['changes ' + at(-7)], 'two minutes before the newest change already held');
  assert.deepEqual(plain(next.projects.map(p => p.id)), ['a', 'c', 'b']);
  assert.equal(next.projects[0].name, 'renamed');
  assert.deepEqual(plain(next.changed), [], 'a rename is not a status change');
});

test('a status change is reported once, and a queued project with a claimed job reads as under way', async () => {
  const rows = new Map([['job', project('job', -3, {status:'queued'})]]);
  const space = workspace(rows);
  const sync = new ProjectSync(space.adapter, () => {});
  assert.equal((await sync.refresh()).projects[0].status, 'queued');
  await settle();
  space.running.add('job');
  const claimed = await sync.refresh();
  assert.equal(claimed.projects[0].status, 'processing', 'the worker has it, though the project row has not changed');
  assert.deepEqual(plain(claimed.changed.map(p => p.id)), ['job']);
  space.running.clear();
  rows.set('job', project('job', 1, {status:'ready'}));
  const done = await sync.refresh();
  assert.equal(done.projects[0].status, 'ready');
  assert.deepEqual(plain(done.changed.map(p => `${p.id}:${p.status}`)), ['job:ready']);
  assert.deepEqual(plain((await sync.refresh()).changed), [], 'not announced a second time');
});

test('a row deleted elsewhere is noticed by the count and removed by a re-read', async () => {
  const rows = new Map(Array.from({length:5}, (_, i) => [`p${i}`, project(`p${i}`, -i)]));
  const space = workspace(rows), states = [];
  const sync = new ProjectSync(space.adapter, state => states.push(state.projects.map(p => p.id)));
  await sync.refresh();
  await settle();
  rows.delete('p3');
  space.calls.length = 0;
  await sync.refresh();
  await settle();
  assert.equal(space.calls[0].startsWith('changes '), true);
  assert.equal(space.calls[1], 'summaries 0+500', 'a change-only poll cannot see a deletion, so everything is read again');
  assert.deepEqual(plain(states.at(-1)), ['p0', 'p1', 'p2', 'p4']);
});

test('a complete re-read happens when the last one is old, and keeps anything newer that arrived meanwhile', async () => {
  const rows = new Map([['a', project('a', -5)]]);
  const space = workspace(rows);
  let now = 0;
  const sync = new ProjectSync(space.adapter, () => {}, {resyncMs:300000}, () => now);
  await sync.refresh();
  await settle();
  now = 200000;
  space.calls.length = 0;
  await sync.refresh();
  await settle();
  assert.equal(space.calls.length, 1, 'not yet due');
  now = 400000;
  await sync.refresh();
  await settle();
  assert.equal(space.calls.at(-1), 'summaries 0+500');
});

test('a new project appears at once, and signing out forgets everything', async () => {
  const rows = new Map([['a', project('a', -5)]]);
  const space = workspace(rows), states = [];
  const sync = new ProjectSync(space.adapter, state => states.push(state));
  await sync.refresh();
  sync.upsert(project('fresh', 3));
  assert.deepEqual(plain(states.at(-1).projects.map(p => p.id)), ['fresh', 'a']);
  assert.equal(states.at(-1).total, 2);
  sync.reset();
  assert.deepEqual(plain(sync.state()), {projects:[], total:0, complete:false});
  space.calls.length = 0;
  rows.set('fresh', project('fresh', 3));
  await sync.refresh();
  assert.equal(space.calls[0], 'summaries 0+200', 'the next sign-in starts with a first read, not a poll');
});

test('an adapter without paging is still listed in full', async () => {
  const sync = new ProjectSync({async list() { return [project('only', 0)]; }}, () => {});
  const result = await sync.refresh();
  assert.deepEqual(plain(result.projects.map(p => p.id)), ['only']);
  assert.equal(sync.state().complete, true);
});

test('the cloud summary asks PostgREST for card fields only, never the whole document', () => {
  const {SUMMARY_SELECT, projectSummary} = load('cloud.ts');
  const columns = SUMMARY_SELECT.split(',');
  assert.equal(columns.includes('document'), false);
  assert.equal(columns.includes('*'), false);
  for (const heavy of ['brief', 'script', 'scriptParts', 'files', 'editPlan', 'evidence'])
    assert.equal(SUMMARY_SELECT.includes(heavy), false, heavy + ' stays out of the library read');
  assert.ok(columns.includes('name:document->>name'));
  assert.ok(columns.includes('pinned:document->pinned'), 'booleans are read as JSON, not as text');
  assert.ok(columns.includes('outputFile:document->data->output->>file'));
  for (const column of columns) assert.match(column, /^(?:[a-z_]+|[A-Za-z]+:document(?:->[A-Za-z]+)*->>?[A-Za-z]+)$/, column);

  const summary = projectSummary({id:'p', created_at:at(0), updated_at:at(1), name:'Checkout', type:'brief', source:'web', url:'https://example.com/', status:'ready', pinned:true, trashed:null, duration:null, progress:42, thumbnail:'owner/p/poster.webp', outputFile:'owner/p/out.mp4', microphone:null, collaborators:null});
  assert.equal(summary.name, 'Checkout');
  assert.equal(summary.type, 'brief');
  assert.equal(summary.pinned, true);
  assert.equal(summary.trashed, false);
  assert.equal(summary.duration, undefined);
  assert.equal(summary.progress, 42);
  assert.equal(summary.updated, at(1));
  assert.equal(summary.data.summary, true);
  assert.deepEqual(plain(summary.data.output), {file:'owner/p/out.mp4'});
  const bare = projectSummary({id:'q', created_at:at(0), updated_at:at(0)});
  assert.deepEqual([bare.name, bare.type, bare.source, bare.status, bare.access, bare.eventLabel], ['Untitled project', 'walkthrough', 'screen', 'draft', 'private', 'Updated'], 'a sparse row still makes a usable card');
});
