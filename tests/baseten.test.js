import { contextFixture, storyFixture, pictureFixture } from './narrative-fixtures.js';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ourtake-baseten-test-'));
process.env.OURTAKE_DATA_DIR = testRoot;
const { extractBasetenOutput } = await import('../server/baseten.js');
after(async () => fs.rm(testRoot, { recursive: true, force: true }));

test('Baseten rejects truncated, refused, empty and malformed responses', () => {
  const completion = (content, finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { content } }] });
  assert.deepEqual(extractBasetenOutput(completion('{"title":"x"}')), { title: 'x' });
  for (const result of [completion('{}', 'length'), completion('{}', 'content_filter'), completion(''), completion('not json'), { choices: [{ finish_reason: 'stop', message: { content: '{}', refusal: 'no' } }] }]) assert.throws(() => extractBasetenOutput(result));
});

// Separate process from the Meta adapter tests; this test never calls a real provider.
test('Baseten uses its own key, inline video, strict schema, and fails without provider fallback', async () => {
  const { initStore, create, dir } = await import('../server/store.js');
  const { analyze, makePlan } = await import('../server/meta.js');
  const { preflightBaseten, BASETEN_LIMITS } = await import('../server/baseten.js');
  await initStore();
  const p = await create('Baseten contract test');
  p.sources = [{ id: 'source-a', name: 'test.mp4', proxy: 'proxy.mp4', duration: 8, hasAudio: false }];
  await fs.writeFile(path.join(dir(p.id), 'proxy.mp4'), 'mock video bytes');
  const oldFetch = globalThis.fetch;
  const oldKeys = { baseten: process.env.BASETEN_API_KEY, meta: process.env.MODEL_API_KEY };
  process.env.BASETEN_API_KEY = 'fake-baseten-key';
  process.env.MODEL_API_KEY = 'fake-meta-key-not-for-baseten';
  let status = 200, calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://inference.baseten.co/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fake-baseten-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'meta-models/muse-spark-open');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.stream, false);
    const video = body.messages[1].content.find(c => c.type === 'video_url');
    assert.equal(Buffer.from(video.video_url.url.split(',')[1], 'base64').toString(), 'mock video bytes');
    assert.ok(!options.body.includes('fake-meta-key'));
    if (status !== 200) return Response.json({ error: 'secret provider request dump' }, { status });
    const kind=body.response_format.json_schema.name;
    const result=kind==='source_analysis'?{summary:'Observed',scenes:[{start:0,end:8,title:'Action',description:'Observed action',people:[],tags:[],confidence:'medium'}]}:kind==='collection_context'?contextFixture():kind==='story_outline'?storyFixture():pictureFixture();
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
  };
  try {
    p.analysis = await analyze(p, 'baseten', () => {});
    assert.equal(p.analysis.mode, 'baseten');
    assert.equal(p.analysis.model, 'meta-models/muse-spark-open');
    const plan = await makePlan(p, { mode: 'baseten', prompt: 'story', previous: null, locked: [], target: 10 }, () => {});
    assert.equal(plan.shots[0].sourceId, 'source-a');
    for (const code of [400, 401, 402, 403, 413, 429, 500]) {
      status = code; const before = calls;
      await assert.rejects(analyze(p, 'baseten', () => {}), e => e.message.includes('Baseten') && !e.message.includes('secret'));
      assert.equal(calls, before + 1);
    }
    const before = calls;
    await assert.rejects(preflightBaseten(p, [{ ...p.sources[0], duration: 301 }]), /5 minutes/);
    const handle = await fs.open(path.join(dir(p.id), 'large.mp4'), 'w'); await handle.truncate(BASETEN_LIMITS.maxRawBytes + 1); await handle.close();
    await assert.rejects(preflightBaseten(p, [{ ...p.sources[0], proxy: 'large.mp4' }]), /50 MiB/);
    delete process.env.BASETEN_API_KEY;
    await assert.rejects(analyze(p, 'baseten', () => {}), /BASETEN_API_KEY/);
    assert.equal(calls, before);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [env, value] of [['BASETEN_API_KEY', oldKeys.baseten], ['MODEL_API_KEY', oldKeys.meta]]) { if (value === undefined) delete process.env[env]; else process.env[env] = value; }
    await fs.rm(dir(p.id), { recursive: true, force: true });
  }
});
