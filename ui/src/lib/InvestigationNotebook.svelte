<script>
  import {tick,untrack} from 'svelte';
  import {createNotebookSession,appendFindingDraft,evidenceHref,normalizeDraftTarget} from './investigationNotebook.js';
  import {reviewDrafts} from './reviewDrafts.js';
  import MarkdownComposer from './MarkdownComposer.svelte';
  let {repo,number,currentHead,currentBase,question=null,checkpoint=null,anchor=null,top=145,onInspect,onResume,onSubmitDraft,pendingReviewsEnabled=false,pendingReview=null,pendingReviewStale=false}=$props();
  let storageError=$state(''),draftError=$state(''),open=$state(false),draftTarget=$state(null),noteInput=$state(null);
  let returnFocus;
  const key=untrack(()=>`prview:findings:v1:${repo}#${number}`);
  const session=createNotebookSession({key,storage:localStorage,onError:message=>storageError=message});
  let snapshot=$state(session.actor.getSnapshot());
  const subscription=session.actor.subscribe(next=>snapshot=next);
  $effect(()=>()=>{subscription.unsubscribe();session.dispose();});
  $effect(()=>{const update=event=>{if(event.key===key || event.key?.startsWith(`${key}:`))session.refresh();};window.addEventListener('storage',update);return()=>window.removeEventListener('storage',update);});
  const selected=$derived(snapshot.context.items.find(item=>item.id===snapshot.context.selected));
  function send(event){session.command(event);}
  function show(){if(!open)returnFocus=document.activeElement;open=true;}
  function close(){draftTarget=null;open=false;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
  export async function jot() {
    const before=snapshot.context.selected;
    show();send({type:'CREATE',question:question?.title ?? 'Review',investigationId:question?.id,target:anchor});
    await tick();if(snapshot.context.selected!==before)noteInput?.focus();
  }
  function ensureFinding(){if(!selected)send({type:'CREATE',question:question?.title ?? 'Review',investigationId:question?.id,target:anchor});}
  export function addFinding(body,evidence=[],origin=question,target=anchor){const before=snapshot.context.selected;show();send({type:'CREATE',question:origin?.title ?? 'Review',investigationId:origin?.id,target});if(snapshot.context.selected===before)return;send({type:'EDIT',body});for(const item of evidence)if(item)send({type:'EVIDENCE',evidence:item});}
  export function saveEvidence(evidence){show();if(!evidence){draftError='Wait for loaded source before saving its evidence.';return;}draftError='';ensureFinding();send({type:'EVIDENCE',evidence});}
  export function saveCheckpoint(){show();ensureFinding();if(checkpoint)send({type:'CHECKPOINT',checkpoint});}
  async function prepareDraft() {
    const target=normalizeDraftTarget(selected?.target);
    if(!target){draftError='This finding needs a changed review location before it can become an inline draft.';return;}
    draftError=reviewDrafts.write(target,appendFindingDraft(reviewDrafts.read(target),selected));
    draftTarget={...target};await tick();
  }
  $effect(()=>{
    if(!open)return;
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(draftTarget)draftTarget=null;else close();}};
    window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);
  });
