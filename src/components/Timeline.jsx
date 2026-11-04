import React from 'react';
import { LockKeyhole, UnlockKeyhole, Play, Film, ArrowUpRight } from 'lucide-react';
export function timestamp(value, precise = false) {
  const n = Math.max(0, value || 0);
  return `${Math.floor(n / 60).toString().padStart(2, '0')}:${Math.floor(n % 60).toString().padStart(2, '0')}${precise ? `.${Math.floor(n % 1 * 10)}` : ''}`;
}
export function shotImage(project, version, index) { return `/api/projects/${project.id}/versions/${version.id}/shots/${index}`; }
export default function Timeline({ project, version, currentTime, activeShot, locked, busy, onSeek, onLock, onOriginal }) {
  const shots = version?.plan.shots || [];
  const duration = shots.reduce((n, s) => n + s.end - s.start, 0);
  const selected = shots[activeShot];
  const source = project?.sources.find(s => s.id === selected?.sourceId);
  const scene = version?.sceneSnapshot?.find(s => s.id === selected?.sceneId);
  return <section className="timeline-section" aria-label="Shot timeline">
    <div className="section-title"><h2>The cut</h2><span>{shots.length ? `${shots.length} ${shots.length===1?'shot':'shots'} · ${timestamp(duration)}` : 'Your moments, in order'}</span></div>
    {shots.length ? <>
      <div className="timeline-ruler"><span>00:00</span><span>{timestamp(duration / 2)}</span><span>{timestamp(duration)}</span></div>
      <div className="timeline-track">
        {shots.map((shot, i) => <div key={i} className={`timeline-shot ${activeShot === i ? 'selected' : ''}`} style={{flexGrow:shot.end-shot.start}}>
          <button className="shot-picture" onClick={() => onSeek(i)} aria-label={`Play shot ${i + 1}`}><img src={shotImage(project, version, i)} alt={`First frame of shot ${i + 1}`}/><b>{String(i+1).padStart(2,'0')}</b><small>{(shot.end-shot.start).toFixed(1)}s</small></button>
          <button className={`shot-lock ${locked.includes(i) ? 'locked' : ''}`} disabled={busy} onClick={() => onLock(i)} aria-label={`${locked.includes(i)?'Unlock':'Lock'} shot ${i+1}`} title="Preserve this shot and its position in your next edit">{locked.includes(i)?<LockKeyhole size={13}/>:<UnlockKeyhole size={13}/>}<span>{locked.includes(i)?'Locked':'Keep shot'}</span></button>
        </div>)}
        <div className="playhead" style={{left:`${duration ? Math.min(100,currentTime/duration*100):0}%`}} aria-hidden="true"><i/></div>
      </div>
      <label className="sr-only" htmlFor="timeline-scrub">Seek through the edit</label>
      <input id="timeline-scrub" className="timeline-scrub" type="range" min="0" max={duration} step="0.04" value={Math.min(currentTime,duration)} onChange={e=>onSeek(null,Number(e.target.value))}/>
      <div className="selected-shot"><span className="cut-number">{String(activeShot+1).padStart(2,'0')}</span><div><strong>{scene?.title || 'Selected moment'}</strong><p>{selected?.reason}</p><button onClick={()=>onOriginal(source,selected.start)}>{source?.name} · {timestamp(selected.start,true)}–{timestamp(selected.end,true)}<ArrowUpRight size={13}/></button></div><span className="shot-length">{selected && (selected.end-selected.start).toFixed(1)}s</span></div>
    </> : <div className="timeline-empty"><Film size={21}/><p>Your story’s shots will appear here, with their original frames.</p></div>}
  </section>;
}
