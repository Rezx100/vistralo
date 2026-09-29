'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
function assert(ok, message) { if (!ok) throw new Error(message); }
function text(value, max=500) { assert(typeof value === 'string' && value.length > 0 && value.length <= max, 'Invalid text'); return value; }
function within(root, relative, existing=false) {
  assert(typeof relative === 'string' && !path.isAbsolute(relative) && !relative.includes(':') && !relative.includes('\0') && !relative.includes('\\'), 'Invalid relative path');
  const base=fs.realpathSync(root), target=path.resolve(base, relative);
  assert(target.startsWith(base+path.sep), 'Path escapes project');
  let cursor=target;
  while (!fs.existsSync(cursor)) cursor=path.dirname(cursor);
  assert(fs.realpathSync(cursor)===base || fs.realpathSync(cursor).startsWith(base+path.sep), 'Symlink escapes project');
  if(existing) assert(fs.statSync(target).isFile(), 'File does not exist');
  return target;
}
function atomic(file, data) {
  fs.mkdirSync(path.dirname(file),{recursive:true}); const temp=file+'.'+id()+'.tmp';
  const fd=fs.openSync(temp,'wx',0o600);
  try {fs.writeFileSync(fd,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  fs.renameSync(temp,file);
}
async function hash(file) {const h=crypto.createHash('sha256'); for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
function disk(root, required=1024**3) { const s=fs.statfsSync(root); const available=s.bavail*s.bsize;assert(available>required,'Not enough free disk space. Free space and retry; original files are preserved.'); return available; }
class Store {
 constructor(root,{recover=true}={}) {
  this.root=path.resolve(root);fs.mkdirSync(this.root,{recursive:true});
  this.db=new DatabaseSync(path.join(this.root,'projects.sqlite'));this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,mode TEXT NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project TEXT NOT NULL,stage TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL,cap REAL NOT NULL DEFAULT 0,estimate REAL NOT NULL DEFAULT 0,data TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(project,stage,fingerprint));
  CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,project TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL,at TEXT NOT NULL);`);
  if(recover){ this.db.exec(`UPDATE projects SET state='Interrupted' WHERE state IN ('Recording','Paused','Processing','Stopping'); UPDATE jobs SET state=CASE WHEN cap>0 THEN 'Unknown' ELSE 'Interrupted' END WHERE state='Processing'`); }
 }
 create(name,mode) {text(name,120);assert(['record','walkthrough'].includes(mode),'Invalid project mode');const p={id:id(),name,mode,state:'Ready',data:{},created:now(),updated:now()};this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run(p.id,p.name,p.mode,p.state,'{}',p.created,p.updated);fs.mkdirSync(this.dir(p.id));this.event(p.id,'created',{mode});return p;}
 dir(pid) {assert(/^[a-f0-9-]{36}$/.test(pid),'Invalid project ID');return path.join(this.root,pid);}
 get(pid) {const p=this.db.prepare('SELECT * FROM projects WHERE id=?').get(pid);assert(p,'Project not found');p.data=JSON.parse(p.data);return p;}
 list(){return this.db.prepare('SELECT * FROM projects ORDER BY created DESC').all().map(p=>({...p,data:JSON.parse(p.data)}));}
 update(pid,state,data={}) {const p=this.get(pid);assert(['Ready','Recording','Paused','Stopping','Processing','Needs Review','Interrupted','Failed'].includes(state),'Invalid state');p.data={...p.data,...data};this.db.prepare('UPDATE projects SET state=?,data=?,updated=? WHERE id=?').run(state,JSON.stringify(p.data),now(),pid);this.event(pid,state,{});this.snapshot(pid);return this.get(pid);}
 claim(pid,state,allowed=['Ready','Needs Review','Interrupted','Failed']){this.get(pid);assert(['Recording','Processing'].includes(state),'Invalid work claim');const marks=allowed.map(()=>'?').join(',');const r=this.db.prepare('UPDATE projects SET state=?,updated=? WHERE id=? AND state IN ('+marks+')').run(state,now(),pid,...allowed);assert(r.changes===1,'Project is busy. Finish or recover the active operation first.');}
 event(pid,type,data){this.db.prepare('INSERT INTO events(project,type,data,at) VALUES(?,?,?,?)').run(pid,type,JSON.stringify(data),now());}
 events(pid){return this.db.prepare('SELECT * FROM events WHERE project=? ORDER BY seq').all(pid).map(e=>({...e,data:JSON.parse(e.data)}));}
 snapshot(pid){atomic(path.join(this.dir(pid),'project.json'),this.get(pid));}
 jobs(pid){return this.db.prepare('SELECT * FROM jobs WHERE project=?').all(pid).map(j=>({...j,data:JSON.parse(j.data)}));}
 reserve(pid,stage,fingerprint,{cap=0,estimate=0,approved=false,...data}={}) {
  this.get(pid);assert(Number.isFinite(cap)&&Number.isFinite(estimate)&&cap>=0&&estimate>=0,'Invalid budget');
  if(cap||estimate)assert(approved&&estimate>0&&cap>=estimate,'A reviewed estimate and sufficient per-job cap are required');
  const job={id:id(),project:pid,stage,fingerprint,state:'Processing',cap,estimate,data};
  try {this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?)').run(job.id,pid,stage,fingerprint,job.state,cap,estimate,JSON.stringify(data),now());}catch(e){if(String(e).includes('UNIQUE'))throw new Error('This exact job already exists. Inspect its status; do not resubmit ambiguous paid work.');throw e;}
  return job;
 }
 finish(jid,state,data={}) {assert(['Ready','Failed','Unknown','Interrupted','Cancelled'].includes(state),'Invalid job state');const j=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jid);assert(j,'Job missing');this.db.prepare('UPDATE jobs SET state=?,data=?,updated=? WHERE id=?').run(state,JSON.stringify({...JSON.parse(j.data),...data}),now(),jid);}
 close(){this.db.close();}
}
module.exports={Store,assert,text,within,atomic,hash,disk,id,now};
