const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/core.cjs');const {Media,run}=require('../src/media.cjs');const {Providers}=require('../src/providers.cjs');
const {planViewports,shiftOf}=require('../src/viewports.cjs');const {composeWalkthrough}=require('../src/editor.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'director-test-'));
const W=48,H=160;
// A tall page of random rows, seen through a screen-sized window.
function page(screens,seed=7){let s=seed;const rand=()=>(s=(s*1103515245+12345)%2147483648)/2147483648;const rows=[];for(let y=0;y<H*screens;y++){const row=new Uint8Array(W);const base=Math.floor(rand()*255);for(let x=0;x<W;x++)row[x]=(base+Math.floor(rand()*60))%256;rows.push(row);}return rows;}
const view=(rows,top)=>{const f=new Uint8Array(W*H);for(let y=0;y<H;y++)f.set(rows[Math.min(rows.length-1,Math.round(top)+y)],y*W);return f;};

test('vertical shift between two scrolled frames is measured',()=>{const rows=page(2);const {shift,error}=shiftOf(view(rows,0),view(rows,30));assert.equal(shift,30);assert.ok(error<.01);});

test('viewport plan holds on every screen of a scroll and never skips a full screen',()=>{const rows=page(6),fps=8,frames=[],tops=[];let top=0;
 const add=()=>{frames.push(view(rows,top));tops.push(top);};
 const pause=s=>{for(let i=0;i<s*fps;i++)add();},scroll=(screens,s)=>{const step=screens*H/(s*fps);for(let i=0;i<s*fps;i++){top+=step;add();}};
 pause(2);scroll(1,1);pause(2);scroll(1,1);pause(2);scroll(2,1.5);pause(2);
 const {viewports}=planViewports(frames,fps);assert.ok(viewports.length>=4&&viewports.length<=7,`found ${viewports.length}`);
 assert.equal(viewports[0].arrival,'start');assert.ok(viewports.slice(1).every(v=>v.arrival==='scrolled down'));
 const seen=viewports.map(v=>tops[Math.round(v.at*fps)]);for(let n=1;n<seen.length;n++)assert.ok(seen[n]-seen[n-1]<=H*1.05,`gap of ${(seen[n]-seen[n-1])/H} screens`);
 assert.ok(top-seen.at(-1)<H*.5,'the end of the page is not held');});

test('viewport plan starts a new stop when the page changes without scrolling',()=>{const a=page(1,3),b=page(1,99),fps=8,frames=[];for(let i=0;i<24;i++)frames.push(view(a,0));for(let i=0;i<24;i++)frames.push(view(b,0));
 const {viewports}=planViewports(frames,fps);assert.equal(viewports.length,2);assert.equal(viewports[1].arrival,'new screen');});

test('walkthrough freezes on each stop while its narration plays',async()=>{const root=temp();
 await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','3','-c:v','libx264','-preset','ultrafast',path.join(root,'video.mp4')]);
 for(const n of [1,2])await run('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1',path.join(root,`v${n}.wav`)]);
 const result=await composeWalkthrough(new Media(),root,{video:'video.mp4',stops:[{at:2,text:'Second',audio:'v2.wav'},{at:1,text:'First',audio:'v1.wav'},{at:2.5,text:'Silent'}]});
 assert.ok(Math.abs(result.duration-7)<.25,`duration ${result.duration}`);assert.deepEqual(result.parts.map(p=>p.text),['First','Second']);
 assert.ok(Math.abs(result.parts[0].at-1.38)<.1&&Math.abs(result.parts[1].at-4.41)<.15,JSON.stringify(result.parts));
 assert.match(fs.readFileSync(path.join(root,result.captions),'utf8'),/First[\s\S]*Second/);assert.equal(fs.readdirSync(path.join(root,'exports')).filter(f=>f.endsWith('.mp4')).length,1);});

test('director script sends every viewport and maps stops back by number',async()=>{const s=new Store(temp()),p=s.create('Director','walkthrough'),root=s.dir(p.id);fs.mkdirSync(path.join(root,'evidence'),{recursive:true});for(const f of ['a','b','m'])fs.writeFileSync(path.join(root,`evidence/${f}.jpg`),Buffer.from([255,216,255]));
 let sent;const reply={system:{palette:'white and violet',typography:'sans',shape:'pill',iconography:'outline',spacing:'airy',imagery:'studio',motion:'none visible'},stops:[{viewport:2,looking_at:'Offers',notes:'n',narration:'Four **cards**, ~300px tall with a 6–8px radius, a 56x20px badge, 4.3% lift and a #7A1BD9 accent.'},{viewport:1,looking_at:'Hero',notes:'n',narration:'Anua home page.'}],closing:'Calm system.'};
 const providers=new Providers(s,{read:()=>({openai:'k'})},async(url,init)=>{sent=JSON.parse(init.body);return {ok:true,status:200,headers:new Headers(),json:async()=>({model:'gpt-4.1',output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}]})};});
 const out=await providers.directorScript(p.id,{uploadApproved:true,model:'gpt-4.1',width:1600,height:764,viewports:[{at:0,frame:'evidence/a.jpg',arrival:'start'},{at:5,frame:'evidence/b.jpg',motionFrame:'evidence/m.jpg',arrival:'scrolled down'}],cap:1,estimate:.2,approved:true,quote:'Test fixture quote'});
 assert.equal(sent.text.format.type,'json_schema');const images=sent.input[0].content.filter(c=>c.type==='input_image');assert.deepEqual(images.map(i=>i.detail),['high','low','high']);assert.match(sent.input[0].content[0].text,/1600×764/);
 assert.deepEqual(out.stops.map(x=>x.text),['Anua home page.','Four cards, about 300 pixels tall with a 6 to 8 pixels radius, a 56 by 20 pixels badge, 4.3 percent lift and a hex 7A1BD9 accent.']);assert.equal(out.stops[1].label,'Offers');assert.equal(out.closing,'Calm system.');assert.equal(out.system.palette,'white and violet');s.close();});

test('director request failure exposes the HTTP status for model fallback',async()=>{const s=new Store(temp()),p=s.create('Fallback','walkthrough');const providers=new Providers(s,{read:()=>({})},async()=>({ok:false,status:404,headers:new Headers()}));
 await assert.rejects(providers.submit(p.id,'analysis',{model:'x'},{cap:1,estimate:.1,approved:true,quote:'Test fixture quote'},'https://example.invalid','key','k'),e=>e.status===404);s.close();});
