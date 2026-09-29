'use strict';
// Build read: opens the recorded website in a headless Chrome, reads what its code actually loads and runs,
// and ties that evidence to the recorded viewports so the walkthrough can say how each effect is built.
const fs=require('node:fs');const crypto=require('node:crypto');const net=require('node:net');const dns=require('node:dns').promises;const {spawn}=require('node:child_process');
const {within,atomic}=require('./core.cjs');const {diff,shiftOf,W,H}=require('./viewports.cjs');

// A library counts as seen when its file loads, its code is inside a loaded script, or it runs on the page.
const LIBRARIES=[
 {name:'GSAP',role:'animation',file:/gsap/i,code:/GreenSock|\bgsap\.(?:to|from|fromTo|timeline|registerPlugin)\(/,version:/GSAP\s+(\d+\.\d+\.\d+)/},
 {name:'ScrollTrigger',role:'scroll-driven animation',file:/scrolltrigger/i,code:/ScrollTrigger\.(?:create|refresh|update)|\bpin-spacer\b/},
 {name:'SplitText',role:'text splitting',file:/splittext/i,code:/\bSplitText\b/},
 {name:'Three.js',role:'WebGL 3D',file:/(?:^|[/._-])three(?:\.module|\.min|\.core)?(?:[/._-]|$)/i,code:/WebGLRenderer|THREE\.REVISION|__THREE__/,version:/REVISION\s*=\s*["'](\d+)/},
 {name:'Lenis',role:'smooth scroll',file:/lenis/i,code:/new Lenis\(|lenis-smooth|\.lenis\.raf\(/},
 {name:'Barba',role:'page transitions',file:/barba/i,code:/@barba\/core|barba\.init\(|data-barba=/},
 {name:'Swiper',role:'carousel',file:/swiper/i,code:/new Swiper\(|swiper-wrapper/,version:/Swiper\s+(\d+\.\d+\.\d+)/},
 {name:'Lottie',role:'vector animation',file:/lottie|bodymovin/i,code:/bodymovin|lottie\.loadAnimation\(|<lottie-player|dotlottie/},
 {name:'Rive',role:'interactive vector animation',file:/@rive-app|rive\.wasm|\/rive[.-]/i,code:/@rive-app|rive\.wasm/},
 {name:'Spline',role:'3D scene',file:/splinetool|spline\.design|splinecode/i,code:/@splinetool|prod\.spline\.design|<spline-viewer/},
 {name:'PixiJS',role:'WebGL 2D',file:/(?:^|[/._-])pixi/i,code:/PIXI\.VERSION|pixi\.js/},
 {name:'Babylon.js',role:'WebGL 3D',file:/babylon/i,code:/BABYLON\.Engine/},
 {name:'OGL',role:'WebGL',file:/(?:^|[/._-])ogl(?:[/._-]|$)/i,code:null},
 {name:'Locomotive Scroll',role:'smooth scroll',file:/locomotive/i,code:/LocomotiveScroll|data-scroll-container/},
 {name:'Framer Motion',role:'animation',file:/framer-motion/i,code:/framer-motion/},
 {name:'anime.js',role:'animation',file:/(?:^|[/._-])anime(?:\.min|\.es)?\.js|animejs/i,code:/animejs/},
 {name:'SplitType',role:'text splitting',file:/split-type/i,code:/\bSplitType\b/},
 {name:'Matter.js',role:'2D physics',file:/matter(?:\.min)?\.js|matter-js/i,code:/Matter\.Engine/},
 {name:'p5.js',role:'creative coding canvas',file:/(?:^|[/._-])p5(?:\.min)?\.js/i,code:null},
 {name:'jQuery',role:'DOM scripting',file:/jquery/i,code:/jQuery v\d/,version:/jQuery v(\d+\.\d+\.\d+)/},
 {name:'Finsweet Attributes',role:'Webflow attribute scripts',file:/@finsweet\/attributes|finsweet/i,code:null},
];
const TECHNIQUES=[['IntersectionObserver reveals',/new IntersectionObserver\(/],['GLSL shaders',/gl_FragColor|gl_Position|precision (?:highp|mediump) float/],['View Transitions API',/startViewTransition\(/],['Canvas 2D drawing',/getContext\(["']2d["']\)/]];
const BUNDLERS=[['Vite',/__vite__mapDeps|vite\/modulepreload-polyfill|rolldown-runtime/],['webpack',/__webpack_require__|webpackChunk/],['Turbopack',/TURBOPACK|turbopack-/],['Parcel',/parcelRequire/]];
const BUILDERS=[['Webflow',/data-wf-site=|website-files\.com|webflow\.js/i],['Framer',/framerusercontent\.com|data-framer-/i],['Wix',/static\.wixstatic\.com|wix-thunderbolt/i],['Squarespace',/static1\.squarespace\.com|squarespace-cdn/i],['Shopify',/cdn\.shopify\.com|Shopify\.theme/i],['WordPress',/\/wp-content\/|\/wp-includes\//i]];
const FRAMEWORKS=[['Next.js',/__NEXT_DATA__|self\.__next_f|\/_next\/static\//],['Nuxt',/__NUXT__|\/_nuxt\//],['Gatsby',/___gatsby/],['Astro',/<astro-island|astro-cid-/],['SvelteKit',/__sveltekit|\/_app\/immutable\//],['Remix',/__remixContext|__reactRouterContext/],['Angular',/\bng-version=/]];
const RANK={code:1,file:2,runtime:3};
// Analytics, consent and payment scripts draw on canvases too, but they are not how the page is built.
const THIRD_PARTY=/mixpanel|googletagmanager|google-analytics|gtag|hotjar|clarity\.ms|segment|facebook|fbevents|stripe|cookieyes|cookiebot|onetrust|intercom|hubspot|hs-scripts|sentry|recaptcha|hcaptcha|posthog|amplitude|fullstory|tiktok|linkedin|doubleclick/i;

const privateAddress=a=>{
 if(net.isIPv4(a)){const [x,y]=a.split('.').map(Number);return x===0||x===10||x===127||x>=224||(x===100&&y>=64&&y<128)||(x===169&&y===254)||(x===172&&y>=16&&y<32)||(x===192&&y===168)||(x===198&&(y===18||y===19));}
 const s=String(a).toLowerCase();if(s.startsWith('::ffff:'))return privateAddress(s.slice(7));return s==='::'||s==='::1'||/^f[cd]/.test(s)||/^fe[89ab]/.test(s)||s.startsWith('ff');};
// Only public http(s) pages without credentials; the browser never visits private or local addresses.
function publicUrl(raw){let u;try{u=new URL(String(raw||'').trim());}catch{return null;}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(host==='localhost'||/\.(?:localhost|local|internal|lan|home|arpa)$/.test(host)||(!net.isIP(host)&&!host.includes('.'))||(net.isIP(host)&&privateAddress(host)))return null;
 u.hash='';return u.href;}
function resolvesPublic(host,cache){host=host.replace(/^\[|\]$/g,'');if(net.isIP(host))return Promise.resolve(!privateAddress(host));
 if(!cache.has(host))cache.set(host,dns.lookup(host,{all:true}).then(list=>list.length>0&&list.every(x=>!privateAddress(x.address))).catch(()=>false));return cache.get(host);}

const fileName=url=>{try{const u=new URL(url);return (u.pathname.split('/').filter(Boolean).pop()||u.hostname).slice(0,80);}catch{return String(url).slice(0,80);}};
const filePath=url=>{try{const u=new URL(url);return u.hostname+u.pathname;}catch{return String(url);}};
function scanScript(url,text=''){const file=fileName(url),where=filePath(url),hits=[];
 const imports=text?[...new Set([...text.matchAll(/["'`]([^"'`\s]{1,200}?\.m?js)["'`]/g)].map(m=>m[1]))]:[];
 for(const lib of LIBRARIES){const byFile=lib.file.test(where),byCode=!byFile&&!!lib.code&&!!text&&lib.code.test(text);
  const imported=!byFile&&!byCode?imports.find(s=>lib.file.test(s)):null;if(!byFile&&!byCode&&!imported)continue;
  const version=(lib.version&&text&&(text.match(lib.version)||[])[1])||(byFile&&(file.match(/[-@](\d+\.\d+\.\d+)/)||[])[1])||null;
  hits.push({name:lib.name,via:byFile?'file':'code',version,file:imported?`${file} (imports ${imported.split('/').pop()})`:file});}
 return {hits,techniques:text?TECHNIQUES.filter(([,re])=>re.test(text)).map(([name])=>name):[],bundler:text?(BUNDLERS.find(([,re])=>re.test(text))||[])[0]||null:null};}
function parseHtml(html='',base){const scripts=[];
 for(const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)){try{scripts.push(new URL(m[1].replace(/&amp;/g,'&'),base).href);}catch{}}
 const generator=(html.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']generator["']/i)||[])[1]||null;
 const builders=BUILDERS.filter(([name,re])=>re.test(html)||new RegExp(name,'i').test(generator||'')).map(([name])=>name);
 const frameworks=FRAMEWORKS.filter(([,re])=>re.test(html)).map(([name])=>name);
 const fonts=[];for(const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi))for(const f of m[1].replace(/&amp;/g,'&').matchAll(/family=([^&:]+)/g))fonts.push(decodeURIComponent(f[1].replace(/\+/g,' '))+' (Google Fonts)');
 if(/use\.typekit\.net/i.test(html))fonts.push('Adobe Fonts kit');
 const markers=[];const finsweet=(html.match(/\sfs-[a-z]+-element=/gi)||[]).length;if(finsweet)markers.push(`${finsweet} Finsweet fs- attributes`);
 const canvases=(html.match(/<canvas\b/gi)||[]).length;if(canvases)markers.push(`${canvases} canvas tag${canvases>1?'s':''} in the HTML`);
 return {scripts:[...new Set(scripts)],generator,builders,frameworks,fonts:[...new Set(fonts)],markers};}
// A bot wall or an empty shell carries no evidence about the real site.
function detectBlock({status=200,title='',textLength=0,html=''}){
 if(/just a moment|attention required|access denied|verify(?:ing)? you are (?:a )?human|are you a robot|security check|checking your browser|pardon our interruption|request blocked|ddos protection/i.test(title))return `challenge page ("${title.trim().slice(0,60)}")`;
 if(textLength<1500&&/cf-chl|_cf_chl_opt|challenge-platform|cf-browser-verification|captcha-delivery\.com|px-captcha|_Incapsula_Resource|ddos-guard|sucuri_cloudproxy/i.test(html))return 'bot challenge markers';
 if([401,403,429,503].includes(status)&&textLength<3000)return `HTTP ${status} with a short page`;
 if(html.length<2000&&textLength<200)return 'tiny HTML shell';
 return null;}

// Runs in the page before its own scripts: records the context type each canvas asked for, and which elements scripts keep restyling.
function instrument(){
 const mark=(el,value)=>{try{if(!el.__vistraloCtx)Object.defineProperty(el,'__vistraloCtx',{value,configurable:true});}catch{}};
 const proto=HTMLCanvasElement.prototype,get=proto.getContext;proto.getContext=function(type,...rest){const ctx=get.call(this,type,...rest);if(ctx)mark(this,String(type).toLowerCase());return ctx;};
 const off=proto.transferControlToOffscreen;if(off)proto.transferControlToOffscreen=function(){mark(this,'offscreen');return off.call(this);};
 const counts=new WeakMap(),moving=new Set();window.__vistraloMoving=moving;
 new MutationObserver(list=>{for(const m of list){const n=(counts.get(m.target)||0)+1;counts.set(m.target,n);if(n===4)moving.add(m.target);}}).observe(document,{attributes:true,attributeFilter:['style'],subtree:true});}
// What is on screen at the current scroll position.
function inView(){
 const VH=innerHeight,VW=innerWidth,out=[];
 const name=el=>{let s=el.tagName.toLowerCase();if(el.id&&!/^w-node/.test(el.id))s+='#'+el.id.slice(0,24);const c=[...el.classList].filter(x=>!/^(?:w-|is-|swiper-slide-)/.test(x)).slice(0,2).map(x=>x.slice(0,28));if(c.length)s+='.'+c.join('.');return s;};
 const seen=el=>{const r=el.getBoundingClientRect();return r.width>8&&r.height>8&&r.bottom>0&&r.top<VH&&r.right>0&&r.left<VW?r:null;};
 // checkVisibility also covers a transparent or hidden ancestor.
 const shown=el=>{const r=seen(el);if(!r)return null;if(el.checkVisibility)return el.checkVisibility({opacityProperty:true,visibilityProperty:true})?r:null;const s=getComputedStyle(el);return s.visibility==='hidden'||Number(s.opacity)===0?null:r;};
 const size=r=>`${Math.round(r.width)}x${Math.round(r.height)}`,big=r=>r&&r.width*r.height>=VW*VH*.02;
 for(const c of document.querySelectorAll('canvas')){const r=shown(c);if(big(r))out.push({kind:'canvas',text:`canvas ${c.__vistraloCtx||'without a context'} ${size(r)} in ${name(c.parentElement||c)}`});}
 for(const v of document.querySelectorAll('video')){const r=shown(v);if(!big(r))continue;const src=(v.currentSrc||v.src||'').split('?')[0].split('/').pop().slice(0,40);out.push({kind:'video',text:`video ${size(r)}${v.autoplay?' autoplay':''}${v.loop?' loop':''}${v.muted?' muted':''}${src?' '+src:''}`});}
 for(const el of document.querySelectorAll('lottie-player,dotlottie-player,[data-animation-type="lottie"],[data-lottie]')){const r=seen(el);if(r)out.push({kind:'lottie',text:`Lottie animation ${size(r)} (${name(el)})`});}
 for(const el of document.querySelectorAll('.swiper-initialized,.swiper-container-initialized,.splide.is-initialized,.slick-initialized,.flickity-enabled')){const r=seen(el);if(!r)continue;const kind=el.swiper||/swiper/.test(el.className)?'Swiper':/splide/.test(el.className)?'Splide':/slick/.test(el.className)?'Slick':'Flickity';out.push({kind:'carousel',text:`${kind} carousel ${size(r)} (${name(el)})`});}
 for(const el of document.querySelectorAll('.pin-spacer')){if(seen(el))out.push({kind:'pin',text:`ScrollTrigger pinned section (${name(el.firstElementChild||el)})`});}
 for(const el of document.querySelectorAll('spline-viewer,model-viewer')){const r=seen(el);if(r)out.push({kind:'3d',text:`${el.tagName.toLowerCase()} ${size(r)}`});}
 for(const el of document.querySelectorAll('iframe')){const r=seen(el);if(r&&/youtube|vimeo|spline|wistia|loom/i.test(el.src||''))out.push({kind:'embed',text:`embedded ${new URL(el.src,location.href).hostname} ${size(r)}`});}
 // The largest elements name the group; cursors and loaders are small or off screen.
 const largest=els=>[...new Set(els.map(el=>{const r=shown(el);return {el,r,a:r?r.width*r.height:0};}).filter(x=>x.r&&!(x.r.width>VW*2&&x.r.height>VH*2)).sort((a,b)=>b.a-a.a).map(x=>name(x.el)))].slice(0,3).join(', ');
 const tweened=[...document.querySelectorAll('body *')].filter(el=>el._gsap&&shown(el));
 if(tweened.length)out.push({kind:'gsap',text:`${tweened.length} GSAP-animated element${tweened.length>1?'s':''} (${largest(tweened)})`});
 const moving=[...(window.__vistraloMoving||[])].filter(el=>{if(!el.isConnected||el._gsap||!(el instanceof Element)||el===document.body)return false;const r=shown(el);return r&&r.width*r.height>=VW*VH*.005;});
 if(moving.length)out.push({kind:'scripted',text:`${moving.length} element${moving.length>1?'s':''} restyled by script (${largest(moving)})`});
 const groups=new Map();for(const a of document.getAnimations?document.getAnimations():[]){const t=a.effect&&a.effect.target;if(!(t instanceof Element)||!seen(t))continue;
  const label=a.animationName?`CSS animation "${a.animationName}"`:a.transitionProperty?`CSS transition of ${a.transitionProperty}`:'Web Animations API';const g=groups.get(label)||new Set();g.add(name(t));groups.set(label,g);}
 for(const [label,els] of [...groups].slice(0,3))out.push({kind:'css',text:`${label} on ${[...els].slice(0,2).join(', ')}${els.size>2?` and ${els.size-2} more`:''}`});
 return out.slice(0,8);}
function pageInfo(){
 const w=window,d=document,rt={},ver=o=>o&&typeof o.version==='string'?o.version:'';
 if(w.__THREE__||w.THREE)rt['Three.js']=w.__THREE__?'r'+w.__THREE__:w.THREE.REVISION?'r'+w.THREE.REVISION:'';
 if(w.gsap)rt.GSAP=ver(w.gsap);if(w.ScrollTrigger)rt.ScrollTrigger=ver(w.ScrollTrigger);if(w.SplitText)rt.SplitText='';
 if(w.Lenis||d.documentElement.classList.contains('lenis'))rt.Lenis=ver(w.Lenis);if(w.barba)rt.Barba=ver(w.barba);if(w.Swiper)rt.Swiper=ver(w.Swiper);
 if(w.lottie||w.bodymovin)rt.Lottie=ver(w.lottie||w.bodymovin);if(w.rive)rt.Rive='';if(w.PIXI)rt.PixiJS=w.PIXI.VERSION||'';if(w.BABYLON)rt['Babylon.js']='';
 if(w.LocomotiveScroll)rt['Locomotive Scroll']='';if(w.anime)rt['anime.js']=ver(w.anime);if(w.Matter)rt['Matter.js']='';if(w.jQuery)rt.jQuery=(w.jQuery.fn&&w.jQuery.fn.jquery)||'';
 const dom={gsap:0,pin:d.querySelectorAll('.pin-spacer').length,swiper:d.querySelectorAll('.swiper-initialized,.swiper-container-initialized').length,lottie:d.querySelectorAll('lottie-player,dotlottie-player,[data-animation-type="lottie"]').length};
 for(const el of d.querySelectorAll('*'))if(el._gsap)dom.gsap++;
 const frameworks=[];if(w.__NEXT_DATA__||w.next||w.__next_f)frameworks.push('Next.js');if(w.__NUXT__||w.$nuxt)frameworks.push('Nuxt');if(d.getElementById('___gatsby'))frameworks.push('Gatsby');
 if(d.querySelector('astro-island'))frameworks.push('Astro');if(w.__VUE__)frameworks.push('Vue');
 if([...d.querySelectorAll('body, body > div')].some(el=>el._reactRootContainer||Object.keys(el).some(k=>k.startsWith('__reactContainer')||k.startsWith('__reactFiber'))))frameworks.push('React');
 const canvases=[...d.querySelectorAll('canvas')].map(c=>{const r=c.getBoundingClientRect();return {type:c.__vistraloCtx||'unknown',width:Math.round(r.width),height:Math.round(r.height)};}).filter(c=>c.width*c.height>0).slice(0,12);
 const fonts=new Set();try{for(const f of d.fonts)if(f.status==='loaded')fonts.add(`${f.family.replace(/["']/g,'')} ${f.weight}${f.style!=='normal'?' '+f.style:''}`);}catch{}
 const face=sel=>{const el=d.querySelector(sel);if(!el)return null;const s=getComputedStyle(el);return `${s.fontFamily.split(',')[0].replace(/["']/g,'').trim()} ${s.fontWeight} ${Math.round(parseFloat(s.fontSize))}px`;};
 return {title:d.title,textLength:((d.body&&d.body.innerText)||'').length,runtime:rt,dom,frameworks,canvases,fonts:[...fonts].slice(0,16),
  used:{heading:face('h1')||face('h2'),subheading:face('h2')||face('h3'),body:face('p')||face('body'),button:face('button, .button, [class*="button"]')},finalUrl:location.href};}
// Some sites scroll an inner container instead of the window.
function findScroller(){const se=document.scrollingElement||document.documentElement;
 if(se.scrollHeight>innerHeight+40&&getComputedStyle(document.body).overflowY!=='hidden'){window.__vistraloScroller=null;return 'window';}
 let best=null,area=0;for(const el of document.querySelectorAll('body *')){if(el.scrollHeight<=el.clientHeight+40||el.clientHeight<innerHeight*.6)continue;const oy=getComputedStyle(el).overflowY;if(!['auto','scroll','overlay'].includes(oy))continue;const a=el.clientWidth*el.clientHeight;if(a>area){area=a;best=el;}}
 window.__vistraloScroller=best;return best?'element':'window';}
function scrollNow(y){const s=window.__vistraloScroller,se=document.scrollingElement||document.documentElement;
 if(typeof y==='number'){if(s)s.scrollTop=y;else window.scrollTo({top:y,behavior:'instant'});}
 return s?{top:s.scrollTop,height:s.scrollHeight}:{top:window.scrollY,height:se.scrollHeight};}

function siteFacts({info,html,scripts,base}){
 const parsed=parseHtml(html||'',base),libs=new Map(),builderNames=new Set(BUILDERS.map(([n])=>n));
 const add=(name,version,strength,evidence)=>{if(builderNames.has(name))return;const known=LIBRARIES.find(l=>l.name===name);
  const e=libs.get(name)||{name,role:known?known.role:'',version:null,strength,evidence:[]};if(version&&!e.version)e.version=version;if(RANK[strength]>RANK[e.strength])e.strength=strength;
  if(e.evidence.length<3&&!e.evidence.includes(evidence))e.evidence.push(evidence);libs.set(name,e);};
 for(const [name,version] of Object.entries(info?.runtime||{}))add(name,version||null,'runtime',`running on the page${version?' ('+version+')':''}`);
 if(info?.dom?.gsap)add('GSAP',null,'runtime',`${info.dom.gsap} elements carry GSAP tween state`);
 if(info?.dom?.pin)add('ScrollTrigger',null,'runtime',`${info.dom.pin} pinned section${info.dom.pin>1?'s':''} (.pin-spacer)`);
 if(info?.dom?.swiper)add('Swiper',null,'runtime',`${info.dom.swiper} initialised carousel${info.dom.swiper>1?'s':''}`);
 if(info?.dom?.lottie)add('Lottie',null,'runtime',`${info.dom.lottie} Lottie player${info.dom.lottie>1?'s':''}`);
 for(const s of scripts||[])for(const h of s.hits||[])add(h.name,h.version,h.via,h.via==='file'?`loaded ${h.file}`:`code inside ${h.file}`);
 for(const src of parsed.scripts)for(const h of scanScript(src).hits)add(h.name,h.version,'file',`script tag ${h.file}`);
 const techniques=[];for(const s of scripts||[])if(!THIRD_PARTY.test(filePath(s.url)))for(const t of s.techniques||[]){const line=`${t} in ${fileName(s.url)}`;if(!techniques.some(x=>x.startsWith(t)))techniques.push(line);}
 for(const c of info?.canvases||[])if(c.width*c.height>=40000&&c.type!=='unknown')techniques.push(`${c.type==='webgl2'?'WebGL2':c.type==='webgl'?'WebGL':c.type==='2d'?'Canvas 2D':c.type} canvas ${c.width}x${c.height}`);
 const runtimeBuilder=info?.runtime&&'Webflow' in info.runtime?'Webflow':null;
 return {builder:parsed.builders[0]||runtimeBuilder,generator:parsed.generator,frameworks:[...new Set([...(info?.frameworks||[]),...parsed.frameworks])],
  bundlers:[...new Set((scripts||[]).map(s=>s.bundler).filter(Boolean))],libraries:[...libs.values()].sort((a,b)=>RANK[b.strength]-RANK[a.strength]),
  techniques:[...new Set(techniques)].slice(0,10),fonts:[...new Set([...(info?.fonts||[]),...parsed.fonts])].slice(0,16),used:info?.used||null,markers:parsed.markers,
  scripts:(scripts||[]).slice(0,60).map(s=>({url:s.url,bytes:s.bytes,sha256:s.sha}))};}

// Recordings are usually a browser tab, so the live page is opened at the recording's own size when it is a plausible desktop viewport.
const viewportFor=({width,height}={})=>width>=1024&&width<=2560&&height>=500&&height<=1600?{width:Math.round(width),height:Math.round(height)}:{width:1920,height:1080};

// coverage() returns how many screens deep the recording can reach, once the caller knows; the read stops there.
async function browse({url,root,width=1920,height=1080,timeout=45000,executablePath,signal,coverage=()=>null}){
 const {chromium}=require('playwright');
 const deadline=Date.now()+timeout,left=()=>deadline-Date.now(),dir='evidence/build';
 const result={url,readAt:new Date().toISOString(),status:'failed',reason:null,viewport:{width,height},finalUrl:null,site:null,steps:[]};
 const target=publicUrl(url);if(!target){result.reason='not a public http or https address';return result;}
 const dnsCache=new Map();if(!await resolvesPublic(new URL(target).hostname,dnsCache)){result.reason='the address does not resolve to a public server';return result;}
 fs.mkdirSync(within(root,dir),{recursive:true});
 const chrome=executablePath||process.env.VISTRALO_BUILDREAD_CHROME||(fs.existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined);
 let browser=null,info=null,html='',response=null,page=null;const scripts=[],reads=[];
 const stop=()=>{if(browser)browser.close().catch(()=>{});};const killer=setTimeout(stop,timeout);signal?.addEventListener('abort',stop,{once:true});
 try{
  browser=await chromium.launch({headless:true,chromiumSandbox:false,timeout:15000,...(chrome?{executablePath:chrome}:{channel:'chrome'}),args:['--disable-dev-shm-usage','--mute-audio','--no-first-run','--disable-extensions','--disable-background-networking']});
  const major=(browser.version().match(/^(\d+)/)||[])[1]||'140';
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,locale:'en-US',acceptDownloads:false,serviceWorkers:'block',userAgent:`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`});
  await context.addInitScript(instrument);
  page=await context.newPage();page.on('dialog',d=>d.dismiss().catch(()=>{}));
  // Only the given page and its own assets: after the first load no further top-level navigation, form post or private address is allowed.
  let settled=false;
  await context.route('**/*',async route=>{const req=route.request();let u;try{u=new URL(req.url());}catch{return route.abort();}
   if(u.protocol==='data:'||u.protocol==='blob:')return route.continue();if(!['http:','https:'].includes(u.protocol))return route.abort();
   if(req.isNavigationRequest()&&req.frame()===page.mainFrame()&&(req.method()!=='GET'||(settled&&!req.redirectedFrom())))return route.abort();
   if(!await resolvesPublic(u.hostname,dnsCache))return route.abort();return route.continue();});
  page.on('response',r=>{if(r.request().resourceType()!=='script'||scripts.length>=150)return;const entry={url:r.url(),bytes:0,sha:null,hits:[],techniques:[],bundler:null};scripts.push(entry);
   reads.push(r.body().then(buf=>{entry.bytes=buf.length;entry.sha=crypto.createHash('sha256').update(buf).digest('hex').slice(0,12);Object.assign(entry,scanScript(entry.url,buf.length<=6e6?buf.toString('utf8'):''));}).catch(()=>Object.assign(entry,scanScript(entry.url))));});
  response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:Math.max(5000,Math.min(20000,left()-15000))}).catch(e=>{result.reason='the page did not load: '+String(e.message||e).split('\n')[0].slice(0,120);return null;});
  if(!response)return result;
  await page.waitForLoadState('load',{timeout:Math.max(1000,Math.min(8000,left()-25000))}).catch(()=>{});settled=true;await page.waitForTimeout(1200);
  html=await page.content().catch(()=>'');info=await page.evaluate(pageInfo).catch(()=>null);
  const block=detectBlock({status:response.status(),title:info?.title||'',textLength:info?.textLength||0,html});
  if(block){result.status='blocked';result.reason=block;return result;}
  await page.evaluate(findScroller).catch(()=>null);
  // Scroll programmatically, or with the wheel when a smooth-scroll library owns the page. Preloaders often lock
  // scrolling for a few seconds, so the first move is retried for longer than later ones.
  let step=Math.round(height*.4),mode='scroll',moved=false;
  const wheel=async dy=>{await page.mouse.move(width/2,height/2);await page.mouse.wheel(0,dy);await page.waitForTimeout(700);return page.evaluate(scrollNow);};
  const advance=async from=>{for(let tries=0;tries<(moved?2:10)&&left()>8000;tries++){let p;if(!moved)await page.evaluate(findScroller).catch(()=>null);
    if(mode==='scroll'){p=await page.evaluate(scrollNow,from+step);if(p.top>from+10){moved=true;return p;}}
    p=await wheel(step);if(p.top>from+10){mode='wheel';moved=true;return p;}await page.waitForTimeout(800);}
   return page.evaluate(scrollNow);};
  const first=await advance(0);if(first.top>10){if(mode==='wheel')await wheel(-first.top-step);await page.evaluate(scrollNow,0);await page.waitForTimeout(700);}
  let pos=await page.evaluate(scrollNow);
  // About 40 positions fit the time budget; long pages get wider steps, never wider than the matcher's shift tolerance allows.
  const depth=()=>{const screens=coverage();return Number.isFinite(screens)&&screens>0?screens*height:Infinity;};
  step=Math.round(Math.min(height*.6,Math.max(height*.4,Math.min(pos.height,depth())/40)));
  for(let i=0;i<60&&left()>5000;i++){
   if(i>0){if(pos.top>=depth())break;const from=pos.top;pos=await advance(from);if(pos.top<=from+10)break;}
   await page.waitForTimeout(350);
   const facts=await page.evaluate(inView).catch(()=>[]);const shot=`${dir}/shot-${String(i).padStart(3,'0')}.jpg`;
   const saved=await page.screenshot({path:within(root,shot),type:'jpeg',quality:50,timeout:5000}).then(()=>true,()=>false);
   result.steps.push({offset:Math.round(pos.top),shot:saved?shot:null,facts});
   if(pos.top+height>=pos.height-2)break;}
  info=await page.evaluate(pageInfo).catch(()=>info);
  result.status='ok';
 }catch(e){if(!result.reason)result.reason='the browser read stopped: '+String(e.message||e).split('\n')[0].slice(0,120);if(result.steps.length&&info)result.status='ok';}
 finally{clearTimeout(killer);signal?.removeEventListener('abort',stop);
  await Promise.race([Promise.allSettled(reads),new Promise(r=>setTimeout(r,3000))]);
  if(browser)await browser.close().catch(()=>{});}
 if(result.status==='ok'){result.finalUrl=info?.finalUrl||page?.url()||target;result.site=siteFacts({info,html,scripts,base:result.finalUrl});}
 return result;}

// One read at a time on this machine.
let queue=Promise.resolve();
function readBuild(options){const run=queue.then(()=>browse(options));queue=run.catch(()=>{});return run;}

function grayImage(ffmpeg,file){return new Promise((resolve,reject)=>{
 const child=spawn(ffmpeg,['-hide_banner','-nostdin','-v','error','-i',file,'-vf',`scale=${W}:${H}:flags=area,format=gray`,'-frames:v','1','-f','rawvideo','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','ignore']});
 const chunks=[];child.stdout.on('data',b=>chunks.push(b));child.once('error',reject);
 child.once('close',code=>{const all=Buffer.concat(chunks);if(code===0&&all.length>=W*H)resolve(all.subarray(0,W*H));else reject(new Error('Could not read an evidence image'));});});}
// Pairs each recorded viewport with the scroll position of the live page that looks the same; unmatched viewports keep only site-level evidence.
async function matchViewports(evidence,{root,frames,ffmpeg='ffmpeg',limit=.1}){
 const viewports=frames.map((_,i)=>({viewport:i+1,offset:null,error:null,facts:[]}));
 const steps=(evidence?.steps||[]).filter(s=>s.shot);if(evidence?.status!=='ok'||!steps.length)return {...evidence,viewports};
 const gray=f=>grayImage(ffmpeg,within(root,f,true)).catch(()=>null);const shots=[];for(const s of steps)shots.push(await gray(s.shot));
 for(const [i,frame] of frames.entries()){const g=await gray(frame);if(!g)continue;
  const ranked=shots.map((s,k)=>({k,d:s?diff(g,s):1})).filter(r=>r.d<1).sort((a,b)=>a.d-b.d).slice(0,3);let best=null;
  for(const r of ranked){const e=Math.min(r.d,shiftOf(g,shots[r.k],Math.floor(H*.32)).error);if(!best||e<best.e)best={k:r.k,e};}
  if(!best)continue;Object.assign(viewports[i],{error:Number(best.e.toFixed(3)),nearest:steps[best.k].offset});
  if(best.e<=limit)Object.assign(viewports[i],{offset:steps[best.k].offset,facts:steps[best.k].facts.map(f=>f.text)});}
 return {...evidence,viewports};}

// Compact enough for the director request (well under 2k tokens).
function evidenceText(e){
 if(!e)return 'No build evidence: this recording has no website address. Mark every library and technique "likely".';
 if(e.status!=='ok'||!e.site)return `No build evidence: the website could not be read (${e.reason||'unknown reason'}). Mark every library and technique "likely".`;
 const s=e.site,lines=[`Build evidence from a headless Chrome read of ${e.finalUrl||e.url} at ${e.viewport.width}x${e.viewport.height}. It shows what the site's code loads and runs.`];
 lines.push(`Site builder: ${s.builder||'none detected'}. Framework: ${s.frameworks.join(', ')||'none detected'}. Bundler: ${s.bundlers.join(', ')||'none detected'}.`);
 if(s.libraries.length){lines.push('Libraries seen in code or at runtime:');for(const l of s.libraries.slice(0,16))lines.push(`- ${l.name}${l.version?' '+l.version:''}${l.role?' ('+l.role+')':''}: ${l.evidence.join('; ')}`);}
 else lines.push('Libraries: none detected.');
 if(s.techniques.length)lines.push(`Techniques seen: ${s.techniques.join('; ')}.`);
 const used=s.used?Object.entries(s.used).filter(([,v])=>v).map(([k,v])=>`${k} ${v}`):[];if(used.length)lines.push(`Fonts in use: ${used.join('; ')}.`);
 if(s.fonts.length)lines.push(`Loaded font faces: ${s.fonts.slice(0,10).join(', ')}.`);
 const per=(e.viewports||[]).filter(v=>v.facts.length);
 if(per.length){lines.push('On screen at each matched viewport:');for(const v of per)lines.push(`- Viewport ${v.viewport}: ${v.facts.slice(0,4).join('; ')}`);
  lines.push('Viewports not listed had no matched evidence; only site-level facts apply to them.');}
 else lines.push('No viewport could be matched to the live page; use this as site-level evidence only.');
 let text=lines.join('\n');if(text.length>7000)text=text.slice(0,7000).replace(/\n[^\n]*$/,'')+'\n(evidence truncated)';return text;}

const norm=s=>String(s||'').toLowerCase().replace(/\.js\b/g,'js').replace(/[^a-z0-9]/g,'');
// "confirmed" survives only when the evidence names the library; everything else is said as "looks like".
function groundBuild(plan,evidence){
 const ok=evidence?.status==='ok'&&!!evidence.site,seen=ok?evidence.site.libraries.map(l=>norm(l.name)).filter(Boolean):[];
 const proven=name=>{const n=norm(name);return !!n&&seen.some(s=>n.includes(s)||(n.length>=4&&s.includes(n)));};
 const lib=l=>({...l,confidence:l.confidence==='confirmed'&&proven(l.name)?'confirmed':'likely'});
 const stack=plan.system?.stack||{framework:'',libraries:[],fonts:[]};
 const stops=(plan.stops||[]).map(s=>{const b=s.build||{effect:'',technique:'',confidence:'likely',libraries:[],files:[],setup:[],agent_prompt:''};
  const facts=evidence?.viewports?.[Number(s.viewport)-1]?.facts||[],libraries=(b.libraries||[]).map(lib);
  return {...s,build:{...b,libraries,confidence:b.confidence==='confirmed'&&ok&&(facts.length>0||libraries.some(l=>l.confidence==='confirmed'))?'confirmed':'likely',evidence:facts}};});
 return {...plan,system:{...plan.system,stack:{...stack,libraries:(stack.libraries||[]).map(l=>({...lib(l),evidence:proven(l.name)?l.evidence:'frames only'}))}},stops};}

const clock=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function writeBrief(root,{url,evidence,stack,closingStack,stops}){
 const read=!url?'no website address was given':evidence?.status==='ok'?`read ${evidence.finalUrl||url} in headless Chrome`:`could not read the site (${evidence?.reason||'unknown reason'})`;
 const json={url:url||null,generated:new Date().toISOString(),evidence:{status:evidence?.status||'none',reason:evidence?.reason||null},stack,closingStack,
  stops:stops.map(s=>({viewport:s.viewport,label:s.label,sourceAt:s.sourceAt,filmAt:s.filmAt,...s.build}))};
 const libs=l=>l.map(x=>`${x.name} (${x.confidence})`).join(', ')||'none';
 const md=['# Build brief','',`Site: ${url||'none'} · Evidence: ${read}.`,'','"confirmed" means seen in the site\'s code or at runtime. "likely" means inferred from the video frames.','','## Stack','',
  `- Framework: ${stack.framework||'not detected'}`,...(stack.libraries||[]).map(l=>`- ${l.name}${l.role?' — '+l.role:''} (${l.confidence}; ${l.evidence})`),`- Fonts: ${(stack.fonts||[]).join(', ')||'not detected'}`,'',closingStack?`Rebuild: ${closingStack}`:'',''];
 for(const s of json.stops){md.push(`## Stop ${s.viewport} · ${s.label||'Screen'}`,'',`Recording ${clock(s.sourceAt)}${Number.isFinite(s.filmAt)?` · film ${clock(s.filmAt)}`:''}`,'',
  `- Effect: ${s.effect||'—'}`,`- Technique (${s.confidence}): ${s.technique||'—'}`,`- Libraries: ${libs(s.libraries||[])}`,...(s.evidence?.length?[`- Evidence: ${s.evidence.join('; ')}`]:[]),'');
  if(s.files?.length)md.push('Files:','',...s.files.map(f=>`- \`${f.path}\` — ${f.purpose}`),'');
  if(s.setup?.length)md.push('Setup:','','```sh',...s.setup,'```','');
  if(s.agent_prompt)md.push('Agent prompt:','',...s.agent_prompt.split(/\r?\n/).map(l=>'> '+l),'');}
 atomic(within(root,'build-brief.json'),json);atomic(within(root,'build-brief.md'),md.join('\n').replace(/\n{3,}/g,'\n\n'));
 return {json:'build-brief.json',markdown:'build-brief.md'};}

module.exports={readBuild,browse,matchViewports,evidenceText,groundBuild,writeBrief,publicUrl,privateAddress,scanScript,parseHtml,detectBlock,siteFacts,viewportFor,LIBRARIES};
