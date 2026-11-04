export const objectSchema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' }, num = { type: 'number' };
/** Enforce our small JSON-schema contract locally, including when a provider uses JSON mode. */
export function validateContract(value, schema) {
  const invalid = () => { throw new Error('The model returned data in an unexpected format.'); };
  if (schema.enum && !schema.enum.includes(value)) invalid();
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    if ((schema.required || []).some(key => !Object.hasOwn(value, key))) invalid();
    if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) invalid();
    for (const [key, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, key)) validateContract(value[key], child);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) invalid();
    for (const item of value) validateContract(item, schema.items);
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') invalid();
  } else if (schema.type === 'number') {
    if (!Number.isFinite(value)) invalid();
  }
  return value;
}
export const analysisSchema = objectSchema({
  summary: str,
  scenes: { type: 'array', items: objectSchema({ start: num, end: num, title: str, description: str, people: { type: 'array', items: str }, tags: { type: 'array', items: str }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } }) }
});
export const planSchema = objectSchema({
  title: str, synopsis: str,
  shots: { type: 'array', items: objectSchema({ sceneId: str, start: num, end: num, reason: str }) },
  speech: { type: 'array', items: objectSchema({ firstTurnId: str, lastTurnId: str, timelineStart: num }) },
  connections: { type: 'array', items: objectSchema({ sceneIds: { type: 'array', items: str }, observation: str, uncertainty: str }) }
});
export const storySchema = objectSchema({ premise: str, speech: planSchema.properties.speech });
export const picturePlanSchema = objectSchema(Object.fromEntries(Object.entries(planSchema.properties).filter(([name]) => name !== 'speech')));
export function validateAnalysis(raw, source) {
  if (!raw || typeof raw.summary !== 'string' || !Array.isArray(raw.scenes) || raw.scenes.length < 1 || raw.scenes.length > 40) throw new Error('The scene analysis has missing or invalid information.');
  return { sourceId: source.id, summary: raw.summary.slice(0, 2000), scenes: raw.scenes.map((s, i) => {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end > source.duration + 0.15 || s.end - s.start < 0.2 || typeof s.title !== 'string' || typeof s.description !== 'string') throw new Error('A scene has missing details or an invalid time range.');
    if (!['high', 'medium', 'low'].includes(s.confidence)) throw new Error('The scene analysis returned an invalid confidence value.');
    return { id: `${source.id}:${i}`, sourceId: source.id, start: s.start, end: Math.min(s.end, source.duration), title: s.title.slice(0, 200), description: s.description.slice(0, 3000), people: Array.isArray(s.people) ? s.people.filter(x => typeof x === 'string').slice(0, 12) : [], tags: Array.isArray(s.tags) ? s.tags.filter(x => typeof x === 'string').slice(0, 12) : [], confidence: ['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : 'low' };
  }) };
}
export function validatePlan(raw, analysis, previous = null, locked = [], turns = []) {
  if (!raw || typeof raw.title !== 'string' || typeof raw.synopsis !== 'string' || !Array.isArray(raw.shots) || !raw.shots.length || raw.shots.length > 40) throw new Error('The edit plan has missing or invalid information.');
  const scenes = new Map(analysis.flatMap(a => a.scenes).map(s => [s.id, s]));
  const shots = raw.shots.map((shot, i) => {
    const scene = scenes.get(shot.sceneId);
    if (!scene || !Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.start < scene.start - 0.05 || shot.end > scene.end + 0.05 || shot.end - shot.start < 0.2) throw new Error(`Shot ${i + 1} refers to a missing scene or an invalid time range.`);
    return { sceneId: scene.id, sourceId: scene.sourceId, start: Math.max(scene.start, shot.start), end: Math.min(scene.end, shot.end), reason: String(shot.reason || '').slice(0, 1000) };
  });
  const duration = shots.reduce((t, s) => t + s.end - s.start, 0);
  if (duration > 600) throw new Error('The finished edit must be no longer than 10 minutes.');
  const speech = validateSpeech(raw.speech || [], turns, duration);
  let timeline = 0;
  for (const shot of shots) {
    const until = timeline + shot.end - shot.start;
    for (const voice of speech) {
      if (voice.sourceId === shot.sourceId && voice.timelineStart < until && voice.timelineStart + voice.end - voice.start > timeline && Math.abs((shot.start - timeline) - (voice.start - voice.timelineStart)) > .05) throw new Error('Picture and speech from the same source must stay synchronized.');
    }
    timeline = until;
  }
  // A lock freezes the slot, source and exact range. Reject changed locks rather than silently reverting an incoherent edit.
  for (const index of locked) {
    const before = previous?.shots[index], after = shots[index];
    if (!before || !after || ['sceneId', 'start', 'end'].some(k => before[k] !== after[k])) throw new Error(`Locked shot ${index + 1} was changed. Please ask for a revision that preserves locked shots.`);
    if (JSON.stringify(speechOverShot(previous, index)) !== JSON.stringify(speechOverShot({ shots, speech }, index))) throw new Error(`Locked shot ${index + 1} audio was changed.`);
  }
  const connections = (Array.isArray(raw.connections) ? raw.connections : []).slice(0, 12).map(c => {
    if (!Array.isArray(c.sceneIds) || c.sceneIds.length < 2 || !c.sceneIds.every(x => scenes.has(x))) throw new Error('A scene connection references invalid evidence.');
    return { sceneIds: c.sceneIds, observation: String(c.observation || '').slice(0, 1500), uncertainty: String(c.uncertainty || '').slice(0, 1000) };
  });
  return { title: raw.title.slice(0, 120), synopsis: raw.synopsis.slice(0, 2500), shots, speech, connections };
}

export function validateSpeech(raw, turns, duration) {
  if (!Array.isArray(raw) || raw.length > 20) throw new Error('Invalid speech selection.');
  const clips = raw.map(clip => {
    const first = turns.find(t => t.id === clip.firstTurnId), last = turns.find(t => t.id === clip.lastTurnId);
    if (!first || !last || first.sourceId !== last.sourceId || last.start < first.start) throw new Error('Speech must reference ordered turns from one source.');
    const start = first.start, end = last.end, at = clip.timelineStart;
    if (!Number.isFinite(at) || at < 0 || end <= start || at + end - start > duration + .001) throw new Error('Speech extends beyond the edit timeline.');
    const selected = turns.filter(t => t.sourceId === first.sourceId && t.start >= start && t.start <= last.start);
    if (selected.some(t => t.end > end + .001)) throw new Error('Speech selection cuts an overlapping turn.');
    return { sourceId: first.sourceId, start, end, timelineStart: at, firstTurnId: first.id, lastTurnId: last.id, turnIds: selected.map(t => t.id), text: selected.map(t => t.text).join(' ') };
  }).sort((a, b) => a.timelineStart - b.timelineStart);
  for (let i = 1; i < clips.length; i++) if (clips[i].timelineStart < clips[i-1].timelineStart + clips[i-1].end - clips[i-1].start - .001) throw new Error('Speech clips cannot overlap on the edit timeline.');
  return clips;
}

function speechOverShot(plan, index) {
  const start = plan.shots.slice(0, index).reduce((n, s) => n + s.end - s.start, 0), end = start + plan.shots[index].end - plan.shots[index].start;
  return (plan.speech || []).filter(s => s.timelineStart < end && s.timelineStart + s.end - s.start > start).map(s => {
    const from = Math.max(start, s.timelineStart), to = Math.min(end, s.timelineStart + s.end - s.start);
    return [s.sourceId, from - start, to - start, s.start + from - s.timelineStart];
  });
}
