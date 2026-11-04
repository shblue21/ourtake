import React from 'react';
import { Play, Download, GitCompareArrows } from 'lucide-react';
import { shotImage, timestamp } from './Timeline';
import RevisionSummary from './RevisionSummary';

export default function SavedEdits({ project, selected, active, busy, onSelect, onRestore, onCompare, onReview }) {
  const others = project.versions.filter(v => v.id !== selected.id).reverse();
  if (!others.length) return null;
  return <details className="saved-edits">
    <summary>View other edits</summary>
    <div className="saved-edits-body">
      <button className="text-button" onClick={onCompare}><GitCompareArrows size={15}/>Compare with this edit</button>
      <RevisionSummary project={project} version={selected} onReview={onReview} onCompare={onCompare}/>
      <div className="saved-edit-list">{others.map(edit=><article key={edit.id}>
        <button className="saved-edit-preview" disabled={busy} onClick={()=>onSelect(edit.id)} aria-label={`Watch ${edit.plan.title}`}><img src={shotImage(project,edit,0)} alt=""/><Play size={20}/></button>
        <div><h3>{edit.plan.title}</h3>
          {edit.prompt&&<p className="saved-edit-request">{edit.prompt}</p>}
          <small>{timestamp(edit.duration)}{edit.id===active?.id?' · Current edit':''} · <time dateTime={edit.createdAt}>{new Date(edit.createdAt).toLocaleString('en-US')}</time></small>
          <div className="saved-edit-actions"><button className="text-button" disabled={busy||edit.id===active?.id} onClick={()=>onRestore(edit.id)}>{edit.id===active?.id?'Current edit':'Use this edit'}</button><a href={edit.download} aria-label={`Download ${edit.plan.title}`}><Download size={15}/></a></div>
        </div>
      </article>)}</div>
    </div>
  </details>;
}
