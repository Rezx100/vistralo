'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const {buildSync} = require('esbuild');

function harness(entry = 'adapters') {
  const output = buildSync({entryPoints:[path.join(__dirname,'../web/'+entry+'.ts')],bundle:true,write:false,platform:'browser',format:'cjs'}).outputFiles[0].text;
  const storage = new Map(), requests = [];
  const module = {exports:{}};
  const context = {module,exports:module.exports,console,URL,Blob,File,DOMException,AbortController,Date,setTimeout,clearTimeout,
    crypto:require('node:crypto').webcrypto,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    location:{origin:'https://vistralo.example',pathname:'/'},
    window:{},
    Worker:class {postMessage(){queueMicrotask(()=>this.onmessage({data:{digest:'a'.repeat(64)}}));}terminate(){}},
    fetch:async(url,options)=>{requests.push({url,options});throw new Error('No server in this test');},
  };
  vm.runInNewContext(output,context);
  return {...module.exports,context,storage,requests};
}
const response = (status, data) => ({ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},json:async()=>data});

test('native Ready without output maps to draft; workspace lifecycle takes precedence during a retry',()=>{
  const {normalizeProject} = harness();
  assert.equal(normalizeProject({id:'p',name:'Untitled',mode:'record',state:'Ready',data:{}}).status,'draft');
  const failed = normalizeProject({id:'p',name:'Capture',mode:'walkthrough',state:'Failed',data:{error:'Blocked'},workspace:{source:'web',type:'brief'}});
  assert.equal(failed.status,'failed'); assert.equal(failed.error,'Blocked'); assert.equal(failed.type,'brief');
  const retry = normalizeProject({id:'p',name:'Capture',mode:'record',state:'Failed',data:{error:'Earlier failure'},workspace:{status:'uploading',progress:42}});
  assert.equal(retry.status,'uploading'); assert.equal(retry.error,undefined);
});

test('demo has exactly eight fictional fixtures and fixture hosts are labels, never external links',async()=>{
  const {createAdapter} = harness(), adapter = createAdapter('demo');
  const projects = await adapter.list();
  assert.equal(projects.length,8);
  assert.equal(projects.find(p=>p.id==='demo-design-handoff').progress,42);
  assert.equal(projects.find(p=>p.id==='demo-checkout-audit').duration,3930);
  assert.equal(projects.find(p=>p.id==='demo-pricing-teardown').eventLabel,'Updated');
  assert.ok(projects.every(p=>p.data.fictional && !p.url));
  assert.equal(projects.filter(p=>p.access==='workspace').length,1);
});

test('demo CRUD persists across adapters and permanent removal is restricted to Trash',async()=>{
  const {createAdapter} = harness(), adapter = createAdapter('demo');
  const project = await adapter.create({name:'My recording',source:'upload'});
  await adapter.update(project.id,{name:'Renamed recording',pinned:true});
  const persisted = (await createAdapter('demo').list()).find(p=>p.id===project.id);
  assert.equal(persisted.name,'Renamed recording'); assert.equal(persisted.pinned,true);
  const duplicate = await adapter.duplicate(project.id);
  assert.equal(duplicate.name,'Renamed recording (copy)'); assert.equal(duplicate.access,'private');
  await assert.rejects(adapter.remove([project.id]),/Move a project to Trash/);
  await adapter.trash([project.id]); await adapter.restore([project.id]);
  assert.equal((await adapter.list()).find(p=>p.id===project.id).trashed,false);
  await adapter.trash([project.id]); await adapter.remove([project.id]);
  assert.equal((await adapter.list()).some(p=>p.id===project.id),false);
});

test('demo links disclose local scope and rendering cannot pretend to create an edited video',async()=>{
  const {createAdapter} = harness(), adapter = createAdapter('demo');
  const share = await adapter.share('demo-homepage-motion');
  assert.equal(share.localOnly,true); assert.match(share.url,/#demo\/share\//);
  await adapter.revoke(share.id);
  assert.equal((await adapter.shares('demo-homepage-motion')).length,0);
  await assert.rejects(adapter.rpc('process',{id:'demo-homepage-motion',action:'render'}),/requires a Vistralo cloud workspace/);
});

test('UUID fallback uses cryptographic bytes and valid RFC4122 version/variant bits on HTTP',()=>{
  const {uuid,context} = harness('id');
  let calls=0;
  context.crypto={getRandomValues:bytes=>{calls++;bytes.fill(255);return bytes;}};
  const value=uuid();
  assert.equal(value,'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(calls,1);
  context.crypto={randomUUID:()=> 'native-uuid'};
  assert.equal(uuid(),'native-uuid');
  context.crypto={};
  assert.throws(()=>uuid(),/cannot create secure project identifiers/);
});

test('demo creation and sharing work where randomUUID is unavailable',async()=>{
  const {createAdapter,context} = harness();
  context.crypto={getRandomValues:bytes=>require('node:crypto').webcrypto.getRandomValues(bytes)};
  const adapter=createAdapter('demo'),project=await adapter.create({name:'HTTP preview project',source:'web'});
  assert.match(project.id,/^demo-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const share=await adapter.share('demo-homepage-motion');
  assert.match(share.id,/^demo-share-/);
});

test('demo read-only links resolve media and reject revocation, expiry and Trash',async()=>{
  const {createAdapter,readDemoShare,storage} = harness(),adapter=createAdapter('demo');
  const share=await adapter.share('demo-homepage-motion'),content=await readDemoShare(share.id);
  assert.equal(content.name,'Homepage motion study');
  assert.equal(content.video,'/assets/sample-walkthrough.mp4');
  assert.equal(content.readOnly,true);assert.equal(content.localOnly,true);
  await adapter.revoke(share.id);
  await assert.rejects(readDemoShare(share.id),/unavailable or expired/);
  const expired=await adapter.share('demo-homepage-motion');
  const key=[...storage.keys()].find(key=>key.startsWith('vistralo-demo-workspace:'));
  const saved=JSON.parse(storage.get(key));saved.shares.find(link=>link.id===expired.id).expiresAt='2000-01-01T00:00:00Z';storage.set(key,JSON.stringify(saved));
  await assert.rejects(readDemoShare(expired.id),/unavailable or expired/);
  const trashed=await adapter.share('demo-storefront-review');
  await adapter.trash(['demo-storefront-review']);
  await assert.rejects(readDemoShare(trashed.id),/unavailable or expired|no longer shared/);
  await assert.rejects(readDemoShare('unknown-local-link'),/only in the browser/);
});

test('only the cloud and demo workspaces exist, and an unknown mode never falls back to demo data',()=>{
  const {createAdapter,storage} = harness();
  for (const mode of ['server','desktop',undefined]) assert.throws(()=>createAdapter(mode),/explicit Vistralo workspace mode/);
  assert.equal(storage.size,0);
});
