'use strict';
// Plans, Paddle and limits. Nothing here opens a connection: Paddle is the mock client or a fake fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {buildSync} = require('esbuild');
const {billingDefines} = require('../scripts/billing-env.cjs');
const {loadEntitlement, checkQuota, checkDuration} = require('../src/entitlements.cjs');

const root = path.join(__dirname, '..');
const offline = async url => { throw new Error('A billing test tried to reach ' + url); };
function load(entry, {define = {}, globals = {}} = {}) {
  const code = buildSync({entryPoints:[path.join(root, entry)], bundle:true, write:false, platform:'browser', format:'cjs', define}).outputFiles[0].text;
  const module = {exports:{}};
  const context = {module, exports:module.exports, console, URL, Blob, File, Date, JSON, Promise, TextEncoder, setTimeout, clearTimeout, crypto:crypto.webcrypto, fetch:offline, ...globals};
  vm.runInNewContext(code, context);
  return {...module.exports, context};
}
const paddle = load('supabase/functions/_shared/paddle.ts');
const PRICES = {pri_promonth:{plan:'pro', interval:'month'}, pri_proyear:{plan:'pro', interval:'year'}, pri_studiomonth:{plan:'studio', interval:'month'}, pri_studioyear:{plan:'studio', interval:'year'}};
const SECRET = 'pdl_ntfset_test_only_not_a_real_secret';
const sign = (body, ts, secret = SECRET) => crypto.createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
const USER = '6f1c2b1e-3a4d-4c5b-8e6f-0a1b2c3d4e5f';
const notification = (type, data, at = '2026-10-13T10:00:00Z') => JSON.stringify({event_id:'evt_01test', event_type:type, occurred_at:at, notification_id:'ntf_01test', data});
const subscription = (extra = {}) => ({id:'sub_01abc', status:'active', customer_id:'ctm_01abc', custom_data:{vistralo_user_id:USER}, items:[{price:{id:'pri_promonth'}, quantity:1}], billing_cycle:{interval:'month', frequency:1}, current_billing_period:{starts_at:'2026-10-13T10:00:00Z', ends_at:'2026-11-13T10:00:00Z'}, next_billed_at:'2026-11-13T10:00:00Z', scheduled_change:null, paused_at:null, canceled_at:null, ...extra});

test('a webhook is trusted only with a current, matching Paddle-Signature over the exact body', async () => {
  const body = notification('subscription.created', subscription()), now = 1791000000;
  const good = `ts=${now};h1=${sign(body, now)}`;
  assert.equal((await paddle.verifyPaddleSignature(good, body, SECRET, now)).ok, true);
  assert.equal((await paddle.verifyPaddleSignature(good, body, SECRET, now + 5)).ok, true, 'Five seconds old is inside the window');
  for (const [name, header, text, secret, at] of [
    ['a missing header', null, body, SECRET, now],
    ['a header without a signature', `ts=${now}`, body, SECRET, now],
    ['a header without a timestamp', `h1=${sign(body, now)}`, body, SECRET, now],
    ['a signature made with another secret', `ts=${now};h1=${sign(body, now, 'other')}`, body, SECRET, now],
    ['a body changed after signing', good, body.replace('active', 'paused'), SECRET, now],
    ['a body re-serialised with different spacing', good, JSON.stringify(JSON.parse(body), null, 1), SECRET, now],
    ['a timestamp changed after signing', `ts=${now + 1};h1=${sign(body, now)}`, body, SECRET, now],
    ['a replay six seconds later', good, body, SECRET, now + 6],
    ['a timestamp from the future', `ts=${now + 60};h1=${sign(body, now + 60)}`, body, SECRET, now],
    ['an unset secret', good, body, '', now],
    ['a truncated signature', `ts=${now};h1=${sign(body, now).slice(0, 32)}`, body, SECRET, now],
  ]) assert.equal((await paddle.verifyPaddleSignature(header, text, secret, at)).ok, false, 'Rejects ' + name);
  // While a secret is rotated Paddle may send more than one h1; any one matching is enough.
  assert.equal((await paddle.verifyPaddleSignature(`ts=${now};h1=${'0'.repeat(64)};h1=${sign(body, now)}`, body, SECRET, now)).ok, true);
});

