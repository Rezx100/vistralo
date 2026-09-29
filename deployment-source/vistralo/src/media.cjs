'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const {assert,within,disk,id,hash,atomic}=require('./core.cjs');
function run(exe,args,{signal,onProgress}={}) {return new Promise((resolve,reject)=>{
 const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});let stdout='',stderr='';
 const stop=()=>child.kill();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 child.stdout.on('data',b=>{stdout=(stdout+b).slice(-8e6);onProgress?.(String(b));});child.stderr.on('data',b=>stderr=(stderr+b).slice(-16000));
 child.once('error',reject);child.once('close',code=>{signal?.removeEventListener('abort',stop);if(signal?.aborted)return reject(new Error('Cancelled; original files preserved'));code===0?resolve(stdout):reject(new Error(`${path.basename(exe)} failed (${code}). ${stderr.slice(-1200)}`));});
});}
class Media {
 constructor({ffmpeg='ffmpeg',ffprobe='ffprobe'}={}) {this.ffmpeg=ffmpeg;this.ffprobe=ffprobe;}
 async check(){return {ffmpeg:(await run(this.ffmpeg,['-version'])).split('\n')[0],ffprobe:(await run(this.ffprobe,['-version'])).split('\n')[0]};}
 async probe(file){return JSON.parse(await run(this.ffprobe,['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,wav,mp3','-show_streams','-show_format','-of','json',file]));}
 async measureDuration(file){const probe=await this.probe(file);const format=Number(probe.format&&probe.format.duration);if(format>0)return format;const video=(probe.streams||[]).find(s=>s.codec_type==='video');const stream=Number(video&&video.duration);if(stream>0)return stream;const progress=await run(this.ffmpeg,['-hide_banner','-nostdin','-i',file,'-map','0:v:0','-f','null','-progress','pipe:1','-']);const marks=[...progress.matchAll(/out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];const last=marks[marks.length-1];const duration=last?Number(last[1])*3600+Number(last[2])*60+Number(last[3]):0;assert(duration>0,'Recording has no measurable duration');return duration;}
 async sampleFrames(root,file,count=8){const source=within(root,file,true),duration=await this.measureDuration(source);const n=Math.min(12,Math.max(2,count)),dir='evidence/screen';fs.mkdirSync(within(root,dir),{recursive:true});const frames=[];for(let i=0;i<n;i++){const at=Math.max(0,Math.min(duration-.05,duration*((i+.5)/n)));const rel=`${dir}/frame-${String(i).padStart(2,'0')}.jpg`;await run(this.ffmpeg,['-hide_banner','-nostdin','-y','-i',source,'-ss',at.toFixed(3),'-frames:v','1','-q:v','3',within(root,rel)]);frames.push(rel);}return {duration,frames};}
 async framesAt(root,file,times,{dir='evidence/chapters',width}={}){const source=within(root,file,true);assert(Array.isArray(times)&&times.length>=1&&times.length<=80,'Choose 1–80 frame times');assert(/^[a-z0-9/_-]+$/.test(dir),'Invalid frame folder');fs.mkdirSync(within(root,dir),{recursive:true});const scale=['-vf',`scale='min(${Math.floor(width||1920)},iw)':-2`];const frames=[];for(const [i,at]of times.entries()){assert(Number.isFinite(at)&&at>=0,'Invalid frame time');const rel=`${dir}/frame-${String(i).padStart(2,'0')}.jpg`;await run(this.ffmpeg,['-hide_banner','-nostdin','-y','-ss',at.toFixed(3),'-i',source,'-frames:v','1',...scale,'-q:v','3',within(root,rel)]);frames.push(rel);}return frames;}
 async output(root,name,args,options={}) {
  disk(root,32*1024**2);assert(/^[a-zA-Z0-9_-]+$/.test(name),'Invalid output name');const rel=`exports/${name}-${id().slice(0,8)}.mp4`;const out=within(root,rel);fs.mkdirSync(path.dirname(out),{recursive:true});const temp=out+'.partial.mp4';
  try {await run(this.ffmpeg,['-hide_banner','-nostdin','-n',...args,'-movflags','+faststart','-progress','pipe:1',temp],options);const p=await this.probe(temp);assert(p.streams.some(s=>s.codec_type==='video')&&Number(p.format.duration)>0,'Output contains no usable video');fs.renameSync(temp,out);return {file:rel,sha256:await hash(out),duration:Number(p.format.duration),streams:p.streams.map(({codec_type,codec_name,width,height})=>({codec_type,codec_name,width,height}))};}catch(e){try{fs.unlinkSync(temp)}catch{}throw e;}
 }
 async remux(root,file,options) {return this.output(root,'master',['-i',within(root,file,true),'-map','0','-c','copy'],options);}
 async render(root,plan,options) {
  validatePlan(plan);const input=within(root,plan.source,true),probe=await this.probe(input),duration=await this.measureDuration(input);assert(plan.clips.every(c=>c.end<=duration+.05),'Edit exceeds source duration');
  const hasAudio=probe.streams.some(s=>s.codec_type==='audio');let graph=[],labels=[];
  plan.clips.forEach((c,i)=>{graph.push(`[0:v]trim=start=${c.start}:end=${c.end},setpts=PTS-STARTPTS[v${i}]`);if(hasAudio)graph.push(`[0:a:0]atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS[a${i}]`);labels.push(`[v${i}]${hasAudio?'[a'+i+']':''}`);});
  graph.push(`${labels.join('')}concat=n=${plan.clips.length}:v=1:a=${hasAudio?1:0}[v]${hasAudio?'[a]':''}`);
  const args=['-i',input,'-filter_complex',graph.join(';'),'-map','[v]'];if(hasAudio)args.push('-map','[a]');args.push('-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac');return this.output(root,'edited',args,options);
 }
 async voiceOnly(root,video,audio,options){const v=within(root,video,true),a=within(root,audio,true);const vp=await this.probe(v),ap=await this.probe(a);assert(Math.abs(Number(vp.format.duration)-Number(ap.format.duration))<.25,'Voice-only replacement requires audio within 250 ms of video duration');return this.output(root,'voice-replaced',['-i',v,'-i',a,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac'],options);}
}
function validatePlan(plan){assert(plan&&plan.version===1,'Edit plan version must be 1');assert(typeof plan.source==='string','Source required');assert(Array.isArray(plan.clips)&&plan.clips.length>0&&plan.clips.length<=200,'Provide 1–200 clips');let last=0;for(const c of plan.clips){assert(Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=last&&c.end>c.start,'Clips must be finite, chronological and non-overlapping');last=c.end;}return plan;}
module.exports={Media,run,validatePlan};
