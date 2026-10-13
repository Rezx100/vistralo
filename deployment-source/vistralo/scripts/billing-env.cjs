'use strict';
// Turns the billing build variables into esbuild defines, and refuses anything that must not
// ship in a browser bundle. Everything here is public by design; the Paddle API key and the
// webhook secret are Supabase function secrets and have no VISTRALO_* build variable at all.

const PRICES = {
  pro_month: 'VISTRALO_PADDLE_PRICE_PRO_MONTH',
  pro_year: 'VISTRALO_PADDLE_PRICE_PRO_YEAR',
  studio_month: 'VISTRALO_PADDLE_PRICE_STUDIO_MONTH',
  studio_year: 'VISTRALO_PADDLE_PRICE_STUDIO_YEAR',
};
const flag = (env, name) => {
  const value = (env[name] || '').trim();
  if (value && value !== 'on' && value !== 'off') throw Error(`${name} must be "on" or "off".`);
  return value === 'on' ? 'on' : '';
};

function billingDefines(env = process.env) {
  const billing = flag(env, 'VISTRALO_BILLING');
  const signup = flag(env, 'VISTRALO_SIGNUP');
  const token = (env.VISTRALO_PADDLE_CLIENT_TOKEN || '').trim();
  const environment = (env.VISTRALO_PADDLE_ENV || '').trim();
  const legal = (env.VISTRALO_LEGAL_URL || '').trim();
  // A client-side token is the only Paddle credential that belongs in a bundle, and only the sandbox one.
  if (token && !/^test_[a-z0-9]+$/i.test(token))
    throw Error('VISTRALO_PADDLE_CLIENT_TOKEN must be a Paddle sandbox client-side token (it starts with "test_"). Live tokens and API keys are refused.');
  if (environment && environment !== 'sandbox')
    throw Error('VISTRALO_PADDLE_ENV must be "sandbox". This build does not take live payments.');
  const prices = {};
  for (const [key, name] of Object.entries(PRICES)) {
    const id = (env[name] || '').trim();
    if (id && !/^pri_[a-z0-9]+$/.test(id)) throw Error(`${name} must be a Paddle price ID (it starts with "pri_").`);
    if (id) prices[key] = id;
  }
  if (legal && !/^https:\/\/[^\s]+$/.test(legal)) throw Error('VISTRALO_LEGAL_URL must be an https:// address.');
  if (signup && !legal)
    throw Error('VISTRALO_SIGNUP=on needs VISTRALO_LEGAL_URL: the sign-up form must link to the published terms and privacy notice.');
  return {
    VISTRALO_BILLING: JSON.stringify(billing),
    VISTRALO_SIGNUP: JSON.stringify(signup),
    VISTRALO_PADDLE_CLIENT_TOKEN: JSON.stringify(token),
    VISTRALO_PADDLE_ENV: JSON.stringify(environment),
    VISTRALO_PADDLE_PRICES: JSON.stringify(prices),
    VISTRALO_LEGAL_URL: JSON.stringify(legal),
  };
}

module.exports = { billingDefines, PRICES };
