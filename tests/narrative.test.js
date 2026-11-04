import test from 'node:test';
import assert from 'node:assert/strict';
import { contextKey, validateContext } from '../server/context.js';
import { validateNarrative, bindStoryToPlan } from '../server/narrative.js';
import { contextFixture, storyFixture } from './narrative-fixtures.js';

const analysis = { sources: [{ sourceId:'source-a',scenes:[{id:'source-a:0',sourceId:'source-a',start:0,end:8}] }, {sourceId:'b',scenes:[{id:'b:0',sourceId:'b',start:0,end:8}]}] };
const context = () => ({...contextFixture(),moments:[...contextFixture().moments,{id:'moment-b',label:'Another moment',sceneIds:['b:0'],subjectIds:[],observation:'A separate source.'}]});
test('relationships need evidence from both moments; similar-looking footage is not automatically linked',()=>{
 const c=context();c.relations=[{id:'r',kind:'reaction',fromMomentId:'moment-a',toMomentId:'moment-b',evidenceSceneIds:['source-a:0'],evidence:'Both visible',certainty:'uncertain'}];
 assert.throws(()=>validateContext(c,analysis),/both moments/);
 c.relations[0].evidenceSceneIds.push('b:0');assert.equal(validateContext(c,analysis),c);
 const story=storyFixture();story.beats[0].momentIds.push('moment-b');story.beats[0].sceneIds.push('b:0');story.beats[0].relationIds=['r'];
 assert.throws(()=>validateNarrative(story,c,analysis,[],30),/uncertain/);
 c.relations[0].certainty='supported';assert.equal(validateNarrative(story,c,analysis,[],30).beats.length,1);
});
test('silent stories retain evidence and gaps without invented speech or subjects',()=>{
 const c=context(),s=storyFixture();s.missingEvidence=['The preparation was not recorded.'];
 assert.deepEqual(validateNarrative(s,c,analysis,[],30).speech,[]);
 s.beats[0].sceneIds.push('b:0');assert.throws(()=>validateNarrative(s,c,analysis,[],30),/referenced moments/);
 s.beats[0].sceneIds=['source-a:0'];s.focus={kind:'person',label:'The host',subjectIds:['missing']};assert.throws(()=>validateNarrative(s,c,analysis,[],30),/focus/);
 c.subjects=[{id:'maybe',label:'Possibly the host',sceneIds:['source-a:0'],evidence:'Unclear identity',certainty:'uncertain'}];s.focus.subjectIds=['maybe'];assert.throws(()=>validateNarrative(s,c,analysis,[],30),/uncertain/);
});
test('actual cuts must realize every story part using its evidence and order',()=>{
 const s=storyFixture();s.beats.push({...s.beats[0],id:'beat-b',momentIds:['moment-b'],sceneIds:['b:0']});
 const cuts=[{sceneId:'source-a:0'},{sceneId:'b:0'}];
 assert.equal(bindStoryToPlan({shots:cuts},[{beatId:'beat-a'},{beatId:'beat-b'}],s,'context').story,s);
 assert.throws(()=>bindStoryToPlan({shots:cuts},[{beatId:'beat-b'},{beatId:'beat-a'}],s,'context'),/evidence/);
 assert.throws(()=>bindStoryToPlan({shots:[cuts[0]]},[{beatId:'beat-a'}],s,'context'),/Every story part/);
 assert.throws(()=>bindStoryToPlan({shots:[cuts[1],cuts[0]]},[{beatId:'beat-b'},{beatId:'beat-a'}],s,'context'),/order/);
});
test('context caching changes with footage, analysis, transcript and model, not the story request',()=>{
 const p={analysis,sources:[{id:'source-a',duration:8}]};const key=contextKey(p,'meta','model');
 assert.equal(contextKey({...p,prompt:'another story'},'meta','model'),key);
 assert.notEqual(contextKey(p,'meta','other-model'),key);
 assert.notEqual(contextKey({...p,sources:[...p.sources,{id:'b',duration:8}]},'meta','model'),key);
 assert.notEqual(contextKey({...p,sources:[{...p.sources[0],transcript:{turns:[]}}]},'meta','model'),key);
});
