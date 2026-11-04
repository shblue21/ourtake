export function contextFixture(sourceId = 'source-a') {
  return { subjects: [], moments: [{ id: 'moment-a', label: 'Visible action', sceneIds: [`${sourceId}:0`], subjectIds: [], observation: 'Visible movement in the source.' }], relations: [] };
}
export function storyFixture(sourceId = 'source-a', turns = []) {
  return { focus: { kind: 'theme', label: 'The shared moment', subjectIds: [] }, premise: 'A source-backed moment.', beats: [{ id: 'beat-a', purpose: 'Show the observed action.', momentIds: ['moment-a'], sceneIds: [`${sourceId}:0`], relationIds: [], turnIds: turns.map(t => t.id) }], missingEvidence: [], speech: turns.length ? [{ firstTurnId: turns[0].id, lastTurnId: turns.at(-1).id, timelineStart: 0 }] : [] };
}
export function pictureFixture(sourceId = 'source-a', start = 1, end = 4) {
  return { title: 'A cut', synopsis: 'A source-backed edit.', shots: [{ beatId: 'beat-a', sceneId: `${sourceId}:0`, start, end, reason: 'Visible action.' }], connections: [] };
}