test('subscription events map to the stored row, and an unknown price grants no plan', () => {
  const record = paddle.subscriptionRecord(paddle.readEvent(notification('subscription.created', subscription())), PRICES);
  assert.deepEqual(JSON.parse(JSON.stringify(record)), {subscriptionId:'sub_01abc', customerId:'ctm_01abc', userId:USER, planId:'pro', priceId:'pri_promonth', status:'active', interval:'month', periodEnd:'2026-11-13T10:00:00Z', nextBilledAt:'2026-11-13T10:00:00Z', scheduledAction:null, scheduledAt:null, resumeAt:null, pausedAt:null, canceledAt:null, occurredAt:'2026-10-13T10:00:00Z'});
  const ending = paddle.subscriptionRecord(paddle.readEvent(notification('subscription.updated', subscription({scheduled_change:{action:'cancel', effective_at:'2026-11-13T10:00:00Z', resume_at:null}}))), PRICES);
  assert.equal(ending.scheduledAction, 'cancel'); assert.equal(ending.scheduledAt, '2026-11-13T10:00:00Z');
  const paused = paddle.subscriptionRecord(paddle.readEvent(notification('subscription.paused', subscription({status:'paused', current_billing_period:null, next_billed_at:null, paused_at:'2026-10-13T10:00:00Z'}))), PRICES);
  assert.equal(paused.status, 'paused'); assert.equal(paused.periodEnd, null);
  const foreign = paddle.subscriptionRecord(paddle.readEvent(notification('subscription.created', subscription({items:[{price:{id:'pri_somethingelse'}}]}))), PRICES);
  assert.equal(foreign.planId, null); assert.equal(foreign.priceId, 'pri_somethingelse');
  // custom_data comes from the browser, so anything that is not an account ID is dropped.
  for (const claimed of [undefined, 42, 'admin', "'; drop table vistralo_accounts;--", USER + 'x'])
    assert.equal(paddle.subscriptionRecord(paddle.readEvent(notification('subscription.created', subscription({custom_data:{vistralo_user_id:claimed}}))), PRICES).userId, null);
  assert.throws(() => paddle.subscriptionRecord(paddle.readEvent(notification('subscription.created', subscription({status:'expired'}))), PRICES), /Unknown subscription status/);
  assert.throws(() => paddle.subscriptionRecord(paddle.readEvent(notification('subscription.created', subscription({id:'42'}))), PRICES), /no subscription ID/);
  assert.throws(() => paddle.readEvent('not json'), /not JSON/);
  assert.throws(() => paddle.readEvent('{"event_type":"subscription.created"}'), /not a Paddle notification/);
});

test('every event the plan names is handled, and prices come from the function secrets by name', () => {
  for (const type of ['subscription.created', 'subscription.activated', 'subscription.updated', 'subscription.past_due', 'subscription.paused', 'subscription.resumed', 'subscription.canceled'])
    assert.ok(paddle.SUBSCRIPTION_EVENTS.has(type), type);
  assert.deepEqual({...paddle.PAYMENT_EVENTS}, {'transaction.completed':'completed', 'transaction.payment_failed':'failed'});
  const secrets = {PADDLE_PRICE_PRO_MONTH:'pri_promonth', PADDLE_PRICE_PRO_YEAR:' pri_proyear ', PADDLE_PRICE_STUDIO_MONTH:'not-a-price', PADDLE_PRICE_STUDIO_YEAR:''};
  assert.deepEqual(JSON.parse(JSON.stringify(paddle.priceMapFromEnv(name => secrets[name]))), {pri_promonth:{plan:'pro', interval:'month'}, pri_proyear:{plan:'pro', interval:'year'}});
});

