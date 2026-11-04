import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const root = path.resolve(process.env.OURTAKE_DATA_DIR || '.data');
export const id = () => randomUUID();
export function validId(value) { return typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value); }
export function dir(projectId) {
  if (!validId(projectId)) throw new Error('Invalid project ID.');
  return path.join(root, 'projects', projectId);
}
export async function initStore() {
  await fs.mkdir(path.join(root, 'projects'), { recursive: true });
  await fs.mkdir(path.join(root, 'uploads'), { recursive: true });
}
export async function load(projectId) {
  try { return JSON.parse(await fs.readFile(path.join(dir(projectId), 'project.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') { const err = new Error('Project not found.'); err.status = 404; throw err; } throw e; }
}
export async function save(project) {
  project.updatedAt = new Date().toISOString();
  const target = dir(project.id);
  await fs.mkdir(target, { recursive: true });
  const tmp = path.join(target, `project-${id()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(project, null, 2));
  await fs.rename(tmp, path.join(target, 'project.json'));
}
export async function create(name = 'Untitled story') {
  const p = { id: id(), name: name.slice(0, 100), createdAt: new Date().toISOString(), sources: [], analysis: null, versions: [], messages: [] };
  await save(p); return p;
}
export async function list() {
  const entries = await fs.readdir(path.join(root, 'projects'));
  const out = [];
  for (const entry of entries.filter(validId)) {
    try { const p = await load(entry); out.push({ id: p.id, name: p.name, updatedAt: p.updatedAt, count: p.sources.length }); } catch { /* incomplete project */ }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function publicProject(p) {
  return { ...p, sources: p.sources.map(({ filename, proxy, ...s }) => ({ ...s, url: `/api/projects/${p.id}/media/${s.id}/video`, thumbnail: `/api/projects/${p.id}/media/${s.id}/thumbnail` })), versions: p.versions.map(v => ({ ...v, url: `/api/projects/${p.id}/versions/${v.id}/video`, download: `/api/projects/${p.id}/versions/${v.id}/download` })) };
}
