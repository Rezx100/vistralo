const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/core.cjs');const {run}=require('../src/media.cjs');const {Providers,DIRECTOR_SCHEMA,speakable}=require('../src/providers.cjs');
const {parseHtml,scanScript,siteFacts,detectBlock,publicUrl,evidenceText,groundBuild,matchViewports,writeBrief}=require('../src/buildread.cjs');
const fixture=name=>fs.readFileSync(path.join(__dirname,'fixtures','buildread',name),'utf8');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'buildread-test-'));
const BASE='https://unitedcarriers.com/';

test('Webflow page: builder, script files and Finsweet attributes are read from the HTML',()=>{const html=fixture('webflow.html'),parsed=parseHtml(html,BASE);
 assert.deepEqual(parsed.builders,['Webflow']);assert.equal(parsed.generator,'Webflow');assert.ok(parsed.scripts.includes('https://united-carriers.netlify.app/main.js'));
 assert.ok(parsed.markers.some(m=>/Finsweet/.test(m)));assert.ok(parsed.markers.some(m=>/canvas/.test(m)));assert.equal(detectBlock({status:200,title:'United Carriers',textLength:4000,html}),null);
 const jquery=parsed.scripts.map(s=>scanScript(s).hits).flat().find(h=>h.name==='jQuery');assert.equal(jquery.version,'3.5.1');assert.equal(jquery.via,'file');});

test('custom bundle: imported library chunks, techniques and bundler are found in the code',()=>{const scan=scanScript('https://united-carriers.netlify.app/main.js',fixture('main.js'));
 assert.equal(scan.bundler,'Vite');assert.ok(scan.techniques.includes('IntersectionObserver reveals'));
 const names=scan.hits.map(h=>h.name);for(const n of ['GSAP','Lenis','Barba'])assert.ok(names.includes(n),`${n} missing from ${names}`);
 assert.ok(scan.hits.every(h=>h.via==='code'));assert.match(scan.hits.find(h=>h.name==='GSAP').file,/imports vendor-gsap/);
 assert.ok(!names.includes('Three.js'),'a scene name is not proof of Three.js');});

test('site facts rank runtime evidence above file and code evidence',()=>{const scripts=[
  {url:'https://united-carriers.netlify.app/main.js',...scanScript('https://united-carriers.netlify.app/main.js',fixture('main.js'))},
  {url:'https://united-carriers.netlify.app/chunks/vendor-gsap-GRoENYFU.js',...scanScript('https://united-carriers.netlify.app/chunks/vendor-gsap-GRoENYFU.js','/*! GSAP 3.12.5 */')},
  {url:'https://united-carriers.netlify.app/chunks/OceanScene-CggVSafL.js',...scanScript('https://united-carriers.netlify.app/chunks/OceanScene-CggVSafL.js','const r=new WebGLRenderer({antialias:true});const REVISION="170";')}];
 const info={runtime:{'Three.js':'r170',Webflow:''},dom:{gsap:14,pin:1,swiper:1,lottie:0},frameworks:[],canvases:[{type:'webgl2',width:1100,height:900}],fonts:['Neue Montreal 500'],used:{heading:'Neue Montreal 500 72px'}};
 const site=siteFacts({info,html:fixture('webflow.html'),scripts,base:BASE});const lib=n=>site.libraries.find(l=>l.name===n);
 assert.equal(site.builder,'Webflow');assert.deepEqual(site.bundlers,['Vite']);assert.ok(!lib('Webflow'),'the builder is not listed as a library');
 assert.equal(lib('GSAP').strength,'runtime');assert.equal(lib('GSAP').version,'3.12.5');assert.equal(lib('Three.js').strength,'runtime');assert.equal(lib('ScrollTrigger').strength,'runtime');
 assert.equal(lib('Lenis').strength,'code');assert.equal(lib('jQuery').strength,'file');assert.equal(site.libraries[0].strength,'runtime');
 assert.ok(site.techniques.includes('WebGL2 canvas 1100x900'));assert.ok(site.techniques.some(t=>t.startsWith('IntersectionObserver')));});

