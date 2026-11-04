import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Plus, Upload, Film, Sparkles, Play, Check, LoaderCircle, Download, Settings2, X, FolderOpen, LockKeyhole, ChevronDown, RotateCcw, AlertCircle, Eye, Code2, GitCompareArrows, Volume2, Trash2 } from 'lucide-react';
import StoryOutline from './components/StoryOutline';
import Pipeline from './components/Pipeline';
import Timeline, { timestamp, shotImage } from './components/Timeline';
import VersionCompare from './components/VersionCompare';
import SavedEdits from './components/SavedEdits';
import { locateShot } from './edit-diff';
import { activeVersion, creationBlocker } from './studio-state';

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed. Please try again.');
  return data;
}
function Brand() { return <span className="brand"><span className="brand-mark"><i/><i/><i/></span>OurTake</span>; }

export default function App() {
  const [config,setConfig]=useState(null),[project,setProject]=useState(null),[mode,setMode]=useState('demo');
  const [job,setJob]=useState(null),[pending,setPending]=useState(false),[error,setError]=useState('');
  const [prompt,setPrompt]=useState(''),[target,setTarget]=useState(20),[audioMode,setAudioMode]=useState('balanced');
  const [versionId,setVersionId]=useState(null),[sourceId,setSourceId]=useState(null),[locked,setLocked]=useState([]),[newCut,setNewCut]=useState(false);
  const [currentTime,setCurrentTime]=useState(0),[activeShot,setActiveShot]=useState(0),[holding,setHolding]=useState(false),[holdAt,setHoldAt]=useState(0);
  const [settings,setSettings]=useState(false),[library,setLibrary]=useState(false),[evidence,setEvidence]=useState(false),[comparison,setComparison]=useState(false),[projects,setProjects]=useState([]);
  const [adjust,setAdjust]=useState(true),[drag,setDrag]=useState(false),[uploadProgress,setUploadProgress]=useState(null);
  const player=useRef(), originalPlayer=useRef(), input=useRef(), pendingSeek=useRef(null), resumeAfterHold=useRef(false), preview=useRef();
  const busy=pending||job?.status==='running';
  const sources=project?.sources||[],versions=project?.versions||[];
  const version=versions.find(v=>v.id===versionId)||versions.find(v=>v.id===project?.activeVersionId)||versions.at(-1);
  const active=activeVersion(project);
  const selectedSource=sources.find(s=>s.id===sourceId);
  const analyzed=project?.analysis?.mode===mode;
  const canRefine=Boolean(version&&version.mode===mode&&version.analysisAt===project?.analysis?.createdAt);
  const editing=canRefine&&!newCut;
  const createHint=locked.length&&!canRefine?'Unlock your kept shots before editing changed footage or switching models.':creationBlocker({busy,config,project,sourceCount:sources.length,prompt,editing});
  const selectedShot=version?.plan.shots[activeShot];
  const comparisonSource=sources.find(s=>s.id===selectedShot?.sourceId);
  const sceneList=version?.sceneSnapshot||project?.analysis?.sources.flatMap(a=>a.scenes)||[];
  const isExample=!sources.length&&!version;
  const playingUrl=selectedSource?.url||version?.url||'/demo/finished.mp4';

  function acceptProject(p,select=true){setProject(p);localStorage.setItem('ourtake-project',p.id);setJob(p.activeJob||null);if(select){setLocked([]);setVersionId(p.activeVersionId||p.versions.at(-1)?.id||null);setSourceId(null);setCurrentTime(0);setActiveShot(0);setLocked([]);setHolding(false);}}
  async function loadProject(pid,select=true){const p=await api(`/api/projects/${pid}`);acceptProject(p,select);return p;}
  useEffect(()=>{let live=true;(async()=>{try{
    const c=await api('/api/config');if(!live)return;setConfig(c);setMode(c.metaConfigured?'meta':c.basetenConfigured?'baseten':'demo');
    let p;const saved=localStorage.getItem('ourtake-project');if(saved){try{p=await api(`/api/projects/${saved}`);}catch{/* start fresh */}}
    if(!p)p=await api('/api/projects',{method:'POST',body:'{}'});if(live)acceptProject(p);
  }catch(e){if(live)setError(e.message);}})();return()=>{live=false;};},[]);
  useEffect(()=>{if(!job||job.status!=='running')return;let stopped=false,timer;
    const poll=async()=>{try{const next=await api(`/api/jobs/${job.id}`);if(stopped)return;
      if(next.status==='done'){await loadProject(next.projectId);setNewCut(false);setJob(null);}
      else if(next.status==='error'){await loadProject(next.projectId,false);setJob(next);setError(next.message);}
      else{setJob(next);timer=setTimeout(poll,700);}
    }catch(e){if(!stopped){setError(e.message);setJob(null);}}};timer=setTimeout(poll,400);return()=>{stopped=true;clearTimeout(timer);};
  },[job?.id,job?.status]);
  const modalOpen=settings||library||evidence||comparison;
  useEffect(()=>{if(!modalOpen)return;const before=document.activeElement;
    const focus=()=>document.querySelector('[role="dialog"] button')?.focus();const timer=setTimeout(focus,0);
    const key=e=>{if(e.key==='Escape'){setSettings(false);setLibrary(false);setEvidence(false);setComparison(false);}
      if(e.key==='Tab'){const els=[...document.querySelectorAll('[role="dialog"] button:not(:disabled),[role="dialog"] a,[role="dialog"] select,[role="dialog"] input')].filter(el=>el.getClientRects().length);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',key);return()=>{clearTimeout(timer);document.removeEventListener('keydown',key);before?.focus();};
  },[modalOpen]);

  async function perform(action){if(busy)return;setPending(true);setError('');try{await action();}catch(e){setError(e.message);}finally{setPending(false);}}
  async function newProject(){await perform(async()=>{const p=await api('/api/projects',{method:'POST',body:'{}'});acceptProject(p);setPrompt('');setNewCut(false);setLibrary(false);setAdjust(true);});}
  async function openExample(){await perform(async()=>{let p=project;if(!p||p.sources.length){p=await api('/api/projects',{method:'POST',body:'{}'});acceptProject(p);}setMode('demo');setPrompt('Make a calm visual postcard. Let the water set the pace.');setJob(await api(`/api/projects/${p.id}/sample`,{method:'POST',body:'{}'}));setAdjust(true);});}
  function upload(files){if(!files?.length||busy||!project)return;perform(async()=>{
    const form=new FormData();[...files].forEach(f=>form.append('videos',f));setUploadProgress(0);
    try{const result=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',`/api/projects/${project.id}/upload`);xhr.responseType='json';xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploadProgress(Math.round(e.loaded/e.total*100));};xhr.onload=()=>xhr.status<300?resolve(xhr.response):reject(new Error(xhr.response?.error||'Upload failed. Please try again.'));xhr.onerror=()=>reject(new Error('Upload connection lost. Please try again.'));xhr.send(form);});setJob(result);setNewCut(true);}finally{setUploadProgress(null);if(input.current)input.current.value='';}
  });}
  function generate(){perform(async()=>{setJob(await api(`/api/projects/${project.id}/edit`,{method:'POST',body:JSON.stringify({mode,prompt,target,audioMode,baseVersionId:version?.id||null,editKind:editing?'refine':'perspective',locked})}));});}
  function selectVersion(id){setVersionId(id);setSourceId(null);setCurrentTime(0);setActiveShot(0);setLocked([]);setNewCut(false);setHolding(false);}
  async function restore(id){await perform(async()=>{const p=await api(`/api/projects/${project.id}/restore`,{method:'POST',body:JSON.stringify({versionId:id})});acceptProject(p);setComparison(false);setNewCut(false);});}
  function seekShot(index,time){if(!version)return;const position=index===null?time:version.plan.shots.slice(0,index).reduce((n,s)=>n+s.end-s.start,0);pendingSeek.current={time:position,play:true};setHolding(false);
    if(selectedSource)setSourceId(null);else if(player.current?.readyState>=1){player.current.currentTime=position;player.current.play().catch(()=>{});pendingSeek.current=null;}
    setCurrentTime(position);const loc=locateShot(version.plan.shots,position);if(loc)setActiveShot(loc.index);
  }
  function openOriginal(source,time=0){if(!source)return;setHolding(false);setEvidence(false);pendingSeek.current={time,play:false};if(sourceId===source.id&&player.current){player.current.currentTime=time;pendingSeek.current=null;}setSourceId(source.id);preview.current?.scrollIntoView({behavior:'smooth',block:'center'});}
  function loaded(){if(pendingSeek.current&&player.current){player.current.currentTime=pendingSeek.current.time;if(pendingSeek.current.play)player.current.play().catch(()=>{});pendingSeek.current=null;}}
  function updateTime(e){if(selectedSource||!version||holding)return;setCurrentTime(e.currentTarget.currentTime);const loc=locateShot(version.plan.shots,e.currentTarget.currentTime);if(loc)setActiveShot(loc.index);}
  function beginHold(){if(!version||selectedSource||!player.current)return;resumeAfterHold.current=!player.current.paused;const at=player.current.currentTime;player.current.pause();const loc=locateShot(version.plan.shots,at);if(loc){setActiveShot(loc.index);setHoldAt(version.plan.shots[loc.index].start+loc.offset);}setHolding(true);}
  function endHold(){setHolding(false);if(resumeAfterHold.current)player.current?.play().catch(()=>{});resumeAfterHold.current=false;}
  function openComparison(){player.current?.pause();setComparison(true);}
  async function openLibrary(){setLibrary(true);try{setProjects(await api('/api/projects'));}catch(e){setError(e.message);}}

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to studio</a>
    <header className="topbar"><a href="#main" aria-label="OurTake studio"><Brand/></a><nav aria-label="Main"><a className="active" href="#main">Studio</a><button onClick={openExample} disabled={busy||!project}>Example film</button><button onClick={openLibrary}>My stories</button><button className="outline-button compact" onClick={()=>setSettings(true)}><Settings2 size={15}/>Settings</button></nav></header>
    <main id="main">
      {error&&<div className="alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={17}/></button></div>}
      {config&&!config.ffmpegReady&&<div className="alert" role="alert">FFmpeg is not available. Check the installation instructions before making an edit.</div>}
      <div className="studio-layout">
        <section className="stage-column" aria-label="Film preview" ref={preview}>
          <div className="stage-frame">
            <video ref={player} key={playingUrl} src={playingUrl} poster={isExample?'/demo/poster.jpg':undefined} controls playsInline preload="metadata" onLoadedMetadata={loaded} onTimeUpdate={updateTime}/>
            {holding&&comparisonSource&&<video className="original-overlay" ref={originalPlayer} key={comparisonSource.id} src={comparisonSource.url} muted playsInline onLoadedMetadata={e=>{e.currentTarget.currentTime=holdAt;}}/>}
            <div className="stage-label"><span className="status-dot"/>{holding?'Original moment':selectedSource?'Original footage':version?'Edited film':'Example film'}{(isExample||version?.mode==='demo')&&<span className="sample-label">CURATED / SAMPLE</span>}</div>
            {version&&!selectedSource&&<button className="inspect-pill" onClick={()=>setEvidence(true)}><Code2 size={15}/>Inside the edit</button>}
            {version&&!selectedSource&&!busy&&<button className="hold-compare" aria-pressed={holding} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);beginHold();}} onPointerUp={endHold} onPointerCancel={endHold} onLostPointerCapture={endHold} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();beginHold();}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();endHold();}}} onBlur={endHold}><Eye size={15}/>{holding?'Original footage':'Hold to see the original'}</button>}
            {busy&&<div className="stage-processing"><LoaderCircle size={18} className="spin"/><span>{uploadProgress!==null?'Uploading footage':job?.message||'Preparing your story'}</span></div>}
          </div>
          <div className="shelf-ledge"/>
          <div className="stage-caption"><p>{isExample?'A little room to breathe':selectedSource?selectedSource.name:version?.plan.title||'Your footage is ready to edit.'}</p><span>{selectedSource?timestamp(selectedSource.duration):version?`${timestamp(version.duration)} · 720p`:'00:15 · 720p'}</span></div>
          {version&&version.id!==active?.id&&<div className="version-context" aria-label="Edit status"><span>You are viewing a saved edit. Changes apply to this edit.</span><button className="text-button" disabled={busy} onClick={()=>selectVersion(active.id)}>Back to current edit</button><button className="text-button" disabled={busy} onClick={()=>restore(version.id)}>Use this edit<RotateCcw size={12}/></button></div>}
          {version&&<StoryOutline project={project} version={version} onSeek={seekShot} onOriginal={openOriginal}/>}
          {(isExample||project?.sampleNotice)&&<p className="sample-disclosure">Real CC0 footage from separate places. A curated example, not AI output. <a href="/demo/credits.html" target="_blank" rel="noreferrer">Footage credits <ArrowUpRight size={11}/></a></p>}
          {selectedSource&&version&&<button className="text-button" onClick={()=>{pendingSeek.current={time:currentTime,play:false};setSourceId(null);}}><ArrowRight size={14}/>Back to the edit</button>}
          {isExample&&<button className="primary-button example-cta" disabled={busy||!project} onClick={openExample}><Play size={16}/>Explore this example<ArrowRight size={16}/></button>}
          {version&&<Timeline project={project} version={version} currentTime={currentTime} activeShot={activeShot} locked={locked} busy={busy||!canRefine} onSeek={seekShot} onLock={i=>setLocked(xs=>xs.includes(i)?xs.filter(x=>x!==i):[...xs,i])} onOriginal={openOriginal}/>}
        </section>

        <section className="direction-column" aria-label="Story direction">
          <div className="project-title"><h1>{version?.plan.title||(sources.length?project.name:'Make a story from your clips.')}</h1><button className="outline-button compact" disabled={busy||!project} onClick={newProject}><Plus size={14}/>New story</button></div>
          <button className="mode-status" onClick={()=>setSettings(true)}><span className={`status-dot ${mode!=='demo'?'green':''}`}/>{mode==='baseten'?'Meta model via Baseten':mode==='meta'?'Meta direct · AI editing':isExample?'Curated example · no API calls':'Sample mode · preset edits'}<ChevronDown size={12}/></button>
          <Pipeline job={job} hasSources={!!sources.length} analyzed={analyzed} ready={!!version} uploadProgress={uploadProgress}/>

          <div className="footage-input" onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);upload(e.dataTransfer.files);}}>
            <input ref={input} type="file" hidden multiple accept="video/*,.mkv,.avi" onChange={e=>upload(e.target.files)}/>
            <button className={`upload-button ${drag?'drag':''}`} disabled={busy||!project||sources.length>=8} onClick={()=>input.current?.click()}><Upload size={19}/><span><strong>{sources.length?'Add another perspective':'Bring your own footage'}</strong><small>Drop clips here, or browse · up to 8 files</small></span><Plus size={17}/></button>
          </div>

          <section className="adjust-panel" aria-label="Adjust your story"><button className="adjust-heading" aria-expanded={adjust} aria-controls="adjust-body" onClick={()=>setAdjust(v=>!v)}><span><strong>{editing?'Adjust this edit':'Shape your story'}</strong><small>Choose what to include and how the story unfolds.</small></span><ChevronDown size={17} className={adjust?'rotated':''}/></button>
            {adjust&&<div id="adjust-body" className="adjust-body">
              {version&&<div className="segmented" aria-label="Editing mode"><button disabled={!canRefine||busy} className={editing?'selected':''} aria-pressed={editing} onClick={()=>setNewCut(false)}>Refine this edit</button><button disabled={busy} className={!editing?'selected':''} aria-pressed={!editing} onClick={()=>setNewCut(true)}>Change perspective</button></div>}
              <label className="field-label" htmlFor="story-prompt">{editing?'What would you change?':'Describe the story'}</label>
              <p className="field-help">{editing?'Keep what works in this edit; tell us what to change.':'Whose story do you want to tell, or what would you like to focus on? We will use only what your footage supports.'}</p>
              <textarea id="story-prompt" value={prompt} maxLength={3000} disabled={busy} aria-describedby="prompt-example create-guidance" onChange={e=>setPrompt(e.target.value)} placeholder={editing?'Write your change here…':'Write your story brief here…'}/>
              <p id="prompt-example" className="prompt-example"><strong>Example:</strong> {editing?'“Make the last shot shorter. Keep the opening.”':'“A warm film about the friends who made this moment happen.”'}</p>
              <div className="brief-presets"><button disabled={busy} onClick={()=>setPrompt(project?.sampleNotice?'Focus on the main moment. Start close to the water, then open up the horizon.':'Make the main character the focus of the story.')}><Sparkles size={12}/>The main moment</button><button disabled={busy} onClick={()=>setPrompt(project?.sampleNotice?'Focus on the preparation: start with the wide shoreline, then notice the details.':'Tell the story of the preparation and the people behind it, using only moments this footage actually shows.')}><Film size={12}/>Behind the moment</button></div>
              <div className="control-row"><label htmlFor="duration">Target length</label><select id="duration" value={target} disabled={busy} onChange={e=>setTarget(Number(e.target.value))}><option value={15}>About 15 seconds</option><option value={20}>About 20 seconds</option><option value={30}>About 30 seconds</option><option value={60}>About a minute</option><option value={120}>About two minutes</option></select></div>
              <label className="toggle-row"><span><strong><Volume2 size={15}/>Balance the sound</strong><small>Level out loudness and soften the audio at cuts.</small></span><input type="checkbox" checked={audioMode==='balanced'} disabled={busy} onChange={e=>setAudioMode(e.target.checked?'balanced':'original')}/><i aria-hidden="true"/></label>
              {locked.length>0&&<div className="lock-notice"><LockKeyhole size={13}/>{locked.length} {locked.length===1?'shot stays':'shots stay'} exactly as {locked.length===1?'it is':'they are'}. <button className="text-button" disabled={busy} onClick={()=>setLocked([])}>Unlock these shots</button></div>}
              <button className="primary-button create-button" disabled={Boolean(createHint)} aria-describedby="create-guidance" onClick={generate}>{busy?<LoaderCircle className="spin" size={17}/>:<Sparkles size={17}/>}<span>{busy?'Working on your story':editing?'Apply changes':'Make my story'}</span><ArrowRight size={17}/></button>
              <p id="create-guidance" className="create-guidance" role="status" aria-live="polite">{createHint||(editing?'Ready to edit this film.':'Ready to create your story.')}</p>
              <p className="creation-note">{mode==='baseten'?'Preview video and extracted audio are sent to Baseten.':mode==='meta'?'Meta receives video previews and speech audio for analysis and edit planning.':'Sample mode needs no API key. It uses preset editing rules instead of AI analysis.'}</p>
            </div>}
          </section>

          {version&&<>
            <div className="delivery-row"><a className="primary-button" href={version.download}><Download size={17}/>Download film</a></div>
            <SavedEdits key={project.id} project={project} selected={version} active={active} busy={busy} onSelect={id=>{selectVersion(id);preview.current?.scrollIntoView({behavior:'smooth',block:'start'});}} onRestore={restore} onCompare={openComparison} onReview={i=>{seekShot(i);preview.current?.scrollIntoView({behavior:'smooth',block:'start'});}}/>
            {version.prompt&&<details className="story-notes"><summary>Your request for this edit</summary><p>{version.prompt}</p></details>}
          </>}
        </section>
      </div>

      <section className="footage-shelf" aria-label="Source footage"><div className="section-title"><div><h2>The footage <span>{sources.length?`${sources.length} original ${sources.length===1?'clip':'clips'}`:'a few different perspectives'}</span></h2><p>Open a clip to see what went into the story.</p></div>{sources.length>0&&<button className="outline-button" disabled={busy||sources.length>=8} onClick={()=>input.current?.click()}><Plus size={15}/>Add footage</button>}</div>
        <div className="source-shelf-row">{sources.length?sources.map((s,i)=><article className={`source-tile ${sourceId===s.id?'selected':''}`} key={s.id}><button onClick={()=>openOriginal(s)} aria-label={`Open original ${i+1}: ${s.name}`}><img src={s.thumbnail} alt={s.name}/><span className="tile-play"><Play size={21}/></span><b>0{i+1}</b><small>{timestamp(s.duration)}</small></button><div><strong>{s.name}</strong><span>{s.width} × {s.height} · {analyzed?`${project.analysis.sources.find(a=>a.sourceId===s.id)?.scenes.length||0} ${project.analysis.sources.find(a=>a.sourceId===s.id)?.scenes.length===1?'scene':'scenes'}`:'Ready'}</span></div></article>):['shore','lake','tide'].map((name,i)=><article className="source-tile" key={name}><button onClick={openExample} disabled={busy||!project} aria-label={`Explore sample clip ${i+1}`}><img src={`/demo/${name}.jpg`} alt={['Rhode Island shoreline','Waves at Pangong lake','Tide at Wangerooge'][i]}/><span className="tile-play"><Play size={21}/></span><b>0{i+1}</b></button><div><strong>{['The shoreline','The details','The tide'][i]}</strong><span>CC0 footage · curated example</span></div></article>)}</div><div className="shelf-ledge"/>
      </section>


      <footer className="page-footer"><Brand/><p>Everyone’s footage. The story you want to tell.</p><span><LockKeyhole size={12}/>Saved on this computer</span></footer>
    </main>

    {comparison&&version&&<VersionCompare project={project} current={version} onClose={()=>setComparison(false)} onRestore={restore} busy={busy}/>}
    {evidence&&version&&<div className="drawer-backdrop" onClick={()=>setEvidence(false)}><aside className="inspection-drawer" role="dialog" aria-modal="true" aria-labelledby="inspect-title" onClick={e=>e.stopPropagation()}><header><span className="overline">Inside the edit</span><button className="icon-button" aria-label="Close inspection" onClick={()=>setEvidence(false)}><X/></button></header><h2 id="inspect-title">Check the original footage.</h2><p className="muted">{version.mode==='demo'?'These are curated or rule-based selections, not AI analysis.':'AI wrote these selection notes. Check them against the original clips.'}</p>{version.plan.shots.map((s,i)=>{const source=sources.find(x=>x.id===s.sourceId);return <article className="evidence-shot" key={i}><button onClick={()=>openOriginal(source,s.start)}><img src={shotImage(project,version,i)} alt=""/><span>0{i+1}<ArrowUpRight size={15}/></span></button><div><strong>{sceneList.find(x=>x.id===s.sceneId)?.title||`Shot ${i+1}`}</strong><p>{s.reason}</p><small>{source?.name}<br/>{timestamp(s.start,true)} → {timestamp(s.end,true)}</small></div></article>;})}{(version.plan.speech||[]).map((s,i)=><div className="connection" key={'speech-'+i}><strong>Spoken story · {timestamp(s.timelineStart,true)}–{timestamp(s.timelineStart+s.end-s.start,true)}</strong><p>{s.text}</p><button className="text-button" onClick={()=>openOriginal(sources.find(x=>x.id===s.sourceId),s.start)}>Hear source · {timestamp(s.start,true)}–{timestamp(s.end,true)}</button><small>This is an automatic transcript. Check the words and the start and end of each speech segment against the original clip.</small></div>)}{version.plan.connections.map((c,i)=><div className="connection" key={i}><strong>Scene connection</strong><p>{c.observation}</p><small>{c.uncertainty}</small></div>)}</aside></div>}
    {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()}><header><span className="overline">Studio settings</span><button className="icon-button" aria-label="Close settings" onClick={()=>setSettings(false)}><X/></button></header><h2 id="settings-title">Choose an editing mode.</h2><p className="muted">Your API key stays on the server and is never sent to your browser.</p><button className={`mode-option ${mode==='demo'?'selected':''}`} disabled={busy} onClick={()=>{setMode('demo');setLocked([]);setSettings(false);}}><Film size={21}/><span><strong>Sample mode</strong><small>Real video exports with predefined editing rules.</small></span>{mode==='demo'&&<Check size={17}/>}</button><button className={`mode-option ${mode==='meta'?'selected':''}`} disabled={busy||!config?.metaConfigured} onClick={()=>{setMode('meta');setLocked([]);setSettings(false);}}><Sparkles size={21}/><span><strong>Meta direct · {config?.metaConfigured?'key configured':'key required'}</strong><small>{config?.model} · understand footage and direction.</small></span>{mode==='meta'&&<Check size={17}/>}</button><button className={`mode-option ${mode==='baseten'?'selected':''}`} disabled={busy||!config?.basetenConfigured} onClick={()=>{setMode('baseten');setLocked([]);setSettings(false);}}><Sparkles size={21}/><span><strong>Baseten · {config?.basetenConfigured?'key configured':'key required'}</strong><small>{config?.basetenModel} · Meta model, hosted by Baseten.</small></span>{mode==='baseten'&&<Check size={17}/>}</button><div className="setup"><h3>Connect a provider</h3><ol><li>Open <code>.env</code> in the project folder.</li><li>For Meta direct, set <code>MODEL_API_KEY</code>. For Baseten, set <code>BASETEN_API_KEY</code>.</li><li>Restart the server, refresh this page, and choose a provider.</li></ol><p>Meta direct uploads preview copies with a one-hour expiry and requests deletion after processing. Baseten receives preview videos and extracted audio directly in the request, without publishing a media URL. Baseten mode supports clips up to 5 minutes and 50 MiB of combined preview media.</p><p>Changing providers starts a new analysis and edit. Your saved versions stay available. A configured key may still lack model access. Check the results with your own footage.</p></div></section></div>}
    {library&&<div className="modal-backdrop" onClick={()=>setLibrary(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="library-title" onClick={e=>e.stopPropagation()}><header><span className="overline">Your collection</span><button className="icon-button" aria-label="Close stories" onClick={()=>setLibrary(false)}><X/></button></header><h2 id="library-title">My stories</h2><button className="primary-button" disabled={busy} onClick={newProject}><Plus size={17}/>Start a new story</button><div className="project-list">{projects.map(p=><div key={p.id}><button disabled={busy} onClick={()=>perform(async()=>{await loadProject(p.id);setLibrary(false);setPrompt('');})}><Film size={19}/><span><strong>{p.name}</strong><small>{p.count} {p.count===1?'clip':'clips'} · {new Date(p.updatedAt).toLocaleDateString('en-US')}</small></span><ArrowUpRight size={16}/></button><button className="icon-button" disabled={busy} aria-label={`Delete ${p.name}`} onClick={()=>{if(confirm(`Delete all footage and edits for “${p.name}” from this computer?`))perform(async()=>{await api(`/api/projects/${p.id}`,{method:'DELETE'});if(p.id===project.id){acceptProject(await api('/api/projects',{method:'POST',body:'{}'}));setPrompt('');}setProjects(await api('/api/projects'));});}}><Trash2 size={16}/></button></div>)}</div></section></div>}
  </div>;
}
