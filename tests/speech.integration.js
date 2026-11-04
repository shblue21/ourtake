import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('speech survives visual cuts and replaces conflicting shot audio; ASR sends real mono WAV', { timeout: 120000 }, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ourtake-speech-test-'));
  process.env.OURTAKE_DATA_DIR = temp;
  const { initStore, create, dir } = await import('../server/store.js');
  const { command, ffmpeg, render } = await import('../server/media.js');
  const { transcribeFile } = await import('../server/speech.js');
  await initStore(); const p = await create();
  const originalFetch = globalThis.fetch, originalKey = process.env.MODEL_API_KEY;
  try {
    for (const [id, color, frequency] of [['a', 'red', 440], ['b', 'blue', 880]]) {
      await command(ffmpeg, ['-v','error','-y','-f','lavfi','-i',`color=c=${color}:s=160x90:r=24:d=4`,'-f','lavfi','-i',`sine=frequency=${frequency}:duration=4`,'-c:v','libx264','-c:a','aac','-shortest',path.join(dir(p.id),id+'.mp4')]);
      p.sources.push({ id, filename: id+'.mp4', hasAudio: true, duration: 4 });
    }
    const plan = { shots: [{ sourceId:'a',start:0,end:2 }, { sourceId:'b',start:0,end:2 }], speech: [{ sourceId:'a',start:0,end:4,timelineStart:0 }] };
    await render(p, plan, 'output', () => {}, 'original');
    const pcm = path.join(temp,'audio.f32');
    await command(ffmpeg,['-v','error','-y','-i',path.join(dir(p.id),'output.mp4'),'-vn','-ac','1','-ar','8000','-f','f32le',pcm]);
    const bytes = await fs.readFile(pcm);
    function amplitude(frequency, seconds) {
      let re=0,im=0; const count=4000,offset=Math.round(seconds*8000);
      for(let i=0;i<count;i++){const v=bytes.readFloatLE((offset+i)*4);re+=v*Math.cos(2*Math.PI*frequency*i/8000);im+=v*Math.sin(2*Math.PI*frequency*i/8000);}
      return Math.hypot(re,im)/count;
    }
    // Window straddles the visual cut; the 440Hz voice must remain, not switch to 880Hz.
    for (const start of [.5,1.75,2.5]) assert.ok(amplitude(440,start)>10*amplitude(880,start));
    process.env.MODEL_API_KEY='test-key';
    globalThis.fetch=async (url,options)=>{
      assert.equal(url,'https://api.meta.ai/v1/asr/transcribe');
      const config=JSON.parse(await options.body.get('request').text()); assert.equal(config.mode,'DIARIZATION');
      const wav=Buffer.from(await options.body.get('audio').arrayBuffer()); assert.equal(wav.subarray(0,4).toString(),'RIFF');
      return Response.json({transcript:'Hello.',turns:[{startMs:100,endMs:1500,transcript:'Hello.',speaker:'A'}]});
    };
    const result=await transcribeFile(path.join(dir(p.id),'a.mp4'),'a',4);
    assert.equal(result.turns[0].end,1.5);
    globalThis.fetch=async()=>Response.json({error:'private upstream detail'},{status:403});
    await assert.rejects(transcribeFile(path.join(dir(p.id),'a.mp4'),'a',4),e=>e.message.includes('403')&&!e.message.includes('private'));
  } finally {
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.MODEL_API_KEY;else process.env.MODEL_API_KEY=originalKey;
    await fs.rm(temp,{recursive:true,force:true});
  }
});
