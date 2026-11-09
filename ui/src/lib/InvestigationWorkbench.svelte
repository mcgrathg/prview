<script>
  import { tick, untrack } from 'svelte';
  import {isPromptDialogOpen} from './dom.js';
  import {theme} from './theme.svelte.js';
  import { createInvestigationSession } from './investigationSession.js';
  import { symbolDestination } from './symbolContext.js';
  import { sourceLocation } from './investigationState.js';
  import {discoveryEvidence} from './repositoryNeighborhood.js';
  import { repoDefinition,repoFile } from './api.js';
  import {repositoryCommand} from './repositoryBrowserState.js';
  import {createRepositoryResearch} from './repositoryResearch.js';
  import RepositoryNavigator from './RepositoryNavigator.svelte';
  import InvestigationConversation from './InvestigationConversation.svelte';
  import InvestigationNotebook from './InvestigationNotebook.svelte';
  import {investigationSnapshot} from './investigationState.js';
  import WorkspaceSource from './WorkspaceSource.svelte';
  let { repo, number, headRef, review, restored = null, onRoute, onReviewDefinition = null, currentHead, currentBase, changedPaths=[], pendingReviewsEnabled=false, pendingReview=null, pendingReviewStale=false, onSubmitDraft } = $props();
  const key = `prview:investigations:v1:${repo}#${number}`;
  let storageError = $state(''), commandError = $state(''), titleInput, tabs, reviewButton, mainRegion, originFocus, returnFocus;
  let overlayTop = $state(145);
  let notebook, mainSource, previewSource, navigator;
  let conversationOpen=$state(false);
  const researchLookup=createRepositoryResearch({repo,headRef});
  let pinnedSources=$state([]);
  const session = createInvestigationSession({key,storage:localStorage,initial:untrack(()=>restored),
    lookup: ({request,signal}) => {
      if(request.kind!=='definition')return researchLookup({request,signal});
      return repoDefinition(repo,request.rev,headRef,request.path,request.symbol,{line:request.line,character:request.character},signal);
    }, onLocation:(state,mode)=>onRoute(state,mode),onError:error=>storageError=error });
  const actor=session.actor;
  let snapshot=$state(actor.getSnapshot()), changed=$state(0);
  const subscription=actor.subscribe(next=>{snapshot=next;changed++;});
  $effect(()=>()=>{subscription.unsubscribe();session.dispose();});
  const active = $derived.by(() => { changed; return snapshot.context.items.find(item=>item.id===snapshot.context.active)?.ref; });
  const working = $derived.by(() => { changed; return active?.getSnapshot().context; });
  const lookup = $derived.by(() => { changed; return active?.getSnapshot().children.lookup?.getSnapshot(); });
  const research=$derived.by(()=>{changed;return active?.getSnapshot().children.research?.getSnapshot();});
  const checkpoint=$derived.by(()=>{changed;return active ? investigationSnapshot(active) : null;});
  $effect(()=>{const requested=restored;untrack(()=>session.restore(requested));});
  $effect(()=>{
    const node=tabs,scale=theme.generalScale/100;if(!active || !node)return;
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{overlayTop=Math.max(42,Math.min(innerHeight/scale-120,node.getBoundingClientRect().bottom/scale));});};
    const observer=new ResizeObserver(update);observer.observe(node);
    window.addEventListener('scroll',update,true);window.addEventListener('resize',update);update();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);};
  });
  function root(event,mode='push'){session.command(event,mode);}
  function send(event,mode='push'){session.send(event,mode);}
  function start(event,location=null) {
    returnFocus=event?.currentTarget;
    const origin = location ?? review.panes?.find(pane=>pane.id===review.active) ?? review;
    const pinned = sourceLocation({ ...origin, rev:origin.side==='left' ? origin.base : origin.rev });
    if (!pinned) { commandError = 'Choose a file at a pinned revision before starting an investigation.'; return; }
    commandError = '';
    root({type:'OPEN',title:`Explore ${pinned.file.split('/').at(-1)}`,location:pinned});
    void tick().then(()=>titleInput?.focus());
  }
  async function returnReview() { root({type:'REVIEW'}); await tick(); returnFocus?.isConnected ? returnFocus.focus() : reviewButton?.focus(); }
  async function closeQuestion(id) { root({type:'CLOSE',id}); await tick(); active ? titleInput?.focus() : reviewButton?.focus(); }
  function inspect(entry,rev,base) {
    if (!working.preview) originFocus=document.activeElement;
    send({type:'INSPECT',location:{file:entry.path ?? entry.file,line:entry.line,rev,base}});
  }
  async function closePreview() { send({type:'PREVIEW.CLOSE'}); await tick(); if (originFocus?.isConnected) originFocus.focus(); else mainRegion?.focus(); }
  function lookupCode(kind,symbol,path,position,location) {
    if (!position || (kind === 'references' && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(symbol))) return;
    if(kind==='definition')send({type:'LOOKUP',request:{kind,symbol,path,line:position.line,character:position.character,rev:location.rev,base:location.base}});
    else openBrowser(kind==='outline'?'symbols':kind,{...location,file:path,line:position.line},symbol,position.character);
  }
  function inspectEvidence(evidence) {
    if(!active)root({type:'OPEN',title:'Inspect saved evidence',location:evidence});
    else inspect(evidence,evidence.rev,evidence.base);
  }
  const draftAnchor=$derived(review.file && review.rev ? {repo,number,headSha:review.rev,path:review.file,side:review.side==='left' ? 'LEFT' : 'RIGHT',line:review.line ?? 1} : null);
  function openSymbol(definition,request,beside) {
    const location = symbolDestination(definition,request);
    if (beside) send({type:'PIN',location});
    else if(onReviewDefinition)onReviewDefinition(definition,request);
    else send({type:'OPEN',location});
  }
  function promote() { if (working.preview) send({type:'OPEN',location:working.preview.location}); root({type:'PROMOTE',id:working.id}); void tick().then(()=>mainRegion?.focus()); }
  export function activateRepository(kind='files'){return openBrowser(kind,working?.location ?? reviewOrigin());}
  function browserSet(patch,immediate=false){send({type:'BROWSER.SET',patch,immediate},immediate?'push':'replace');}
  function reviewOrigin(){const origin=review.panes?.find(pane=>pane.id===review.active) ?? review;return sourceLocation({...origin,rev:origin.side==='left'?origin.base:origin.rev});}
  async function openBrowser(kind='files',origin=working?.location,symbol='',character=0){
    if(!active){start(null,origin);origin=session.active()?.getSnapshot().context.location;}
    if(!origin)return;
    browserSet({kind,origin,query:'',filter:'',symbol,character},true);await tick();navigator?.focus();
  }
  async function closeBrowser(){send({type:'BROWSER.CLOSE'});await tick();mainRegion?.focus();mainSource?.focus();}
  const evidenceRequests=new Set();
  $effect(()=>()=>{for(const request of evidenceRequests)request.abort();});
  async function saveDiscovery(entry,request){
    const controller=new AbortController(),origin={id:working.id,title:working.title},target=draftAnchor?{...draftAnchor}:null,owner=notebook;evidenceRequests.add(controller);
    try{
      const evidence=await discoveryEvidence({repo,entry,request,signal:controller.signal,readFile:(path,rev,signal)=>repoFile(repo,rev,headRef,path,signal)});
      if(!controller.signal.aborted)owner?.addFinding(`${entry.category}: ${entry.reason}`,evidence,origin,target);
    }catch(error){if(!controller.signal.aborted)commandError=error.message;}finally{evidenceRequests.delete(controller);}
  }
  function resultLocation(entry,request){return sourceLocation({file:entry.path,line:entry.line,rev:request.rev,base:request.base});}
  function sourceCommand(kind,location){void openBrowser(kind,location);}
  $effect(()=>{
    if(!active)return;
    const keys=event=>{const command=repositoryCommand(event);if(!command || event.defaultPrevented || event.target.closest?.('[data-investigation-workbench]') || isPromptDialogOpen() || event.target.closest?.('[role="dialog"],[role="alertdialog"]'))return;event.preventDefault();event.stopImmediatePropagation();openBrowser(command);};
    window.addEventListener('keydown',keys,true);return()=>window.removeEventListener('keydown',keys,true);
  });
  const editorEscapes=new WeakSet();
  function captureKeydown(event){
    if(event.key==='Escape' && event.target.closest?.('.monaco-editor') && [...event.target.closest('.monaco-editor').querySelectorAll('.monaco-hover,.context-view,.find-widget,.suggest-widget')].some(node=>node.getBoundingClientRect().height>0 && getComputedStyle(node).visibility!=='hidden' && getComputedStyle(node).display!=='none'))editorEscapes.add(event);
  }
  function keydown(event) {
    if(event.defaultPrevented || editorEscapes.has(event))return;
    const command=repositoryCommand(event);if(command){event.preventDefault();event.stopPropagation();openBrowser(command);return;}
    if (event.key==='Escape') { event.preventDefault(); event.stopPropagation(); working.preview ? closePreview() : working.browser.open ? closeBrowser() : returnReview(); }
  }
