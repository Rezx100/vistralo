import {createClient} from 'npm:@supabase/supabase-js@2.99.1';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
Deno.serve(async req=>{
 const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; media-src https://*.supabase.co; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
 const unavailable=()=>new Response('<!doctype html><title>Link unavailable</title><h1>This link is unavailable</h1><p>It may have expired or been revoked.</p>',{status:404,headers});
 if(req.method!=='GET')return new Response('Method not allowed',{status:405});
 const token=new URL(req.url).searchParams.get('t')||'';if(!/^[a-f0-9]{64}$/.test(token))return unavailable();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const {data:share,error}=await client.from('vistralo_shares').select('project_id,owner_id').eq('token_hash',digest).eq('revoked',false).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(error||!share)return unavailable();
 const {data:row}=await client.from('vistralo_projects').select('document').eq('id',share.project_id).eq('owner_id',share.owner_id).maybeSingle();
 if(!row||row.document.trashed)return unavailable();const p=row.document;
 const file=p.data?.output?.file;
 let media='';
 if(typeof file==='string'&&file.startsWith(`${share.owner_id}/${share.project_id}/`)&&p.data?.files?.[file]){
  const {data}=await client.storage.from('vistralo-media').createSignedUrl(file,60);
  if(data)media=`<video controls preload="metadata" src="${esc(data.signedUrl)}"></video><p><a href="${esc(data.signedUrl)}">Download output</a></p>`;
 }
 const brief=typeof p.data?.brief==='string'?p.data.brief.slice(0,1024*1024):'';
 if(!media&&!brief)return unavailable();
 return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} · Vistralo</title><style>body{font:16px/1.5 system-ui;margin:0;background:#0b0d12;color:#f4f5f8}main{max-width:960px;margin:48px auto;padding:0 24px}video{width:100%;max-height:70vh}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#a8adfd}small{color:#b9bdc8}</style><main><small>Shared with Vistralo · Read only</small><h1>${esc(p.name)}</h1>${media}${brief?`<pre>${esc(brief)}</pre>`:''}</main></html>`,{headers});
});
