'use strict';
// Repeatable CI checks for the built web app in demo mode; no providers or production data.
// Run npm run build:server first.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { serve } = require('./static-server.cjs');
(async () => {
  const output = path.resolve('evidence/web-accessibility');
  fs.mkdirSync(output, {recursive:true});
  const app = await serve(Number(process.env.VISTRALO_UI_TEST_PORT || 8788) + 1);
  const origin = app.origin;
  let browser;
  const evidence = [];
  try {
    browser = await chromium.launch({headless:true, ...(process.env.VISTRALO_TEST_CHROMIUM ? {executablePath:process.env.VISTRALO_TEST_CHROMIUM} : {})});
    const cases = [
      ['desktop',1440,900,'dark','en','ltr'],
      ['laptop',1280,720,'dark','en','ltr'],
      ['tablet',1024,768,'dark','en','ltr'],
      ['tablet-icon-rail',820,1000,'dark','en','ltr'],
      ['mobile',390,844,'dark','en','ltr'],
      ['zoom-200-equivalent',640,900,'dark','en','ltr'],
      ['light',1440,900,'light','en','ltr'],
      ['german-rtl',1280,900,'dark','de','rtl'],
      ['forced-colors',1440,900,'dark','en','ltr'],
    ];
    for(const [name,width,height,theme,locale,direction] of cases) {
      const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce',forcedColors:name === 'forced-colors' ? 'active' : 'none'});
      await context.addInitScript(({theme,locale,direction}) => {
        localStorage.setItem('vistralo-theme',theme);
        localStorage.setItem('vistralo-locale',locale);
        localStorage.setItem('vistralo-direction',direction);
      },{theme,locale,direction});
      const page = await context.newPage();
      const errors = [];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/#demo/projects');
      await page.locator('.project-card').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(require('axe-core').source);
      const scan = await page.evaluate(async () => {
        const result = await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
        return {violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),incomplete:result.incomplete.map(v=>v.id)};
      });
      const metrics = await page.evaluate(() => ({
        width:innerWidth,documentWidth:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,
        firstRowBottom:Math.max(...Array.from(document.querySelectorAll('.project-card')).slice(0,3).map(el=>el.getBoundingClientRect().bottom)),
      }));
      await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
      evidence.push({name,metrics,...scan,errors});
      assert.equal(scan.violations.length,0,JSON.stringify(evidence.at(-1)));
      assert.equal(metrics.h1,1,name+' must have one H1');
      assert.ok(metrics.documentWidth<=width,name+' must not overflow horizontally');
      if(name==='desktop'||name==='laptop') assert.ok(metrics.firstRowBottom<=height,name+' first row must be fully visible');
      if(name==='tablet-icon-rail') for(const label of [/^Demo workspace/,/^Demo user/]) assert.equal(await page.locator('.rail').getByRole('button',{name:label}).count(),1,label+' must name its icon-rail button');
      // The same library with a selection, and as a list: both must pass axe and fit the width.
      const rescan = async () => page.evaluate(async () => (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
      await page.locator('.project-card .card-selection input').first().check({force:true});
      await page.getByText('1 selected',{exact:true}).waitFor();
      assert.deepEqual(await rescan(),[],name+' with a project selected');
      await page.getByRole('button',{name:'Clear selection',exact:true}).click();
      await page.getByRole('button',{name:'List view',exact:true}).click();
      await page.locator('.project-table tbody tr').first().waitFor();
      assert.deepEqual(await rescan(),[],name+' list view');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),name+' list view must not overflow the page');
      await page.screenshot({path:path.join(output,name+'-list.png'),fullPage:true});
      // Settings and its profile form.
      for(const route of ['settings','settings/profile']) {
        await page.goto(origin+'/#demo/'+route);
        await page.getByRole('heading',{name:'Settings',level:1,exact:true}).waitFor();
        assert.deepEqual(await rescan(),[],name+' '+route);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),name+' '+route+' must not overflow the page');
        assert.equal(await page.locator('h1').count(),1,name+' '+route+' must have one H1');
      }
      assert.deepEqual(errors,[]);
      await context.close();
    }
    // The public share page, built by the vistralo-share function. It is checked twice: once
    // without its policy so axe can be loaded into it, and once under its real policy to prove
    // the hashed stylesheet applies and a script cannot run.
    const {buildSync} = require('esbuild');
    const shareModule = {exports:{}};
    require('node:vm').runInNewContext(buildSync({entryPoints:['supabase/functions/_shared/share-page.ts'],bundle:true,write:false,platform:'browser',format:'cjs'}).outputFiles[0].text,
      {module:shareModule,exports:shareModule.exports,crypto:require('node:crypto').webcrypto,TextEncoder,btoa,Date,Intl});
    const share = shareModule.exports;
    const shareHeaders = share.shareHeaders(await share.styleHash());
    const brief = fs.readFileSync('server-ui/assets/sample-brief.md','utf8');
    const sharePages = {
      walkthrough:share.sharePage({name:'Checkout flow accessibility audit for the spring campaign',type:'walkthrough',mediaUrl:origin+'/assets/sample-walkthrough.mp4',narrated:true,expiresAt:'2026-10-20T09:00:00Z'}),
      brief:share.sharePage({name:'Storefront design review',type:'brief',brief,expiresAt:'2026-10-20T09:00:00Z'}),
      unavailable:share.unavailablePage(),
    };
    for(const [name,width,height,scheme] of [['share-light',1280,900,'light'],['share-dark',1280,900,'dark'],['share-mobile',390,844,'light']]) {
      const context = await browser.newContext({viewport:{width,height},colorScheme:scheme,reducedMotion:'reduce'});
      const page = await context.newPage();
      const blocked = [];
      page.on('console',message=>{if(/Content Security Policy/i.test(message.text()))blocked.push(message.text());});
      for(const [kind,html] of Object.entries(sharePages)) {
        await page.setContent(html);
        await page.evaluate(require('axe-core').source);
        const violations = await page.evaluate(async () => (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
        assert.deepEqual(violations,[],name+' '+kind);
        assert.equal(await page.locator('h1').count(),1,name+' '+kind+' has one H1');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),name+' '+kind+' must not overflow horizontally');
      }
      // Under the function's own headers: the stylesheet applies, and nothing else does.
      await page.route(origin+'/share-check',route=>route.fulfill({status:200,headers:{...shareHeaders,'Content-Security-Policy':shareHeaders['Content-Security-Policy'].replace('https://*.supabase.co',origin)},body:sharePages.walkthrough}));
      await page.goto(origin+'/share-check');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor),scheme==='dark'?'rgb(11, 13, 18)':'rgb(244, 245, 247)',name+' is styled under its own policy');
      assert.deepEqual(blocked,[],name+' loads nothing its policy refuses');
      await page.addScriptTag({content:'window.__ran = true'}).catch(()=>{});
      assert.equal(await page.evaluate(() => window.__ran),undefined,name+' refuses an injected script');
      await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
      evidence.push({name,violations:[]});
      await context.close();
    }
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,at:new Date().toISOString(),cases:evidence},null,2));
    console.log('Web accessibility and viewport checks passed: '+evidence.length+' variants');
  } catch(error) {
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:error.message,cases:evidence},null,2));
    throw error;
  } finally {await browser?.close();await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
