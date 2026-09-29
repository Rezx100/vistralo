'use strict';
const {assert,within,atomic,id}=require('./core.cjs');const {run}=require('./media.cjs');const path=require('node:path');const fs=require('node:fs');
function transcriptPlan(source,words,{padding=.08,maxGap=.6,removeFillers=true}={}){assert(Array.isArray(words)&&words.length>0&&words.length<=50000,'Word-timed transcript required');let last=0;const kept=[];for(const w of words){assert(typeof w.text==='string'&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=last&&w.end>w.start,'Invalid word timing');last=w.start;if(removeFillers&&/^(um+|uh+|erm|hmm)[,.!?]?$/i.test(w.text.trim()))continue;kept.push(w);}assert(kept.length,'No speech remains');const clips=[];for(const w of kept){const start=Math.max(0,w.start-padding),end=w.end+padding;if(clips.length&&start-clips.at(-1).end<=maxGap)clips.at(-1).end=end;else clips.push({start,end});}assert(clips.length<=200,'Transcript produces more than 200 clips; split into chapters');return {version:1,source,clips,notes:'Review cuts before rendering. This rule-based proposal removes isolated fillers and long gaps; it does not correct English or identify semantic repetition.',script:kept.map(w=>w.text).join(' ')};}
function srtTime(sec){assert(Number.isFinite(sec)&&sec>=0,'Invalid caption timing');const ms=Math.round(sec*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;}
async function composeNarrated(media,root,segments,options={}){assert(Array.isArray(segments)&&segments.length>0&&segments.length<=40,'Use 1–40 narration segments');const chapterDir='chapters/'+id().slice(0,8);fs.mkdirSync(within(root,chapterDir),{recursive:true});const outputs=[],captions=[];let offset=0;for(const [i,s]of segments.entries()){
 assert(typeof s.text==='string'&&s.text.length<=5000&&Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start&&s.start>=0,'Invalid narrated segment');const source=within(root,s.video,true),audio=within(root,s.audio,true),videoDuration=await media.measureDuration(source),ap=await media.probe(audio);assert(s.end<=videoDuration+.05,'Segment exceeds video duration');const duration=Number(ap.format.duration);assert(duration>0&&duration<=600,'Narration segment must be between 0 and 600 seconds');const clipLength=s.end-s.start;const filter=`scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${Math.max(0,duration-clipLength)}`;
 const out=await media.output(root,'chapter',['-ss',String(s.start),'-t',String(clipLength),'-i',source,'-i',audio,'-map','0:v:0','-map','1:a:0','-vf',filter,'-t',String(duration),'-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2'],options);outputs.push(out);captions.push(`${i+1}\n${srtTime(offset)} --> ${srtTime(offset+duration)}\n${s.text.replace(/\r?\n/g,' ')}\n`);offset+=duration;}
  const list=within(root,chapterDir+'/concat.txt');atomic(list,outputs.map(o=>"file '"+within(root,o.file,true).split(path.sep).join('/').replace(/'/g,"'\\''")+"'").join('\n'));
 const output=await media.output(root,'narrated-brief',['-f','concat','-safe','0','-i',list,'-c','copy'],options);const captionsFile=output.file.replace('.mp4','.srt');atomic(within(root,captionsFile),captions.join('\n'));atomic(within(root,output.file.replace('.mp4','.json')),{segments,chapters:outputs,output,captions:captionsFile,note:'Source-speed footage then last-frame hold when narration is longer. Shorter narration trims demonstration. Review completeness. Captions are segment-level, not word-aligned.'});return {...output,captions:captionsFile};}
// Keeps the whole recording at source speed and lays each spoken part at its chapter start.
// A part never starts before the previous one ends; the last frame is held if speech outruns the video.
async function composeVoiceover(media,root,{video,parts},options={}){
 assert(Array.isArray(parts)&&parts.length>0&&parts.length<=12,'Use 1–12 narration parts');const source=within(root,video,true),duration=await media.measureDuration(source);
 const placed=[];let cursor=0;
 for(const part of parts){assert(typeof part.text==='string'&&part.text.length<=5000&&Number.isFinite(part.at)&&part.at>=0,'Invalid narration part');const audio=within(root,part.audio,true),length=Number((await media.probe(audio)).format.duration);assert(length>0&&length<=600,'Narration part must be between 0 and 600 seconds');const at=Math.max(part.at,cursor);placed.push({audio,at,length,text:part.text});cursor=at+length+.3;}
 const total=Math.max(duration,placed.at(-1).at+placed.at(-1).length+.5),hold=Math.max(0,total-duration);
 const delays=placed.map((p,i)=>{const ms=Math.round(p.at*1000);return `[${i+1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`;});
 const graph=[...delays,`${placed.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${placed.length}:normalize=0:dropout_transition=0,apad[a]`,`[0:v]fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}[v]`].join(';');
 const output=await media.output(root,'narrated-walkthrough',['-i',source,...placed.flatMap(p=>['-i',p.audio]),'-filter_complex',graph,'-map','[v]','-map','[a]','-t',total.toFixed(3),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','2'],options);
 const captionsFile=output.file.replace('.mp4','.srt');atomic(within(root,captionsFile),placed.map((p,i)=>`${i+1}\n${srtTime(p.at)} --> ${srtTime(p.at+p.length)}\n${p.text.replace(/\r?\n/g,' ')}\n`).join('\n'));
 return {...output,captions:captionsFile,parts:placed.map(({at,length,text})=>({at,length,text}))};}
// Plays the recording at source speed and freezes on each stop while its narration plays, so the voice never chases the scroll.
// Pieces are encoded one at a time and joined without re-encoding; a single filter graph would buffer every branch in memory.
// The concat demuxer takes its stream layout from the first piece, so a piece without video or audio corrupts the whole film.
async function composeWalkthrough(media,root,{video,stops},options={}){
 assert(Array.isArray(stops)&&stops.length>0&&stops.length<=60,'Use 1–60 narration stops');const source=within(root,video,true),duration=await media.measureDuration(source);
 const dir='chapters/'+id().slice(0,8);fs.mkdirSync(within(root,dir),{recursive:true});
 const lead=.35,tail=.65,frame=1/30,pieces=[],placed=[],holds=[];let from=0,clock=0;
 // MediaRecorder writes a frame only when the screen changes, so a cut inside a still stretch can hold no frame at all.
 // Every piece is cut from one constant 30 fps copy that runs to the measured end.
 const steady=within(root,`${dir}/steady.mp4`);
 await run(media.ffmpeg,['-hide_banner','-nostdin','-y','-i',source,'-map','0:v:0','-vf','fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,tpad=stop_mode=clone:stop_duration=2','-t',duration.toFixed(3),'-an','-c:v','libx264','-preset','veryfast','-crf','16','-pix_fmt','yuv420p','-g','30',steady],options);
 const encode=async(start,play,hold,audio,delay)=>{const file=within(root,`${dir}/piece-${String(pieces.length).padStart(3,'0')}.mp4`),total=play+hold;
  const audioIn=audio?['-i',audio]:['-f','lavfi','-i','anullsrc=r=48000:cl=stereo'];const ms=Math.round(delay*1000);
  const graph=[`[0:v]setpts=PTS-STARTPTS,fps=30${hold>0?`,tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}`:''}[v]`,`[1:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo${audio?`,adelay=${ms}|${ms}`:''},apad[a]`].join(';');
  await run(media.ffmpeg,['-hide_banner','-nostdin','-y','-ss',start.toFixed(3),'-t',(play+frame/2).toFixed(3),'-i',steady,...audioIn,'-filter_complex',graph,'-map','[v]','-map','[a]','-t',total.toFixed(3),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','160k','-ar','48000','-ac','2',file],options);
  const streams=(await media.probe(file)).streams||[],length=kind=>Number(streams.find(s=>s.codec_type===kind)?.duration);
  assert(Math.abs(length('video')-total)<.2&&Math.abs(length('audio')-total)<.2,`Walkthrough piece ${pieces.length} came out without a full picture and sound track`);
  pieces.push(file);return total;};
 for(const stop of [...stops].sort((a,b)=>a.at-b.at)){assert(typeof stop.text==='string'&&stop.text.length<=5000&&Number.isFinite(stop.at)&&stop.at>=0,'Invalid narration stop');if(!stop.audio)continue;
  const audio=within(root,stop.audio,true),length=Number((await media.probe(audio)).format.duration);assert(length>0&&length<=600,'Narration stop must be between 0 and 600 seconds');
  // At least one frame plays before each hold, so there is always a picture to freeze.
  const at=Math.min(Math.max(stop.at,from),Math.max(0,duration-frame)),play=Math.max(at-from+frame,frame),hold=lead+length+tail;
  placed.push({at:clock+play+lead,length,text:stop.text,source:Number(at.toFixed(3)),label:stop.label||null,ref:stop.ref??null});holds.push({source:from+play,length:hold});clock+=await encode(from,play,hold,audio,play+lead);from=Math.min(duration,from+play);}
 assert(placed.length,'No narration stops have audio');if(duration-from>frame)clock+=await encode(from,duration-from,0,null,0);
 const list=within(root,dir+'/concat.txt');atomic(list,pieces.map(p=>"file '"+p.split(path.sep).join('/').replace(/'/g,"'\\''")+"'").join('\n'));
 const output=await media.output(root,'narrated-walkthrough',['-f','concat','-safe','0','-i',list,'-c','copy'],options);
 for(const p of [...pieces,steady])try{fs.unlinkSync(p)}catch{}
 const joined=(await media.probe(within(root,output.file,true))).streams||[],track=kind=>Number(joined.find(s=>s.codec_type===kind)?.duration);
 assert(Math.abs(track('video')-clock)<.5&&Math.abs(track('audio')-clock)<.5,`Narrated film is ${track('video').toFixed(1)} s of picture and ${track('audio').toFixed(1)} s of sound, expected ${clock.toFixed(1)} s`);
 const captionsFile=output.file.replace('.mp4','.srt');atomic(within(root,captionsFile),placed.map((p,i)=>`${i+1}\n${srtTime(p.at)} --> ${srtTime(p.at+p.length)}\n${p.text.replace(/\r?\n/g,' ')}\n`).join('\n'));
 // Where a recording moment lands in the film: every hold that ends before it pushes it later.
 const filmAt=t=>Number((t+holds.filter(h=>h.source<=t+1e-6).reduce((sum,h)=>sum+h.length,0)).toFixed(3));
 return {...output,captions:captionsFile,filmAt,parts:placed.map(({at,length,text,source,label,ref})=>({at,length,text,source,label,ref}))};}
module.exports={transcriptPlan,composeNarrated,composeVoiceover,composeWalkthrough,srtTime};