test('billing actions call only the sandbox API, with the key in the header, and refuse a live key first', async () => {
  const calls = [];
  const reply = data => async (url, options) => { calls.push({url, options}); return {ok:true, status:200, json:async () => ({data})}; };
  const stored = {paddle_subscription_id:'sub_01abc', paddle_customer_id:'ctm_01abc', plan_id:'pro', status:'active', billing_interval:'month', scheduled_action:null};
  const key = 'pdl_sdbx_apikey_test_only';
  const portal = {urls:{general:{overview:'https://sandbox-customer-portal.paddle.com/cpl_1?action=overview&token=t'}, subscriptions:[{id:'sub_01abc', cancel_subscription:'https://sandbox-customer-portal.paddle.com/cpl_1?action=cancel_subscription&token=t', update_subscription_payment_method:'https://sandbox-customer-portal.paddle.com/cpl_1?action=update_subscription_payment_method&token=t'}]}};

  const opened = await paddle.billingAction({action:'portal', intent:'cancel'}, stored, {fetch:reply(portal), apiKey:key, prices:PRICES});
  assert.match(opened.url, /action=cancel_subscription/);
  assert.equal(calls[0].url, 'https://sandbox-api.paddle.com/customers/ctm_01abc/portal-sessions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + key);
  assert.deepEqual(JSON.parse(calls[0].options.body), {subscription_ids:['sub_01abc']});

  await paddle.billingAction({action:'change_plan', plan:'studio', interval:'year'}, stored, {fetch:reply({}), apiKey:key, prices:PRICES});
  assert.equal(calls[1].options.method, 'PATCH'); assert.equal(calls[1].url, 'https://sandbox-api.paddle.com/subscriptions/sub_01abc');
  assert.deepEqual(JSON.parse(calls[1].options.body), {items:[{price_id:'pri_studioyear', quantity:1}], proration_billing_mode:'prorated_immediately'});

  await paddle.billingAction({action:'resume'}, {...stored, status:'paused'}, {fetch:reply({}), apiKey:key, prices:PRICES});
  assert.equal(calls[2].url, 'https://sandbox-api.paddle.com/subscriptions/sub_01abc/resume');
  await paddle.billingAction({action:'keep'}, {...stored, scheduled_action:'cancel'}, {fetch:reply({}), apiKey:key, prices:PRICES});
  assert.deepEqual(JSON.parse(calls[3].options.body), {scheduled_change:null});
  assert.ok(calls.every(call => call.url.startsWith('https://sandbox-api.paddle.com/')));

  const before = calls.length;
  await assert.rejects(paddle.billingAction({action:'portal'}, stored, {fetch:reply(portal), apiKey:'pdl_live_apikey_x', prices:PRICES}), /sandbox API key/);
  await assert.rejects(paddle.billingAction({action:'portal'}, stored, {fetch:reply(portal), apiKey:'', prices:PRICES}), /not connected/);
  await assert.rejects(paddle.billingAction({action:'portal'}, null, {fetch:reply(portal), apiKey:key, prices:PRICES}), /no subscription/);
  await assert.rejects(paddle.billingAction({action:'change_plan', plan:'pro', interval:'month'}, stored, {fetch:reply({}), apiKey:key, prices:PRICES}), /already on that plan/);
  await assert.rejects(paddle.billingAction({action:'change_plan', plan:'studio', interval:'month'}, {...stored, status:'past_due'}, {fetch:reply({}), apiKey:key, prices:PRICES}), /active subscription/);
  await assert.rejects(paddle.billingAction({action:'resume'}, stored, {fetch:reply({}), apiKey:key, prices:PRICES}), /not paused/);
  assert.equal(calls.length, before, 'A refused action never reaches Paddle');
  // A portal link is only handed to the browser if it really is a Paddle page.
  await assert.rejects(paddle.billingAction({action:'portal'}, stored, {fetch:reply({urls:{general:{overview:'https://paddle.com.evil.example/x'}}}), apiKey:key, prices:PRICES}), /did not return a billing page/);
  assert.throws(() => paddle.parseBillingRequest({action:'change_plan', plan:'enterprise', interval:'month'}), /Choose a plan/);
  assert.throws(() => paddle.parseBillingRequest({action:'refund'}), /Unknown billing action/);
});

test('the plans the app shows are the plans the database enforces', () => {
  const {PLANS} = load('web/billing/plans.ts');
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261013150000_vistralo_billing.sql'), 'utf8');
  const seeded = [...sql.matchAll(/\('(\w+)', '(\w+)', (\d+), (null|\d+), (null|\d+), (null|\d+), (\d+)\)/g)].map(row => ({id:row[1], name:row[2], rank:Number(row[3]), maxProjects:row[4] === 'null' ? null : Number(row[4]), monthlyJobs:row[5] === 'null' ? null : Number(row[5]), maxSourceMinutes:row[6] === 'null' ? null : Number(row[6]), shareDays:Number(row[7])}));
  assert.equal(seeded.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(PLANS.map(({id, name, rank, maxProjects, monthlyJobs, maxSourceMinutes, shareDays}) => ({id, name, rank, maxProjects, monthlyJobs, maxSourceMinutes, shareDays})))), seeded);
  // Both switches start off, so applying the migration changes nothing by itself.
  assert.match(sql, /enforce_limits boolean not null default false/);
  assert.match(sql, /signup_enabled boolean not null default false/);
  for (const table of ['vistralo_billing_config', 'vistralo_plans', 'vistralo_billing_customers', 'vistralo_billing_subscriptions', 'vistralo_billing_events', 'vistralo_billing_usage'])
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table + ' has row-level security');
});

