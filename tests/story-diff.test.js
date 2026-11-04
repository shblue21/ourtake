import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStories } from '../src/story-diff.js';
const version=(focus,moments,contextId='same')=>({plan:{contextId,story:{focus:{label:focus},beats:moments.map(id=>({momentIds:[id]}))}}});
test('perspective comparison reports evidence changes, not a fabricated explanation',()=>{
 const a=version('The guest',['arrival','celebration']),b=version('The helpers',['preparation','celebration']);
 const d=compareStories(a,b);assert.equal(d.beforeFocus,'The guest');assert.equal(d.afterFocus,'The helpers');assert.deepEqual(d.added,['preparation']);assert.deepEqual(d.removed,['arrival']);
 assert.equal(compareStories({plan:{}},b).available,false);
 assert.equal(compareStories(a,version('New understanding',['preparation'],'different')).sameContext,false);
 assert.deepEqual(compareStories(a,version('New understanding',['preparation'],'different')).added,[]);
});