test('Next.js page: framework and Google fonts are read, and it is not mistaken for a bot wall',()=>{const html=fixture('next.html'),parsed=parseHtml(html,'https://nextjs.org/');
 assert.deepEqual(parsed.frameworks,['Next.js']);assert.deepEqual(parsed.builders,[]);assert.deepEqual(parsed.fonts,['Inter (Google Fonts)','JetBrains Mono (Google Fonts)']);
 assert.equal(detectBlock({status:200,title:'Next.js by Vercel',textLength:2400,html}),null);});

test('bot challenge page is detected and yields no build evidence',()=>{const html=fixture('challenge.html');
 assert.match(detectBlock({status:403,title:'Just a moment...',textLength:40,html}),/challenge page/);assert.match(detectBlock({status:200,title:'',textLength:40,html}),/challenge markers/);
 const text=evidenceText({url:BASE,status:'blocked',reason:'challenge page',steps:[]});assert.match(text,/could not be read \(challenge page\)/);assert.match(text,/likely/);
 assert.match(evidenceText(null),/no website address/);});

test('only public http(s) addresses are read',()=>{
 for(const bad of ['http://localhost:3000/','http://127.0.0.1/','http://10.0.0.8/','http://192.168.1.1/','http://169.254.169.254/latest','http://[::1]/','http://printer.local/','http://user:pw@example.com/','ftp://example.com/','javascript:alert(1)','intranet','']) assert.equal(publicUrl(bad),null,bad);
 assert.equal(publicUrl(' https://unitedcarriers.com/#top '),BASE);assert.equal(publicUrl('http://8.8.8.8/'),'http://8.8.8.8/');});

test('evidence text stays compact with every viewport matched',()=>{const site={builder:'Webflow',frameworks:[],bundlers:['Vite'],libraries:Array.from({length:20},(_,i)=>({name:`Lib${i}`,role:'animation',version:'1.0.0',strength:'file',evidence:['loaded lib'+i+'.js','running on the page']})),techniques:['WebGL2 canvas 1100x900'],fonts:[],used:{heading:'Inter 600 64px'},markers:[]};
 const viewports=Array.from({length:36},(_,i)=>({viewport:i+1,facts:['canvas webgl2 1100x900 in div.home-hero_globe-wrap','14 GSAP-animated elements (h1.heading-style-h1, p.text-size-medium, a.button)','CSS animation "marquee" on div.logos_track','Swiper carousel 1200x480 (div.swiper.testimonials_swiper)']}));
 const text=evidenceText({url:BASE,status:'ok',viewport:{width:1920,height:1080},site,viewports});assert.ok(text.length<=7100,`${text.length} characters`);assert.match(text,/Viewport 1:/);});

test('confirmed survives only when the evidence names the library',()=>{
 const plan={system:{palette:'',stack:{framework:'Webflow',fonts:[],libraries:[{name:'GSAP',role:'animation',confidence:'confirmed',evidence:'running'},{name:'Three.js',role:'3D',confidence:'confirmed',evidence:'globe'}]}},
  stops:[{viewport:1,build:{effect:'globe',technique:'WebGL globe',confidence:'confirmed',libraries:[{name:'GSAP ScrollTrigger',confidence:'confirmed'},{name:'Three.js',confidence:'confirmed'}],files:[],setup:[],agent_prompt:''}},
   {viewport:2,build:{effect:'static layout',technique:'CSS grid',confidence:'confirmed',libraries:[],files:[],setup:[],agent_prompt:''}}]};
 const evidence={status:'ok',site:{libraries:[{name:'GSAP'},{name:'ScrollTrigger'}]},viewports:[{viewport:1,facts:['canvas webgl2 1100x900']},{viewport:2,facts:[]}]};
 const grounded=groundBuild(plan,evidence);const [a,b]=grounded.stops.map(s=>s.build);
 assert.deepEqual(a.libraries.map(l=>l.confidence),['confirmed','likely']);assert.equal(a.confidence,'confirmed');assert.deepEqual(a.evidence,['canvas webgl2 1100x900']);assert.equal(b.confidence,'likely');
 assert.deepEqual(grounded.system.stack.libraries.map(l=>[l.confidence,l.evidence]),[['confirmed','running'],['likely','frames only']]);
 const blind=groundBuild(plan,null);assert.ok(blind.stops.every(s=>s.build.confidence==='likely'&&s.build.libraries.every(l=>l.confidence==='likely')));});

