const sameRange = (a, b) => a.start === b.start && a.end === b.end;

export function speechChanged(before = [], after = []) {
  const timing = clips => clips.map(s => [s.sourceId, s.start, s.end, s.timelineStart]);
  return JSON.stringify(timing(before)) !== JSON.stringify(timing(after));
}

/** Match repeated clips one-to-one: exact ranges first, then changed ranges. */
export function compareShots(before = [], after = []) {
  const used = new Set();
  const matches = Array(after.length).fill(-1);
  for (const exact of [true, false]) {
    after.forEach((shot, i) => {
      if (matches[i] >= 0) return;
      const j = before.findIndex((other, k) => !used.has(k) && other.sceneId === shot.sceneId && (!exact || sameRange(other, shot)));
      if (j >= 0) { matches[i] = j; used.add(j); }
    });
  }
  const shots = after.map((shot, i) => {
    const oldIndex = matches[i], old = before[oldIndex];
    return { index: i, oldIndex, added: !old, moved: !!old && oldIndex !== i, trimmed: !!old && !sameRange(old, shot), unchanged: !!old && oldIndex === i && sameRange(old, shot), delta: old ? (shot.end - shot.start) - (old.end - old.start) : shot.end - shot.start };
  });
  return { shots, removed: before.map((shot, index) => ({ ...shot, index })).filter(s => !used.has(s.index)), durationDelta: after.reduce((n, s) => n + s.end - s.start, 0) - before.reduce((n, s) => n + s.end - s.start, 0) };
}

export function locateShot(shots, time) {
  let at = 0;
  for (let index = 0; index < shots.length; index++) {
    const duration = shots[index].end - shots[index].start;
    if (time < at + duration || index === shots.length - 1) return { index, offset: Math.max(0, Math.min(duration, time - at)), timelineStart: at };
    at += duration;
  }
  return null;
}
