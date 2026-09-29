import { createClient } from '@supabase/supabase-js';
import type { WorkspaceAdapter, Project, ProjectDetail, CreateProjectInput, ProjectPatch, UploadOptions, WorkspaceSettings, ShareLink } from './contracts';
import { uuid } from './id';
import { abortIfNeeded, checksum } from './checksum';
import { posterFrame } from './poster';

declare const VISTRALO_SUPABASE_URL: string;
declare const VISTRALO_SUPABASE_KEY: string;
export const cloudConfigured = typeof VISTRALO_SUPABASE_URL !== 'undefined' && !!VISTRALO_SUPABASE_URL;
export const cloud = cloudConfigured ? createClient(VISTRALO_SUPABASE_URL,VISTRALO_SUPABASE_KEY,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
const required = () => {if(!cloud) throw Error('Cloud connection is not configured.'); return cloud;};
const unwrap = <T,>(result:{data?:T|null,error:any}):NonNullable<T> => {if(result.error) throw Error(result.error.message);return result.data as NonNullable<T>;};
const now = () => new Date().toISOString();
// Matches the project's Supabase global file size limit (Pro plan with spend cap on).
const MAX_UPLOAD = 50 * 1024 ** 3;
// Supabase resumable uploads require exactly 6 MB chunks.
const UPLOAD_CHUNK = 6 * 1024 * 1024;
// The worker rebuilds data.files from its own snapshot, so a poster written mid-job may be missing there.
const ownPoster = (p:Project) => typeof p.thumbnail==='string'&&p.thumbnail.split('/')[1]===p.id&&!p.thumbnail.includes('..');
const storageEndpoint = () => {const u=new URL(VISTRALO_SUPABASE_URL);if(/^[a-z0-9]+\.supabase\.co$/.test(u.hostname))u.hostname=u.hostname.replace('.supabase.co','.storage.supabase.co');return `${u.origin}/storage/v1/upload/resumable`;};
export async function cloudAccount() {
  const client=required();
  const {data}=await client.auth.getSession();
  const user=data.session?.user;
  if(!user) throw Error('Sign in to Vistralo.');
  const account=unwrap<{role:string,user_id:string,display_name:string,workspace_name:string}>(await client.from('vistralo_accounts').select('*').eq('user_id',user.id).single());
  if(!account) throw Error('Your account has not been granted workspace access.');
  return {...account,email:user.email||''};
}
export class CloudAdapter implements WorkspaceAdapter {
  readonly mode='cloud' as const;
  capabilities={manage:true,share:true,workspaceAccess:false,upload:true,capture:true,providers:true,localOnly:false};
  private urls=new Map<string,{url:string,until:number}>();
  async login(value:string){const {email,password}=JSON.parse(value);const result=await required().auth.signInWithPassword({email,password});if(result.error)throw result.error;await cloudAccount();}
  async logout(){unwrap(await required().auth.signOut());this.urls.clear();}
  async settings(patch?:WorkspaceSettings){const account=await cloudAccount();if(patch)unwrap(await required().from('vistralo_accounts').update({display_name:String(patch.displayName||account.display_name),workspace_name:String(patch.name||account.workspace_name)}).eq('user_id',account.user_id));return {displayName:account.display_name,email:account.email,name:account.workspace_name,role:account.role};}
  private async row(id:string){await cloudAccount();const row=unwrap<{id:string,owner_id:string,document:Project,updated_at:string}>(await required().from('vistralo_projects').select('*').eq('id',id).single());return row;}
  private async sign(p:Project, only?:string[]){
    const files=[...new Set([...(only??Object.keys(p.data.files||{})),...(ownPoster(p)?[p.thumbnail!]:[])])];
    const nowMs=Date.now();
    const needed=files.filter(file=>{const hit=this.urls.get(p.id+':'+file);return !(hit&&hit.until-nowMs>120000);});
    for(let i=0;i<needed.length;i+=8){
      await Promise.all(needed.slice(i,i+8).map(async file=>{
        const data=unwrap(await required().storage.from('vistralo-media').createSignedUrl(file,600));
        this.urls.set(p.id+':'+file,{url:data.signedUrl,until:nowMs+480000});
      }));
    }
    return {...p,thumbnail:p.thumbnail?this.media(p.id,p.thumbnail):undefined};
  }
  async list(){
    await cloudAccount();
    const rows=unwrap(await required().from('vistralo_projects').select('*').order('updated_at',{ascending:false}));
    const projects=rows.map(r=>({...r.document,id:r.id,created:r.created_at,updated:r.updated_at} as Project));
    this.backfillPosters(projects);
    return Promise.all(projects.map(async p=>{
      try{return await this.sign(p,[]);}catch{return {...p,thumbnail:undefined};}
    }));
  }
  private postersTried=new Set<string>();
  private postersRunning=false;
  // Projects recorded before posters existed get one, drawn from their video, the first time they are listed.
  private backfillPosters(projects:Project[]){
    const pending=projects.filter(p=>!p.thumbnail&&!p.trashed&&p.type==='walkthrough'&&typeof p.video==='string'&&p.data?.files?.[p.video]&&!['queued','processing','uploading'].includes(p.status)&&!this.postersTried.has(p.id));
    if(!pending.length||this.postersRunning)return;
    this.postersRunning=true;
    void (async()=>{
      for(const p of pending){
        this.postersTried.add(p.id);
        try{await this.poster(p.id);}catch{/* The card keeps its placeholder. */}
      }
    })().finally(()=>{this.postersRunning=false;});
  }
  private async poster(id:string,local?:Blob){
    const row=await this.row(id);
    const p=row.document;
    if(!p.video)throw Error('Upload a recording before making a thumbnail.');
    let source:Blob|string|undefined=local;
    if(!source){await this.sign({...p,id},[p.video]);source=this.media(id,p.video);}
    if(!source)throw Error('The recording could not be opened.');
    const image=await posterFrame(source);
    const target=`${row.owner_id}/${id}/poster-${uuid()}.${image.type==='image/webp'?'webp':'jpg'}`;
    unwrap(await required().storage.from('vistralo-media').upload(target,image,{contentType:image.type,cacheControl:'31536000',upsert:false}));
    // Attaching a poster is not an edit: keep updated_at so the project does not jump to the top of the list.
    for(let attempt=0;attempt<3;attempt++){
      const latest=attempt?await this.row(id):row;
      const previous=ownPoster({...latest.document,id})?latest.document.thumbnail:undefined;
      const files={...latest.document.data.files};
      if(previous)delete files[previous];
      const next={...latest.document,thumbnail:target,data:{...latest.document.data,files:{...files,[target]:{size:image.size,mime:image.type}}}};
      const saved=unwrap(await required().from('vistralo_projects').update({document:next}).eq('id',id).eq('updated_at',latest.updated_at).select('id'));
      if(saved.length){
        if(previous&&previous!==target)await required().storage.from('vistralo-media').remove([previous]).catch(()=>{});
        return target;
      }
    }
    await required().storage.from('vistralo-media').remove([target]).catch(()=>{});
    throw Error('This project changed in another session. Refresh and try again.');
  }
  async create(input:CreateProjectInput){const account=await cloudAccount();const id=uuid();const p:Project={id,name:input.name,type:input.type||(input.source==='web'?'brief':'walkthrough'),source:input.source,url:input.url,status:'draft',access:'private',created:now(),updated:now(),eventAt:now(),eventLabel:'Updated',data:{files:{}}};unwrap(await required().from('vistralo_projects').insert({id,owner_id:account.user_id,document:p}));return p;}
  private async save(id:string,mutate:(p:Project)=>Project){const row=await this.row(id);const p=mutate(row.document);p.updated=now();const saved=unwrap(await required().from('vistralo_projects').update({document:p,updated_at:p.updated}).eq('id',id).eq('updated_at',row.updated_at).select('id'));if(!saved.length)throw Error('This project changed in another session. Refresh and try again.');return this.sign(p);}
  async update(id:string,patch:ProjectPatch){if(patch.access&&patch.access!=='private')throw Error('Use a read-only share link to grant access.');return this.save(id,p=>({...p,...patch,eventLabel:patch.lastOpened?'Updated':'Edited',eventAt:patch.lastOpened?p.eventAt:now()}));}
  async duplicate(id:string){const original=await this.row(id);if(Object.keys(original.document.data.files||{}).length)throw Error('Duplicate a media project by uploading its source into a new project. Originals stay private.');const next=await this.create({...original.document,name:original.document.name+' (copy)'});return this.save(next.id,p=>({...p,data:structuredClone(original.document.data)}));}
  async trash(ids:string[]){for(const id of ids){await this.save(id,p=>({...p,trashed:true,trashedAt:now()}));unwrap(await required().from('vistralo_shares').update({revoked:true}).eq('project_id',id));}}
  async restore(ids:string[]){for(const id of ids)await this.save(id,p=>({...p,trashed:false,trashedAt:undefined}));}
  async remove(ids:string[]){for(const id of ids){const row=await this.row(id);if(!row.document.trashed)throw Error('Move the project to Trash first.');const files=[...new Set([...Object.keys(row.document.data.files||{}),...(ownPoster({...row.document,id})?[row.document.thumbnail!]:[])])];if(files.length)unwrap(await required().storage.from('vistralo-media').remove(files));unwrap(await required().from('vistralo_projects').delete().eq('id',id));}}
  async project(id:string):Promise<ProjectDetail>{const row=await this.row(id);const p=await this.sign(row.document);const jobs=unwrap(await required().from('vistralo_jobs').select('*').eq('project_id',id).order('created_at',{ascending:false}));return {project:p,files:Object.entries(p.data.files||{}).map(([file,value]:[string,any])=>({file,...value})),evidence:p.data.evidence||null,jobs,events:[],progress:await this.liveProgress(jobs),shares:await this.shares(id),brief:p.data.brief};}
  private async liveProgress(jobs:any[]){
    const job=jobs.find(j=>j.state==='queued'||j.state==='processing');
    if(!job)return null;
    const progress={...(job.progress||{})} as Record<string,any>;
    if(job.state==='queued'&&progress.percent===undefined){
      // Row-level security limits this count to the viewer's own jobs, so say exactly that.
      const ahead=(unwrap(await required().from('vistralo_jobs').select('id').eq('state','queued').lt('created_at',job.created_at))||[]).length;
      return {percent:0,stage:'Waiting for a free capture worker',detail:ahead?`${ahead} of your other job${ahead>1?'s are':' is'} ahead in the queue`:'This project is next in your queue'};
    }
    if(typeof progress.preview==='string'){
      // One URL per published frame: reminting on every poll would change the
      // src without changing the picture, and the view would flicker.
      const key=`${progress.preview}@${progress.previewAt||''}`;
      let url=this.previews.get(key);
      if(!url){
        const signed=await required().storage.from('vistralo-media').createSignedUrl(progress.preview,300);
        url=signed.data?.signedUrl||'';
        if(url){this.previews.clear();this.previews.set(key,url);}
      }
      if(url)progress.previewUrl=url;
    }
    return progress;
  }
  private previews=new Map<string,string>();
  media(id:string,file:string,download=false){
    const url=this.urls.get(id+':'+file)?.url||'';
    // Supabase only sends Content-Disposition: attachment when the signed URL carries download=<filename>.
    return url&&download?`${url}&download=${encodeURIComponent(file.split('/').pop()||'download')}`:url;
  }
  async readText(id:string,file:string){await this.row(id);const data=unwrap(await required().storage.from('vistralo-media').download(file));return data.text();}
  // TUS against the direct storage host: 6 MB chunks, each retried from the server's offset, so a dropped connection costs one chunk.
  private async resumable(target:string,file:File,resumeKey:string,options:UploadOptions){
    const endpoint=storageEndpoint();
    const headers=async()=>{const {data}=await required().auth.getSession();const token=data.session?.access_token;if(!token)throw Error('Sign in to Vistralo.');return {authorization:`Bearer ${token}`,apikey:VISTRALO_SUPABASE_KEY,'tus-resumable':'1.0.0'};};
    const reason=async(r:Response)=>{const text=await r.text().catch(()=>'');try{return JSON.parse(text).message||text;}catch{return text||`Upload failed (${r.status}).`;}};
    const serverOffset=async(location:string)=>{const r=await fetch(location,{method:'HEAD',headers:await headers(),signal:options.signal});if(!r.ok)return -1;return Number(r.headers.get('upload-offset'));};
    let location=(JSON.parse(localStorage.getItem(resumeKey)||'null') as {location:string,target:string}|null)?.location||'';
    let offset=location?await serverOffset(location):-1;
    if(offset<0){
      const meta=[['bucketName','vistralo-media'],['objectName',target],['contentType',file.type||'application/octet-stream'],['cacheControl','3600']].map(([k,v])=>`${k} ${btoa(v)}`).join(',');
      const r=await fetch(endpoint,{method:'POST',headers:{...await headers(),'upload-length':String(file.size),'upload-metadata':meta,'x-upsert':'false'},signal:options.signal});
      if(r.status!==201)throw Error(await reason(r));
      location=new URL(r.headers.get('location')||'',endpoint).href;offset=0;
      localStorage.setItem(resumeKey,JSON.stringify({location,target}));
    }
    let failures=0;
    while(offset<file.size){
      abortIfNeeded(options.signal);
      options.onProgress?.({phase:'uploading',percent:Math.floor(offset/file.size*100),uploaded:offset,total:file.size});
      let r:Response;
      try{r=await fetch(location,{method:'PATCH',headers:{...await headers(),'upload-offset':String(offset),'content-type':'application/offset+octet-stream'},body:file.slice(offset,offset+UPLOAD_CHUNK),signal:options.signal});}
      catch(e){
        if((e as Error).name==='AbortError')throw e;
        if(++failures>6)throw Error('The connection keeps dropping. Select the same file again to resume from where it stopped.');
        await new Promise(done=>setTimeout(done,1000*2**failures));
        const resumed=await serverOffset(location).catch(()=>-1);if(resumed>=0)offset=resumed;
        continue;
      }
      if(r.status===409){const resumed=await serverOffset(location);if(resumed<0)throw Error(await reason(r));offset=resumed;continue;}
      if(r.status!==204)throw Error(await reason(r));
      offset=Number(r.headers.get('upload-offset'));failures=0;
    }
    options.onProgress?.({phase:'uploading',percent:100,uploaded:file.size,total:file.size});
    localStorage.removeItem(resumeKey);
  }
  async upload(id:string,file:File,options:UploadOptions={}){
    if(!file.size)throw Error('The selected file is empty.');
    if(file.size>MAX_UPLOAD)throw Error('This file is larger than 50 GB, the workspace upload limit.');
    abortIfNeeded(options.signal);
    const account=await cloudAccount();const row=await this.row(id);if(row.document.trashed)throw Error('Restore this project before uploading.');
    const ext=file.name.split('.').pop()?.toLowerCase();if(!['mp4','webm','mov','mkv','wav','mp3','m4a','srt','vtt'].includes(ext||''))throw Error('Unsupported media format.');
    const digest=await checksum(file,options);
    const resumeKey=`vistralo-cloud-upload:${id}:${digest}:${file.size}`;
    const stored=JSON.parse(localStorage.getItem(resumeKey)||'null') as {target?:string}|null;
    const target=typeof stored?.target==='string'&&stored.target.startsWith(`${account.user_id}/${id}/`)?stored.target:`${account.user_id}/${id}/${uuid()}.${ext}`;
    await this.save(id,p=>({...p,status:'uploading',progress:0}));options.onProgress?.({phase:'uploading',percent:0});
    try {
      await this.resumable(target,file,resumeKey,options);
      const spoken=options.voice==='microphone';
      await this.save(id,p=>({...p,status:'draft',progress:undefined,error:undefined,video:target,duration:undefined,eventLabel:spoken?'Recorded':'Uploaded',eventAt:now(),data:{...p.data,video:target,output:null,editPlan:null,sourceMaster:null,narratedVideo:null,walkthroughVideo:null,captions:null,script:null,scriptParts:null,scriptError:null,mediaInfo:null,sourceSha256:digest,microphone:spoken?true:p.data.microphone,files:{...p.data.files,[target]:{size:file.size,mime:file.type}}}}));
      if(['mp4','webm','mov','mkv'].includes(ext||''))await this.poster(id,file).catch(()=>{});
      const saved=await this.row(id);
      if(spoken)return {file:target,sha256:digest,voice:'microphone' as const};
      const voiceover=options.voice==='ai'||(saved.document.source==='screen'&&options.voice!=='original');
      if(voiceover){
        if(!await this.workerReady())return {file:target,sha256:digest,voice:'offline' as const};
        unwrap(await required().from('vistralo_jobs').insert({project_id:id,owner_id:account.user_id,kind:'narrate',payload:{auto:true}}));
        await this.save(id,p=>({...p,status:'queued'}));
        return {file:target,sha256:digest,voice:'queued' as const};
      }
      if(await this.workerReady()){unwrap(await required().from('vistralo_jobs').insert({project_id:id,owner_id:account.user_id,kind:'probe',payload:{}}));await this.save(id,p=>({...p,status:'queued'}));}
      return {file:target,sha256:digest,voice:null};
    } catch(e){await this.save(id,p=>({...p,status:'failed',error:(e as Error).message}));throw e;}
  }
  async shares(id:string):Promise<ShareLink[]>{const rows=unwrap(await required().from('vistralo_shares').select('id,expires_at,created_at,revoked').eq('project_id',id));return rows.map(r=>({id:r.id,expiresAt:r.expires_at,created:r.created_at,revoked:r.revoked}));}
  async share(id:string,days:1|7|30=7){const row=await this.row(id);if(row.document.trashed)throw Error('Restore the project first.');if(!row.document.data.output?.file&&!row.document.data.brief)throw Error('Finish the output or save a brief before sharing.');const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');const data=unwrap<{id:string,expires_at:string}>(await required().from('vistralo_shares').insert({project_id:id,owner_id:row.owner_id,token_hash:hash,expires_at:new Date(Date.now()+days*86400000).toISOString()}).select().single());return {id:data.id,url:`${VISTRALO_SUPABASE_URL}/functions/v1/vistralo-share?t=${token}`,expiresAt:data.expires_at};}
  async revoke(id:string){unwrap(await required().from('vistralo_shares').update({revoked:true}).eq('id',id));}
  async rpc<T=any>(method:string,args:Record<string,any>={}):Promise<T>{
    if(method==='check'){await cloudAccount();return {database:'connected',worker:await this.workerReady()} as T;}
    if(method==='briefSave'){const text=String(args.text||'');if(text.length>1024*1024)throw Error('Brief exceeds 1 MB.');return await this.save(args.id,p=>({...p,eventLabel:'Edited',eventAt:now(),data:{...p.data,brief:text}})) as T;}
    if(method==='plan'){return await this.save(args.id,p=>({...p,eventLabel:'Edited',eventAt:now(),data:{...p.data,editPlan:args.plan,output:null}})) as T;}
    if(method==='mediaInfo'){const row=await this.row(args.id);const info=row.document.data.mediaInfo;if(info&&row.document.video===args.file)return info;throw Error('Media inspection requires the connected capture worker.');}
    if(method==='thumbnail'){await this.poster(args.id);return (await this.project(args.id)).project as T;}
    if(method==='walkthrough'||method==='process'){
      if(!await this.workerReady())throw Error('The capture and render worker is offline. Your project is saved; try again when it reconnects.');
      const row=await this.row(args.id);const kind=method==='walkthrough'?'website':'render';
      if(kind==='render'&&args.action!=='render'&&args.action!=='remux')throw Error('Only trim rendering and MP4 previews are supported in this cloud workspace.');
      if(kind==='render'&&args.action==='remux'&&!row.document.video)throw Error('Upload a source video before creating an MP4 preview.');
      const payload=kind==='website'?{url:args.url,viewports:args.viewports,narrate:args.narrate===true}:args.action==='remux'?{mode:'preview'}:{plan:row.document.data.editPlan};
      const job=unwrap(await required().from('vistralo_jobs').insert({project_id:args.id,owner_id:row.owner_id,kind,payload}).select().single());
      await this.save(args.id,p=>({...p,status:'queued',error:undefined}));return job as T;
    }
    if(method==='cancel'){
      const cancelled=unwrap(await required().rpc('vistralo_cancel_jobs',{p_project:args.id}));
      await this.save(args.id,p=>p.status==='queued'||p.status==='processing'?{...p,status:'draft',eventLabel:'Updated',eventAt:now(),error:undefined}:p);
      return {cancelled} as T;
    }
    if(method==='providerSettings'){
      const account=await cloudAccount();
      const rows=unwrap(await required().from('vistralo_provider_settings').select('voice_id,cost_cap_usd,openai_configured,heygen_configured').eq('owner_id',account.user_id));
      const row:any=rows[0]||{};
      return {openai:!!row.openai_configured,heygen:!!row.heygen_configured,voiceId:row.voice_id||'',cap:Number(row.cost_cap_usd??1),workerKey:!!await this.workerKey()} as T;
    }
    if(method==='providerSave'){
      const account=await cloudAccount();
      const cap=Number(args.cap);
      if(!Number.isFinite(cap)||cap<=0||cap>50)throw Error('Set a per-job cost cap between $0.01 and $50.');
      // Keys are sealed to the worker's public key here, so the plaintext never leaves this browser.
      const seal=async(value:unknown)=>typeof value==='string'&&value.trim()?await this.seal(value.trim()):'';
      unwrap(await required().rpc('vistralo_save_provider_settings',{
        p_openai:await seal(args.openai),
        p_heygen:await seal(args.heygen),
        p_voice:String(args.voiceId||''),
        p_cap:cap,
      }));
      return {saved:true} as T;
    }
    if(method==='scriptSave'){
      const text=String(args.text||'');
      if(text.length>5000)throw Error('Narration script must be 5000 characters or fewer.');
      return await this.save(args.id,p=>({...p,eventLabel:'Edited',eventAt:now(),data:{...p.data,script:text,scriptApproved:false}})) as T;
    }
    if(method==='voiceover'){
      if(!await this.workerReady())throw Error('The capture and render worker is offline. Your project is saved; try again when it reconnects.');
      const row=await this.row(args.id);
      if(row.document.trashed)throw Error('Restore this project first.');
      if(!row.document.video)throw Error('Upload a recording before adding an AI voice-over.');
      const job=unwrap(await required().from('vistralo_jobs').insert({project_id:args.id,owner_id:row.owner_id,kind:'narrate',payload:{auto:true}}).select().single());
      await this.save(args.id,p=>({...p,status:'queued',error:undefined}));
      return job as T;
    }
    if(method==='narrate'){
      if(!await this.workerReady())throw Error('The capture and render worker is offline. Your project is saved; try again when it reconnects.');
      const row=await this.row(args.id);
      const text=String(args.text??row.document.data.script??'').trim();
      if(!text)throw Error('Draft a narration script before generating audio.');
      if(text.length>5000)throw Error('Narration script must be 5000 characters or fewer.');
      if(!row.document.data.walkthroughVideo)throw Error('Capture the website before narrating it.');
      await this.save(args.id,p=>({...p,status:'queued',error:undefined,data:{...p.data,script:text,scriptApproved:true}}));
      const job=unwrap(await required().from('vistralo_jobs').insert({project_id:args.id,owner_id:row.owner_id,kind:'narrate',payload:{}}).select().single());
      return job as T;
    }
    throw Error('This action is not available in the cloud workspace yet.');
  }
  private async workerKey(){const rows=unwrap(await required().from('vistralo_worker_keys').select('public_key').eq('id','capture-worker'));return rows[0]?.public_key||'';}
  private async seal(value:string){
    const spki=await this.workerKey();
    if(!spki)throw Error('The capture worker has not published an encryption key yet. Start the worker and try again.');
    const raw=Uint8Array.from(atob(spki),c=>c.charCodeAt(0));
    const key=await crypto.subtle.importKey('spki',raw,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
    const sealed=await crypto.subtle.encrypt({name:'RSA-OAEP'},key,new TextEncoder().encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(sealed)));
  }
  private async workerReady(){const rows=unwrap(await required().from('vistralo_runtime').select('heartbeat_at').eq('id','capture-worker'));return !!rows[0]&&Date.now()-Date.parse(rows[0].heartbeat_at)<60000;}
}
