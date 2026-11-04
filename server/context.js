import { createHash } from 'node:crypto';
import { objectSchema, validateContract } from './plans.js';

const text = { type: 'string' }, refs = { type: 'array', items: text };
const certainty = { type: 'string', enum: ['supported', 'uncertain'] };
export const contextSchema = objectSchema({
  subjects: { type: 'array', items: objectSchema({ id: text, label: text, sceneIds: refs, evidence: text, certainty }) },
  moments: { type: 'array', items: objectSchema({ id: text, label: text, sceneIds: refs, subjectIds: refs, observation: text }) },
  relations: { type: 'array', items: objectSchema({ id: text, kind: { type: 'string', enum: ['same_event', 'before_after', 'reaction', 'thematic'] }, fromMomentId: text, toMomentId: text, evidenceSceneIds: refs, evidence: text, certainty }) }
});

export function contextKey(project, mode, model) {
  return createHash('sha256').update(JSON.stringify({ schema: 1, mode, model, analysis: project.analysis, sources: project.sources.map(s => ({ id: s.id, duration: s.duration, transcript: mode === 'meta' ? s.transcript : undefined })) })).digest('hex');
}
function unique(items, label, max) {
  if (items.length > max || new Set(items.map(x => x.id)).size !== items.length || items.some(x => !x.id.trim())) throw new Error(`Invalid ${label} identifiers.`);
  return new Map(items.map(x => [x.id, x]));
}
export function validRefs(ids, catalog, label, required = true) {
  if (!Array.isArray(ids) || (required && !ids.length) || new Set(ids).size !== ids.length || ids.some(id => !catalog.has(id))) throw new Error(`Invalid ${label} evidence references.`);
}
export function validateContext(raw, analysis) {
  validateContract(raw, contextSchema);
  const scenes = new Map(analysis.sources.flatMap(a => a.scenes).map(s => [s.id, s]));
  const subjects = unique(raw.subjects, 'subject', 40), moments = unique(raw.moments, 'moment', 80);
  unique(raw.relations, 'relationship', 120);
  if (!moments.size) throw new Error('The analysis did not identify any moments supported by the footage.');
  for (const s of raw.subjects) { validRefs(s.sceneIds, scenes, 'subject'); if (!s.evidence.trim()) throw new Error('The analysis linked a subject to scenes without explaining the visible evidence.'); }
  for (const m of raw.moments) { validRefs(m.sceneIds, scenes, 'moment'); validRefs(m.subjectIds, subjects, 'subject', false); }
  for (const r of raw.relations) {
    if (!moments.has(r.fromMomentId) || !moments.has(r.toMomentId) || r.fromMomentId === r.toMomentId) throw new Error('A relationship must connect two existing moments.');
    validRefs(r.evidenceSceneIds, scenes, 'relationship');
    if (!r.evidence.trim()) throw new Error('The analysis linked moments without explaining the visible evidence.');
    for (const id of [r.fromMomentId, r.toMomentId]) if (!moments.get(id).sceneIds.some(s => r.evidenceSceneIds.includes(s))) throw new Error('A connection needs footage supporting both moments.');
  }
  return raw;
}
