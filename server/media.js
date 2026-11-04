import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dir, id } from './store.js';

export const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
export const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
export function command(bin, args, timeout = 900000, capture = 'stdout') {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeout);
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-2000000); });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-8000); });
    child.on('error', e => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? `${bin} was not found. Check your FFmpeg installation paths.` : 'Could not start video processing.')); });
    child.on('close', (code, signal) => { clearTimeout(timer); if (code === 0) resolve(capture === 'stderr' ? stderr : stdout); else { const e = new Error(signal === 'SIGKILL' ? 'Video processing timed out.' : 'Video processing failed. Please try another file.'); e.detail = stderr; reject(e); } });
  });
}
export async function dependencies() {
  const result = await Promise.allSettled([command(ffmpeg, ['-version'], 10000), command(ffprobe, ['-version'], 10000)]);
  return result.every(r => r.status === 'fulfilled');
}
export async function probe(file) {
  const data = JSON.parse(await command(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], 30000));
  const video = data.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const duration = Number(data.format?.duration || video?.duration);
  if (!video || !Number.isFinite(duration) || duration < 0.5 || duration > 1200) throw new Error('Upload a video between 0.5 seconds and 20 minutes long.');
  return { duration, width: video.width, height: video.height, hasAudio: data.streams.some(s => s.codec_type === 'audio') };
}
export async function prepareSource(projectId, file, originalName) {
  const sourceId = id(), folder = dir(projectId);
  const metadata = await probe(file);
  const filename = `${sourceId}-original${path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10) || '.bin'}`;
  const original = path.join(folder, filename);
  const proxy = `${sourceId}-preview.mp4`;
  await fs.rename(file, original);
  try {
    await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', original, '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1', '-r', '24', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(folder, proxy)]);
    await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.min(1, metadata.duration / 3)), '-i', path.join(folder, proxy), '-frames:v', '1', '-vf', 'scale=480:-2', path.join(folder, `${sourceId}.jpg`)]);
    return { id: sourceId, name: originalName, filename, proxy, ...metadata };
  } catch (e) { await Promise.all([filename, proxy, `${sourceId}.jpg`].map(f => fs.rm(path.join(folder, f), { force: true }))); throw e; }
}
export async function shotThumbnail(project, version, index) {
  const shot = version.plan.shots[index];
  if (!shot) throw new Error('Shot not found.');
  const source = project.sources.find(s => s.id === shot.sourceId);
  const output = path.join(dir(project.id), `${version.id}-shot-${index}.jpg`);
  try { await fs.access(output); return output; } catch { /* render the actual cut-in frame */ }
  await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(shot.start), '-i', path.join(dir(project.id), source.filename), '-frames:v', '1', '-vf', 'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2', output]);
  return output;
}

