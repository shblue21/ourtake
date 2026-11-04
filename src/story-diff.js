export function compareStories(before, after) {
  if (!before?.plan.story || !after?.plan.story) return { available: false };
  const sameContext = Boolean(before.plan.contextId && before.plan.contextId === after.plan.contextId);
  const a = new Set(before.plan.story.beats.flatMap(b => b.momentIds));
  const b = new Set(after.plan.story.beats.flatMap(b => b.momentIds));
  return { available: true, sameContext,
    beforeFocus: before.plan.story.focus.label, afterFocus: after.plan.story.focus.label,
    added: sameContext ? [...b].filter(id => !a.has(id)) : [],
    removed: sameContext ? [...a].filter(id => !b.has(id)) : []
  };
}
