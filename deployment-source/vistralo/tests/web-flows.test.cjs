'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const {buildSync} = require('esbuild');

function load(entry, globals = {}) {
  const bundled = buildSync({entryPoints:[path.join(__dirname,'../web/features/'+entry+'.ts')],bundle:true,write:false,platform:'browser',format:'cjs'}).outputFiles[0].text;
  const module = {exports:{}};
  vm.runInNewContext(bundled, {module,exports:module.exports,URL,File,Blob,Date,setTimeout,clearTimeout,...globals});
  return module.exports;
}
const {buildClipPlan,validateVideo,publicWebsite,MAX_UPLOAD_BYTES} = load('flow-utils');

test('reviewed trim plan keeps selected source, exact end boundary and chronological adjacent clips',()=>{
  const edits = [{start:'0',end:'2.25'},{start:'2.25',end:'4.125'}];
  const snapshot = JSON.stringify(edits), result = buildClipPlan('imports/source.webm',4.125,edits);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{version:1,source:'imports/source.webm',clips:[{start:0,end:2.25},{start:2.25,end:4.125}]});
  assert.equal(JSON.stringify(edits),snapshot,'Review inputs must not be modified by validation');
});

test('trim planning refuses unknown or non-finite source durations',()=>{
  for(const duration of [null,0,-1,NaN,Infinity,-Infinity]) assert.throws(()=>buildClipPlan('imports/source.webm',duration,[{start:'0',end:'2'}]),/duration/);
  assert.throws(()=>buildClipPlan('',10,[{start:'0',end:'2'}]),/source recording/);
});

test('trim planning rejects missing, non-finite, reversed, overlapping and out-of-bounds cuts',()=>{
  for(const clips of [
    [{start:'',end:'1'}], [{start:'0',end:''}], [{start:'NaN',end:'1'}], [{start:'0',end:'Infinity'}],
    [{start:'-1',end:'2'}], [{start:'2',end:'2'}], [{start:'2',end:'1'}], [{start:'0',end:'10.0001'}],
    [{start:'0',end:'5'},{start:'4.9',end:'8'}], [{start:'6',end:'8'},{start:'0',end:'2'}],
  ]) assert.throws(()=>buildClipPlan('imports/source.webm',10,clips),/Clip/);
  assert.throws(()=>buildClipPlan('imports/source.webm',10,[]),/1 and 200/);
  assert.throws(()=>buildClipPlan('imports/source.webm',1000,Array.from({length:201},(_,i)=>({start:i,end:i+1}))),/1 and 200/);
});

test('video import enforces extension, nonempty source and the documented upload bound',()=>{
  assert.doesNotThrow(()=>validateVideo({name:'source.WEBM',size:MAX_UPLOAD_BYTES}));
  assert.throws(()=>validateVideo({name:'source.mp4',size:0}),/not empty/);
  assert.throws(()=>validateVideo({name:'source.mp4',size:MAX_UPLOAD_BYTES+1}),/20 GB/);
  assert.throws(()=>validateVideo({name:'source.html',size:10}),/MP4, WebM, MOV or MKV/);
});

test('website creation rejects credentials and obvious private or executable input before creating a project',()=>{
  assert.equal(publicWebsite(' https://example.com/path '),'https://example.com/path');
  for(const url of ['javascript:alert(1)','file:///tmp/a','https://user:pass@example.com','http://localhost:8000','http://127.0.0.1','http://192.168.1.1','http://10.0.0.2','http://172.16.1.2','relative/path']) assert.throws(()=>publicWebsite(url));
});

test('recording recovery closes its database if a synchronous quota failure prevents staging',async()=>{
  let closed = 0;
  const quota = new Error('Quota exceeded');
  const db = {close(){closed++;},transaction(){return {objectStore(){return {put(){throw quota;}};}};}};
  const indexedDB = {open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}};
  const {stageRecording} = load('recording-store',{indexedDB,queueMicrotask});
  await assert.rejects(stageRecording(new File(['recording bytes'],'capture.webm',{type:'video/webm'})),/Quota exceeded/);
  assert.equal(closed,1);
});

test('recording recovery closes its database when opening a transaction itself fails',async()=>{
  let closed = 0;
  const db = {close(){closed++;},transaction(){throw new Error('Database is closing');}};
  const indexedDB = {open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}};
  const {recoverRecording} = load('recording-store',{indexedDB,queueMicrotask});
  await assert.rejects(recoverRecording(),/Database is closing/);
  assert.equal(closed,1);
});