// OpenAI strict mode: every object lists all its properties as required and forbids extra ones.
function validate(schema,value,at='plan'){
 if(schema.enum)assert.ok(schema.enum.includes(value),`${at} is not one of ${schema.enum}`);
 if(schema.type==='object'){assert.equal(schema.additionalProperties,false,`${at} allows extra properties`);assert.deepEqual([...schema.required].sort(),Object.keys(schema.properties).sort(),`${at} leaves a property optional`);
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),`${at} is not an object`);assert.deepEqual(Object.keys(value).sort(),Object.keys(schema.properties).sort(),`${at} keys`);
  for(const [k,s] of Object.entries(schema.properties))validate(s,value[k],`${at}.${k}`);}
 else if(schema.type==='array'){assert.ok(Array.isArray(value),`${at} is not an array`);value.forEach((v,i)=>validate(schema.items,v,`${at}[${i}]`));}
 else if(schema.type==='string')assert.equal(typeof value,'string',at);else if(schema.type==='integer')assert.ok(Number.isInteger(value),at);}
const samplePlan=()=>({system:{palette:'white, navy hex 0B1F3A',typography:'grotesque sans',shape:'8 pixel radius',iconography:'outline',spacing:'12 column grid',imagery:'ocean photography',motion:'globe rotates',
  stack:{framework:'Webflow',libraries:[{name:'GSAP',role:'animation',confidence:'confirmed',evidence:'running on the page'}],fonts:['Neue Montreal']}},
 stops:[{viewport:1,looking_at:'Hero',notes:'globe 1100 by 900',narration:'United Carriers home page. The globe is a WebGL canvas driven by Three.js. Create src/scenes/Globe.ts and run npm install three. It spins slowly behind a 72 pixel headline.',
  build:{effect:'rotating globe',technique:'WebGL2 canvas scrubbed by scroll',confidence:'confirmed',libraries:[{name:'GSAP',confidence:'confirmed'}],files:[{path:'src/scenes/Globe.ts',purpose:'globe mesh and render loop'}],setup:['npm install three gsap'],agent_prompt:'Build a 1100 by 900 WebGL globe.'}}],
 closing:'A calm navy system.',closing_stack:'It is built in Webflow with GSAP, and the globe looks like Three.js.'});

test('director schema is strict-mode complete and accepts a sample plan',()=>{validate(DIRECTOR_SCHEMA,samplePlan());
 assert.throws(()=>validate(DIRECTOR_SCHEMA,{...samplePlan(),closing_stack:undefined}));});

test('narration never speaks file paths or shell commands',async()=>{
 for(const bad of ['Create src/hero/Globe.tsx next.','Run npm install three gsap.','Then yarn add lenis.','Edit globe.ts for this.','Put it in main.js today.','Use `useGlobe` here.','See /scenes/ocean/wake.glsl.'])assert.equal(speakable(bad),'',bad);
 assert.equal(speakable('The scene uses a large canvas area (evidence shows about 1745 by 982 pixels) and lifts.'),'The scene uses a large canvas area and lifts.');
 for(const good of ['The globe is a WebGL canvas driven by Three.js.','It looks like Next.js with React.','Cards sit 24 pixels apart, about 300 pixels tall.'])assert.equal(speakable(good),good);
 const s=new Store(temp()),p=s.create('Build read','walkthrough'),root=s.dir(p.id);fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/a.jpg'),Buffer.from([255,216,255]));
 let sent;const providers=new Providers(s,{read:()=>({openai:'k'})},async(url,init)=>{sent=JSON.parse(init.body);return {ok:true,status:200,headers:new Headers(),json:async()=>({model:'gpt-5-mini',output:[{content:[{type:'output_text',text:JSON.stringify(samplePlan())}]}]})};});
 const evidence={url:BASE,status:'ok',viewport:{width:1920,height:1080},site:{builder:'Webflow',frameworks:[],bundlers:[],libraries:[{name:'GSAP',role:'animation',version:null,strength:'runtime',evidence:['running on the page']}],techniques:[],fonts:[],used:null,markers:[]},viewports:[{viewport:1,facts:['canvas webgl2 1100x900 in div.hero']}]};
 const out=await providers.directorScript(p.id,{uploadApproved:true,model:'gpt-5-mini',width:1920,height:1080,viewports:[{at:0,frame:'evidence/a.jpg',arrival:'start'}],evidence,cap:1,estimate:.2,approved:true,quote:'Test fixture quote'});
 assert.match(sent.input[0].content[1].text,/Build evidence[\s\S]*GSAP[\s\S]*Viewport 1: canvas webgl2/);assert.deepEqual(sent.text.format.schema,DIRECTOR_SCHEMA);assert.equal(sent.text.format.strict,true);
 const text=out.stops[0].text;assert.match(text,/WebGL canvas driven by Three\.js/);assert.doesNotMatch(text,/src\/|npm|Globe\.ts/);assert.match(text,/72 pixel headline/);
 assert.equal(out.closingStack,'It is built in Webflow with GSAP, and the globe looks like Three.js.');assert.equal(out.stops[0].build.libraries[0].confidence,'confirmed');assert.deepEqual(out.stops[0].build.evidence,['canvas webgl2 1100x900 in div.hero']);s.close();});