export async function audioGain(file, start, duration) {
  const result = await command(ffmpeg, ['-hide_banner', '-nostats', '-ss', String(start), '-i', file, '-t', String(duration), '-vn', '-af', 'volumedetect', '-f', 'null', '-'], 120000, 'stderr');
  const mean = Number(result.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);
  const peak = Number(result.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
  if (!Number.isFinite(mean) || !Number.isFinite(peak) || mean < -65) return 0;
  // Bounded RMS matching; protect transients rather than boosting background noise indefinitely.
  return Math.min(12, Math.max(-24, -20 - mean), -1.5 - peak);
}

export async function render(project, plan, versionId, onProgress, audioMode = 'balanced') {
  const work = path.join(dir(project.id), `render-${versionId}`);
  await fs.mkdir(work, { recursive: true });
  const final = path.join(dir(project.id), `${versionId}.mp4`);
  try {
    for (let i = 0; i < plan.shots.length; i++) {
      const shot = plan.shots[i], source = project.sources.find(s => s.id === shot.sourceId);
      if (!source) throw new Error('The original video could not be found.');
      const length = shot.end - shot.start;
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(shot.start), '-i', path.join(dir(project.id), source.filename)];
      if (!source.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
      const fade = Math.min(.08, length / 4);
      const gain = source.hasAudio && audioMode === 'balanced' ? await audioGain(path.join(dir(project.id), source.filename), shot.start, length) : 0;
      const audio = ['asetpts=PTS-STARTPTS', `volume=${gain.toFixed(3)}dB`, 'aresample=48000', `apad=whole_dur=${length}`, `atrim=duration=${length}`, `afade=t=in:d=${fade}`, `afade=t=out:st=${length - fade}:d=${fade}`].join(',');
      args.push('-t', String(length), '-map', '0:v:0', '-map', source.hasAudio ? '0:a:0' : '1:a:0', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x15110d,setsar=1,fps=24', '-af', audio, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-video_track_timescale', '24000', path.join(work, `${i}.mp4`));
      await command(ffmpeg, args);
      await shotThumbnail(project, { id: versionId, plan }, i);
      onProgress(65 + Math.round((i + 1) / plan.shots.length * 25), `${i + 1}/${plan.shots.length} shots rendered`, 'render');
    }
    await fs.writeFile(path.join(work, 'concat.txt'), plan.shots.map((_, i) => `file '${i}.mp4'`).join('\n'));
    onProgress(94, 'Assembling the film and finalizing audio', 'export');
    const assembled = plan.speech?.length ? path.join(work, 'assembled.mp4') : final;
    await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', path.join(work, 'concat.txt'), '-c', 'copy', '-movflags', '+faststart', assembled]);
    if (plan.speech?.length) await renderSpeech(project, plan, assembled, final, audioMode);
    const actual = await probe(final);
    return { duration: actual.duration };
  } catch (e) { await fs.rm(final, { force: true }); await Promise.all(plan.shots.map((_, i) => fs.rm(path.join(dir(project.id), `${versionId}-shot-${i}.jpg`), { force: true }))); throw e; }
  finally { await fs.rm(work, { recursive: true, force: true }); }
}

export async function renderSpeech(project, plan, assembled, final, audioMode) {
  const duration = plan.shots.reduce((n, s) => n + s.end - s.start, 0);
  const args = ['-v', 'error', '-y', '-i', assembled], filters = [];
  const mute = plan.speech.map(s => `volume=0:enable='gte(t,${s.timelineStart})*lt(t,${s.timelineStart + s.end - s.start})'`).join(',');
  filters.push(`[0:a]${mute}[base]`);
  for (const [i, clip] of plan.speech.entries()) {
    const source = project.sources.find(s => s.id === clip.sourceId);
    if (!source?.hasAudio) throw new Error('Selected speech has no source audio.');
    const file = path.join(dir(project.id), source.filename), length = clip.end - clip.start;
    args.push('-ss', String(clip.start), '-t', String(length), '-i', file);
    const gain = audioMode === 'balanced' ? await audioGain(file, clip.start, length) : 0;
    filters.push(`[${i+1}:a]asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=duration=${length},volume=${gain.toFixed(3)}dB,adelay=${Math.round(clip.timelineStart*48000)}S:all=1[s${i}]`);
  }
  filters.push(`[base]${plan.speech.map((_, i) => `[s${i}]`).join('')}amix=inputs=${plan.speech.length+1}:duration=first:dropout_transition=0:normalize=0[audio]`);
  args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[audio]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-t', String(duration), '-movflags', '+faststart', final);
  await command(ffmpeg, args);
}

const fixtures = [
  { name: '01 - The preparation.mp4', color: '0x254e43', label: 'BEFORE THE MOMENT', accent: '0xe5b986', titles: ['Setting the scene', 'Waiting for the moment'], descriptions: ['Sample: an illustration representing the preparation.', 'Sample: an illustration representing the wait before the event.'], tags: ['preparation', 'friends'] },
  { name: '02 - The main moment.mp4', color: '0xa85e42', label: 'THE MAIN MOMENT', accent: '0xf4deb4', titles: ['The arrival', 'The celebration'], descriptions: ['Sample: an illustration representing the main arrival.', 'Sample: an illustration representing the main event.'], tags: ['main', 'arrival'] },
  { name: '03 - The other side.mp4', color: '0x4e5676', label: 'THE OTHER SIDE', accent: '0xd3d5ef', titles: ['The reactions', 'A shared memory'], descriptions: ['Sample: an illustration representing another point of view.', 'Sample: an illustration representing the people who were there.'], tags: ['reaction', 'together'] }
];
export async function seedSamples(project, onProgress) {
  const sources = [];
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i], temp = path.join(dir(project.id), `sample-${i}.mp4`);
    const drawing = [`drawbox=x=80:y=80:w=800:h=380:color=${f.accent}@0.12:t=fill`, `drawbox=x=130:y=330:w=700:h=10:color=${f.accent}:t=fill`, ...[0, 1, 2, 3, 4].map(n => `drawbox=x=${190 + n * 125}:y=${205 + (n % 2) * 25}:w=58:h=${125 - (n % 2) * 25}:color=${f.accent}@${0.4 + n * .12}:t=fill`), `drawtext=text='OURTAKE / SAMPLE 0${i + 1}':fontcolor=${f.accent}:fontsize=18:x=130:y=118`, `drawtext=text='${f.label}':fontcolor=${f.accent}:fontsize=33:x=130:y=370`, `drawtext=text='%{pts\\:hms}':fontcolor=${f.accent}:fontsize=18:x=700:y=420`].join(',');
    await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${f.color}:s=960x540:r=24:d=8`, '-vf', drawing, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', temp]);
    const s = await prepareSource(project.id, temp, f.name);
    s.fixture = { titles: f.titles, descriptions: f.descriptions, tags: f.tags };
    sources.push(s);
    onProgress(15 + i * 25, `Preparing sample ${i + 1}/3`);
  }
  return sources;
}
