'use strict';
const {spawn}=require('node:child_process');
const {assert}=require('./core.cjs');

const W=48,H=160;

function grayFrames(ffmpeg,file,fps,{signal}={}){return new Promise((resolve,reject)=>{
 const child=spawn(ffmpeg,['-hide_banner','-nostdin','-v','error','-i',file,'-map','0:v:0','-vf',`fps=${fps},scale=${W}:${H}:flags=area,format=gray`,'-f','rawvideo','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const chunks=[];let size=0,stderr='';const stop=()=>child.kill();signal?.addEventListener('abort',stop,{once:true});
 child.stdout.on('data',b=>{chunks.push(b);size+=b.length;if(size>W*H*20000)child.kill();});child.stderr.on('data',b=>stderr=(stderr+b).slice(-4000));
 child.once('error',reject);child.once('close',code=>{signal?.removeEventListener('abort',stop);if(code!==0)return reject(new Error('Could not read the recording frames. '+stderr.slice(-600)));const all=Buffer.concat(chunks),frames=[];for(let o=0;o+W*H<=all.length;o+=W*H)frames.push(all.subarray(o,o+W*H));resolve(frames);});
});}

// Vertical shift that best maps frame a onto frame b, with the leftover difference (0–1).
function shiftOf(a,b,max=Math.floor(H*.6)){let best=0,err=Infinity;
 for(let s=-max;s<=max;s++){const from=Math.max(0,s),to=Math.min(H,H+s);if(to-from<H*.35)continue;let sum=0;
  for(let y=from;y<to;y++){const ra=y*W,rb=(y-s)*W;for(let x=0;x<W;x++)sum+=Math.abs(a[ra+x]-b[rb+x]);}
  const e=sum/((to-from)*W*255);if(e<err-1e-6||(Math.abs(e-err)<=1e-6&&Math.abs(s)<Math.abs(best))){err=e;best=s;}}
 return {shift:best,error:err};}
function diff(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/(a.length*255);}

// Splits a screen recording into the distinct viewports a viewer sees: a new one each time the page
// scrolls most of a screen further, jumps to another page or opens something new, held where the motion settles.
function planViewports(frames,fps,{overlap=.8,max=36,minGap=1.2,settle=1.6}={}){
 assert(frames.length>=2,'Recording is too short to plan viewports');
 const motion=[0],offset=[0],cut=[false],page=[0];
 for(let i=1;i<frames.length;i++){const m=diff(frames[i-1],frames[i]);motion.push(m);
  if(m<.004){offset.push(offset[i-1]);cut.push(false);page.push(page[i-1]);continue;}
  const {shift,error}=shiftOf(frames[i-1],frames[i]);const jumped=error>.07&&error>m*.6;
  offset.push(offset[i-1]+(jumped?0:shift/H));cut.push(jumped);page.push(page[i-1]+(jumped?1:0));}
 const duration=frames.length/fps;
 // Waits for the scroll to settle, but never so long that more than a screen goes by unseen.
 const stillest=(from,last)=>{let best=from;for(let j=from;j<Math.min(frames.length,from+Math.ceil(settle*fps));j++){if(page[j]===page[last]&&Math.abs(offset[j]-offset[last])>1)break;if(motion[j]<motion[best]-.0005)best=j;}return best;};
 const plan=step=>{const reps=[stillest(0,0)];let changedSince=false;
  for(let i=reps[0]+1;i<frames.length;i++){const last=reps.at(-1);changedSince=changedSince||cut[i];
   const moved=Math.abs(offset[i]-offset[last]),changed=changedSince||diff(frames[i],frames[last])>.09&&moved<.15;
   if(moved>=step||changed&&(i-last)/fps>=minGap){const at=stillest(i,last);reps.push(at);changedSince=false;i=at;}}
  const last=reps.at(-1),end=frames.length-1;if((end-last)/fps>=minGap&&(Math.abs(offset[end]-offset[last])>=step*.4||diff(frames[end],frames[last])>.05))reps.push(end);
  return reps;};
 let step=overlap,reps=plan(step);while(reps.length>max&&step<4){step*=1.15;reps=plan(step);}
 return {duration,step,viewports:reps.map((i,n)=>{const prev=reps[n-1];
  const arrival=n===0?'start':page[i]!==page[prev]||Math.abs(offset[i]-offset[prev])<.15?'new screen':offset[i]>offset[prev]?'scrolled down':'scrolled up';
  return {at:Math.min(duration-.05,i/fps),arrival};})};}

async function detectViewports(media,file,options={}){const fps=options.fps||8;const frames=await grayFrames(media.ffmpeg,file,fps,options);return planViewports(frames,fps,options);}
module.exports={detectViewports,planViewports,shiftOf,diff,W,H};