test('build brief lists the stack, then each stop with its prompt',()=>{const root=temp();
 const out=writeBrief(root,{url:BASE,evidence:{status:'ok',finalUrl:BASE},stack:{framework:'Webflow',libraries:[{name:'GSAP',role:'animation',confidence:'confirmed',evidence:'running on the page'}],fonts:['Neue Montreal']},closingStack:'Webflow with GSAP.',
  stops:[{viewport:1,label:'Hero',sourceAt:3.2,filmAt:4.1,build:{effect:'rotating globe',technique:'WebGL2 canvas',confidence:'confirmed',libraries:[{name:'GSAP',confidence:'confirmed'}],files:[{path:'src/scenes/Globe.ts',purpose:'globe'}],setup:['npm install gsap'],agent_prompt:'Build the globe.',evidence:['canvas webgl2 1100x900']}}]});
 const md=fs.readFileSync(path.join(root,out.markdown),'utf8'),json=JSON.parse(fs.readFileSync(path.join(root,out.json),'utf8'));
 assert.match(md,/## Stack[\s\S]*GSAP — animation \(confirmed; running on the page\)[\s\S]*## Stop 1 · Hero\n\nRecording 0:03 · film 0:04[\s\S]*```sh\nnpm install gsap\n```[\s\S]*> Build the globe\./);
 assert.equal(json.stops[0].agent_prompt,'Build the globe.');assert.equal(json.stops[0].filmAt,4.1);assert.equal(json.evidence.status,'ok');});

test('recorded viewports are matched to the live page scroll position that looks the same',async()=>{const root=temp();fs.mkdirSync(path.join(root,'evidence/build'),{recursive:true});fs.mkdirSync(path.join(root,'evidence/viewports'),{recursive:true});
 await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=640x2400','-frames:v','1',path.join(root,'page.png')]);
 const crop=(y,file)=>run('ffmpeg',['-v','error','-y','-i',path.join(root,'page.png'),'-vf',`crop=640:360:0:${y}`,'-frames:v','1',path.join(root,file)]);
 const steps=[];for(let i=0;i*144<=2040;i++){const shot=`evidence/build/shot-${String(i).padStart(3,'0')}.jpg`;await crop(i*144,shot);steps.push({offset:i*144,shot,facts:[{text:`fact at ${i*144}`}]});}
 await crop(1152,'evidence/viewports/frame-00.jpg');await crop(300,'evidence/viewports/frame-01.jpg');
 await run('ffmpeg',['-v','error','-f','lavfi','-i','mandelbrot=size=640x360','-frames:v','1',path.join(root,'evidence/viewports/frame-02.jpg')]);
 const out=await matchViewports({status:'ok',steps},{root,frames:['evidence/viewports/frame-00.jpg','evidence/viewports/frame-01.jpg','evidence/viewports/frame-02.jpg']});
 assert.equal(out.viewports[0].offset,1152);assert.deepEqual(out.viewports[0].facts,['fact at 1152']);assert.ok([288,432].includes(out.viewports[1].offset),`matched ${out.viewports[1].offset}`);
 assert.deepEqual(out.viewports[2].facts,[],'an unrelated screen gets no evidence');});
