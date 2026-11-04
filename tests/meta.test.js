import { contextFixture, storyFixture, pictureFixture } from './narrative-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Meta adapter sends video evidence + structured contract and cleans uploads on success and failure', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ourtake-meta-'));
  process.env.OURTAKE_DATA_DIR = temp;
  process.env.MODEL_API_KEY = 'test-only-not-a-real-key';
  const { initStore, create, dir } = await import('../server/store.js');
  const { analyze, makePlan } = await import('../server/meta.js');
  await initStore(); const p = await create();
  p.sources = [{ id: 'source-a', name: 'untrusted.mp4', proxy: 'proxy.mp4', duration: 8 }];
  await fs.writeFile(path.join(dir(p.id), 'proxy.mp4'), 'mock media payload');
  const originalFetch = globalThis.fetch;
  const calls = [];
  let fail = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer test-only-not-a-real-key');
    if (options.method === 'DELETE') return Response.json({ deleted: true });
    if (url.endsWith('/files')) {
      assert.equal(options.body.get('purpose'), 'user_data');
      assert.equal(options.body.get('expires_after[seconds]'), '3600');
      assert.ok(options.body.get('file') instanceof Blob);
      return Response.json({ id: 'file-12345' });
    }
    assert.ok(url.endsWith('/responses'));
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.reasoning.effort, 'low');
    assert.equal(body.text.format.type, 'json_object');
    assert.ok(body.input[0].content[0].text.includes('Schema:'));
    const contract=body.input[0].content[0].text.split('Contract: ')[1].split('\n')[0];
    if(contract!=='story_outline')assert.ok(body.input[1].content.some(c=>c.type==='input_file'));
    if(fail)return Response.json({error:'sensitive upstream text'},{status:429});
    const requestText=body.input[1].content.filter(c=>c.type==='input_text').at(-1).text;
    const request=contract==='source_analysis'?{}:JSON.parse(requestText);
    const output=contract==='source_analysis'?{summary:'Observed event',scenes:[{start:0,end:8,title:'Observed',description:'Visible movement',people:[],tags:[],confidence:'medium'}]}:contract==='collection_context'?contextFixture():contract==='story_outline'?storyFixture('source-a',request.transcriptTurns):pictureFixture();
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] });
  };
  try {
    p.analysis = await analyze(p, 'meta', () => {});
    assert.equal(p.analysis.sources[0].scenes[0].id, 'source-a:0');
    const plan = await makePlan(p, { mode: 'meta', prompt: 'story', previous: null, locked: [], target: 10 }, () => {});
    assert.equal(plan.shots[0].sourceId, 'source-a');
    assert.equal(plan.story.beats.length,1); // Silent footage still gets a story.
    const contextCalls=()=>calls.filter(c=>c.url.endsWith('/responses')&&c.options.body.includes('Contract: collection_context')).length;
    const count=contextCalls();
    await makePlan(p,{mode:'meta',prompt:'Another perspective',previous:plan,locked:[],target:10,editKind:'perspective'},()=>{});
    assert.equal(contextCalls(),count);
    p.sources[0].transcript={turns:[{id:'turn-a',sourceId:'source-a',start:1,end:4,text:'My role.'}]};
    const spoken=await makePlan(p,{mode:'meta',prompt:'Tell their story',previous:null,locked:[],target:10},()=>{});
    assert.equal(spoken.speech[0].text,'My role.');
    assert.equal(spoken.speech[0].start,1);
    fail = true;
    await assert.rejects(analyze(p, 'meta', () => {}), error => /rate limit/.test(error.message) && !error.message.includes('sensitive'));
    assert.equal(calls.filter(c => c.options.method === 'DELETE').length, 7);
  } finally { globalThis.fetch = originalFetch; delete process.env.MODEL_API_KEY; await fs.rm(temp, { recursive: true, force: true }); }
});
