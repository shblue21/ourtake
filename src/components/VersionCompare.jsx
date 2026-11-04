import React, { useRef, useState } from 'react';
import { Play, Pause, RotateCcw, X } from 'lucide-react';
import { compareShots } from '../edit-diff';
import { shotImage, timestamp } from './Timeline';
import StoryComparison from './StoryComparison';
import { activeVersion } from '../studio-state';
export default function VersionCompare({ project, current, onClose, onRestore, busy }) {
  const candidates=project.versions.filter(v=>v.id!==current.id);
  const [beforeId,setBeforeId]=useState(current.parentId || candidates.at(-1)?.id);
  const before=candidates.find(v=>v.id===beforeId) || candidates[0];
  const a=useRef(),b=useRef(); const [playing,setPlaying]=useState(false); const [listen,setListen]=useState('selected');
  if(!before) return null;
  const diff=compareShots(before.plan.shots,current.plan.shots);
  const alreadyActive=before.id===activeVersion(project)?.id;
  function playBoth(){ if(playing){a.current.pause();b.current.pause();setPlaying(false);}else{a.current.currentTime=0;b.current.currentTime=0;Promise.all([a.current.play(),b.current.play()]).then(()=>setPlaying(true)).catch(()=>setPlaying(false));} }
  const changed=diff.shots.filter(s=>!s.unchanged).length;
  return <div className="modal-backdrop" onClick={onClose}><section className="compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title" onClick={e=>e.stopPropagation()}><header><div><span className="overline">Edit comparison</span><h2 id="compare-title">See what changed.</h2></div><button className="icon-button" aria-label="Close comparison" onClick={onClose}><X/></button></header>
    <p className="comparison-direction">Comparing <strong>{current.plan.title}</strong> with <strong>{before.plan.title}</strong>.</p>
    <div className="comparison-videos"><div><label>Compare with<select aria-label="Compare with edit" value={before.id} onChange={e=>{setBeforeId(e.target.value);setPlaying(false);a.current?.pause();b.current?.pause();}}>{candidates.map(v=><option key={v.id} value={v.id}>{v.plan.title} · {new Date(v.createdAt).toLocaleString('en-US')}</option>)}</select></label><video key={before.id} ref={a} src={before.url} controls muted={listen!=='before'} playsInline/><small>{timestamp(before.duration)} · {before.plan.shots.length} {before.plan.shots.length===1?'shot':'shots'}{alreadyActive?' · Active':''}</small></div><div><label>Selected edit<span>{current.plan.title}</span></label><video ref={b} src={current.url} controls muted={listen!=='selected'} playsInline onEnded={()=>setPlaying(false)}/><small>{timestamp(current.duration)} · {current.plan.shots.length} {current.plan.shots.length===1?'shot':'shots'}{current.id===activeVersion(project)?.id?' · Active':''}</small></div></div>
    <div className="compare-toolbar"><button className="outline-button" onClick={playBoth}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pause both':'Play both from start'}</button><label>Listen to<select aria-label="Comparison audio" value={listen} onChange={e=>setListen(e.target.value)}><option value="selected">Selected edit</option><option value="before">Comparison edit</option><option value="none">Mute both</option></select></label></div>
    <StoryComparison before={before} after={current}/><div className="diff-summary"><span><b>{changed}</b> {changed===1?'changed shot':'changed shots'}</span><span><b>{diff.shots.filter(s=>s.unchanged).length}</b> unchanged</span><span><b>{diff.removed.length}</b> removed</span><span><b>{diff.durationDelta>=0?'+':''}{diff.durationDelta.toFixed(1)}s</b> duration</span></div>
    <p className="muted">The separate speech track lasts {(before.plan.speech||[]).reduce((n,s)=>n+s.end-s.start,0).toFixed(1)}s in the comparison edit and {(current.plan.speech||[]).reduce((n,s)=>n+s.end-s.start,0).toFixed(1)}s in the selected edit. This excludes the clips' own audio. Use the Listen to menu to compare sound; the list below shows picture changes.</p><div className="diff-shots">{diff.shots.map(d=><div key={d.index} className={d.unchanged?'unchanged':'changed'}><img src={shotImage(project,current,d.index)} alt=""/><div><strong>Shot {d.index+1}</strong><p>{d.added?'Added':d.unchanged?'Unchanged':[d.moved?`Moved from ${d.oldIndex+1}`:null,d.trimmed?`Range changed (${d.delta>=0?'+':''}${d.delta.toFixed(1)}s)`:null].filter(Boolean).join(' · ')}</p></div></div>)}</div>
    {diff.removed.length>0&&<p className="muted">Shots only in the comparison edit: {diff.removed.map(s=>s.index+1).join(', ')}</p>}
    <footer><p>{alreadyActive?'The comparison edit is already current.':'Use the comparison edit as your current edit. All edits remain saved.'}</p><button className="primary-button" disabled={busy||alreadyActive} onClick={()=>onRestore(before.id)}><RotateCcw size={16}/>{alreadyActive?'Current edit':'Use comparison edit'}</button></footer>
  </section></div>;
}