test('billing is off unless the build says otherwise, and only sandbox values are accepted', () => {
  const none = billingDefines({});
  assert.equal(none.VISTRALO_BILLING, '""'); assert.equal(none.VISTRALO_SIGNUP, '""'); assert.equal(none.VISTRALO_PADDLE_CLIENT_TOKEN, '""');
  const full = billingDefines({VISTRALO_BILLING:'on', VISTRALO_PADDLE_CLIENT_TOKEN:'test_0123456789abcdef', VISTRALO_PADDLE_ENV:'sandbox', VISTRALO_PADDLE_PRICE_PRO_MONTH:'pri_promonth'});
  assert.equal(full.VISTRALO_BILLING, '"on"'); assert.equal(full.VISTRALO_PADDLE_PRICES, '{"pro_month":"pri_promonth"}');
  for (const [name, env, reason] of [
    ['a live client token', {VISTRALO_PADDLE_CLIENT_TOKEN:'live_0123456789abcdef'}, /sandbox client-side token/],
    ['an API key in place of the client token', {VISTRALO_PADDLE_CLIENT_TOKEN:'pdl_sdbx_apikey_0123'}, /sandbox client-side token/],
    ['the production environment', {VISTRALO_PADDLE_ENV:'production'}, /must be "sandbox"/],
    ['a product ID as a price', {VISTRALO_PADDLE_PRICE_PRO_YEAR:'pro_01abc'}, /Paddle price ID/],
    ['sign-up without published terms', {VISTRALO_SIGNUP:'on'}, /VISTRALO_LEGAL_URL/],
    ['a truthy flag that is not "on"', {VISTRALO_BILLING:'true'}, /"on" or "off"/],
  ]) assert.throws(() => billingDefines(env), reason, 'Refuses ' + name);
  // The two secrets have no build variable, so nothing can put them in the bundle by configuration.
  assert.ok(!Object.keys(full).some(name => /API_KEY|SECRET/.test(name)));
});

test('checkout mode never reaches live, and without sandbox values Paddle is not contacted', async () => {
  const {paddleMode} = load('web/billing/config.ts');
  const prices = {pro_month:'pri_a1', pro_year:'pri_a2', studio_month:'pri_a3', studio_year:'pri_a4'};
  const config = extra => ({enabled:true, signup:false, token:'test_abc', environment:'sandbox', prices, legalUrl:'', ...extra});
  assert.equal(paddleMode(config({enabled:false}), 'cloud'), 'off');
  assert.equal(paddleMode(config({enabled:false}), 'demo'), 'off');
  assert.equal(paddleMode(config(), 'demo'), 'mock');
  assert.equal(paddleMode(config(), 'cloud'), 'sandbox');
  assert.equal(paddleMode(config({token:''}), 'cloud'), 'unconfigured');
  assert.equal(paddleMode(config({token:'live_abc'}), 'cloud'), 'unconfigured');
  assert.equal(paddleMode(config({environment:'production'}), 'cloud'), 'unconfigured');
  assert.equal(paddleMode(config({prices:{...prices, studio_year:''}}), 'cloud'), 'unconfigured');

  // The mock client runs with no document and a fetch that throws: it cannot load a script or call out.
  const {createPaddleClient, createMockPaddle} = load('web/billing/paddle.ts');
  assert.equal(createPaddleClient('off', config(), async () => 'closed'), null);
  assert.equal(createPaddleClient('unconfigured', config(), async () => 'closed'), null);
  const seen = [];
  const mock = createPaddleClient('mock', config(), async request => { seen.push(request); return 'completed'; });
  assert.equal(mock.mode, 'mock');
  assert.deepEqual({...(await mock.prices())}, {pro_month:'$12', pro_year:'$120', studio_month:'$36', studio_year:'$360'});
  assert.equal(await mock.checkout({plan:'pro', interval:'month', theme:'dark', locale:'en'}), 'completed');
  assert.equal(seen[0].plan, 'pro');
  assert.equal(await createMockPaddle(async () => 'declined').checkout({plan:'studio', interval:'year', theme:'dark', locale:'en'}), 'declined');
});

