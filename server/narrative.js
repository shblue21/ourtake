import { objectSchema, planSchema, picturePlanSchema, validateContract, validateSpeech } from './plans.js';
import { validRefs } from './context.js';

const text = { type: 'string' }, refs = { type: 'array', items: text };
export const narrativeSchema = objectSchema({
  focus: objectSchema({ kind: { type: 'string', enum: ['person', 'process', 'theme'] }, label: text, subjectIds: refs }),
  premise: text,
  beats: { type: 'array', items: objectSchema({ id: text, purpose: text, momentIds: refs, sceneIds: refs, relationIds: refs, turnIds: refs }) },
  missingEvidence: refs,
  speech: planSchema.properties.speech
});
export const narrativePictureSchema = objectSchema({ ...picturePlanSchema.properties,
  shots: { type: 'array', items: objectSchema({ ...planSchema.properties.shots.items.properties, beatId: text }) }
});

export function validateNarrative(raw, context, analysis, turns, durationLimit) {
  validateContract(raw, narrativeSchema);
  if (!raw.premise.trim() || !raw.focus.label.trim() || raw.beats.length < 1 || raw.beats.length > 8 || new Set(raw.beats.map(b => b.id)).size !== raw.beats.length || raw.beats.some(b => !b.id.trim() || !b.purpose.trim())) throw new Error('A story needs 1–8 distinct, source-backed parts.');
  const subjects = new Map(context.subjects.map(s => [s.id, s])), moments = new Map(context.moments.map(m => [m.id, m]));
  const scenes = new Map(analysis.sources.flatMap(s => s.scenes).map(s => [s.id, s]));
  const relations = new Map(context.relations.map(r => [r.id, r])), speechTurns = new Map(turns.map(t => [t.id, t]));
  validRefs(raw.focus.subjectIds, subjects, 'focus', raw.focus.kind === 'person');
  if (raw.focus.subjectIds.some(id => subjects.get(id).certainty !== 'supported')) throw new Error('The AI is uncertain about the subject chosen for this story.');
  for (const beat of raw.beats) {
    validRefs(beat.momentIds, moments, 'story moment'); validRefs(beat.sceneIds, scenes, 'story scene');
    validRefs(beat.relationIds, relations, 'story relationship', false); validRefs(beat.turnIds, speechTurns, 'story speech', false);
    const available = new Set(beat.momentIds.flatMap(id => moments.get(id).sceneIds));
    if (beat.sceneIds.some(id => !available.has(id))) throw new Error('Story scenes must belong to the referenced moments.');
    for (const id of beat.relationIds) {
      const r = relations.get(id);
      if (r.certainty !== 'supported') throw new Error('An uncertain relationship cannot support a story claim.');
      if (![r.fromMomentId, r.toMomentId].every(id => beat.momentIds.includes(id))) throw new Error('A story part uses a connection without including both moments that support it.');
    }
    for (const id of beat.turnIds) {
      const t = speechTurns.get(id);
      if (!beat.sceneIds.some(id => { const s = scenes.get(id); return s.sourceId === t.sourceId && s.start < t.end && s.end > t.start; })) throw new Error('The selected speech has no matching scene in this part of the story.');
    }
  }
  const speech = validateSpeech(raw.speech, turns, durationLimit);
  const usedTurns = new Set(raw.beats.flatMap(b => b.turnIds));
  if (speech.some(s => s.turnIds.some(id => !usedTurns.has(id)))) throw new Error('Selected speech must support a story part.');
  return { ...raw, speech };
}

export function bindStoryToPlan(plan, rawShots, story, contextId) {
  const beats = new Map(story.beats.map(b => [b.id, b]));
  const shots = plan.shots.map((s, i) => {
    const beatId = rawShots[i].beatId;
    if (!beats.get(beatId)?.sceneIds.includes(s.sceneId)) throw new Error('A picture cut must use evidence from its story part.');
    return { ...s, beatId };
  });
  if (story.beats.some(b => !shots.some(s => s.beatId === b.id))) throw new Error('Every story part must appear in the actual edit.');
  const order = story.beats.map(b => b.id); let previous = -1;
  for (const shot of shots) { const at = order.indexOf(shot.beatId); if (at < previous) throw new Error('Picture cuts must follow the story order.'); previous = at; }
  return { ...plan, shots, story, contextId };
}
