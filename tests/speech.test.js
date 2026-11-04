import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTurns } from '../server/speech.js';
import { validatePlan, validateSpeech } from '../server/plans.js';

const turns = [
  { id: 'a1', sourceId: 'a', start: 2, end: 4, text: 'A question?' },
  { id: 'a2', sourceId: 'a', start: 4.2, end: 7, text: 'The complete answer.' },
  { id: 'b1', sourceId: 'b', start: 1, end: 3, text: 'Another person.' }
];
test('speech references whole ordered turns, not invented text or timestamps', () => {
  const clip = { firstTurnId: 'a1', lastTurnId: 'a2', timelineStart: 0 };
  const result = validateSpeech([clip], turns, 6)[0];
  assert.equal(result.start, 2); assert.equal(result.end, 7);
  assert.equal(result.text, 'A question? The complete answer.');
  for (const bad of [{ ...clip, firstTurnId: 'missing' }, { ...clip, lastTurnId: 'b1' }, { ...clip, firstTurnId: 'a2', lastTurnId: 'a1' }, { ...clip, timelineStart: -1 }, { ...clip, timelineStart: 2 }]) assert.throws(() => validateSpeech([bad], turns, 6));
  assert.throws(() => validateSpeech([clip, clip], turns, 10), /overlap/);
});
test('locked visual shots also preserve the speech heard over them', () => {
  const analysis = [{ sourceId: 'a', scenes: [{ id: 's', sourceId: 'a', start: 0, end: 10 }] }];
  const raw = { title: 'x', synopsis: 'x', shots: [{ sceneId: 's', start: 2, end: 8 }], speech: [{ firstTurnId: 'a1', lastTurnId: 'a2', timelineStart: 0 }], connections: [] };
  const before = validatePlan(raw, analysis, null, [], turns);
  assert.throws(() => validatePlan({ ...raw, speech: [] }, analysis, before, [0], turns), /audio/);
  assert.deepEqual(validatePlan(raw, analysis, before, [0], turns), before);
  assert.throws(() => validatePlan({ ...raw, shots: [{ sceneId: 's', start: 0, end: 6 }] }, analysis, null, [], turns), /synchronized/);
});
test('ASR bounds use milliseconds and preserve source offsets and scoped speakers', () => {
  const input = { transcript: 'Hello.', turns: [{ startMs: 500, endMs: 2100, transcript: 'Hello.', speaker: 'A' }] };
  const [turn] = parseTurns(input, 'source', 3, 600, 1);
  assert.equal(turn.start, 600.5); assert.equal(turn.end, 602.1); assert.equal(turn.speaker, '1:A');
  assert.throws(() => parseTurns(input, 'source', 1), /invalid/);
  assert.throws(() => parseTurns({ transcript: 'Hello.', turns: [] }, 'source', 3));
  assert.deepEqual(parseTurns({ transcript: '', turns: [] }, 'source', 3), []);
  assert.equal(parseTurns({ ...input, turns: [...input.turns, { startMs: 2200, endMs: 2400, transcript: '', speaker: 'B' }] }, 'source', 3).length, 1);
});
