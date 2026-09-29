'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createClient } = require('@supabase/supabase-js');
const { Service } = require('../src/service.cjs');
const { within, hash, assert } = require('../src/core.cjs');
const { validatePlan } = require('../src/media.cjs');
const { Providers } = require('../src/providers.cjs');
const { composeNarrated, composeWalkthrough } = require('../src/editor.cjs');
const { detectViewports } = require('../src/viewports.cjs');
const { readBuild, matchViewports, writeBrief, publicUrl, viewportFor } = require('../src/buildread.cjs');
const { KEY_ID, loadKeyPair, exportPublicKey, decrypt } = require('./worker-secrets.cjs');

// The analysis returns a full brief; narration is the part meant to be spoken.
function narrationFrom(markdown) {
  const heading = /^#{1,4}\s*(?:draft\s+)?narration[^\n]*$/im.exec(markdown);
  let text = markdown;
  if (heading) {
    const rest = markdown.slice(heading.index + heading[0].length);
    const next = /^#{1,4}\s/m.exec(rest);
    text = next ? rest.slice(0, next.index) : rest;
  }
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*[-*>]\s+/gm, '')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

// Sources match the Supabase global file size limit; outputs use the standard upload endpoint, which stops at 5 GB.
const LIMIT = 50 * 1024 ** 3;
const OUTPUT_LIMIT = 5 * 1024 ** 3;
const unwrap = (r) => { if (r.error) throw Error(r.error.message); return r.data; };

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(name) || process.env[name]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[name] = value;
  }
}