test('the browser bundle carries no Paddle secret names and no API host, with plans on or off', () => {
  for (const env of [{}, {VISTRALO_BILLING:'on', VISTRALO_PADDLE_CLIENT_TOKEN:'test_0123456789abcdef', VISTRALO_PADDLE_ENV:'sandbox', VISTRALO_PADDLE_PRICE_PRO_MONTH:'pri_promonth', VISTRALO_PADDLE_PRICE_PRO_YEAR:'pri_proyear', VISTRALO_PADDLE_PRICE_STUDIO_MONTH:'pri_studiomonth', VISTRALO_PADDLE_PRICE_STUDIO_YEAR:'pri_studioyear'}]) {
    const bundle = buildSync({entryPoints:[path.join(root, 'web/main.tsx')], bundle:true, write:false, minify:true, loader:{'.css':'empty'}, target:['es2022'], define:{'process.env.NODE_ENV':'"production"', VISTRALO_SUPABASE_URL:'""', VISTRALO_SUPABASE_KEY:'""', ...billingDefines(env)}}).outputFiles[0].text;
    for (const forbidden of ['PADDLE_API_KEY', 'PADDLE_WEBHOOK_SECRET', 'pdl_', 'api.paddle.com', 'Paddle-Signature', 'SERVICE_ROLE'])
      assert.equal(bundle.includes(forbidden), false, `Bundle must not contain ${forbidden}`);
  }
});

function demo(define) {
  const storage = new Map(), events = [];
  const loaded = load('web/adapters.ts', {define, globals:{
    DOMException, AbortController, CustomEvent:class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    localStorage:{getItem:key => storage.get(key) || null, setItem:(key, value) => storage.set(key, String(value)), removeItem:key => storage.delete(key)},
    location:{origin:'https://vistralo.example', pathname:'/'},
    window:{dispatchEvent:event => events.push(event)},
  }});
  return {adapter:loaded.createAdapter('demo'), events};
}

test('with the flag off nothing is limited, whatever the saved state says', async () => {
  const {adapter, events} = demo({});
  await adapter.rpc('billingSimulate', {enforce:true});
  for (let i = 0; i < 3; i++) await adapter.create({name:'Project ' + i, source:'upload'});
  assert.equal((await adapter.list()).length, 11);
  await adapter.share('demo-homepage-motion', 30);
  assert.equal(events.length, 0);
});

test('with the flag on, each limit refuses the action, says why, and an upgrade lifts it', async () => {
  const {adapter, events} = demo({VISTRALO_BILLING:'"on"'});
  // Limits stay off in the demo until the preview switch is set, so the samples never block a visitor.
  const first = await adapter.create({name:'Before limits', source:'upload'});
  let state = await adapter.rpc('billing');
  assert.equal(state.plan, 'free'); assert.equal(state.enforce, false); assert.equal(state.subscription, null); assert.equal(state.usage.projects, 9);

  await adapter.rpc('billingSimulate', {enforce:true});
  await assert.rejects(adapter.create({name:'One too many', source:'upload'}), error => error.name === 'PlanLimitError' && error.kind === 'projects' && /Free plan holds 5 projects/.test(error.message));
  assert.equal((await adapter.list()).length, 9, 'A refused project is not created');
  await assert.rejects(adapter.share('demo-homepage-motion', 30), error => error.kind === 'share' && /up to 7 days/.test(error.message));
  await adapter.share('demo-homepage-motion', 7);
  // Trash is not a way round the limit: a restore is checked like a new project.
  await adapter.trash([first.id]);
  await assert.rejects(adapter.restore([first.id]), error => error.kind === 'projects');
  assert.deepEqual(events.map(event => [event.type, event.detail.kind]), [['vistralo:plan-limit', 'projects'], ['vistralo:plan-limit', 'share'], ['vistralo:plan-limit', 'projects']]);

  await adapter.rpc('billingSimulate', {plan:'pro', interval:'month', status:'active', scheduledAction:null});
  state = await adapter.rpc('billing');
  assert.equal(state.plan, 'pro'); assert.equal(state.limits.maxProjects, 100); assert.equal(state.subscription.status, 'active');
  await adapter.restore([first.id]);
  await adapter.create({name:'Fits on Pro', source:'upload'});
  await adapter.share('demo-homepage-motion', 30);

  // The monthly allowance counts AI and website jobs, and is refused at the cap.
  await adapter.rpc('billingSimulate', {jobs:60});
  await assert.rejects(adapter.rpc('walkthrough', {id:first.id, url:'https://example.com/'}), error => error.kind === 'jobs' && /60 AI walkthroughs/.test(error.message));
  await adapter.rpc('billingSimulate', {jobs:59});
  await adapter.rpc('walkthrough', {id:first.id, url:'https://example.com/'});
  assert.equal((await adapter.rpc('billing')).usage.jobs, 60);
});

