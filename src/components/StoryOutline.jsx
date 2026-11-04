import React from 'react';
import { Play, ArrowUpRight } from 'lucide-react';
import { timestamp } from './Timeline';

export default function StoryOutline({ project, version, onSeek, onOriginal }) {
  const story = version?.plan.story;
  if (!story) return null;
  const scenes = version.sceneSnapshot || [];
  return <section className="story-outline" aria-label="Story perspective">
    <span className="overline">Story outline</span>
    <h2>{story.focus.label}</h2><p>{story.premise}</p>
    <ol>{story.beats.map(beat => {
      const index = version.plan.shots.findIndex(s => s.beatId === beat.id);
      const evidence = scenes.filter(s => beat.sceneIds.includes(s.id));
      const sourceCount = new Set(evidence.map(s=>s.sourceId)).size;
      const shotCount = version.plan.shots.filter(s=>s.beatId===beat.id).length;
      return <li key={beat.id}><button className="story-beat" onClick={()=>onSeek(index)}><Play size={14}/><span>{beat.purpose}<small>{sourceCount} source {sourceCount===1?'clip':'clips'} · {shotCount} {shotCount===1?'shot':'shots'}</small></span></button>
        <details><summary>See the source clips</summary>{evidence.map(scene=><button className="text-button" key={scene.id} onClick={()=>onOriginal(project.sources.find(s=>s.id===scene.sourceId),scene.start)}>{scene.title} · {timestamp(scene.start,true)}–{timestamp(scene.end,true)}<ArrowUpRight size={12}/></button>)}</details>
      </li>;
    })}</ol>
    {story.missingEvidence.length>0&&<div className="story-gaps"><strong>What's missing or uncertain</strong><ul>{story.missingEvidence.map((gap,i)=><li key={i}>{gap}</li>)}</ul></div>}
    <small className="muted">AI wrote this outline. Use the original clips to check the details.</small>
  </section>;
}
