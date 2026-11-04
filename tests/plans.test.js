import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysis, validatePlan, validateContract, analysisSchema, planSchema } from '../server/plans.js';
import { extractOutput } from '../server/meta.js';
const analysis = [{ sourceId: 'a', scenes: [{ id: 'a:0', sourceId: 'a', start: 2, end: 8 }, { id: 'a:1', sourceId: 'a', start: 9, end: 12 }] }];
const raw = () => ({ title: 'Story', synopsis: 'Evidence', shots: [{ sceneId: 'a:0', start: 2, end: 6, reason: 'Visible action' }], speech: [], connections: [] });
test('rejects fabricated scene identifiers and out-of-evidence ranges', () => {
  const p = raw(); p.shots[0].sceneId = '../../private'; assert.throws(() => validatePlan(p, analysis));
  p.shots[0] = { sceneId: 'a:0', start: 0, end: 5 }; assert.throws(() => validatePlan(p, analysis));
  p.shots[0] = { sceneId: 'a:0', start: 2, end: NaN }; assert.throws(() => validatePlan(p, analysis));
  p.shots[0] = { sceneId: 'a:0', start: 8, end: 8 }; assert.throws(() => validatePlan(p, analysis));
});
test('locked slots preserve source and exact timing, even on otherwise valid revisions', () => {
  const before = validatePlan(raw(), analysis);
  const after = raw(); after.shots[0].end = 7;
  assert.throws(() => validatePlan(after, analysis, before, [0]), /Locked/);
  assert.equal(validatePlan(after, analysis, before, []).shots[0].end, 7);
  assert.deepEqual(validatePlan(raw(), analysis, before, [0]).shots, before.shots);
});
test('rejects unsupported relationship evidence and excessive output', () => {
  const p = raw(); p.connections = [{ sceneIds: ['a:0', 'missing'], observation: 'same event' }];
  assert.throws(() => validatePlan(p, analysis));
  p.connections = []; p.shots = Array(41).fill(p.shots[0]); assert.throws(() => validatePlan(p, analysis));
});
test('analysis cannot place events outside the uploaded source', () => {
  assert.throws(() => validateAnalysis({ summary: 'x', scenes: [{ start: 0, end: 15, title: 'x', description: 'x' }] }, { id: 'a', duration: 10 }));
});
test('Meta extraction accepts Responses output, rejects incomplete/refusal/invalid JSON', () => {
  assert.deepEqual(extractOutput({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"title":"x"}' }] }] }), { title: 'x' });
  assert.throws(() => extractOutput({ status: 'incomplete', output_text: '{}' }));
  assert.throws(() => extractOutput({ output: [{ content: [{ type: 'refusal', refusal: 'no' }] }] }));
  assert.throws(() => extractOutput({ output_text: '```json\n{}\n```' }));
});
test('JSON mode still rejects missing fields, wrong types, invalid enums and extra model fields', () => {
  const a = { summary: 'Observed', scenes: [{ start: 0, end: 2, title: 'Water', description: 'Visible waves', people: [], tags: [], confidence: 'high' }] };
  assert.equal(validateContract(a, analysisSchema), a);
  assert.doesNotThrow(() => validateContract(raw(), planSchema));
  for (const confidence of ['garbled value', 1, null]) assert.throws(() => validateContract({ ...a, scenes: [{ ...a.scenes[0], confidence }] }, analysisSchema));
  assert.throws(() => validateContract({ ...a, scenes: [{ ...a.scenes[0], people: 'none' }] }, analysisSchema));
  assert.throws(() => validateContract({ scenes: a.scenes }, analysisSchema));
  assert.throws(() => validateContract({ ...raw(), execute: 'untrusted' }, planSchema));
  assert.throws(() => validateContract({ ...raw(), shots: [{ ...raw().shots[0], start: '0' }] }, planSchema));
});
