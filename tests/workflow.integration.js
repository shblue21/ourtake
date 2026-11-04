import { contextFixture, storyFixture, pictureFixture } from './narrative-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('keyless end-to-end: sample → analyze → real MP4 → locked revision → persisted version → delete', { timeout: 180000 }, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ourtake-test-'));
  const dataRoot = path.join(temp, '.data');
  process.env.OURTAKE_DATA_DIR = dataRoot;
  delete process.env.MODEL_API_KEY;
  const { createApp } = await import('../server/index.js');
  const { app, close } = await createApp({ frontend: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
  };
  const wait = async job => {
    for (let n = 0; n < 360; n++) {
      const state = await call(`/api/jobs/${job.id}`);
      if (state.status === 'error') assert.fail(state.message);
      if (state.status === 'done') return;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.fail('Job timed out');
  };
  try {
    const config = await call('/api/config'); assert.equal(config.metaConfigured, false); assert.equal(config.ffmpegReady, true);
    const p = await call('/api/projects', {}), route = `/api/projects/${p.id}`;
    const forbidden = await fetch(base + '/api/projects', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(forbidden.status, 403);
    await wait(await call(route + '/sample', { fixture: 'synthetic' }));
    let project = await call(route); assert.equal(project.sources.length, 3); assert.ok(project.sources.every(s => !s.filename && !s.proxy));
    await wait(await call(route + '/analyze', { mode: 'demo' }));
    const meta = await fetch(base + route + '/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'meta' }) }); assert.equal(meta.status, 400);
    await wait(await call(route + '/edit', { mode: 'demo', prompt: 'Focus on the friends preparing', target: 15 }));
    project = await call(route); assert.equal(project.versions.length, 1);
    const v1 = project.versions[0];
    assert.ok(Math.abs(v1.duration - 15) < .5);
    assert.equal((await fetch(base + route + '/versions/' + v1.id + '/shots/0')).status, 200);
    assert.equal((await fetch(base + route + '/versions/' + v1.id + '/shots/999')).status, 404);
    const video = await fetch(base + v1.url, { headers: { Range: 'bytes=0-63' } });
    assert.equal(video.status, 206); const bytes = Buffer.from(await video.arrayBuffer()); assert.equal(bytes.subarray(4, 8).toString(), 'ftyp');
    const download = await fetch(base + v1.download); assert.match(download.headers.get('content-disposition'), /attachment/); await download.body.cancel();
    await wait(await call(route + '/edit', { mode: 'demo', prompt: 'Make the last shot shorter', target: 15, baseVersionId: v1.id, locked: [0] }));
    project = await call(route); assert.equal(project.versions.length, 2);
    assert.deepEqual(project.versions[1].plan.shots[0], v1.plan.shots[0]);
    assert.ok(project.versions[1].duration < v1.duration);
    const persisted = JSON.parse(await fs.readFile(path.join(dataRoot, 'projects', p.id, 'project.json'), 'utf8')); assert.equal(persisted.versions.length, 2);
    await call(route + '/restore', { versionId: v1.id });
    assert.equal((await call(route)).activeVersionId, v1.id);
    assert.equal((await call(route)).versions.length, 2);
    const conflict = await call(route + '/edit', { mode: 'demo', prompt: 'Make the last shot shorter', target: 15, baseVersionId: v1.id, locked: [5] });
    let failed;
    for (let n = 0; n < 20; n++) { failed = await call('/api/jobs/' + conflict.id); if (failed.status !== 'running') break; await new Promise(r => setTimeout(r, 100)); }
    assert.equal(failed.status, 'error');
    assert.equal((await call(route)).versions.length, 2);

    // Exercise the actual multipart path, mixed aspect ratios, real audio and hidden storage directory.
    const { command, ffmpeg, ffprobe } = await import('../server/media.js');
    const portrait = path.join(temp, 'portrait.mp4');
    await command(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=180x320:r=24:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', portrait]);
    const uploaded = await call('/api/projects', { name: 'Upload test' });
    const form = new FormData();
    form.append('videos', new Blob([await fs.readFile(portrait)], { type: 'video/mp4' }), 'portrait.mp4');
    const up = await fetch(base + `/api/projects/${uploaded.id}/upload`, { method: 'POST', body: form });
    assert.equal(up.status, 202); await wait(await up.json());
    let upProject = await call(`/api/projects/${uploaded.id}`);
    assert.equal(upProject.sources[0].hasAudio, true);
    assert.equal((await fetch(base + upProject.sources[0].thumbnail)).status, 200);
    await wait(await call(`/api/projects/${uploaded.id}/edit`, { mode: 'demo', prompt: 'Show the main moment', target: 5 }));
    upProject = await call(`/api/projects/${uploaded.id}`);
    const info = JSON.parse(await command(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', path.join(dataRoot, 'projects', uploaded.id, `${upProject.versions[0].id}.mp4`)]));
    assert.ok(info.streams.some(s => s.codec_type === 'audio'));
    assert.equal(upProject.analysis.mode, 'demo');
    assert.equal(upProject.versions[0].audioMode, 'balanced');
    assert.ok(info.streams.some(s => s.codec_type === 'video' && s.width === 1280 && s.height === 720));

    // Real media preparation + mocked Baseten transport: no credentials or footage leave this test.
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.BASETEN_API_KEY;
    process.env.BASETEN_API_KEY = 'fake-integration-baseten-key';
    let basetenCalls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith(base)) return originalFetch(url, options);
      assert.equal(url, 'https://inference.baseten.co/v1/chat/completions');
      basetenCalls++;
      const body = JSON.parse(options.body);
      const content = body.messages[1].content;
      assert.ok(content.some(c => c.video_url?.url.startsWith('data:video/mp4;base64,')));
      assert.ok(content.some(c => c.audio_url?.url.startsWith('data:audio/mpeg;base64,')));
      assert.ok(content.find(c => c.audio_url).audio_url.url.length > 1000);
      const sourceId = upProject.sources[0].id;
      const kind=body.response_format.json_schema.name;
      const result=kind==='source_analysis'?{summary:'Test footage',scenes:[{start:0,end:1.8,title:'Test scene',description:'Test observation',people:[],tags:[],confidence:'medium'}]}:kind==='collection_context'?contextFixture(sourceId):kind==='story_outline'?storyFixture(sourceId):pictureFixture(sourceId,0,1.5);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
    };
    try {
      const liveConfig = await call('/api/config');
      assert.equal(liveConfig.basetenConfigured, true);
      assert.ok(!JSON.stringify(liveConfig).includes('fake-integration'));
      await wait(await call(`/api/projects/${uploaded.id}/edit`, { mode: 'baseten', prompt: 'Show the action', target: 5 }));
      const basetenProject = await call(`/api/projects/${uploaded.id}`);
      assert.equal(basetenProject.analysis.mode, 'baseten');
      assert.equal(basetenProject.versions.at(-1).model, 'meta-models/muse-spark-open');
      assert.equal(basetenCalls, 4);
      assert.equal((await fetch(base + basetenProject.versions.at(-1).url)).status, 200);
      const oldContext=structuredClone(basetenProject.versions.at(-1).contextSnapshot);
      const oldVersion=basetenProject.versions.at(-1);
      await wait(await call(`/api/projects/${uploaded.id}/edit`,{mode:'baseten',prompt:'A different perspective',target:5,baseVersionId:oldVersion.id,editKind:'perspective'}));
      const changed=await call(`/api/projects/${uploaded.id}`);
      assert.equal(changed.versions.at(-1).parentId,oldVersion.id);
      assert.equal(changed.versions.at(-1).editKind,'perspective');
      assert.deepEqual(changed.versions.find(v=>v.id===oldVersion.id).contextSnapshot,oldContext);
      assert.equal(basetenCalls,6); // Only outline and pictures; context is reused.

      const mixed = await fetch(base + `/api/projects/${uploaded.id}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'baseten', prompt: 'Revise it', target: 5, baseVersionId: upProject.versions[0].id }) });
      assert.equal(mixed.status, 400);
      assert.equal(basetenCalls, 6);
      const another=new FormData();another.append('videos',new Blob([await fs.readFile(portrait)],{type:'video/mp4'}),'another.mp4');
      const more=await fetch(base+`/api/projects/${uploaded.id}/upload`,{method:'POST',body:another});assert.equal(more.status,202);await wait(await more.json());
      const expanded=await call(`/api/projects/${uploaded.id}`);assert.equal(expanded.context,null);assert.equal(expanded.analysis,null);
      assert.deepEqual(expanded.versions.find(v=>v.id===oldVersion.id).contextSnapshot,oldContext);
      const staleLock=await fetch(base+`/api/projects/${uploaded.id}/edit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'baseten',prompt:'Another perspective',target:5,baseVersionId:oldVersion.id,editKind:'perspective',locked:[0]})});
      assert.equal(staleLock.status,400);assert.equal(basetenCalls,6);

    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.BASETEN_API_KEY; else process.env.BASETEN_API_KEY = originalKey;
    }
    await call(route, undefined, 'DELETE');
    assert.equal((await fetch(base + route)).status, 404);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await close(); await fs.rm(temp, { recursive: true, force: true }); }
});
