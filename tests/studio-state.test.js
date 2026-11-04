import test from 'node:test';
import assert from 'node:assert/strict';
import { creationBlocker, activeVersion } from '../src/studio-state.js';
const ready={busy:false,config:{ffmpegReady:true},project:{id:'p'},sourceCount:3,prompt:'Make it shorter',editing:true};
test('creation guidance matches the first unmet prerequisite',()=>{
 assert.equal(creationBlocker(ready),'');
 assert.match(creationBlocker({...ready,busy:true}),/wait/i);
 assert.match(creationBlocker({...ready,config:null}),/Loading/);
 assert.match(creationBlocker({...ready,config:{ffmpegReady:false}}),/FFmpeg/);
 assert.match(creationBlocker({...ready,sourceCount:0,prompt:''}),/footage/);
 assert.match(creationBlocker({...ready,prompt:'  '}),/Enter a change/);
 assert.match(creationBlocker({...ready,prompt:'',editing:false}),/Describe your story/);
});
test('restoring an older version keeps it active independently from the newest version',()=>{
 const a={id:'v1'},b={id:'v2'};
 assert.equal(activeVersion({versions:[a,b],activeVersionId:'v1'}),a);
 assert.equal(activeVersion({versions:[a,b]}),b);
 assert.equal(activeVersion({versions:[],activeVersionId:'missing'}),null);
});
