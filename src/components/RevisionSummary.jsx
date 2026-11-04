import React from 'react';
import { Check, Play, GitCompareArrows } from 'lucide-react';
import { compareShots, speechChanged } from '../edit-diff';

export default function RevisionSummary({ project, version, onReview, onCompare }) {
  const parent = project.versions.find(v => v.id === version.parentId);
  if (!parent) return null;
  const diff = compareShots(parent.plan.shots, version.plan.shots);
  const changes = diff.shots.filter(s => !s.unchanged);
  const audioChanged = (version.audioMode || 'balanced') !== (parent.audioMode || 'balanced');
  const voiceChanged = speechChanged(parent.plan.speech, version.plan.speech);
  return <section className="revision-summary" aria-label="Revision summary">
    <div role="status" aria-live="polite"><Check size={15}/><strong>Changes from {parent.plan.title}</strong></div>
    <p>{changes.length} {changes.length === 1 ? 'shot changed' : 'shots changed'} · {diff.shots.length - changes.length} unchanged{diff.removed.length > 0 && ` · ${diff.removed.length} removed`}{audioChanged && ' · Audio settings updated'}{voiceChanged && ' · Spoken story changed'}</p>
    {!changes.length && !diff.removed.length && <p className="revision-detail">The same shots play in the same order and at the same times.</p>}
    <div className="revision-actions">{changes.length > 0 && <button className="text-button" onClick={() => onReview(changes[0].index)}><Play size={13}/>Review changed shot {changes[0].index + 1}</button>}<button className="text-button" onClick={onCompare}><GitCompareArrows size={13}/>Compare with earlier edit</button></div>
  </section>;
}
