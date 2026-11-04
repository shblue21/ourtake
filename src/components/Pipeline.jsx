import React from 'react';
import { Upload, ScanEye, Sparkles, ShieldCheck, Scissors, Download, Check, LoaderCircle, X } from 'lucide-react';
const steps = [
  ['import', 'Upload', Upload], ['analyze', 'Analyze', ScanEye], ['plan', 'Plan', Sparkles],
  ['check', 'Check', ShieldCheck], ['render', 'Edit', Scissors], ['export', 'Export', Download]
];
export default function Pipeline({ job, hasSources, analyzed, ready, uploadProgress }) {
  const running = job?.status === 'running' || uploadProgress !== null;
  const failed = job?.status === 'error';
  const at = uploadProgress !== null ? 0 : Math.max(0, steps.findIndex(s => s[0] === job?.stage));
  const completed = running || failed ? at : ready ? 6 : analyzed ? 2 : hasSources ? 1 : 0;
  const note = uploadProgress !== null ? `Uploading footage · ${uploadProgress}%` : running || failed ? job?.message || 'Preparing your footage' : ready ? 'Your film is ready to watch or edit.' : hasSources ? 'Describe the story you want to tell.' : 'Start with your clips, or open the example.';
  return <section className={`pipeline ${ready && !running ? 'finished' : ''}`} aria-label="Editing progress">
    <ol>{steps.map(([key, label, Icon], i) => {
      const status = i < completed ? 'done' : (running || failed) && i === at ? failed ? 'failed' : 'active' : 'waiting';
      const Glyph = status === 'done' ? Check : status === 'failed' ? X : Icon;
      return <li key={key} className={status} aria-current={status === 'active' ? 'step' : undefined}><span className="pipeline-circle"><Glyph size={18}/></span><span>{label}</span><span className="sr-only">: {status}</span></li>;
    })}</ol>
    <p role="status" aria-live="polite">{running && <LoaderCircle size={13} className="spin"/>}{note}</p>
    {running && <div className="pipeline-meter" aria-hidden="true"><i style={{width:`${uploadProgress ?? job?.progress ?? 3}%`}}/></div>}
  </section>;
}
