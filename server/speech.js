import { openAsBlob } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { command, ffmpeg } from './media.js';
import { dir, save } from './store.js';

export const speechModel = 'muse-voice-transcribe-1.0';

export function parseTurns(data, sourceId, duration, offset = 0, chunk = 0) {
  if (!Array.isArray(data.turns) || (data.transcript?.trim() && !data.turns.length)) throw new Error('Speech recognition returned no timed turns.');
  const turns = data.turns.map((turn, i) => {
    const start = turn.startMs / 1000, end = turn.endMs / 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + .2 || typeof turn.transcript !== 'string') throw new Error('Speech recognition returned an invalid timed turn.');
    // Live diarization can emit a valid speaker span without recognized words.
    if (!turn.transcript.trim()) return null;
    return { id: `${sourceId}:speech:${chunk}:${i}`, sourceId, start: offset + start, end: offset + Math.min(end, duration), text: turn.transcript.trim(), speaker: typeof turn.speaker === 'string' ? `${chunk}:${turn.speaker}` : '', boundary: start < .1 || end > duration - .1 };
  }).filter(Boolean).sort((a, b) => a.start - b.start);
  if (data.transcript?.trim() && !turns.length) throw new Error('Speech recognition returned no timed words.');
  return turns;
}

export async function transcribeFile(file, sourceId, duration) {
  if (!process.env.MODEL_API_KEY?.trim()) throw new Error('Meta speech recognition needs MODEL_API_KEY.');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ourtake-speech-'));
  const turns = [];
  try {
    // The file endpoint accepts at most ten minutes and 32 MB per request.
    for (let offset = 0, chunk = 0; offset < duration; offset += 600, chunk++) {
      const length = Math.min(600, duration - offset), wav = path.join(temp, `${chunk}.wav`);
      await command(ffmpeg, ['-v', 'error', '-y', '-ss', String(offset), '-i', file, '-t', String(length), '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-map_metadata', '-1', wav]);
      const form = new FormData();
      form.set('request', new Blob([JSON.stringify({ mode: 'DIARIZATION', model: speechModel, audioEncoding: 'WAV' })], { type: 'application/json' }));
      form.set('audio', await openAsBlob(wav, { type: 'audio/wav' }), 'speech.wav');
      let response;
      try { response = await fetch('https://api.meta.ai/v1/asr/transcribe', { method: 'POST', headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY.trim()}` }, body: form, signal: AbortSignal.timeout(240000) }); }
      catch { throw new Error('Meta speech recognition timed out or could not be reached.'); }
      if (!response.ok) throw new Error(`Meta speech recognition failed (HTTP ${response.status}).`);
      turns.push(...parseTurns(await response.json(), sourceId, length, offset, chunk));
    }
    return { model: speechModel, turns };
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}

export async function ensureTranscripts(project, mode, progress) {
  // Baseten keeps its existing multimodal path; never silently send its media to Meta.
  if (mode !== 'meta') return [];
  for (const [index, source] of project.sources.entries()) {
    if (!source.hasAudio) continue;
    if (source.transcript?.model !== speechModel) {
      progress(44, `Transcribing clip ${index + 1} of ${project.sources.length}`, 'analyze');
      source.transcript = await transcribeFile(path.join(dir(project.id), source.filename), source.id, source.duration);
      await save(project);
    }
  }
  return project.sources.flatMap(s => s.transcript?.turns || []);
}
