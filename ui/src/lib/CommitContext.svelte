<script>
  import { tick } from 'svelte';
  import { createActor } from 'xstate';
  import { reviewLookupMachine } from './reviewLookupMachine.js';
  import { reviewCommitContext } from './api.js';
  import { REVIEW_NAVIGATION_EVENT } from './reviewHistory.js';
  let {repo,head,base,headRef} = $props();
  let dialog = $state(null), x = $state(8), y = $state(8);
  let returnFocus;
  const actor = createActor(reviewLookupMachine,{input:{lookup:({request,signal})=>reviewCommitContext(request,signal)}}).start();
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe(next=>snapshot=next);
  $effect(()=>()=>{subscription.unsubscribe();actor.stop();});
  $effect(()=>{repo;head;base; close();});
  function close() {actor.send({type:'CANCEL'});}
  function dismiss() {close(); if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
  function portal(node){document.body.append(node);return{destroy(){node.remove();}};}
  export async function inspect(event,path) {
    returnFocus=event.currentTarget;
    const rect=returnFocus.getBoundingClientRect();
    x=Math.max(8,Math.min(rect.left,innerWidth-408));
    y=Math.max(8,Math.min(rect.bottom+8,innerHeight-260));
    actor.send({type:'LOAD',request:{repo,head,base,headRef,path}});
    await tick(); dialog?.querySelector('button')?.focus({preventScroll:true});
  }
  $effect(()=>{
    if(snapshot.matches('idle'))return;
    const outside=event=>{if(!dialog?.contains(event.target))close();};
    const keys=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();dismiss();}};
    const navigate=()=>close();
    window.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',keys,true);
    for(const name of ['popstate','hashchange',REVIEW_NAVIGATION_EVENT])window.addEventListener(name,navigate);
    return()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',keys,true);for(const name of ['popstate','hashchange',REVIEW_NAVIGATION_EVENT])window.removeEventListener(name,navigate);};
  });
</script>
{#if snapshot.context.request}
  {@const request=snapshot.context.request}
  {@const result=snapshot.context.result}
  <dialog open use:portal bind:this={dialog} class="commit-context" data-code-overlay aria-label="Commit context" style:left={`${x}px`} style:top={`${y}px`} style:max-height={`calc(100vh - ${y+8}px)`}>
    <header><strong>Commit context</strong><button aria-label="Close commit context" onclick={dismiss}>×</button></header>
    <p class="path">{request.path}</p><small>File-level candidates · {request.base.slice(0,7)}…{request.head.slice(0,7)}</small>
    {#if snapshot.matches('loading') || snapshot.matches('retrying')}<p role="status">Reading commits…</p>
    {:else if snapshot.matches('error') || snapshot.matches('unavailable')}<p role="alert">{snapshot.context.error || result?.error || `Commit context unavailable (${result?.status}).`}</p><button onclick={()=>actor.send({type:'RETRY'})}>Retry</button>
    {:else}
      {#if !result?.commits?.length}<p>No commits touching this path were found in this comparison.</p>{/if}
      {#each result?.commits ?? [] as commit}<article><strong>{commit.title || 'Untitled commit'}</strong><a href={`https://github.com/${request.repo}/commit/${commit.sha}`} target="_blank" rel="noopener noreferrer" title="Open commit on GitHub">{commit.sha.slice(0,7)} ↗</a>{#if commit.body}<p class="message">{commit.body}</p>{:else}<small>No additional commit message.</small>{/if}</article>{/each}
      {#if result?.limited}<p>Showing the latest 30 matching commits.</p>{/if}
      <small>History follows this file path. Earlier names and exact line attribution are not included.</small>
    {/if}
  </dialog>
{/if}
<style>
  .commit-context{position:fixed;margin:0;z-index:210;width:min(400px,calc(100vw - 16px));box-sizing:border-box;overflow:auto;padding:12px;border:1px solid var(--border,#555);border-radius:8px;background:var(--panel,#242424);color:var(--text,#eee);box-shadow:0 10px 32px #0008;font:12px/1.5 system-ui;}
  header{display:flex;justify-content:space-between;align-items:center;}header button{border:0;background:transparent;color:inherit;font-size:18px;cursor:pointer;}button:focus-visible,a:focus-visible{outline:2px solid var(--link);}
  .path{font:11px/1.5 var(--font-mono,monospace);overflow-wrap:anywhere;margin:8px 0;}small{color:var(--muted,#aaa);font-size:11px;}article{border-top:1px solid var(--border);padding:10px 0;margin-top:8px;}article strong{display:block;}a{display:block;width:max-content;color:var(--link);font:11px/1.8 monospace;}.message{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;}
</style>
