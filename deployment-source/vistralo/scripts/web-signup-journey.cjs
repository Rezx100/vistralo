'use strict';
// Browser journey through the sign-up form with Supabase Auth mocked.
// It builds two cloud copies of the app (sign-up on, sign-up off) that point at the project's
// Supabase host, then answers every request to that host from this file. Nothing reaches Supabase:
// a request the mock does not know fails the run, and so does a request to any other host.
// Run npm run build:server first.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const {serve} = require('./static-server.cjs');

const LEGAL = 'https://vistralo.com/legal';
const EMAIL = 'new.person@example.com';
const PASSWORD = 'a-long-enough-password';
const USER_ID = '7f1c2d1e-58a4-4c5b-9a57-3f6f0a4f2b11';

// The policy only lets the page talk to the project's own Supabase host, so the mock answers as that host.
function supabaseHost() {
  const policy = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).headers.flatMap(rule => rule.headers).find(h => h.key === 'Content-Security-Policy').value;
  const host = /connect-src[^;]*?(https:\/\/[a-z0-9]+\.supabase\.co)/.exec(policy);
  assert(host, 'vercel.json names a Supabase host in connect-src');
  return host[1];
}

const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const user = confirmed => ({id:USER_ID, aud:'authenticated', role:'authenticated', email:EMAIL, email_confirmed_at:confirmed ? '2026-10-13T10:00:00Z' : null, confirmation_sent_at:'2026-10-13T09:59:00Z', app_metadata:{provider:'email', providers:['email']}, user_metadata:{}, identities:[], created_at:'2026-10-13T09:59:00Z', updated_at:'2026-10-13T09:59:00Z'});
const session = () => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  // Shaped like a token and signed by nobody: only this mock ever reads it.
  return {access_token:[b64({alg:'HS256', typ:'JWT'}), b64({sub:USER_ID, role:'authenticated', aud:'authenticated', email:EMAIL, exp:expires}), 'mock-signature'].join('.'), token_type:'bearer', expires_in:3600, expires_at:expires, refresh_token:'mock-refresh-token', user:user(true)};
};
const freePlan = {enforce:false, admin:false, plan:'free', limits:{maxProjects:5, monthlyJobs:3, maxSourceMinutes:5, shareDays:7}, usage:{projects:0, jobs:0, periodStart:'2026-10-01'}, subscription:null};

// One mock per browser context. `world` is what the pretend Supabase project looks like; `calls` is what the page asked of it.
function mockSupabase(host, world) {
  const calls = [], unknown = [];
  const cors = {'access-control-allow-origin':'*', 'access-control-expose-headers':'*'};
  const json = (route, status, body) => route.fulfill({status, headers:{...cors, 'content-type':'application/json'}, body:JSON.stringify(body)});
  const handle = async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    let body = null;
    try { body = request.postDataJSON(); } catch { /* not JSON */ }
    const name = method + ' ' + url.pathname + (url.searchParams.get('grant_type') ? '?grant_type=' + url.searchParams.get('grant_type') : '');
    calls.push({name, body, query:Object.fromEntries(url.searchParams), authorization:request.headers().authorization || ''});
    if (name === 'POST /auth/v1/signup') {
      if (world.signup === 'rate') return json(route, 429, {code:429, error_code:'over_email_send_rate_limit', msg:'For security purposes, you can only request this after 52 seconds.'});
      if (world.signup === 'weak') return json(route, 422, {code:422, error_code:'weak_password', msg:'Password should be at least 12 characters.'});
      if (world.signup === 'session') return json(route, 200, session());
      return json(route, 200, user(false));
    }
    if (name === 'POST /auth/v1/token?grant_type=password') {
      if (body.email !== EMAIL || body.password !== PASSWORD) return json(route, 400, {code:400, error_code:'invalid_credentials', msg:'Invalid login credentials'});
      if (!world.confirmed) return json(route, 400, {code:400, error_code:'email_not_confirmed', msg:'Email not confirmed'});
      return json(route, 200, session());
    }
    if (name === 'POST /auth/v1/token?grant_type=pkce') { world.confirmed = true; return json(route, 200, session()); }
    if (name === 'GET /auth/v1/user') return json(route, 200, user(true));
    if (name === 'POST /auth/v1/logout') return route.fulfill({status:204, headers:cors});
    if (name === 'GET /rest/v1/vistralo_accounts') return json(route, 200, world.account ? [world.account] : []);
    if (name === 'POST /rest/v1/rpc/vistralo_complete_signup') {
      if (!world.signupOpen) return json(route, 400, {code:'P0001', message:'Sign-up is not open yet. Contact contact@vistralo.com for access.', details:null, hint:null});
      world.account = {user_id:USER_ID, role:'member', display_name:'new.person', workspace_name:'My workspace', created_at:'2026-10-13T10:00:00Z'};
      return route.fulfill({status:204, headers:cors});
    }
    if (name === 'POST /rest/v1/rpc/vistralo_billing_state') return json(route, 200, freePlan);
    // An empty workspace. The library asks for a count with each read, which PostgREST answers in Content-Range.
    if (name === 'GET /rest/v1/vistralo_projects' || name === 'GET /rest/v1/vistralo_jobs') return route.fulfill({status:200, headers:{...cors, 'content-type':'application/json', 'content-range':'*/0'}, body:'[]'});
    if (name === 'HEAD /rest/v1/vistralo_projects') return route.fulfill({status:200, headers:{...cors, 'content-range':'*/0'}});
    unknown.push(name);
    return json(route, 500, {message:'The sign-up test has no answer for ' + name});
  };
  const named = name => calls.filter(call => call.name === name);
  return {handle, calls, unknown, named, host, world};
}

