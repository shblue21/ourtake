import React from 'react';
import { compareStories } from '../story-diff';

export default function StoryComparison({ before, after }) {
  const comparison = compareStories(before, after);
  if (!comparison.available) return <p className="muted">One of these edits has no saved story outline. You can still compare the video and audio.</p>;
  const name = (version,id) => version.contextSnapshot?.moments.find(m=>m.id===id)?.label || id;
  return <section className="story-comparison" aria-label="Story changes">
    <h3>How the story changed</h3>
    <div className="story-focus-pair"><div><small>Comparison edit</small><strong>{comparison.beforeFocus}</strong><p>{before.plan.story.premise}</p><ol>{before.plan.story.beats.map(b=><li key={b.id}>{b.purpose}</li>)}</ol></div><div><small>Selected edit</small><strong>{comparison.afterFocus}</strong><p>{after.plan.story.premise}</p><ol>{after.plan.story.beats.map(b=><li key={b.id}>{b.purpose}</li>)}</ol></div></div>
    {comparison.sameContext?<><p>Moments added: {comparison.added.map(id=>name(after,id)).join('; ')||'None.'}</p><p>Moments removed: {comparison.removed.map(id=>name(before,id)).join('; ')||'None.'}</p></>:<p className="muted">We cannot match moments across these two story outlines. Each uses the source references saved with its edit.</p>}
  </section>;
}