async function start() {
  loadEnvFile(path.join(__dirname, '..', '.env'));
  const url = process.env.VISTRALO_SUPABASE_URL;
  const key = process.env.VISTRALO_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.VISTRALO_ADMIN_EMAIL;
  const password = process.env.VISTRALO_ADMIN_PASSWORD;
  const root = process.env.VISTRALO_CLOUD_DATA_ROOT;
  assert(url && key && email && password && root, 'Worker environment is incomplete');
  assert(path.isAbsolute(root), 'Cloud data root must be absolute');
  fs.mkdirSync(root, { recursive: true });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } });
  const signed = await db.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const service = new Service(root);
  const bucket = db.storage.from('vistralo-media');
  const keys = loadKeyPair(root);
  unwrap(await db.from('vistralo_worker_keys').upsert({
    id: KEY_ID,
    public_key: exportPublicKey(keys.publicKey),
    algorithm: 'RSA-OAEP-256',
    updated_at: new Date().toISOString(),
  }));
  // Providers reads keys through read(); here they come from the owner's encrypted settings.
  const settingsFor = async (owner) => {
    const rows = unwrap(await db.rpc('vistralo_worker_secrets', { target: owner }));
    const row = rows?.[0];
    const fromEnv = (name) => (typeof process.env[name] === 'string' ? process.env[name].trim() : '');
    const openai = fromEnv('OPENAI_API_KEY') || (row && decrypt(keys.privateKey, row.openai_cipher));
    const heygen = fromEnv('HEYGEN_API_KEY') || (row && decrypt(keys.privateKey, row.heygen_cipher));
    assert(openai || heygen, 'Add your provider keys in Settings before running AI narration');
    return {
      openai,
      heygen,
      voiceId: fromEnv('HEYGEN_VOICE_ID') || (row && row.voice_id),
      cap: Number((row && row.cost_cap_usd) || fromEnv('VISTRALO_COST_CAP_USD') || 1),
    };
  };
  const providersFor = (settings) => new Providers(service.store, {
    read: () => ({ openai: settings.openai, heygen: settings.heygen, voice: settings.voiceId }),
  }, fetch);

  // Evenly spaced frames describe the whole capture; the first N only show its opening moment.
  const spread = (items, count) => {
    if (items.length <= count) return items.slice();
    const step = (items.length - 1) / (count - 1);
    return Array.from({ length: count }, (_, i) => items[Math.round(i * step)]);
  };

  async function draftScript(job, p, nativeId, manifest) {
    const settings = await settingsFor(job.owner_id);
    assert(settings.openai, 'Add an OpenAI API key in Settings to draft narration');
    // screenScript, not analyze: analyze writes an engineering brief ("This
    // document outlines...") which reads as nonsense when spoken aloud.
    const frames = spread(
      (manifest.sessions || []).flatMap((s) => (s.frames || []).map((f) => f.file)),
      12,
    );
    assert(frames.length >= 2, 'Capture produced too few frames to analyse');
    const model = typeof job.payload.model === 'string' && job.payload.model ? job.payload.model : 'gpt-4o-mini';
    const estimate = Math.min(settings.cap, Number((0.02 + frames.length * 0.01).toFixed(2)));
    const result = await providersFor(settings).screenScript(nativeId, {
      signal,
      uploadApproved: true,
      model,
      frames,
      cap: settings.cap,
      estimate,
      approved: true,
      quote: `OpenAI ${model} vision pricing, ${frames.length} evidence frames, estimated at 1 cent per frame plus 2 cents of text.`,
    });
    const text = fs.readFileSync(within(service.store.dir(nativeId), result.file, true), 'utf8');
    return { text: narrationFrom(text), model };
  }

  async function narrate(job, p, nativeId, nativeRoot, files) {
    const settings = await settingsFor(job.owner_id);
    assert(settings.heygen, 'Add a HeyGen API key in Settings to generate narration');
    assert(p.data.scriptApproved === true, 'Approve the narration script before generating audio');
    const script = String(p.data.script || '').trim();
    assert(script.length > 0 && script.length <= 5000, 'Narration script must be 1–5000 characters');
    const source = p.data.walkthroughVideo;
    assert(typeof source === 'string' && files[source], 'Capture the website before narrating it');

    const local = path.join(nativeRoot, 'narration-source' + path.extname(source));
    await download(source, local);
    const imported = await service.importFile(nativeId, local);
    const probe = await service.media.probe(within(nativeRoot, imported.file, true));
    const duration = Number(probe.format.duration);
    assert(duration > 0, 'Captured video has no measurable duration');

    const estimate = Math.min(settings.cap, Math.max(0.02, Number((script.length / 1000 * 0.03).toFixed(2))));
    const speech = await providersFor(settings).speech(nativeId, {
      signal,
      text: script,
      scriptApproved: true,
      cap: settings.cap,
      estimate,
      approved: true,
      quote: `HeyGen text-to-speech, ${script.length} characters, estimated at 3 cents per 1000 characters.`,
    });
    const composed = await composeNarrated(service.media, nativeRoot, [
      { video: imported.file, audio: speech.file, start: 0, end: duration, text: script },
    ], { signal });
    const video = await upload(job, composed.file, nativeRoot, files);
    const captions = await upload(job, composed.captions, nativeRoot, files);
    return {
      video,
      duration: composed.duration,
      eventLabel: 'Narrated',
      data: {
        ...p.data, files,
        narratedVideo: video,
        captions,
        voiceId: settings.voiceId || null,
        output: { ...composed, file: video },
      },
    };
  }

  // One Create Walkthrough click: find every screen in the recording, write a creative director's narration for each,
  // then freeze the video on each screen while its part is spoken.
  async function voiceFromRecording(job, p, nativeId, nativeRoot, files) {
    // Narrating again starts from the recording, not from the previous voice-over.
    const source = p.video && p.video === p.data.narratedVideo ? p.data.walkthroughVideo : p.video;
    assert(typeof source === 'string' && files[source], 'Recording is missing');
    await reportProgress(job, { percent: 5, stage: 'Watching recording', detail: 'Reading the captured video' });
    const local = path.join(nativeRoot, 'walkthrough-source' + path.extname(source));
    await download(source, local);
    const imported = await service.importFile(nativeId, local);
    // The checksum belongs to the uploaded file; previews and trims are derived outputs.
    if (p.data.sourceSha256 && source === p.data.video) assert(await hash(within(nativeRoot, imported.file, true)) === p.data.sourceSha256, 'Source checksum mismatch');
    const sourcePath = within(nativeRoot, imported.file, true);
    const duration = await service.media.measureDuration(sourcePath);
    const settings = await settingsFor(job.owner_id);
    assert(settings.openai, 'Add an OpenAI API key in Settings to draft narration');
    assert(settings.heygen, 'Add a HeyGen API key in Settings to generate narration');
    const picture = (await service.media.probe(sourcePath)).streams.find((s) => s.codec_type === 'video') || {};
    // With a website address, the live site is read in the background while the recording is scanned.
    // A failed read only means every build claim stays "likely"; it never fails the walkthrough.
    const siteUrl = publicUrl(p.url);
    // Recorded viewports are at most a screen apart, so the recording cannot reach deeper than one screen per viewport.
    let reach = null;
    const reading = siteUrl
      ? readBuild({ url: siteUrl, root: nativeRoot, ...viewportFor(picture), coverage: () => reach })
        .catch((error) => ({ url: siteUrl, status: 'failed', reason: String(error.message || error).slice(0, 200), steps: [] }))
      : Promise.resolve(null);
    await reportProgress(job, { percent: 8, stage: 'Finding every screen', detail: siteUrl ? 'Following each scroll and reading how the site is built' : 'Following each scroll and page change' });
    const views = (await detectViewports(service.media, sourcePath, { signal })).viewports;
    checkCancelled();
    reach = views.length + 1;
    await reportProgress(job, { percent: 14, stage: 'Finding every screen', detail: `${views.length} screen${views.length > 1 ? 's' : ''} to explain` });
    const holds = await service.media.framesAt(nativeRoot, imported.file, views.map((v) => v.at), { dir: 'evidence/viewports' });
    // A small frame from the way in lets the director see motion that a still cannot show.
    const between = views.map((v, i) => (i > 0 && v.at - views[i - 1].at > 1.5 ? (v.at + views[i - 1].at) / 2 : null));
    const motionTimes = between.filter((t) => t !== null);
    const motion = motionTimes.length ? await service.media.framesAt(nativeRoot, imported.file, motionTimes, { dir: 'evidence/motion', width: 640 }) : [];
    let nextMotion = 0;
    const viewports = views.map((v, i) => ({ ...v, frame: holds[i], motionFrame: between[i] === null ? null : motion[nextMotion++] }));
    let evidence = await reading;
    if (evidence) {
      try { evidence = await matchViewports(evidence, { root: nativeRoot, frames: holds, ffmpeg: service.media.ffmpeg }); }
      catch (error) { console.warn('Build evidence could not be matched to viewports', String(error.message || error).slice(0, 200)); }
      fs.writeFileSync(within(nativeRoot, 'build-evidence.json'), JSON.stringify(evidence, null, 2));
      console.log(`Build read ${evidence.status}${evidence.reason ? ` (${evidence.reason})` : ''}: ${(evidence.viewports || []).filter((v) => v.facts.length).length} of ${views.length} viewports matched`);
    }
    await reportProgress(job, { percent: 22, stage: 'Writing narration', detail: `Studying ${views.length} screens like a creative director` });
    // Fall back only when the provider refuses the request outright (unknown model, no access, or over the
    // account's rate limit: one request carries every screen); a 5xx has unknown billing and is never retried.
    const models = [...new Set([process.env.VISTRALO_DIRECTOR_MODEL, 'gpt-5-mini', 'gpt-4.1', 'gpt-4o-mini'].filter(Boolean))];
    // The film aims at about three times the recording and not much past six minutes; the build kit keeps the full detail.
    // Speech runs at about 2.4 words a second, and each pause adds a second of silence around its words.
    const budget = Math.round(Math.max(60, Math.min(3 * duration, 360) - duration - views.length * 0.5) * 2.4);
    let drafted;
    for (const [i, model] of models.entries()) {
      try {
        drafted = await providersFor(settings).directorScript(nativeId, {
          signal,
          uploadApproved: true,
          model,
          viewports,
          evidence,
          budget,
          width: picture.width || 1920,
          height: picture.height || 1080,
          cap: settings.cap,
          estimate: Math.min(settings.cap, Number((0.1 + views.length * 0.008).toFixed(2))),
          approved: true,
          quote: `OpenAI ${model} vision, ${views.length} high-detail screens and ${motion.length} small motion frames, estimated at under 1 cent per screen plus 10 cents of text.`,
        });
        break;
      } catch (error) {
        if (i === models.length - 1 || ![400, 403, 404, 429].includes(error.status)) throw error;
        console.warn(`Director model ${model} was rejected (HTTP ${error.status}); trying ${models[i + 1]}`);
      }
    }
    const stops = drafted.stops.map((stop, i) => ({ ...stop, ref: i }));
    const closing = [drafted.closing, drafted.closingStack].filter(Boolean).join(' ');
    if (closing) stops.push({ at: views.at(-1).at, label: 'Design system', text: closing });
    const spoken = stops.filter((stop) => stop.text);
    for (const [i, stop] of spoken.entries()) {
      await reportProgress(job, { percent: 30 + Math.round((i / spoken.length) * 45), stage: 'Generating voice', detail: `Screen ${i + 1} of ${spoken.length}` });
      const speech = await providersFor(settings).speech(nativeId, {
        signal,
        text: stop.text,
        scriptApproved: true,
        cap: settings.cap,
        estimate: Math.min(settings.cap, Math.max(0.02, Number((stop.text.length / 1000 * 0.03).toFixed(2)))),
        approved: true,
        quote: `HeyGen text-to-speech, ${stop.text.length} characters, estimated at 3 cents per 1000 characters.`,
      });
      stop.audio = speech.file;
    }
    await reportProgress(job, { percent: 78, stage: 'Attaching voice', detail: `Pausing on ${spoken.length} screens while each is explained` });
    const composed = await composeWalkthrough(service.media, nativeRoot, { video: imported.file, stops: spoken }, { signal });
    await reportProgress(job, { percent: 95, stage: 'Saving walkthrough', detail: 'Uploading the narrated video' });
    const video = await upload(job, composed.file, nativeRoot, files);
    const captions = await upload(job, composed.captions, nativeRoot, files);
    const stream = composed.streams.find((s) => s.codec_type === 'video') || {};
    // The brief is a by-product: losing it must not lose the finished film.
    let buildBrief = null;
    try {
      const brief = writeBrief(nativeRoot, {
        url: siteUrl,
        evidence,
        stack: drafted.stack || { framework: '', libraries: [], fonts: [] },
        closingStack: drafted.closingStack,
        stops: drafted.stops.map((stop, i) => ({
          viewport: i + 1,
          label: stop.label,
          sourceAt: stop.at,
          // Silent stops play through, so their screen is where the recording moment lands in the film.
          filmAt: composed.parts.find((part) => part.ref === i)?.at ?? composed.filmAt(stop.at),
          build: stop.build || {},
        })),
      });
      buildBrief = {
        markdown: await upload(job, brief.markdown, nativeRoot, files),
        json: await upload(job, brief.json, nativeRoot, files),
        evidence: evidence ? await upload(job, 'build-evidence.json', nativeRoot, files) : null,
        status: evidence ? evidence.status : 'none',
      };
    } catch (error) { console.error('Build brief failed', String(error.message || error).slice(0, 300)); }
    return {
      video,
      duration: composed.duration,
      eventLabel: 'Narrated',
      data: {
        ...p.data, files,
        script: composed.parts.map((part) => part.text).join('\n\n'),
        scriptParts: composed.parts,
        scriptApproved: true,
        scriptModel: drafted.model,
        designSystem: drafted.system,
        buildBrief,
        scriptError: null,
        walkthroughVideo: source,
        sourceMaster: p.data.sourceMaster || source,
        narratedVideo: video,
        captions,
        voiceId: settings.voiceId || null,
        output: { ...composed, file: video },
        mediaInfo: { duration: composed.duration, width: stream.width, height: stream.height },
      },
    };
  }

  // Mirror the capture's own progress into the job row, with the newest
  // screenshot, so the dashboard shows the real page instead of a spinner.
  // A bar that goes backwards reads as a fault even when the job is healthy.
  let percentFloor = 0;
  const monotonic = (value) => (percentFloor = Math.max(percentFloor, Math.round(value)));

  function publishProgress(job, nativeId) {
    const nativeRoot = service.store.dir(nativeId);
    const previewPath = `${job.owner_id}/${job.project_id}/live/preview.jpg`;
    let sent = '', busy = false;
    const push = async () => {
      if (busy) return;
      const p = service.progress[nativeId];
      if (!p) return;
      busy = true;
      try {
        const sessions = Number(p.sessions) || 1;
        const session = Number(p.session) || 0;
        const steps = Number(p.steps) || 0;
        const within01 = steps > 0 ? Math.min(1, (Number(p.step) || 0) / steps) : 0;
        // Capture occupies the first 85%; uploading the evidence finishes the bar.
        const percent = monotonic(Math.min(85, ((session + within01) / sessions) * 85));
        const progress = { percent, stage: p.stage || 'Capturing', detail: p.detail || '', session: session + 1, sessions };
        if (p.preview && p.preview !== sent) {
          const file = within(nativeRoot, p.preview, true);
          if (fs.existsSync(file)) {
            // The path is reused for every frame, so it must never be cached.
            await bucket.upload(previewPath, fs.readFileSync(file), { upsert: true, contentType: 'image/jpeg', cacheControl: '0' });
            sent = p.preview;
            progress.preview = previewPath;
            progress.previewAt = Date.now();
          }
        } else if (sent) {
          progress.preview = previewPath;
          progress.previewAt = Date.now();
        }
        await db.from('vistralo_jobs').update({ progress }).eq('id', job.id).eq('state', 'processing');
      } catch { /* progress is best-effort; never fail the capture for it */ }
      finally { busy = false; }
    };
    const timer = setInterval(push, 1500);
    return () => clearInterval(timer);
  }

  // Set per job; the owner cancels by moving the job row to 'cancelled'.
  let signal = new AbortController().signal;
  const CANCELLED = 'Cancelled by the owner';
  const checkCancelled = () => { if (signal.aborted) throw Error(CANCELLED); };
  const reportProgress = async (job, progress) => {
    checkCancelled();
    const value = { ...progress, percent: monotonic(progress.percent) };
    try { await db.from('vistralo_jobs').update({ progress: value }).eq('id', job.id).eq('state', 'processing'); } catch { /* best effort */ }
  };
  function watchCancel(job) {
    const controller = new AbortController();
    signal = controller.signal;
    const timer = setInterval(async () => {
      try {
        const rows = unwrap(await db.from('vistralo_jobs').select('state').eq('id', job.id));
        if (rows[0]?.state === 'cancelled') { console.log('Cancel requested', job.id); controller.abort(); clearInterval(timer); }
      } catch { /* try again on the next tick */ }
    }, 3000);
    return () => clearInterval(timer);
  }

  let stopped = false;
  process.on('SIGTERM', () => { stopped = true; });
  process.on('SIGINT', () => { stopped = true; });
  async function heartbeat() {
    unwrap(await db.from('vistralo_runtime').upsert({
      id: 'capture-worker',
      heartbeat_at: new Date().toISOString(),
      capabilities: { render: true, website: true, probe: true },
    }));
  }
  const upload = async (job, rel, nativeRoot, files) => {
    const input = within(nativeRoot, rel, true);
    const stat = fs.statSync(input);
    assert(stat.size <= OUTPUT_LIMIT, 'Output exceeds 5 GB');
    const target = `${job.owner_id}/${job.project_id}/${job.id}/${rel}`;
    unwrap(await bucket.upload(target, fs.readFileSync(input), {
      upsert: false,
      contentType: /\.mp4$/i.test(rel) ? 'video/mp4' : /\.webm$/i.test(rel) ? 'video/webm' : /\.mp3$/i.test(rel) ? 'audio/mpeg' : /\.(srt|md)$/i.test(rel) ? 'text/plain' : /\.json$/i.test(rel) ? 'application/json' : /\.png$/i.test(rel) ? 'image/png' : /\.jpe?g$/i.test(rel) ? 'image/jpeg' : 'application/octet-stream',
    }));
    files[target] = { size: stat.size };
    return target;
  };
  // bucket.download() buffers the whole object in memory; stream it to disk instead.
  const download = async (source, local) => {
    const { signedUrl } = unwrap(await bucket.createSignedUrl(source, 3600));
    const response = await fetch(signedUrl, { signal });
    assert(response.ok && response.body, `Could not download the source (HTTP ${response.status})`);
    const size = Number(response.headers.get('content-length'));
    assert(!(size > LIMIT), 'Source exceeds 50 GB');
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(local), { signal });
    assert(!size || fs.statSync(local).size === size, 'Source download was incomplete');
  };
  // A job only reaches 'processing' once this worker claims it, so anything
  // still in that state after a restart was abandoned mid-flight and would
  // otherwise spin in the dashboard forever. Requeue it instead.
  async function reclaimAbandoned(olderThanMs) {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const rows = unwrap(await db.from('vistralo_jobs').select('id').eq('state', 'processing').lt('started_at', cutoff));
    for (const row of rows || []) {
      unwrap(await db.from('vistralo_jobs').update({ state: 'queued', started_at: null, progress: {} }).eq('id', row.id));
      console.log('Requeued abandoned job', row.id);
    }
  }
  // At startup nothing of ours is running, so any age qualifies.
  await reclaimAbandoned(0);
  let sweptAt = Date.now();

  console.log('Capture worker signed in');
  // The app treats a heartbeat older than 60 s as offline, and a job can run far longer than that.
  const beat = setInterval(() => { heartbeat().catch(() => {}); }, 15000);
  try {
    while (!stopped) {
      await heartbeat();
      // While running, only jobs far past any plausible runtime are abandoned.
      if (Date.now() - sweptAt > 300000) { sweptAt = Date.now(); await reclaimAbandoned(1800000); }
      const jobs = unwrap(await db.rpc('vistralo_claim_next_job'));
      const job = jobs?.[0];
      if (!job) { await new Promise((r) => setTimeout(r, 1000)); continue; }
      console.log('Claimed', job.kind, job.id);
      percentFloor = 0;
      const stopWatch = watchCancel(job);
      let native;
      try {
        const row = unwrap(await db.from('vistralo_projects').select('*').eq('id', job.project_id).eq('owner_id', job.owner_id).single());
        assert(!row.document.trashed, 'Project is in Trash');
        const p = row.document;
        native = service.store.create(p.name, job.kind === 'website' ? 'walkthrough' : 'record');
        const nativeRoot = service.store.dir(native.id);
        const files = { ...p.data.files };
        let changes = {};
        if (job.kind === 'website') {
          await reportProgress(job, { percent: 1, stage: 'Starting browser', detail: job.payload.url || '' });
          const stopProgress = publishProgress(job, native.id);
          let manifest;
          try {
            manifest = await service.walkthrough(native.id, {
            url: job.payload.url,
            pages: [],
            actions: [],
            viewports: Array.isArray(job.payload.viewports) ? job.payload.viewports.slice(0, 2) : [{ width: 1440, height: 900 }],
            localApproved: false,
            chromiumSandbox: false,
              channel: 'chrome',
              headless: true,
            });
          } finally { stopProgress(); }
          assert(manifest.sessions?.some((s) => !s.error), 'Website capture could not read the page');
          const briefRel = path.posix.join(path.posix.dirname(manifest.path), 'implementation-brief.md');
          const brief = fs.readFileSync(within(nativeRoot, briefRel, true), 'utf8');
          const chosen = (manifest.sessions || []).flatMap((s) => spread(s.frames || [], 12));
          let references = 0;
          const evidence = [];
          for (const frame of chosen) {
            if (!frame.file) continue;
            evidence.push(await upload(job, frame.file, nativeRoot, files));
            references += 1;
            await reportProgress(job, {
              percent: 85 + Math.round((references / (chosen.length + 1)) * 10),
              stage: 'Saving evidence',
              detail: `${references} of ${chosen.length} frames`,
            });
          }
          // The walkthrough recording used to be discarded; keep it so the brief's
          // video link resolves and narration has footage to speak over.
          await reportProgress(job, { percent: 95, stage: 'Saving recording', detail: 'Uploading the walkthrough video' });
          let walkthrough = null;
          for (const session of manifest.sessions || []) {
            if (session.video && !walkthrough) walkthrough = await upload(job, session.video, nativeRoot, files);
          }
          // A narration problem must not discard a capture that already succeeded.
          let script = null, scriptError = null;
          if (job.payload.narrate) {
            await reportProgress(job, { percent: 97, stage: 'Drafting narration', detail: 'Analysing evidence frames' });
            try { script = await draftScript(job, p, native.id, manifest); }
            catch (failure) { scriptError = String(failure.message || failure).slice(0, 300); console.error('Script draft failed', scriptError); }
          }
          changes = {
            references,
            sections: (brief.match(/^## /gm) || []).length,
            eventLabel: script ? 'Script ready' : 'Analyzed',
            video: walkthrough || p.video,
            data: {
              ...p.data, files, brief,
              walkthroughVideo: walkthrough,
              analysisEvidence: evidence,
              ...(script ? { script: script.text, scriptModel: script.model, scriptApproved: false } : {}),
              // Always overwrite: spreading p.data would otherwise keep a stale
              // failure on the project long after a later draft succeeded.
              ...(job.payload.narrate ? { scriptError: scriptError || null } : {}),
              evidence: { url: job.payload.url, coverage: manifest.coverage, limitations: manifest.limitations },
            },
          };
        } else if (job.kind === 'narrate') {
          changes = job.payload && job.payload.auto
            ? await voiceFromRecording(job, p, native.id, nativeRoot, files)
            : await narrate(job, p, native.id, nativeRoot, files);
        } else {
          const preview = job.kind === 'render' && job.payload?.mode === 'preview';
          const source = job.kind === 'render' && !preview ? job.payload.plan?.source : p.video;
          assert(typeof source === 'string' && source.startsWith(`${job.owner_id}/${job.project_id}/`) && files[source], 'Invalid project source');
          const local = path.join(nativeRoot, 'cloud-source' + path.extname(source));
          await download(source, local);
          if (p.data.sourceSha256 && source === p.data.video) assert(await hash(local) === p.data.sourceSha256, 'Source checksum mismatch');
          const imported = await service.importFile(native.id, local);
          const probe = await service.media.probe(within(nativeRoot, imported.file, true));
          const stream = probe.streams.find((s) => s.codec_type === 'video');
          assert(stream, 'Source contains no video');
          const sourcePath = within(nativeRoot, imported.file, true);
          // Browser MediaRecorder WebM has no duration in its header, so measure by decoding when needed.
          const info = { duration: await service.media.measureDuration(sourcePath), width: stream.width, height: stream.height };
          if (preview) {
            const output = await service.media.output(nativeRoot, 'preview', ['-i', sourcePath, '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'], { signal });
            const file = await upload(job, output.file, nativeRoot, files);
            changes = { video: file, duration: output.duration, eventLabel: 'Ready', data: { ...p.data, files, sourceMaster: p.data.sourceMaster || p.video, output: { ...output, file }, mediaInfo: { ...info, duration: output.duration } } };
          } else if (job.kind === 'render') {
            const plan = { ...job.payload.plan, source: imported.file };
            validatePlan(plan);
            service.savePlan(native.id, plan);
            const output = await service.process(native.id, 'render');
            const file = await upload(job, output.file, nativeRoot, files);
            changes = { video: file, duration: output.duration, eventLabel: 'Ready', data: { ...p.data, files, sourceMaster: p.data.sourceMaster || p.video, sourceSha256: output.sha256, output: { ...output, file }, mediaInfo: { ...info, duration: output.duration } } };
          } else changes = { duration: info.duration, eventLabel: 'Uploaded', data: { ...p.data, files, mediaInfo: info } };
        }
        checkCancelled();
        const latest = unwrap(await db.from('vistralo_projects').select('document,updated_at').eq('id', job.project_id).single());
        assert(!latest.document.trashed, 'Project moved to Trash during processing');
        const at = new Date().toISOString();
        const saved = unwrap(await db.from('vistralo_projects').update({ document: { ...latest.document, ...changes, status: job.kind === 'probe' ? 'draft' : 'ready', eventAt: at, error: null }, updated_at: at }).eq('id', job.project_id).eq('updated_at', latest.updated_at).select('id'));
        assert(saved.length === 1, 'Project changed during output save');
        unwrap(await db.from('vistralo_jobs').update({ state: 'ready', finished_at: at, progress: {} }).eq('id', job.id));
        console.log('Finished', job.id);
      } catch (error) {
        if (signal.aborted) {
          // The app already marked the job cancelled and the project a draft; only repair a project it missed.
          console.log('Cancelled', job.id);
          const row = unwrap(await db.from('vistralo_projects').select('document,updated_at').eq('id', job.project_id).maybeSingle());
          if (row && ['queued', 'processing'].includes(row.document.status)) unwrap(await db.from('vistralo_projects').update({ document: { ...row.document, status: 'draft', error: null }, updated_at: new Date().toISOString() }).eq('id', job.project_id).eq('updated_at', row.updated_at));
          continue;
        }
        const message = String(error.message || error).slice(0, 500);
        console.error('Job failed', message);
        unwrap(await db.from('vistralo_jobs').update({ state: 'failed', error: message, finished_at: new Date().toISOString(), progress: {} }).eq('id', job.id));
        const row = unwrap(await db.from('vistralo_projects').select('document,updated_at').eq('id', job.project_id).maybeSingle());
        if (row) unwrap(await db.from('vistralo_projects').update({ document: { ...row.document, status: 'failed', error: message }, updated_at: new Date().toISOString() }).eq('id', job.project_id).eq('updated_at', row.updated_at));
      } finally {
        stopWatch();
      }
    }
  } finally {
    clearInterval(beat);
    await service.close();
  }
}

start().catch((error) => {
  console.error('Capture worker stopped.', error.message || error);
  process.exitCode = 1;
});