</script>
<div class="investigation-tab-anchor"><nav bind:this={tabs} class:active={Boolean(active)} class="investigation-tabs" aria-label="Review investigations">
  <button bind:this={reviewButton} class:selected={!active} onclick={returnReview}>Changes</button>
  <button onclick={()=>openBrowser('files',working?.location ?? reviewOrigin())}>Repository</button>
  {#each snapshot.context.items as item}<div class="tab"><button class:selected={snapshot.context.active===item.id} onclick={()=>root({type:'SELECT',id:item.id})} title={item.ref.getSnapshot().context.title}>{item.ref.getSnapshot().context.title}{snapshot.context.main===item.id ? ' · Main' : ''}</button><button aria-label={`Close investigation ${item.ref.getSnapshot().context.title}`} onclick={()=>closeQuestion(item.id)}>×</button></div>{/each}
  {#if snapshot.context.archived.length}<details class="saved-questions"><summary>Saved questions ({snapshot.context.archived.length})</summary><div>{#each [...snapshot.context.archived].reverse() as item}<button onclick={event=>{ event.currentTarget.closest('details').open=false; root({type:'URL.RESTORE',state:item}); }}>{item.title}</button>{/each}</div></details>{/if}
  <button disabled={snapshot.context.items.length>=8 || !review.file} title={`Explore ${review.file} at ${review.rev?.slice(0,8) ?? 'unresolved revision'}`} onclick={event=>start(event)}>＋ Explore in side tab</button>
  <InvestigationNotebook bind:this={notebook} {repo} {number} {currentHead} {currentBase} {pendingReviewsEnabled} {pendingReview} {pendingReviewStale} {onSubmitDraft} question={working ? {id:working.id,title:working.title} : null} {checkpoint} anchor={draftAnchor} top={overlayTop} onInspect={inspectEvidence} onResume={state=>root({type:'URL.RESTORE',state})} />
</nav></div>
{#if snapshot.context.notice}<p role="status">{snapshot.context.notice}</p>{/if}
{#if commandError}<p role="alert">{commandError}</p>{/if}
{#if storageError}<p role="alert" class="save-error">{storageError}</p>{/if}
{#if active && working}
<div style:top={`${overlayTop}px`} class="investigation-workbench" data-investigation-workbench data-code-overlay onkeydowncapture={captureKeydown} onkeydown={keydown} role="region" aria-label={`Investigation ${working.title}`}>
  <header><button onclick={returnReview}>← Return to review</button><input aria-label="Investigation question" bind:this={titleInput} value={working.title} oninput={event=>send({type:'TITLE',title:event.currentTarget.value},'replace')} /><span>{working.location.rev.slice(0,8)}</span><button onclick={promote}>Promote to main</button><button onclick={event=>start(event,working.preview?.location ?? working.location)}>Explore in side tab</button><button aria-label="Close current investigation" onclick={()=>closeQuestion(working.id)}>×</button></header>
  <div class="investigation-tools"><button disabled={working.cursor===0} onclick={()=>send({type:'HISTORY.BACK'})}>Back in investigation</button><button disabled={working.cursor===working.history.length-1} onclick={()=>send({type:'HISTORY.FORWARD'})}>Forward</button><button onclick={()=>inspect(working.location,working.location.rev,working.location.base)}>Inspect source</button><button aria-pressed={working.browser.open} title="Find file · ⌘P; search repository · ⌘⇧F" onclick={()=>openBrowser('files')}>Repository</button><button onclick={()=>openBrowser('text')}>Search text</button><button onclick={()=>openBrowser('neighborhood')}>Patterns</button><button onclick={()=>conversationOpen=!conversationOpen} aria-pressed={conversationOpen}>Ask about code</button><span>Private workspace</span></div>
  {#if lookup?.matches('loading') || lookup?.matches('retrying')}<p role="status">Looking up {lookup.context.request.symbol}… <button onclick={()=>send({type:'LOOKUP.CANCEL'})}>Cancel lookup</button></p>
  {:else if lookup?.matches('error') || lookup?.matches('unavailable')}<p role="alert">{lookup.context.error || 'This lookup is unavailable for the pinned source.'}<button onclick={()=>active.getSnapshot().children.lookup.send({type:'RETRY'})}>Retry lookup</button></p>
  {:else if lookup?.matches('empty')}<p role="status">No semantic locations found.</p>{/if}
  <div class="investigation-body">
    <div class="code-columns">
      <section class="investigation-main" bind:this={mainRegion} tabindex="-1"><h2 title={working.location.file}>{working.location.file}:{working.location.line}<button onpointerdown={event=>event.preventDefault()} onclick={()=>notebook?.saveEvidence(mainSource?.captureEvidence())}>Save evidence</button></h2><div class="workspace-scroll"><WorkspaceSource enhancedEditor onCommand={kind=>sourceCommand(kind,working.location)} onSemantic={(kind,symbol,path,position)=>lookupCode(kind,symbol,path,position,working.location)} bind:this={mainSource} {repo} {headRef} onOpenSymbol={openSymbol} pane={working.location} onNavigate={patch=>send({type:'OPEN',location:{...working.location,...patch}})} onDefinition={(symbol,path,position)=>lookupCode('definition',symbol,path,position,working.location)} onReferences={(symbol,path,position)=>lookupCode('references',symbol,path,position,working.location)} /></div></section>
      {#each working.pinned as pinned,index}<section><h2 title={pinned.file}>Kept beside · {pinned.file}<button onpointerdown={event=>event.preventDefault()} onclick={()=>notebook?.saveEvidence(pinnedSources[index]?.captureEvidence())}>Save evidence</button><button aria-label={`Close comparison ${pinned.file}`} onclick={()=>send({type:'UNPIN',index})}>×</button></h2><div class="workspace-scroll"><WorkspaceSource enhancedEditor onCommand={kind=>sourceCommand(kind,pinned)} onSemantic={(kind,symbol,path,position)=>lookupCode(kind,symbol,path,position,pinned)} bind:this={pinnedSources[index]} {repo} {headRef} onOpenSymbol={openSymbol} pane={pinned} onDefinition={(symbol,path,position)=>lookupCode('definition',symbol,path,position,pinned)} onReferences={(symbol,path,position)=>lookupCode('references',symbol,path,position,pinned)} /></div></section>{/each}
      {#if working.preview}<section class="investigation-preview" aria-label="Temporary code preview"><h2 title={working.preview.location.file}>Inspect · {working.preview.location.file}:{working.preview.location.line}</h2><div class="preview-actions"><button disabled={working.preview.trail.length<2} onclick={()=>send({type:'PREVIEW.BACK'})}>Preview back</button><button onclick={()=>send({type:'KEEP'})}>Keep beside</button><button onclick={closePreview}>Close preview</button><button onpointerdown={event=>event.preventDefault()} onclick={()=>notebook?.saveEvidence(previewSource?.captureEvidence())}>Save evidence</button></div><div class="workspace-scroll"><WorkspaceSource enhancedEditor onCommand={kind=>sourceCommand(kind,working.preview.location)} onSemantic={(kind,symbol,path,position)=>lookupCode(kind,symbol,path,position,working.preview.location)} bind:this={previewSource} {repo} {headRef} onOpenSymbol={openSymbol} pane={working.preview.location} onNavigate={patch=>inspect({...working.preview.location,...patch},working.preview.location.rev,working.preview.location.base)} onDefinition={(symbol,path,position)=>lookupCode('definition',symbol,path,position,working.preview.location)} onReferences={(symbol,path,position)=>lookupCode('references',symbol,path,position,working.preview.location)} /></div></section>{/if}
    </div>
    {#if working.browser.open}<RepositoryNavigator {repo} {headRef} bind:this={navigator} browser={working.browser} {research} {changedPaths} onSet={browserSet} onExplore={(entry,request)=>openBrowser('neighborhood',resultLocation(entry,request))} onSave={saveDiscovery} onFilter={(filter,scope)=>send({type:'BROWSER.FILTER',filter,scope},'replace')} onClose={closeBrowser} onRetry={()=>active.getSnapshot().children.research.send({type:'RETRY'})} onInspect={(entry,request)=>inspect(entry,request.rev,request.base)} onOpen={(entry,request)=>send({type:'OPEN',location:resultLocation(entry,request)})} onBeside={(entry,request)=>send({type:'PIN',location:resultLocation(entry,request)})} />{/if}
  </div>
  {#if conversationOpen}{#key working.id}<InvestigationConversation {repo} {number} {headRef} question={{id:working.id,title:working.title}} locations={[working.location,...working.pinned,...(working.preview?[working.preview.location]:[])]} top={overlayTop} onClose={()=>conversationOpen=false} onInspect={evidence=>{inspectEvidence(evidence);conversationOpen=false;}} onFinding={(body,evidence,origin)=>{notebook?.addFinding(body,evidence,origin,draftAnchor);conversationOpen=false;}} />{/key}{/if}
  <footer>{working.preview ? 'Inspect is temporary. Keep beside pins a comparison; Promote makes it the working location.' : 'Click code for a symbol card; F12 inspects its definition; Alt-click for semantic references. Each question keeps its own history and previews.'}</footer>
</div>
{/if}
<style>
 .investigation-tab-anchor{min-height:34px;}.investigation-tabs.active{position:fixed;top:0;left:52px;right:8px;z-index:86;}.investigation-tabs{display:flex;align-items:center;gap:5px;padding:5px 8px;background:var(--bg);border-bottom:1px solid var(--border);overflow-x:auto;white-space:nowrap;font-size:11px;min-height:34px;}button{cursor:pointer;color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:5px;padding:5px 8px;}button:disabled{opacity:.4;cursor:default;}button:focus-visible,input:focus-visible{outline:2px solid var(--link);}button.selected{border-color:var(--link);color:var(--link);} .saved-questions{position:relative;}.saved-questions summary{cursor:pointer;padding:5px 8px;}.saved-questions>div{position:fixed;z-index:120;max-height:250px;overflow:auto;background:var(--panel);border:1px solid var(--border);padding:5px;}.saved-questions button{display:block;width:100%;text-align:left;} .tab{display:flex;max-width:230px;}.tab button:first-child{overflow:hidden;text-overflow:ellipsis;}.tab button+button{padding-inline:6px;} .investigation-workbench{position:fixed;z-index:85;top:145px;left:52px;right:8px;bottom:38px;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:12px;box-shadow:0 8px 25px #0004;}header,.investigation-tools{display:flex;align-items:center;gap:7px;padding:8px;border-bottom:1px solid var(--border);}header input{flex:1;min-width:100px;font-weight:600;}.investigation-tools input{flex:1;min-width:100px;}.investigation-tools span,header span,small,footer{color:var(--muted);}input{background:var(--panel);color:var(--text);border:1px solid var(--border);padding:5px 8px;border-radius:5px;} .investigation-body{display:flex;flex:1;min-height:0;}.code-columns{display:flex;flex:1;min-width:0;}.code-columns>section{display:flex;flex-direction:column;flex:1;min-width:180px;border-right:1px solid var(--border);}h2{font:11px/1.6 monospace;padding:7px 10px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid var(--border);}h2 button{float:right;}.workspace-scroll{overflow:auto;min-height:0;flex:1;}.preview-actions{display:flex;gap:5px;padding:5px;background:var(--panel);}.investigation-preview{border-left:2px solid var(--link);}aside{width:280px;min-width:180px;overflow:auto;border-left:1px solid var(--border);}.result{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--border);border-radius:0;background:transparent;padding:8px 10px;}.result strong{display:block;overflow-wrap:anywhere;font:10px monospace;}.result code{display:block;white-space:pre;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-size:10px;margin-top:5px;}footer{padding:5px 9px;border-top:1px solid var(--border);font-size:10px;}p{padding:7px 10px;margin:0;}.partial,.save-error{color:var(--warning,#e9b766);}@media(max-width:800px){.investigation-tabs.active{left:6px;}.investigation-workbench{left:6px;top:150px;}header{flex-wrap:wrap;}header input{order:-1;flex-basis:80%;}.investigation-body{overflow:auto;}.code-columns{min-width:500px;}aside{min-width:230px;}}
</style>
