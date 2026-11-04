import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, id, dir, initStore, load, save, create, list, publicProject, validId } from './store.js';
import { dependencies, prepareSource, render, seedSamples, shotThumbnail } from './media.js';
import { ensureTranscripts } from './speech.js';
import { seedExperience } from './experience.js';
import { hasKey, modelName, analyze, makePlan, ensureContext } from './meta.js';

const jobs = new Map(), active = new Map();
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function checkMode(mode) {
  if (!['demo', 'meta', 'baseten'].includes(mode)) fail('Choose an analysis mode.');
  if (mode !== 'demo' && !hasKey(mode)) fail(`${mode === 'baseten' ? 'Baseten (BASETEN_API_KEY)' : 'Meta (MODEL_API_KEY)'} needs a key in .env. Restart the server after adding it.`);
}
function idle(projectId) { if (active.has(projectId)) fail('This project is still processing another request.', 409); }
function startJob(projectId, task) {
  idle(projectId);
  const job = { id: id(), projectId, status: 'running', progress: 3, message: 'Getting started', createdAt: Date.now() };
  jobs.set(job.id, job); active.set(projectId, job.id);
  const update = (progress, message, stage) => Object.assign(job, { progress, message, ...(stage ? { stage } : {}) });
  Promise.resolve().then(() => task(update)).then(() => Object.assign(job, { status: 'done', progress: 100, message: 'Your story is ready.' })).catch(e => Object.assign(job, { status: 'error', message: e.message || 'The job failed. Please try again.' })).finally(() => active.delete(projectId));
  // Bounded in-memory history; active jobs are never evicted.
  for (const [key, old] of jobs) if (old.status !== 'running' && old.createdAt < Date.now() - 3600000) jobs.delete(key);
  return job;
}
export async function createApp({ frontend = true } = {}) {
  await initStore();
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const host = req.hostname;
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) return res.status(403).json({ error: 'This app only accepts local connections.' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return res.status(403).json({ error: 'Requests from other websites are not allowed.' });
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  const upload = multer({ dest: path.join(root, 'uploads'), limits: { fileSize: 500 * 1024 * 1024, files: 8 }, fileFilter: (_req, file, cb) => {
    if (!/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.originalname)) return cb(new Error('Choose an MP4, MOV, M4V, WebM, MKV or AVI video.'));
    cb(null, true);
  } });
  app.get('/api/config', async (_req, res) => res.json({ metaConfigured: hasKey(), basetenConfigured: hasKey('baseten'), model: modelName(), basetenModel: modelName('baseten'), ffmpegReady: await dependencies(), maxFiles: 8, maxFileMB: 500 }));
  app.get('/api/projects', async (_req, res) => res.json(await list()));
  app.post('/api/projects', async (req, res) => res.status(201).json(publicProject(await create(typeof req.body.name === 'string' ? req.body.name : undefined))));
  app.get('/api/projects/:projectId', async (req, res) => {
    const p = await load(req.params.projectId);
    res.json({ ...publicProject(p), activeJob: active.has(p.id) ? jobs.get(active.get(p.id)) : null });
  });
  app.delete('/api/projects/:projectId', async (req, res) => {
    const p = await load(req.params.projectId); idle(p.id);
    await fs.rm(dir(p.id), { recursive: true }); res.json({ ok: true });
  });
  app.post('/api/projects/:projectId/sample', async (req, res) => {
    const p = await load(req.params.projectId); idle(p.id);
    if (p.sources.length) fail('Open a new project to try the sample footage.');
    const job = startJob(p.id, async update => {
      if (req.body.fixture === 'synthetic') { p.sources = await seedSamples(p, update); p.name = 'A little celebration'; p.isSample = true; }
      else await seedExperience(p, update);
      await save(p);
    });
    res.status(202).json(job);
  });
  app.post('/api/projects/:projectId/upload', (req, res, next) => {
    upload.array('videos', 8)(req, res, async error => {
      try {
        if (error) throw error;
        const files = req.files || [];
        const p = await load(req.params.projectId); idle(p.id);
        if (!files.length) fail('Choose at least one video.');
        if (p.sources.length + files.length > 8) fail('A project can contain up to eight source videos.');
        const job = startJob(p.id, async update => {
          const prepared = [];
          try {
            for (let i = 0; i < files.length; i++) {
              update(5 + Math.round(i / files.length * 85), `Preparing preview ${i + 1} of ${files.length}`, 'import');
              let name = files[i].originalname;
              // Multipart clients commonly encode UTF-8 filenames as Latin-1.
              const decoded = Buffer.from(name, 'latin1').toString('utf8');
              if (!decoded.includes('\uFFFD') && /[^\x00-\x7F]/.test(name)) name = decoded;
              prepared.push(await prepareSource(p.id, files[i].path, name));
            }
            p.sources.push(...prepared); p.analysis = null; p.context = null;
            if (p.name === 'Untitled story') p.name = 'My new story';
            await save(p);
          } catch (e) {
            await Promise.all(prepared.flatMap(s => [s.filename, s.proxy, `${s.id}.jpg`]).map(f => fs.rm(path.join(dir(p.id), f), { force: true })));
            throw e;
          } finally { await Promise.all(files.map(f => fs.rm(f.path, { force: true }))); }
        });
        res.status(202).json(job);
      } catch (e) { await Promise.all((req.files || []).map(f => fs.rm(f.path, { force: true }))); next(e); }
    });
  });
  app.post('/api/projects/:projectId/analyze', async (req, res) => {
    const p = await load(req.params.projectId); checkMode(req.body.mode); idle(p.id);
    if (!p.sources.length) fail('Upload your footage first.');
    const job = startJob(p.id, async update => { const result = await analyze(p, req.body.mode, update); p.analysis = result; p.context = null; await save(p); });
    res.status(202).json(job);
  });
  app.post('/api/projects/:projectId/edit', async (req, res) => {
    const p = await load(req.params.projectId); idle(p.id);
    const { mode, prompt, baseVersionId, locked = [], target = 20, audioMode = 'balanced', editKind = baseVersionId ? 'refine' : 'perspective' } = req.body;
    if (!Array.isArray(locked)) fail('The list of locked shots is invalid.');
    if (!['refine', 'perspective'].includes(editKind)) fail('Choose a local edit or a new perspective.');
    checkMode(mode);
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 3000) fail('Enter a story brief between 1 and 3,000 characters.');
    if (!p.sources.length) fail('Upload your footage first.');
    if (!['balanced', 'original'].includes(audioMode)) fail('Choose a supported audio mode.');
    const version = baseVersionId ? p.versions.find(v => v.id === baseVersionId) : null;
    if (baseVersionId && !version) fail('The version to revise could not be found.');
    if (version && (editKind === 'refine' || locked.length) && version.analysisAt !== p.analysis?.createdAt) fail('The footage analysis has changed. Start a new cut to use the latest scenes.');
    if (version && (editKind === 'refine' || locked.length) && version.mode !== mode) fail('This version belongs to a different mode. Start a new cut in the current mode.');
    if (!Array.isArray(locked) || locked.some(n => !Number.isInteger(n) || n < 0 || !version?.plan.shots[n]) || new Set(locked).size !== locked.length) fail('The list of locked shots is invalid.');
    if (!Number.isFinite(target) || target < 5 || target > 180) fail('Target duration must be between 5 and 180 seconds.');
    const job = startJob(p.id, async update => {
      // One user action owns the full flow; no separate "analyze" click is required.
      if (!p.analysis || p.analysis.mode !== mode) {
        p.analysis = await analyze(p, mode, (percent, message) => update(5 + Math.round(percent * .4), message, 'analyze'));
        await save(p);
      }
      await ensureTranscripts(p, mode, update);
      await save(p);
      await ensureContext(p, mode, update);
      await save(p);
      const previous = version?.analysisAt === p.analysis.createdAt && version?.mode === mode ? version.plan : null;
      const plan = await makePlan(p, { mode, prompt: prompt.trim(), previous, locked, target, editKind }, update);
      update(60, 'Checked clip timing and kept shots', 'check');
      const versionId = id();
      const { duration } = await render(p, plan, versionId, update, audioMode);
      p.versions.push({ id: versionId, parentId: version?.id || null, analysisAt: p.analysis.createdAt, sceneSnapshot: p.analysis.sources.flatMap(a => a.scenes), contextSnapshot: mode === 'demo' ? null : p.context, editKind, createdAt: new Date().toISOString(), mode, model: modelName(mode), prompt: prompt.trim(), plan, duration, audioMode });
      p.activeVersionId = versionId;
      p.messages.push({ role: 'user', content: prompt.trim(), versionId }, { role: 'assistant', content: plan.synopsis, versionId });
      p.name = plan.title; await save(p);
    });
    res.status(202).json(job);
  });
  app.post('/api/projects/:projectId/restore', async (req, res) => {
    const p = await load(req.params.projectId); idle(p.id);
    const v = p.versions.find(v => v.id === req.body.versionId);
    if (!v) fail('Version not found.', 404);
    p.activeVersionId = v.id; p.name = v.plan.title; await save(p);
    res.json(publicProject(p));
  });
  const thumbnails = new Map();
  app.get('/api/projects/:projectId/versions/:versionId/shots/:index', async (req, res) => {
    const p = await load(req.params.projectId), v = p.versions.find(v => v.id === req.params.versionId);
    if (!v || !/^\d+$/.test(req.params.index) || !v.plan.shots[Number(req.params.index)]) fail('Shot not found.', 404);
    const key = `${v.id}:${req.params.index}`;
    if (!thumbnails.has(key)) thumbnails.set(key, shotThumbnail(p, v, Number(req.params.index)).finally(() => thumbnails.delete(key)));
    const file = await thumbnails.get(key);
    res.sendFile(file, { dotfiles: 'allow' });
  });
  app.get('/api/jobs/:jobId', (req, res) => { const job = jobs.get(req.params.jobId); if (!job) fail('This job could not be found. If the server restarted, please try again.', 404); res.json(job); });
  app.get('/api/projects/:projectId/media/:sourceId/:kind', async (req, res) => {
    const p = await load(req.params.projectId), s = p.sources.find(x => x.id === req.params.sourceId);
    if (!s || !['video', 'thumbnail'].includes(req.params.kind)) fail('Source footage not found.', 404);
    res.sendFile(path.join(dir(p.id), req.params.kind === 'thumbnail' ? `${s.id}.jpg` : s.proxy), { dotfiles: 'allow' });
  });
  app.get('/api/projects/:projectId/versions/:versionId/:kind', async (req, res) => {
    const p = await load(req.params.projectId), v = p.versions.find(x => x.id === req.params.versionId);
    if (!v || !['video', 'download'].includes(req.params.kind)) fail('Edit not found.', 404);
    const file = path.join(dir(p.id), `${v.id}.mp4`);
    if (req.params.kind === 'download') res.download(file, `OurTake-${p.versions.indexOf(v) + 1}.mp4`, { dotfiles: 'allow' }); else res.sendFile(file, { dotfiles: 'allow' });
  });
  app.use('/api', (_req, _res, next) => { const e = new Error('Endpoint not found.'); e.status = 404; next(e); });
  app.use((error, _req, res, _next) => {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : error.status || 400).json({ error: tooLarge ? 'Each file must be no larger than 500MB.' : error instanceof multer.MulterError ? 'Check the number and format of your uploaded files.' : error.message || 'The request could not be completed.' });
  });
  let vite;
  if (frontend) {
    if (process.argv.includes('--production')) {
      app.use(express.static(path.join(here, 'dist')));
      app.get('/{*splat}', (_req, res) => res.sendFile(path.join(here, 'dist/index.html')));
    } else {
      vite = await (await import('vite')).createServer({ root: here, server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    }
  }
  return { app, close: async () => { if (vite) await vite.close(); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, close } = await createApp();
  const port = Number(process.env.PORT || 4317);
  const server = app.listen(port, '127.0.0.1', () => console.log(`OurTake is ready at http://127.0.0.1:${port}`));
  const stop = () => { server.close(); close().finally(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