test('past due keeps the plan; paused and cancelled fall back to Free; each state has its own notice', async () => {
  const {adapter} = demo({VISTRALO_BILLING:'"on"'});
  const {billingNotice, planLabel, grantsPlan} = load('web/billing/plans.ts');
  const at = async patch => { await adapter.rpc('billingSimulate', {plan:'pro', interval:'month', scheduledAction:null, ...patch}); return adapter.rpc('billing'); };

  let state = await at({status:'past_due'});
  assert.equal(state.plan, 'pro'); assert.equal(planLabel(state), 'Pro plan · Past due');
  assert.deepEqual([billingNotice(state).tone, billingNotice(state).action, billingNotice(state).dismissible], ['danger', 'payment', false]);

  state = await at({status:'paused'});
  assert.equal(state.plan, 'free'); assert.equal(state.limits.maxProjects, 5); assert.equal(planLabel(state), 'Pro plan · Paused');
  assert.equal(billingNotice(state).action, 'resume');
  await adapter.rpc('billingAction', {action:'resume'});
  assert.equal((await adapter.rpc('billing')).subscription.status, 'active');

  state = await at({status:'active', scheduledAction:'cancel'});
  assert.equal(state.plan, 'pro'); assert.match(billingNotice(state).title, /^Pro ends on /); assert.equal(billingNotice(state).action, 'keep');
  await adapter.rpc('billingAction', {action:'keep'});
  assert.equal(billingNotice(await adapter.rpc('billing')), null, 'An active subscription with nothing scheduled shows no notice');

  state = await at({status:'canceled'});
  assert.equal(state.plan, 'free'); assert.equal(planLabel(state), 'Free plan');
  assert.deepEqual([billingNotice(state).action, billingNotice(state).dismissible], ['plans', true]);
  assert.deepEqual(['trialing', 'active', 'past_due', 'paused', 'canceled'].map(grantsPlan), [true, true, true, false, false]);
});

test('the worker refuses work over the plan, and behaves as before when billing is not installed', async () => {
  const rpc = reply => ({rpc:async (name, args) => { assert.equal(name, 'vistralo_worker_entitlement'); assert.deepEqual(args, {target:USER}); return reply; }});
  assert.equal(await loadEntitlement(rpc({data:null, error:{code:'PGRST202', message:'Could not find the function'}}), USER), null);
  assert.equal(await loadEntitlement(rpc({data:{enforce:false, plan:'free', planName:'Free', monthlyJobs:3, maxSourceMinutes:5, jobsUsed:9}, error:null}), USER), null);
  await assert.rejects(loadEntitlement(rpc({data:null, error:{code:'57014', message:'canceling statement due to statement timeout'}}), USER), /Could not read the owner's plan/);
  const free = await loadEntitlement(rpc({data:{enforce:true, plan:'free', planName:'Free', monthlyJobs:3, maxSourceMinutes:5, jobsUsed:3}, error:null}), USER);

  for (const check of [() => checkQuota(null, {kind:'narrate'}), () => checkDuration(null, 99999), () => checkQuota(free, {kind:'narrate'}), () => checkQuota({...free, jobsUsed:99}, {kind:'probe'}), () => checkQuota({...free, jobsUsed:99}, {kind:'render'}), () => checkQuota({...free, monthlyJobs:null, jobsUsed:99}, {kind:'website'}), () => checkDuration(free, 300), () => checkDuration({...free, maxSourceMinutes:null}, 99999)])
    assert.doesNotThrow(check);
  assert.throws(() => checkQuota({...free, jobsUsed:4}, {kind:'narrate'}), /3 AI walkthroughs on the Free plan are used/);
  assert.throws(() => checkQuota({...free, jobsUsed:4}, {kind:'website'}), /Settings, under Billing/);
  assert.throws(() => checkDuration(free, 301), /6 minutes long, and the Free plan narrates up to 5/);
});
