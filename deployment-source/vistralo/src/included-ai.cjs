'use strict';
// Which OpenAI and HeyGen keys a job runs on.
//
// Plans marked "aiIncluded" in web/billing/plans.json (Pro and Studio) include AI narration:
// their jobs run on Vistralo's own keys, which the worker holds in VISTRALO_INCLUDED_* variables.
// Other plans (Free) bring their own keys, saved encrypted in Settings. A customer's own saved
// key always wins, so anyone may run narration on their own account instead.
//
// To include another plan, set its "aiIncluded" to true in plans.json and redeploy the app and
// the worker. VISTRALO_INCLUDED_AI_PLANS (comma-separated plan ids) overrides the file.

const fs = require('node:fs');
const path = require('node:path');

const PLANS_FILE = path.join(__dirname, '..', 'web', 'billing', 'plans.json');

/** Plan ids whose jobs may use the included keys. Fails loudly rather than guess. */
function includedPlans(env = process.env, file = PLANS_FILE) {
  const override = typeof env.VISTRALO_INCLUDED_AI_PLANS === 'string' ? env.VISTRALO_INCLUDED_AI_PLANS.trim() : '';
  if (override) return new Set(override.split(',').map((id) => id.trim()).filter(Boolean));
  if (!fs.existsSync(file)) throw Error(`The plan table is missing (${file}); the worker cannot tell which plans include AI narration`);
  const table = JSON.parse(fs.readFileSync(file, 'utf8'));
  return new Set(table.plans.filter((plan) => plan.aiIncluded === true).map((plan) => plan.id));
}

/** Vistralo's own keys, from the worker's environment. Empty strings when not set. */
function includedKeys(env = process.env) {
  const read = (name) => (typeof env[name] === 'string' ? env[name].trim() : '');
  const cap = Number(read('VISTRALO_INCLUDED_COST_CAP_USD') || 1);
  return {
    openai: read('VISTRALO_INCLUDED_OPENAI_API_KEY'),
    heygen: read('VISTRALO_INCLUDED_HEYGEN_API_KEY'),
    voiceId: read('VISTRALO_INCLUDED_HEYGEN_VOICE_ID'),
    cap: Number.isFinite(cap) && cap > 0 ? cap : 1,
  };
}

const FREE_MESSAGE =
  'On the Free plan, AI narration needs your own OpenAI and HeyGen keys. Add them in Settings, under AI narration, or choose Pro or Studio, which include it.';
const UNAVAILABLE_MESSAGE =
  'AI narration is not available right now. Write to contact@vistralo.com and we will look into it.';

/**
 * The keys, voice and cost cap for one job.
 * own: the customer's saved settings ({openai, heygen, voiceId, cap}), decrypted.
 * included: whether the owner's plan (or role) includes AI narration.
 * house: includedKeys().
 * Returns the settings plus `need(provider)`, which throws the message that fits this account.
 */
function chooseKeys({ own = {}, included = false, house = {} }) {
  const openaiOwn = !!own.openai, heygenOwn = !!own.heygen;
  const openai = own.openai || (included ? house.openai || '' : '');
  const heygen = own.heygen || (included ? house.heygen || '' : '');
  const usesIncluded = (!!openai && !openaiOwn) || (!!heygen && !heygenOwn);
  // With the included HeyGen key, the customer's voice is used if they chose one, else Vistralo's.
  const voiceId = heygenOwn ? own.voiceId || '' : own.voiceId || house.voiceId || '';
  const ownCap = Number(own.cap) > 0 ? Number(own.cap) : 0;
  // A customer's cap may lower spending on the included keys but never raise it.
  const cap = usesIncluded ? Math.min(ownCap || house.cap || 1, house.cap || 1) : ownCap || 1;
  const sources = { openai: openai ? (openaiOwn ? 'own' : 'included') : '', heygen: heygen ? (heygenOwn ? 'own' : 'included') : '' };
  const need = (provider) => {
    if (provider === 'openai' ? openai : heygen) return;
    throw Error(included ? UNAVAILABLE_MESSAGE : FREE_MESSAGE);
  };
  return { openai, heygen, voiceId, cap, sources, included, need };
}

module.exports = { PLANS_FILE, includedPlans, includedKeys, chooseKeys, FREE_MESSAGE, UNAVAILABLE_MESSAGE };
