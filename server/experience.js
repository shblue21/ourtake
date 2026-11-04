import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dir, id } from './store.js';
import { prepareSource, render } from './media.js';
import { validateAnalysis, validatePlan } from './plans.js';

const assets = fileURLToPath(new URL('../public/demo/', import.meta.url));
export const sampleNotice = 'Curated edit of CC0 footage from three different places. Not a synchronized event or an AI-generated result.';
const clips = [
  { file: 'shore.mp4', name: '01 · Rhode Island shore.mp4', title: ['The shoreline', 'A quieter horizon'], tags: ['preparation', 'wide'], description: 'Cloudy Beach, filmed by Dgao0204 in Rhode Island. This is one independent recording.' },
  { file: 'lake.mp4', name: '02 · Pangong lake.mp4', title: ['Water at the edge', 'Small waves'], tags: ['main', 'detail'], description: 'Pangong Tso Waves by Satalah. A separate place and date; not the same event as the other clips.' },
  { file: 'tide.mp4', name: '03 · Wangerooge tide.mp4', title: ['The tide comes in', 'A moment to linger'], tags: ['reaction', 'together'], description: 'Waves near the wooden posts at Wangerooge, filmed by Rhetos. A separate recording.' }
];
export async function seedExperience(project, update) {
  const sources = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i], temp = path.join(dir(project.id), `sample-import-${i}.mp4`);
    update(8 + i * 10, `Opening sample footage ${i + 1}/3`, 'import');
    await fs.copyFile(path.join(assets, clip.file), temp);
    const source = await prepareSource(project.id, temp, clip.name);
    source.fixture = { titles: clip.title, descriptions: [clip.description, clip.description], tags: clip.tags };
    sources.push(source);
  }
  project.sources = sources; project.isSample = true; project.sampleNotice = sampleNotice;
  const analyses = sources.map(s => validateAnalysis({ summary: s.fixture.descriptions[0], scenes: [0, 1].map(i => ({ start: i * s.duration / 2, end: (i + 1) * s.duration / 2, title: s.fixture.titles[i], description: s.fixture.descriptions[i], people: [], tags: s.fixture.tags, confidence: 'low' })) }, s));
  project.analysis = { mode: 'demo', model: null, createdAt: new Date().toISOString(), sources: analyses };
  const scenes = analyses.flatMap(a => a.scenes);
  const selected = [scenes[0], scenes[2], scenes[4], scenes[1], scenes[5]];
  const plan = validatePlan({ title: 'A little room to breathe', synopsis: sampleNotice, shots: selected.map((s, i) => ({ sceneId: s.id, start: s.start, end: Math.min(s.end, s.start + (i === 4 ? 4 : 3)), reason: ['Open on the wide shoreline to establish the mood.', 'Move closer to the small waves for a change in scale.', 'Let the moving tide carry the rhythm.', 'Return to the horizon for a visual pause.', 'Hold on the water to give the film a quiet ending.'][i] + ' Curated sample selection, not AI analysis.' })), connections: [] }, analyses);
  update(60, 'Preparing the curated sample edit', 'render');
  const versionId = id(); const result = await render(project, plan, versionId, update);
  project.versions.push({ id: versionId, analysisAt: project.analysis.createdAt, sceneSnapshot: scenes, parentId: null, createdAt: new Date().toISOString(), mode: 'demo', model: null, prompt: 'A quiet visual postcard from the water.', plan, duration: result.duration, audioMode: 'balanced', curated: true });
  project.activeVersionId = versionId; project.name = plan.title;
}
