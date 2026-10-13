'use strict';
// Browser journey through plans and billing in demo mode, where a test checkout stands in for Paddle.
// It builds a second copy of the app with VISTRALO_BILLING=on; nothing here contacts Paddle or Supabase.
// Run npm run build:server first (the flag-off build is checked too).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const {serve} = require('./static-server.cjs');

async function main() {
  assert(fs.readFileSync('server-ui/index.html', 'utf8').includes('id="root"'), 'Run npm run build:server first');
  const evidence = path.resolve('evidence/web-billing');
  const build = path.join(evidence, 'app');
  fs.mkdirSync(build, {recursive:true});
  const env = {...process.env, VISTRALO_BILLING:'on', VISTRALO_WEB_OUT:build};
  for (const name of Object.keys(env)) if (/^VISTRALO_(SUPABASE|PADDLE|SIGNUP|LEGAL)/.test(name)) delete env[name];
  execFileSync(process.execPath, ['scripts/build-web.cjs'], {stdio:'inherit', env});

  const off = await serve(Number(process.env.VISTRALO_UI_TEST_PORT || 8790));
  const on = await serve(Number(process.env.VISTRALO_UI_TEST_PORT || 8790) + 1, build);
  const checks = [];
  let browser;
  try {
    browser = await chromium.launch({headless:true, ...(process.env.VISTRALO_TEST_CHROMIUM ? {executablePath:process.env.VISTRALO_TEST_CHROMIUM} : {})});
    const errors = [], requests = [];
    const open = async (origin, options = {}) => {
      const context = await browser.newContext({viewport:{width:1440, height:900}, reducedMotion:'reduce', ...options});
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (/Content Security Policy/i.test(message.text())) errors.push(message.text()); });
      page.on('request', request => { if (!request.url().startsWith(origin) && !/^(data|blob):/.test(request.url())) requests.push(request.url()); });
      page.setDefaultTimeout(15000);
      return page;
    };
    const workspace = page => page.locator('.workspace-button');
    const settle = page => page.locator('.toast-message');

    // Flag off: the default build shows nothing about plans, and the pricing route is just Projects.
    let page = await open(off.origin);
    await page.goto(off.origin + '/#demo/pricing');
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    await workspace(page).click();
    assert.equal(await page.getByRole('menuitem', {name:'Plan and billing', exact:true}).count(), 0);
    assert.equal(await workspace(page).locator('small').innerText(), 'Free plan');
    await page.keyboard.press('Escape');
    await page.locator('.rail-footer').getByRole('button', {name:'Settings', exact:true}).click();
    assert.equal(await page.getByRole('tab', {name:'Billing', exact:true}).count(), 0);
    await page.context().close();
    checks.push('with the flag off there is no plan menu item, settings tab or pricing page');

    // Flag on.
    page = await open(on.origin);
    await page.goto(on.origin + '/#demo/projects');
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    await workspace(page).locator('small', {hasText:'Free plan'}).waitFor();
    assert.equal(await page.locator('.billing-notice').count(), 0, 'No banner without a subscription');

    const openBilling = async () => {
      await workspace(page).click();
      await page.getByRole('menuitem', {name:'Plan and billing', exact:true}).click();
      const dialog = page.getByRole('dialog', {name:'Preferences', exact:true});
      await dialog.getByRole('tab', {name:'Billing', exact:true, selected:true}).waitFor();
      return dialog;
    };
    const preview = async label => {
      const dialog = await openBilling();
      await dialog.getByLabel('Preview a billing state').selectOption({label});
      return dialog;
    };
    const done = dialog => dialog.getByRole('button', {name:'Done', exact:true}).click();

    let settings = await openBilling();
    await settings.getByText('Free plan', {exact:true}).waitFor();
    await settings.getByText('8 of 5', {exact:true}).waitFor();
    await settings.getByText(/Limits are shown but not applied in this demo/).waitFor();
    await page.screenshot({path:path.join(evidence, 'settings-free.png')});
    await settings.getByRole('switch', {name:/Apply plan limits in this demo/}).check();
    await done(settings);
    checks.push('Plan and billing shows the plan, usage against each limit, and that limits are off in the demo');

    // At the project limit, starting anything new offers the upgrade instead of the create flow.
    await page.getByRole('button', {name:'New project', exact:true}).click();
    await page.getByRole('menuitem', {name:/^Narrate a video/}).click();
    const prompt = page.getByRole('dialog', {name:'The Free plan holds 5 projects', exact:true});
    await prompt.waitFor();
    assert.equal(await page.getByRole('dialog', {name:'Narrate a video', exact:true}).count(), 0, 'The create flow does not open at the limit');
    await page.screenshot({path:path.join(evidence, 'upgrade-prompt.png')});
    await prompt.getByRole('button', {name:'See plans', exact:true}).click();
    await page.getByRole('heading', {name:'Plans', level:1, exact:true}).waitFor();
    checks.push('at the project limit an upgrade prompt replaces the create flow and leads to Plans');

    // A 30-day share link is a paid-plan option.
    await page.getByRole('button', {name:'Back to projects', exact:true}).click();
    await page.getByRole('heading', {name:'Projects', level:1, exact:true}).waitFor();
    await page.locator('.project-card', {hasText:'Homepage motion study'}).getByRole('button', {name:/^Share/}).first().click();
    const share = page.getByRole('dialog', {name:/^Share /});
    assert.equal(await share.locator('option', {hasText:'30 days (paid plans)'}).evaluate(option => option.disabled), true);
    assert.equal(await share.locator('option', {hasText:'7 days'}).evaluate(option => option.disabled), false);
    await share.getByRole('button', {name:'Close dialog', exact:true}).click();
    checks.push('the share dialog marks 30 days as a paid-plan option on Free');

    // Plans page: three plans, test prices, and the test checkout in place of Paddle.
    await workspace(page).click();
    await page.getByRole('menuitem', {name:'Plan and billing', exact:true}).click();
    await page.getByRole('dialog', {name:'Preferences', exact:true}).getByRole('button', {name:'See plans', exact:true}).click();
    await page.getByRole('heading', {name:'Plans', level:1, exact:true}).waitFor();
    const plan = name => page.locator('.plan', {has:page.getByRole('heading', {name:new RegExp('^' + name), level:2})});
    assert.equal(await page.locator('.plan').count(), 3);
    await plan('Pro').getByText('$12', {exact:true}).waitFor();
    await plan('Free').getByText('Your plan', {exact:true}).waitFor();
    await page.getByRole('group', {name:'Billing period', exact:true}).getByRole('button', {name:'Yearly', exact:true}).click();
    await plan('Studio').getByText('$360', {exact:true}).waitFor();
    await page.getByRole('group', {name:'Billing period', exact:true}).getByRole('button', {name:'Monthly', exact:true}).click();
    await page.screenshot({path:path.join(evidence, 'plans-desktop.png'), fullPage:true});

    await plan('Pro').getByRole('button', {name:'Choose Pro', exact:true}).click();
    let checkout = page.getByRole('dialog', {name:'Test checkout', exact:true});
    await checkout.getByText('$12 / month', {exact:true}).waitFor();
    await page.screenshot({path:path.join(evidence, 'test-checkout.png')});
    await checkout.getByRole('button', {name:'Decline the card', exact:true}).click();
    await settle(page).filter({hasText:'The test card was declined'}).waitFor();
    await workspace(page).locator('small', {hasText:'Free plan'}).waitFor();
    checks.push('a declined test payment changes nothing and says so');

    await plan('Pro').getByRole('button', {name:'Choose Pro', exact:true}).click();
    checkout = page.getByRole('dialog', {name:'Test checkout', exact:true});
    await checkout.getByRole('button', {name:'Complete test payment', exact:true}).click();
    await settle(page).filter({hasText:'You are on the Pro plan'}).waitFor();
    await workspace(page).locator('small', {hasText:/^Pro plan$/}).waitFor();
    await plan('Pro').getByText('Your plan', {exact:true}).waitFor();
    assert.equal(await plan('Pro').getByRole('button', {name:'Current plan', exact:true}).isDisabled(), true);
    await plan('Studio').getByRole('button', {name:'Switch to Studio', exact:true}).waitFor();
    checks.push('a completed test payment moves the workspace to Pro');

    // The limit is lifted: the create flow opens again.
    await page.getByRole('button', {name:'Back to projects', exact:true}).click();
    await page.getByRole('button', {name:'New project', exact:true}).click();
    await page.getByRole('menuitem', {name:/^Analyze a website/}).click();
    const site = page.getByRole('dialog', {name:'Analyze a website', exact:true});
    await site.waitFor();
    await page.keyboard.press('Escape');
    await site.waitFor({state:'detached'});
    checks.push('after upgrading, creating a project works again');

    // Past due, paused, ending and ended each say what happened and offer the one useful next step.
    const banner = page.locator('.billing-notice');
    await done(await preview('Pro, payment past due'));
    await banner.getByText('Your last payment did not go through', {exact:true}).waitFor();
    await banner.getByRole('button', {name:'Update payment method', exact:true}).waitFor();
    await workspace(page).locator('small', {hasText:'Pro plan · Past due'}).waitFor();
    await page.screenshot({path:path.join(evidence, 'state-past-due.png')});

    await done(await preview('Pro, paused'));
    await banner.getByText('Your Pro subscription is paused', {exact:true}).waitFor();
    await workspace(page).locator('small', {hasText:'Pro plan · Paused'}).waitFor();
    await page.screenshot({path:path.join(evidence, 'state-paused.png')});
    await banner.getByRole('button', {name:'Resume subscription', exact:true}).click();
    await settle(page).filter({hasText:'Your subscription is active again'}).waitFor();
    await banner.waitFor({state:'detached'});

    await done(await preview('Pro, cancellation scheduled'));
    await banner.getByText(/^Pro ends on /).waitFor();
    await banner.getByRole('button', {name:'Keep Pro', exact:true}).click();
    await settle(page).filter({hasText:'Your plan will keep renewing'}).waitFor();
    await banner.waitFor({state:'detached'});

    settings = await preview('Pro, ended');
    await settings.getByText('Your Pro subscription has ended').waitFor();
    await page.screenshot({path:path.join(evidence, 'settings-ended.png')});
    await done(settings);
    await banner.getByText('Your Pro subscription has ended', {exact:true}).waitFor();
    await workspace(page).locator('small', {hasText:/^Free plan$/}).waitFor();
    await page.screenshot({path:path.join(evidence, 'state-ended.png')});
    await banner.getByRole('button', {name:'Dismiss', exact:true}).click();
    await banner.waitFor({state:'detached'});
    checks.push('past due, paused, cancellation scheduled and ended each show their own notice and action');
    await page.context().close();

    // Accessibility and layout of the Plans page and the billing tab, across themes and widths.
    for (const [name, width, height, theme, direction, forced] of [
      ['plans-dark', 1440, 900, 'dark', 'ltr', false], ['plans-light', 1280, 720, 'light', 'ltr', false],
      ['plans-tablet', 1024, 768, 'dark', 'ltr', false], ['plans-mobile', 390, 844, 'light', 'ltr', false],
      ['plans-rtl', 1280, 900, 'dark', 'rtl', false], ['plans-forced-colors', 1440, 900, 'dark', 'ltr', true],
    ]) {
      page = await open(on.origin, {viewport:{width, height}, forcedColors:forced ? 'active' : 'none'});
      await page.addInitScript(({theme, direction}) => { localStorage.setItem('vistralo-theme', theme); localStorage.setItem('vistralo-direction', direction); }, {theme, direction});
      await page.goto(on.origin + '/#demo/pricing');
      await page.getByRole('heading', {name:'Plans', level:1, exact:true}).waitFor();
      await page.getByText('$12', {exact:true}).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(require('axe-core').source);
      const scan = async () => page.evaluate(async () => (await axe.run(document, {runOnly:{type:'tag', values:['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']}})).violations.map(v => ({id:v.id, nodes:v.nodes.map(n => n.target)})));
      assert.deepEqual(await scan(), [], name + ' Plans page');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' has no horizontal overflow');
      assert.equal(await page.locator('h1').count(), 1, name + ' has one H1');
      await page.screenshot({path:path.join(evidence, name + '.png'), fullPage:true});
      if (width >= 768) await page.locator('.workspace-button').click();
      else { await page.getByRole('button', {name:'Open navigation', exact:true}).click(); await page.locator('.workspace-button').click(); }
      await page.getByRole('menuitem', {name:'Plan and billing', exact:true}).click();
      const dialog = page.getByRole('dialog', {name:'Preferences', exact:true});
      await dialog.getByLabel('Preview a billing state').selectOption({label:'Pro, payment past due'});
      await dialog.getByText('Your last payment did not go through').waitFor();
      assert.deepEqual(await scan(), [], name + ' billing tab');
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, name + ' billing tab fits its sheet');
      await page.screenshot({path:path.join(evidence, name.replace('plans', 'settings') + '.png')});
      await page.context().close();
    }
    checks.push('Plans and the billing tab pass axe and fit at six widths, themes and directions');

    assert.deepEqual(requests, [], 'The demo with plans on contacts no other host, Paddle included');
    assert.deepEqual(errors, [], 'No uncaught exceptions or CSP violations');
    checks.push('no request leaves the page, and there are no exceptions or CSP violations');
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({passed:true, at:new Date().toISOString(), checks}, null, 2));
    console.log('Billing journey passed: ' + checks.length + ' checks');
  } catch (error) {
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({passed:false, error:error.message, checks}, null, 2));
    throw error;
  } finally {
    await browser?.close();
    await off.close();
    await on.close();
    fs.rmSync(build, {recursive:true, force:true});
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
