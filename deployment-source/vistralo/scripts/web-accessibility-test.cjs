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
  const app = await serve(8789);
  const origin = app.origin;
  let browser;
  const evidence = [];
  try {
    browser = await chromium.launch({headless:true, ...(process.env.VISTRALO_TEST_CHROMIUM ? {executablePath:process.env.VISTRALO_TEST_CHROMIUM} : {})});
    const cases = [
      ['desktop',1440,900,'dark','en','ltr'],
      ['laptop',1280,720,'dark','en','ltr'],
      ['tablet',1024,768,'dark','en','ltr'],
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
      assert.deepEqual(errors,[]);
      await context.close();
    }
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,at:new Date().toISOString(),cases:evidence},null,2));
    console.log('Web accessibility and viewport checks passed: '+evidence.length+' variants');
  } catch(error) {
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:error.message,cases:evidence},null,2));
    throw error;
  } finally {await browser?.close();await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