async function main() {
  assert(fs.readFileSync('server-ui/index.html', 'utf8').includes('id="root"'), 'Run npm run build:server first');
  const host = supabaseHost();
  const evidence = path.resolve('evidence/web-signup');
  const builds = {open:path.join(evidence, 'app-open'), closed:path.join(evidence, 'app-closed')};
  const base = {...process.env};
  for (const name of Object.keys(base)) if (/^VISTRALO_(SUPABASE|PADDLE|SIGNUP|LEGAL|BILLING|WEB_OUT)/.test(name)) delete base[name];
  const cloudEnv = {...base, VISTRALO_SUPABASE_URL:host, VISTRALO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_signup_test'};
  for (const [name, extra] of [['open', {VISTRALO_BILLING:'on', VISTRALO_SIGNUP:'on', VISTRALO_LEGAL_URL:LEGAL}], ['closed', {}]]) {
    fs.mkdirSync(builds[name], {recursive:true});
    execFileSync(process.execPath, ['scripts/build-web.cjs'], {stdio:'inherit', env:{...cloudEnv, ...extra, VISTRALO_WEB_OUT:builds[name]}});
  }
  // The build refuses to offer sign-up without somewhere to read the terms. It gets a folder of
  // its own: a refused build clears its output so nothing can be served from it.
  builds.refused = path.join(evidence, 'app-refused');
  assert.throws(() => execFileSync(process.execPath, ['scripts/build-web.cjs'], {stdio:'pipe', env:{...cloudEnv, VISTRALO_SIGNUP:'on', VISTRALO_WEB_OUT:builds.refused}}), /VISTRALO_LEGAL_URL/);
  assert.equal(fs.existsSync(path.join(builds.refused, 'app.js')), false, 'a refused build leaves no bundle behind');

  const port = Number(process.env.VISTRALO_UI_TEST_PORT || 8790) + 2;
  const open = await serve(port, builds.open);
  const closed = await serve(port + 1, builds.closed);
  const checks = [];
  let browser;
  try {
    browser = await chromium.launch({headless:true, ...(process.env.VISTRALO_TEST_CHROMIUM ? {executablePath:process.env.VISTRALO_TEST_CHROMIUM} : {})});
    const errors = [], leaks = [], mocks = [];
    const start = async (origin, world = {}, options = {}) => {
      const context = await browser.newContext({viewport:{width:1280, height:800}, reducedMotion:'reduce', ...options});
      const mock = mockSupabase(host, {signup:'confirm', confirmed:false, signupOpen:true, account:null, ...world});
      mocks.push(mock);
      await context.route(url => url.origin !== origin, route => {
        const url = new URL(route.request().url());
        if (url.origin === host) return mock.handle(route);
        if (/^(data|blob):/.test(url.protocol)) return route.continue();
        leaks.push(url.href);
        return route.abort();
      });
      await context.routeWebSocket(/.*/, socket => { leaks.push(socket.url()); socket.close(); });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (/Content Security Policy/i.test(message.text())) errors.push(message.text()); });
      page.setDefaultTimeout(15000);
      await page.goto(origin + '/');
      await page.getByRole('heading', {name:'Sign in to Vistralo', level:1, exact:true}).waitFor();
      return {page, mock};
    };
    const toSignUp = async page => {
      await page.getByRole('button', {name:'Create an account', exact:true}).click();
      await page.getByRole('heading', {name:'Create your Vistralo account', level:1, exact:true}).waitFor();
    };
    const fill = async (page, password = PASSWORD) => {
      await page.getByLabel('Email', {exact:true}).fill(EMAIL);
      await page.getByLabel(/^Password/).fill(password);
    };
    const status = page => page.locator('.login-card [role="status"]');
    // The shell can paint before the account lookup finishes, so wait for the request itself.
    const until = async (test, what) => {
      for (let i = 0; i < 100; i++) { if (test()) return; await new Promise(r => setTimeout(r, 50)); }
      throw Error('Timed out waiting for ' + what);
    };

    // Sign-up off (the default cloud build): the form cannot be reached.
    let {page, mock} = await start(closed.origin);
    assert.equal(await page.getByRole('button', {name:'Create an account', exact:true}).count(), 0);
    await page.getByText('Need access? Contact').waitFor();
    assert.equal(await page.getByRole('button', {name:'See plans and prices', exact:true}).count(), 0);
    await fill(page);
    await page.getByRole('button', {name:'Sign in', exact:true}).click();
    await status(page).filter({hasText:'Email not confirmed'}).waitFor();
    assert.equal(mock.named('POST /auth/v1/signup').length, 0);
    await page.context().close();
    checks.push('with sign-up off the sign-in page offers no account creation and never calls the sign-up endpoint');

    // Sign-up off, and someone whose address exists in Supabase Auth but was never given a workspace.
    ({page, mock} = await start(closed.origin, {confirmed:true}));
    await fill(page);
    await page.getByRole('button', {name:'Sign in', exact:true}).click();
    await page.getByRole('heading', {name:'This account has no workspace yet', level:1, exact:true}).waitFor();
    await page.getByRole('alert').filter({hasText:'Your account has not been granted workspace access.'}).waitFor();
    await page.getByText('Signed in as ' + EMAIL, {exact:true}).waitFor();
    assert.equal(mock.named('POST /rest/v1/rpc/vistralo_complete_signup').length, 0, 'a build with sign-up off never asks for a workspace');
    assert.equal(await page.getByRole('button', {name:'New project', exact:true}).count(), 0, 'the app shell is not shown');
    await page.getByRole('button', {name:'Sign out', exact:true}).click();
    await page.getByRole('heading', {name:'Sign in to Vistralo', level:1, exact:true}).waitFor();
    assert.equal(mock.named('POST /auth/v1/logout').length, 1);
    await page.context().close();
    checks.push('an account with no workspace gets a page that says so and offers sign-out, not an app shell that cannot work');

    // Sign-up on: the form, its rules and its links.
    ({page, mock} = await start(open.origin));
    await toSignUp(page);
    const password = page.getByLabel(/^Password/);
    assert.equal(await password.getAttribute('autocomplete'), 'new-password');
    assert.equal(await password.getAttribute('minlength'), '12');
    assert.equal(await page.getByLabel('Email', {exact:true}).getAttribute('type'), 'email');
    assert.equal(await page.getByRole('link', {name:'Terms', exact:true}).getAttribute('href'), LEGAL + '/terms');
    assert.equal(await page.getByRole('link', {name:'Privacy notice', exact:true}).getAttribute('href'), LEGAL + '/privacy');
    assert.equal(await page.getByRole('button', {name:'Forgot password?', exact:true}).count(), 0);
    await page.screenshot({path:path.join(evidence, 'sign-up.png')});

    // The browser refuses a short password and a malformed address before anything is sent.
    await fill(page, 'too-short');
    await page.getByRole('button', {name:'Create account', exact:true}).click();
    assert.equal(await password.evaluate(input => input.validity.tooShort), true);
    await page.getByLabel('Email', {exact:true}).fill('not-an-address');
    await password.fill(PASSWORD);
    await page.getByRole('button', {name:'Create account', exact:true}).click();
    assert.equal(await page.getByLabel('Email', {exact:true}).evaluate(input => input.validity.typeMismatch), true);
    assert.equal(mock.named('POST /auth/v1/signup').length, 0);
    checks.push('the form asks for an email address and a 12-character password, links to the terms and privacy notice, and sends nothing until both are valid');

    // A valid form: one request, with PKCE and the confirmation address, then back to sign-in with instructions.
    await fill(page);
    await page.getByRole('button', {name:'Create account', exact:true}).click();
    await status(page).filter({hasText:'Check your inbox and confirm your email address, then sign in here.'}).waitFor();
    await page.getByRole('heading', {name:'Sign in to Vistralo', level:1, exact:true}).waitFor();
    assert.equal(await password.inputValue(), '', 'the password is cleared');
    assert.equal(await page.getByLabel('Email', {exact:true}).inputValue(), EMAIL, 'the address is kept for signing in');
    const [sent] = mock.named('POST /auth/v1/signup');
    assert.equal(mock.named('POST /auth/v1/signup').length, 1);
    assert.equal(sent.body.email, EMAIL);
    assert.equal(sent.body.password, PASSWORD);
    assert.equal(sent.body.code_challenge_method, 's256');
    assert.match(sent.body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(sent.query.redirect_to, open.origin + '/auth/callback');
    assert.equal(mock.named('POST /rest/v1/rpc/vistralo_complete_signup').length, 0, 'no workspace before the address is confirmed');
    await page.screenshot({path:path.join(evidence, 'confirm-your-email.png')});
    checks.push('a valid form sends one sign-up request with a PKCE challenge and the callback address, then asks for the email to be confirmed');

    // Signing in before confirming says why.
    await password.fill(PASSWORD);
    await page.getByRole('button', {name:'Sign in', exact:true}).click();
    await status(page).filter({hasText:'Email not confirmed'}).waitFor();
    checks.push('signing in before confirming the address is refused with the reason');

    // Opening the link from the email exchanges its code and creates the workspace.
    await page.goto(open.origin + '/auth/callback?code=mock-confirmation-code');
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    await until(() => mock.named('GET /rest/v1/vistralo_projects').length > 0, 'the project list to be read');
    const [exchange] = mock.named('POST /auth/v1/token?grant_type=pkce');
    assert.equal(exchange.body.auth_code, 'mock-confirmation-code');
    assert.match(exchange.body.code_verifier, /^[A-Za-z0-9_-]{43,}/);
    assert.equal(mock.named('POST /rest/v1/rpc/vistralo_complete_signup').length, 1, 'the workspace is created once');
    assert.match(mock.named('POST /rest/v1/rpc/vistralo_complete_signup')[0].authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(new URL(page.url()).searchParams.has('code'), false, 'the one-time code is removed from the address');
    // The library reads card fields out of each project, not whole projects.
    const listed = mock.named('GET /rest/v1/vistralo_projects')[0].query;
    assert.match(listed.select, /^id,created_at,updated_at,name:document->>name,/);
    assert.equal(/(^|,)(\*|document)(,|$)/.test(listed.select), false, 'the whole document is not requested');
    assert.equal(listed.order, 'updated_at.desc,id.asc');
    assert.equal(listed.limit, '200');
    await page.locator('.workspace-button small', {hasText:'Free plan'}).waitFor();
    await page.screenshot({path:path.join(evidence, 'new-workspace.png')});
    await page.reload();
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    assert.equal(mock.named('POST /rest/v1/rpc/vistralo_complete_signup').length, 1, 'a reload does not create the workspace again');
    await page.context().close();
    checks.push('the confirmation link signs the person in, creates their workspace once and opens Projects on the Free plan');

    // A confirmed person signing in on another device gets the same workspace step.
    ({page, mock} = await start(open.origin, {confirmed:true}));
    await fill(page);
    await page.getByRole('button', {name:'Sign in', exact:true}).click();
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    await until(() => mock.named('GET /rest/v1/vistralo_projects').length > 0, 'the project list to be read');
    assert.equal(mock.named('POST /rest/v1/rpc/vistralo_complete_signup').length, 1);
    await page.context().close();
    checks.push('a confirmed account with no workspace yet gets one on first sign-in');

    // A project with email confirmation switched off returns a session straight away.
    ({page, mock} = await start(open.origin, {signup:'session', confirmed:true}));
    await toSignUp(page);
    await fill(page);
    await page.getByRole('button', {name:'Create account', exact:true}).click();
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    await until(() => mock.named('GET /rest/v1/vistralo_projects').length > 0, 'the project list to be read');
    assert.equal(mock.named('POST /rest/v1/rpc/vistralo_complete_signup').length, 1);
    await page.context().close();
    checks.push('when Supabase returns a session at once, sign-up goes straight to the workspace');

    // Refusals from Supabase Auth and from the database are shown as they are, and the form stays usable.
    for (const [world, text] of [[{signup:'rate'}, 'you can only request this after 52 seconds'], [{signup:'weak'}, 'Password should be at least 12 characters.']]) {
      ({page, mock} = await start(open.origin, world));
      await toSignUp(page);
      await fill(page);
      await page.getByRole('button', {name:'Create account', exact:true}).click();
      await status(page).filter({hasText:text}).waitFor();
      await page.getByRole('heading', {name:'Create your Vistralo account', level:1, exact:true}).waitFor();
      assert.equal(await page.getByRole('button', {name:'Create account', exact:true}).isEnabled(), true);
      await page.context().close();
    }
    ({page, mock} = await start(open.origin, {signup:'session', confirmed:true, signupOpen:false}));
    await toSignUp(page);
    await fill(page);
    await page.getByRole('button', {name:'Create account', exact:true}).click();
    await page.getByRole('heading', {name:'This account has no workspace yet', level:1, exact:true}).waitFor();
    await page.getByRole('alert').filter({hasText:'Sign-up is not open yet. Contact contact@vistralo.com for access.'}).waitFor();
    assert.equal(await page.getByRole('heading', {name:'Projects', level:1, exact:true}).count(), 0);
    assert.equal(mock.named('GET /rest/v1/vistralo_projects').length, 0, 'no workspace data is read');
    await page.screenshot({path:path.join(evidence, 'no-workspace.png')});
    // Once the switch is on, Try again is enough.
    mock.world.signupOpen = true;
    await page.getByRole('button', {name:'Try again', exact:true}).click();
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    await page.context().close();
    checks.push('a rate limit, a rejected password and a closed sign-up switch each show their reason and leave the form usable');

    // Switching back and forth keeps what was typed and clears the message.
    ({page, mock} = await start(open.origin));
    await page.getByRole('button', {name:'See plans and prices', exact:true}).click();
    await page.getByRole('heading', {name:'Plans', level:1, exact:true}).waitFor();
    await page.goBack();
    await page.getByRole('heading', {name:'Sign in to Vistralo', level:1, exact:true}).waitFor();
    await toSignUp(page);
    await fill(page);
    await page.locator('.login-switch').getByRole('button', {name:'Sign in', exact:true}).click();
    await page.getByRole('heading', {name:'Sign in to Vistralo', level:1, exact:true}).waitFor();
    assert.equal(await page.getByLabel('Email', {exact:true}).inputValue(), EMAIL);
    assert.equal(await page.getByLabel(/^Password/).getAttribute('autocomplete'), 'current-password');
    assert.equal(await page.getByLabel(/^Password/).getAttribute('minlength'), null);
    await page.getByRole('button', {name:'Forgot password?', exact:true}).waitFor();
    await page.context().close();
    checks.push('the form switches between signing in and creating an account without losing the address, and plans are one click away');

    // Keyboard only: reach the switch, fill the form and submit without the pointer.
    ({page, mock} = await start(open.origin));
    const tabTo = async name => {
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        if (await page.evaluate(wanted => (document.activeElement?.textContent || '').trim() === wanted || document.activeElement?.closest('label')?.firstChild?.textContent?.trim() === wanted, name)) return;
      }
      throw Error('Tab never reached ' + name);
    };
    await tabTo('Create an account');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', {name:'Create your Vistralo account', level:1, exact:true}).waitFor();
    await page.getByLabel('Email', {exact:true}).focus();
    await page.keyboard.type(EMAIL);
    await page.keyboard.press('Tab');
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');
    await status(page).filter({hasText:'Check your inbox'}).waitFor();
    await page.context().close();
    checks.push('the whole sign-up can be done from the keyboard');

    // Accessibility and layout of the sign-up form.
    for (const [name, width, height, theme, direction, forced] of [
      ['signup-dark', 1280, 800, 'dark', 'ltr', false], ['signup-light', 1920, 1080, 'light', 'ltr', false],
      ['signup-tablet', 768, 1024, 'light', 'ltr', false], ['signup-mobile', 390, 844, 'light', 'ltr', false],
      ['signup-mobile-dark', 390, 844, 'dark', 'ltr', false], ['signup-rtl', 1280, 800, 'light', 'rtl', false],
      ['signup-forced-colors', 1280, 800, 'dark', 'ltr', true],
    ]) {
      const context = await browser.newContext({viewport:{width, height}, reducedMotion:'reduce', forcedColors:forced ? 'active' : 'none'});
      const world = mockSupabase(host, {signup:'rate', confirmed:false, signupOpen:true, account:null});
      mocks.push(world);
      await context.route(url => url.origin !== open.origin, route => new URL(route.request().url()).origin === host ? world.handle(route) : (leaks.push(route.request().url()), route.abort()));
      page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({theme, direction}) => { localStorage.setItem('vistralo-theme', theme); localStorage.setItem('vistralo-direction', direction); }, {theme, direction});
      await page.goto(open.origin + '/');
      await toSignUp(page);
      await fill(page);
      await page.getByRole('button', {name:'Create account', exact:true}).click();
      await status(page).filter({hasText:'52 seconds'}).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(require('axe-core').source);
      const violations = await page.evaluate(async () => (await axe.run(document, {runOnly:{type:'tag', values:['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']}})).violations.map(v => ({id:v.id, nodes:v.nodes.map(n => n.target)})));
      assert.deepEqual(violations, [], name + ' sign-up form');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' has no horizontal overflow');
      assert.equal(await page.locator('h1').count(), 1, name + ' has one H1');
      // Links inside a sentence are exempt from the target-size rule (WCAG 2.5.8, inline exception).
      const small = await page.locator('.login-card button, .login-card input').evaluateAll(nodes => nodes.filter(node => { const box = node.getBoundingClientRect(); return box.width && (box.height < 24 || box.width < 24); }).map(node => node.textContent || node.getAttribute('type')));
      assert.deepEqual(small, [], name + ' targets are at least 24px');
      await page.screenshot({path:path.join(evidence, name + '.png')});
      await context.close();
    }
    checks.push('the sign-up form passes axe and fits at seven widths, themes and directions');

    assert.deepEqual(mocks.flatMap(m => m.unknown), [], 'Every Supabase request has a mocked answer');
    assert.deepEqual(leaks, [], 'Nothing leaves the page except to the mocked Supabase host');
    assert.deepEqual(errors, [], 'No uncaught exceptions or CSP violations');
    checks.push('every request was answered by the mock; none reached Supabase or any other host');
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({passed:true, at:new Date().toISOString(), checks}, null, 2));
    console.log('Sign-up journey passed: ' + checks.length + ' checks');
  } catch (error) {
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({passed:false, error:error.message, checks}, null, 2));
    throw error;
  } finally {
    await browser?.close();
    await open.close();
    await closed.close();
    for (const dir of Object.values(builds)) fs.rmSync(dir, {recursive:true, force:true});
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
