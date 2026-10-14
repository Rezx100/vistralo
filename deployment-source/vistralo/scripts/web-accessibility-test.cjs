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
      // A project's Trim editor (with a part that is out of order) and its Visual brief, read and edited.
      const fits = async label => {
        assert.deepEqual(await rescan(),[],name+' '+label);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),name+' '+label+' must not overflow the page');
      };
      await page.goto(origin+'/#demo/project/demo-homepage-motion');
      await page.getByRole('tab',{name:'Editor',exact:true}).click();
      const parts = page.getByRole('list',{name:'Parts to keep',exact:true});
      await parts.getByLabel('Ends at (seconds)').first().fill('5');
      await page.getByRole('button',{name:'Add a part',exact:true}).click();
      await parts.getByLabel('Starts at (seconds)').nth(1).fill('3');
      await parts.getByLabel('Ends at (seconds)').nth(1).fill('8');
      await parts.locator('.trim-problem').waitFor();
      await fits('trim');
      await page.screenshot({path:path.join(output,name+'-trim.png'),fullPage:true});
      await page.goto(origin+'/#demo/project/demo-storefront-review');
      await page.getByRole('tab',{name:'Visual brief',exact:true}).click();
      await page.locator('.brief-doc').waitFor();
      await fits('brief');
      await page.screenshot({path:path.join(output,name+'-brief.png'),fullPage:true});
      await page.getByRole('button',{name:'Edit',exact:true}).click();
      await page.getByLabel('Brief in Markdown',{exact:true}).waitFor();
      await fits('brief editor');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    // The page a share link opens: /watch#<token>, served with the app's own headers. The
    // vistralo-share function's JSON answer is mocked at the address the page asks.
    const brief = fs.readFileSync('server-ui/assets/sample-brief.md','utf8');
    const TOKEN = 'ab'.repeat(32);
    const film = {mediaUrl:origin+'/assets/sample-walkthrough.mp4',expiresAt:'2026-10-20T09:00:00Z'};
    const answers = {
      walkthrough:[200,{name:'Checkout flow accessibility audit for the spring campaign',type:'walkthrough',...film,narrated:true,working:false},'Narrated by an AI voice.'],
      working:[200,{name:'Onboarding take',type:'walkthrough',...film,narrated:false,working:true},'A narrated version is being prepared and will replace it at this address.'],
      brief:[200,{name:'Storefront design review',type:'brief',brief,expiresAt:'2026-10-20T09:00:00Z'},'Storefront design review'],
      unavailable:[404,{unavailable:true},'It has expired, or the person who made it has switched it off.'],
    };
    const isShareCall = url => url.pathname.endsWith('/functions/v1/vistralo-share');
    for(const [name,width,height,scheme] of [['watch-light',1280,900,'light'],['watch-dark',1280,900,'dark'],['watch-mobile',390,844,'light']]) {
      const context = await browser.newContext({viewport:{width,height},colorScheme:scheme,reducedMotion:'reduce'});
      const page = await context.newPage();
      const problems = [];
      page.on('console',message=>{if(message.type()==='error'||/Content Security Policy/i.test(message.text()))problems.push(message.text());});
      page.on('pageerror',error=>problems.push(error.message));
      for(const [kind,[status,body,text]] of Object.entries(answers)) {
        let asked;
        await page.route(isShareCall,route=>{asked=new URL(route.request().url());return route.fulfill({status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});});
        await page.goto('about:blank');
        const response = await page.goto(origin+'/watch#'+TOKEN);
        await page.getByText(text).first().waitFor();
        assert.equal(asked.searchParams.get('t'),TOKEN,name+' '+kind+' asks for this token');
        assert.equal(asked.searchParams.get('format'),'json');
        // The page is the share page and not the app, kept out of search, and sends no referrer.
        assert.equal(response.headers()['x-robots-tag'],'noindex, nofollow');
        assert.equal(response.headers()['referrer-policy'],'no-referrer');
        assert.equal(response.headers()['content-security-policy'].includes("'unsafe-inline'"),false);
        assert.equal(await page.locator('#root').count(),0,'the React app is not loaded for a viewer');
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme),scheme,name+' follows the device theme');
        await page.evaluate(require('axe-core').source);
        const violations = await page.evaluate(async () => (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
        assert.deepEqual(violations,[],name+' '+kind);
        assert.equal(await page.locator('h1').count(),1,name+' '+kind+' has one H1');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),name+' '+kind+' must not overflow horizontally');
        if(kind==='walkthrough') {
          assert.equal(await page.title(),'Checkout flow accessibility audit for the spring campaign · Vistralo');
          await page.locator('video[aria-label="Checkout flow accessibility audit for the spring campaign"]').waitFor();
          assert.equal(await page.getByRole('link',{name:'Download the video',exact:true}).getAttribute('href'),film.mediaUrl);
          await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
        }
        if(kind==='brief') {
          // The brief arrives as Markdown and is drawn as headings under the page's own H1.
          assert.ok(await page.locator('.watch-brief h2').count()>0);
          assert.equal(await page.locator('.watch-brief script').count(),0);
        }
        await page.unroute(isShareCall);
      }
      // A link with no token, or a malformed one, says so without asking anything.
      let calls = 0;
      await page.route(isShareCall,route=>{calls++;return route.abort();});
      for(const hash of ['','#not-a-token']) {
        await page.goto('about:blank');
        await page.goto(origin+'/watch'+hash);
        await page.getByRole('heading',{name:'This link is unavailable',level:1}).waitFor();
      }
      assert.equal(calls,0);
      // A failed request is told apart from an expired link.
      await page.goto('about:blank');
      await page.goto(origin+'/watch#'+TOKEN);
      await page.getByRole('heading',{name:'This link could not be opened',level:1}).waitFor();
      await page.getByText('Check your connection and reload the page.').waitFor();
      await page.unroute(isShareCall);
      assert.deepEqual(problems.filter(text=>!/Failed to load resource|net::ERR_FAILED/.test(text)),[],name+' has no console errors or refused resources');
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
