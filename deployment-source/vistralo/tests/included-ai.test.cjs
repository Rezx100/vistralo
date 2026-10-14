'use strict';
// Which keys a narration job runs on: Pro and Studio fall back to Vistralo's own keys; Free brings its own.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { includedPlans, includedKeys, chooseKeys, FREE_MESSAGE, UNAVAILABLE_MESSAGE } = require('../src/included-ai.cjs');

const HOUSE = { openai: 'house-openai', heygen: 'house-heygen', voiceId: 'house-voice', cap: 1 };
const OWN = { openai: 'own-openai', heygen: 'own-heygen', voiceId: 'own-voice', cap: 2.5 };

test('the plans that include AI narration come from the plan table', () => {
  assert.deepEqual([...includedPlans({})].sort(), ['pro', 'studio']);
  const table = JSON.parse(fs.readFileSync(path.join(__dirname, '../web/billing/plans.json'), 'utf8'));
  for (const plan of table.plans) assert.equal(typeof plan.aiIncluded, 'boolean', plan.id + ' says whether AI is included');
  // The override is how Free is added later without editing the file.
  assert.deepEqual([...includedPlans({ VISTRALO_INCLUDED_AI_PLANS: 'free, pro,studio' })], ['free', 'pro', 'studio']);
  // A worker without the table refuses to start rather than guess.
  assert.throws(() => includedPlans({}, path.join(os.tmpdir(), 'no-such-plans.json')), /plan table is missing/);
});

test('the included keys are read from their own variables, not the old shared ones', () => {
  assert.deepEqual(includedKeys({ OPENAI_API_KEY: 'x', HEYGEN_API_KEY: 'y' }), { openai: '', heygen: '', voiceId: '', cap: 1 });
  assert.deepEqual(
    includedKeys({ VISTRALO_INCLUDED_OPENAI_API_KEY: ' a ', VISTRALO_INCLUDED_HEYGEN_API_KEY: 'b', VISTRALO_INCLUDED_HEYGEN_VOICE_ID: 'v', VISTRALO_INCLUDED_COST_CAP_USD: '3' }),
    { openai: 'a', heygen: 'b', voiceId: 'v', cap: 3 },
  );
  assert.equal(includedKeys({ VISTRALO_INCLUDED_COST_CAP_USD: 'nonsense' }).cap, 1);
});

test('a paid plan with no keys of its own runs on the included keys and voice, within the included cap', () => {
  const settings = chooseKeys({ own: {}, included: true, house: HOUSE });
  assert.equal(settings.openai, 'house-openai');
  assert.equal(settings.heygen, 'house-heygen');
  assert.equal(settings.voiceId, 'house-voice');
  assert.equal(settings.cap, 1);
  assert.deepEqual(settings.sources, { openai: 'included', heygen: 'included' });
  assert.doesNotThrow(() => { settings.need('openai'); settings.need('heygen'); });
});

test('a customer cannot raise spending on the included keys, but can lower it', () => {
  assert.equal(chooseKeys({ own: { cap: 50 }, included: true, house: HOUSE }).cap, 1);
  assert.equal(chooseKeys({ own: { cap: 0.25 }, included: true, house: HOUSE }).cap, 0.25);
  assert.equal(chooseKeys({ own: { voiceId: 'chosen' }, included: true, house: HOUSE }).voiceId, 'chosen');
});

test('a customer\'s own saved keys always win, with their own cap', () => {
  const settings = chooseKeys({ own: OWN, included: true, house: HOUSE });
  assert.equal(settings.openai, 'own-openai');
  assert.equal(settings.heygen, 'own-heygen');
  assert.equal(settings.voiceId, 'own-voice');
  assert.equal(settings.cap, 2.5);
  assert.deepEqual(settings.sources, { openai: 'own', heygen: 'own' });
  // One of each: the included key covers only the missing one, and the included cap applies.
  const mixed = chooseKeys({ own: { openai: 'own-openai', cap: 5 }, included: true, house: HOUSE });
  assert.deepEqual(mixed.sources, { openai: 'own', heygen: 'included' });
  assert.equal(mixed.cap, 1);
});

test('the Free plan never touches the included keys and is told to bring its own', () => {
  const none = chooseKeys({ own: {}, included: false, house: HOUSE });
  assert.equal(none.openai, '');
  assert.equal(none.heygen, '');
  assert.throws(() => none.need('openai'), (error) => error.message === FREE_MESSAGE);
  assert.match(FREE_MESSAGE, /Settings, under AI narration/);
  const own = chooseKeys({ own: OWN, included: false, house: HOUSE });
  assert.equal(own.openai, 'own-openai');
  assert.equal(own.voiceId, 'own-voice');
  assert.equal(own.cap, 2.5);
  const half = chooseKeys({ own: { openai: 'own-openai' }, included: false, house: HOUSE });
  assert.equal(half.heygen, '');
  assert.throws(() => half.need('heygen'), (error) => error.message === FREE_MESSAGE);
});

test('a paid plan whose included keys are missing on the worker gets a message that is not about its own keys', () => {
  const settings = chooseKeys({ own: {}, included: true, house: { openai: '', heygen: '', voiceId: '', cap: 1 } });
  assert.throws(() => settings.need('heygen'), (error) => error.message === UNAVAILABLE_MESSAGE);
});

test('the worker uses the rule and no longer reads the shared OPENAI_API_KEY or HEYGEN_API_KEY', () => {
  const worker = fs.readFileSync(path.join(__dirname, '../scripts/local-admin-worker.cjs'), 'utf8');
  assert.match(worker, /chooseKeys\(/);
  assert.doesNotMatch(worker, /fromEnv\('(OPENAI_API_KEY|HEYGEN_API_KEY|HEYGEN_VOICE_ID)'\)/);
  assert.doesNotMatch(worker, /assert\(settings\.(openai|heygen)/);
});
