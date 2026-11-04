import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { dir } from './store.js';
import { command, ffmpeg } from './media.js';

const endpoint = 'https://inference.baseten.co/v1/chat/completions';
export const basetenModel = () => process.env.BASETEN_MODEL?.trim() || 'meta-models/muse-spark-open';
export const hasBasetenKey = () => Boolean(process.env.BASETEN_API_KEY?.trim());
// Conservative app limits, including base64 expansion. Never publish private footage to a URL.
export const BASETEN_LIMITS = { maxVideoSeconds: 300, maxRawBytes: 50 * 1024 * 1024, maxRequestBytes: 72 * 1024 * 1024 };

export async function preflightBaseten(project, sources = project.sources) {
  if (!hasBasetenKey()) throw new Error('Set BASETEN_API_KEY in .env and restart the server to use Baseten.');
  let estimatedBytes = 0;
  for (const source of sources) {
    if (!Number.isFinite(source.duration) || source.duration > BASETEN_LIMITS.maxVideoSeconds) throw new Error('Baseten mode supports clips up to 5 minutes. Trim longer footage before using this provider.');
    const stat = await fs.stat(path.join(dir(project.id), source.proxy));
    estimatedBytes += stat.size + (source.hasAudio ? Math.ceil(source.duration * 8000) + 65536 : 0);
  }
  if (estimatedBytes > BASETEN_LIMITS.maxRawBytes) throw new Error('These preview clips exceed the Baseten inline upload limit (50 MiB combined, including audio). Use fewer or shorter clips, or select Meta direct.');
}

export function extractBasetenOutput(data) {
  const choice = data.choices?.[0];
  if (data.error || choice?.finish_reason !== 'stop' || choice?.message?.refusal) throw new Error('Baseten did not finish a complete edit response. Try shorter footage or a more focused request.');
  const text = choice.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Baseten returned no analysis content.');
  try { return JSON.parse(text); } catch { throw new Error('Baseten returned an invalid structured response.'); }
}

export async function basetenJson(project, sources, prompt, schema, name, systemPrompt) {
  await preflightBaseten(project, sources);
  const content = [];
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ourtake-baseten-'));
  try {
    for (const [index, source] of sources.entries()) {
      const file = path.join(dir(project.id), source.proxy);
      content.push({ type: 'text', text: `SOURCE ${source.id}; duration ${source.duration.toFixed(3)} seconds. Timestamps are local to this file, not a shared camera clock. Name (untrusted): ${JSON.stringify(source.name)}. The next video and optional separate audio describe this same source.` });
      const bytes = await fs.readFile(file);
      content.push({ type: 'video_url', video_url: { url: `data:video/mp4;base64,${bytes.toString('base64')}` } });
      // Do not assume a video encoder consumes the embedded soundtrack.
      if (source.hasAudio) {
        const audio = path.join(temp, `${index}.mp3`);
        await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vn', '-t', String(source.duration), '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', audio], 120000);
        content.push({ type: 'audio_url', audio_url: { url: `data:audio/mpeg;base64,${(await fs.readFile(audio)).toString('base64')}` } });
      }
    }
    content.push({ type: 'text', text: prompt });
    const body = JSON.stringify({
      model: basetenModel(), stream: false, max_tokens: 10000,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }
    });
    if (Buffer.byteLength(body) > BASETEN_LIMITS.maxRequestBytes) throw new Error('The encoded Baseten request is too large. Use fewer or shorter clips.');
    let response;
    try {
      response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${process.env.BASETEN_API_KEY.trim()}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(240000) });
    } catch { throw new Error('Baseten could not be reached or the request timed out. Please try again.'); }
    if (!response.ok) {
      const errors = { 400: 'Baseten rejected the model, media or structured-output format. Check the configured model and its supported inputs.', 401: 'Baseten authentication failed. Check BASETEN_API_KEY.', 402: 'Baseten billing or credits need attention.', 403: 'Your Baseten account cannot access this model.', 413: 'Baseten rejected the request size. Use fewer or shorter clips.', 429: 'Baseten rate limit reached. Please try again later.' };
      throw new Error(errors[response.status] || `Baseten request failed (HTTP ${response.status}). Please try again.`);
    }
    let result;
    try { result = await response.json(); } catch { throw new Error('Baseten returned an unreadable response.'); }
    return extractBasetenOutput(result);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