</script>
<div class="notebook-launch"><button onclick={()=>open ? close() : show()}>Findings ({snapshot.context.items.length})</button><button onclick={jot}>Jot</button></div>
{#if open}
<aside class="findings-drawer" data-code-overlay aria-label="Private findings" style:top={`${top}px`}>
  <header><strong>Findings</strong><span>Private · this browser</span><button aria-label="Close findings" onclick={close}>×</button></header>
  {#if storageError}<p role="alert">{storageError} <button onclick={()=>session.retry()}>Retry autosave</button></p>{/if}
  {#if draftError}<p role="alert">{draftError}</p>{/if}
  {#if snapshot.context.notice}<p role="status">{snapshot.context.notice}</p>{/if}
  <div class="findings-list" aria-label="Saved findings">{#each [...snapshot.context.items].reverse() as item}<button class:selected={selected?.id===item.id} onclick={()=>{draftTarget=null;draftError='';send({type:'SELECT',id:item.id});}} title={item.question}>{item.body.split('\n')[0].slice(0,80) || `Evidence · ${item.question || 'Review'}`}</button>{/each}</div>
  {#if selected}
    <div class="finding-editor">
      <small>From {selected.question || 'Review'} · {new Date(selected.createdAt).toLocaleDateString()}</small>
      <textarea aria-label="Private finding note" bind:this={noteInput} maxlength="50000" placeholder="Jot an observation or question…" value={selected.body} oninput={event=>send({type:'EDIT',body:event.currentTarget.value})}></textarea>
      <label>Optional label <select aria-label="Finding label" value={selected.label} onchange={event=>send({type:'LABEL',label:event.currentTarget.value})}><option value="">None</option><option>Question</option><option>Observation</option><option>Concern</option></select></label>
      <div class="evidence-list">{#each selected.evidence as evidence}<article><button class="evidence-link" onclick={()=>{onInspect?.(evidence);close();}}>{evidence.file}:{evidence.line}{evidence.endLine>evidence.line ? `–${evidence.endLine}` : ''}</button><small>{evidence.rev.slice(0,7)} · {evidence.rev===currentHead ? 'Current head' : evidence.rev===currentBase ? 'Original' : 'Earlier revision'}</small>{#if evidence.excerpt}<pre>{evidence.excerpt}</pre>{/if}{#if evidence.truncated}<small>Excerpt shortened</small>{/if}<a href={evidenceHref(evidence)} target="_blank" rel="noopener noreferrer">Pinned source on GitHub ↗</a></article>{/each}</div>
      <div class="finding-actions"><button disabled={!checkpoint} onclick={saveCheckpoint}>Save checkpoint</button>{#if selected.checkpoint}<button onclick={()=>onResume?.(selected.checkpoint)}>Resume investigation</button>{/if}</div>
      {#if selected.target}<small>Draft anchor: {selected.target.path}:{selected.target.line} · {selected.target.headSha.slice(0,7)}{selected.target.headSha!==currentHead ? ' · Earlier revision' : ''}</small>{/if}
      <button disabled={!selected.target || !(selected.body.trim() || selected.evidence.length)} onclick={prepareDraft}>Prepare review draft</button>
      <small>Notes stay private. Preparing a draft preserves existing comment text; publication is a separate action.</small>
      {#if draftTarget}<section class="finding-draft" aria-label="Prepared review draft">{#key JSON.stringify(draftTarget)}<MarkdownComposer target={draftTarget} {currentHead} {pendingReviewsEnabled} {pendingReview} {pendingReviewStale} onSubmit={onSubmitDraft} onClose={()=>draftTarget=null} />{/key}</section>{/if}
    </div>
  {:else}<p>Jot a note or save code evidence from an investigation.</p>{/if}
</aside>
{/if}
<style>
  .notebook-launch{display:inline-flex;gap:5px;margin-left:auto;}button,select{color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:5px;padding:5px 8px;font:inherit;cursor:pointer;}button:disabled{opacity:.4;cursor:default;}button:focus-visible,a:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--link);}
  .findings-drawer{position:fixed;z-index:100;right:8px;bottom:38px;width:min(390px,calc(100vw - 24px));display:flex;flex-direction:column;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-dialog);font:12px/1.5 system-ui;color:var(--text);}
  header{display:flex;align-items:center;gap:8px;padding:10px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--panel);z-index:1;}header span{flex:1;color:var(--text-dim);font-size:10px;}header button{border:0;font-size:17px;padding:0 4px;}
  .findings-list{max-height:145px;flex-shrink:0;overflow:auto;border-bottom:1px solid var(--border);}.findings-list button{display:block;text-align:left;width:100%;border:0;border-radius:0;padding:7px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.findings-list button.selected{background:var(--bg-hover);color:var(--link);}
  .finding-editor{display:flex;flex-direction:column;gap:9px;padding:10px;}small{font-size:10px;color:var(--text-dim);overflow-wrap:anywhere;}textarea{resize:vertical;min-height:125px;width:100%;box-sizing:border-box;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:8px;font:12px/1.5 system-ui;}label{display:flex;align-items:center;gap:7px;color:var(--text-dim);font-size:11px;}
  article{border-top:1px solid var(--border);padding:8px 0;}article small{display:block;}.evidence-link{text-align:left;color:var(--link);border:0;background:transparent;padding:0;overflow-wrap:anywhere;font:11px/1.5 monospace;}pre{max-height:110px;overflow:auto;white-space:pre;font:10px/1.6 monospace;background:var(--bg);padding:5px;}a{color:var(--link);font-size:10px;}.finding-actions{display:flex;gap:5px;flex-wrap:wrap;}p{padding:8px;margin:0;color:var(--text-dim);}.finding-draft{border-top:1px solid var(--border);padding-top:8px;}
</style>
