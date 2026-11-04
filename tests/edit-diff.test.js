import test from 'node:test';
import assert from 'node:assert/strict';
import { compareShots, locateShot, speechChanged } from '../src/edit-diff.js';
const shot=(sceneId,start,end)=>({sceneId,start,end});
test('speech-only changes remain visible even when picture cuts do not change',()=>{
 const a=[{sourceId:'a',start:1,end:4,timelineStart:0,text:'hello'}];
 assert.equal(speechChanged(undefined,[]),false);
 assert.equal(speechChanged(a,[{...a[0],text:'corrected transcript'}]),false);
 assert.equal(speechChanged(a,[{...a[0],timelineStart:1}]),true);
 assert.equal(speechChanged(a,[]),true);
});
test('comparison distinguishes moved, trimmed, added, removed and unchanged shots',()=>{
 const before=[shot('a',0,3),shot('b',1,4),shot('c',0,2),shot('d',0,2)];
 const after=[shot('b',1,4),shot('a',0,2),shot('c',0,2),shot('e',0,1)];
 const d=compareShots(before,after);
 assert.equal(d.shots[0].moved,true);assert.equal(d.shots[0].trimmed,false);
 assert.equal(d.shots[1].trimmed,true);assert.equal(d.shots[1].delta,-1);
 assert.equal(d.shots[2].unchanged,true);assert.equal(d.shots[3].added,true);
 assert.deepEqual(d.removed.map(s=>s.sceneId),['d']);assert.equal(d.durationDelta,-2);
});
test('repeated scenes are matched one-to-one, preferring exact ranges',()=>{
 const d=compareShots([shot('a',0,2),shot('a',3,5)],[shot('a',3,5),shot('a',0,1)]);
 assert.deepEqual(d.shots.map(s=>s.oldIndex),[1,0]);assert.equal(d.removed.length,0);
});
test('original comparison maps edit time to the correct source-local moment',()=>{
 const shots=[shot('a',5,8),shot('b',20,22)];
 assert.deepEqual(locateShot(shots,3.5),{index:1,offset:.5,timelineStart:3});
 assert.equal(locateShot(shots,99).offset,2);assert.equal(locateShot([],0),null);
});
