<script>
  import { createActor } from 'xstate';
  import { onMount, untrack } from 'svelte';
  import { reviewLookupMachine } from './reviewLookupMachine.js';
  import WorkspaceSource from './WorkspaceSource.svelte';
  import {referenceDiffLocation} from './reviewRoute.js';
  import { repoReferences,repoDefinition } from './api.js';
  let { repo, headRef, origin, onSelect, onClose, hrefFor, comparison={},onPreviewClose,onOpenBeside,onContextReferences } = $props();
  let closeButton;
  let filter = $state('');
  const actor = createActor(reviewLookupMachine, { input: { lookup: ({ request, signal }) => repoReferences(request.repo, request.rev, request.headRef, request.path, request.symbol, { line: request.line, character: request.character }, signal) } }).start();
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe(next => snapshot = next);
  $effect(() => () => { subscription.unsubscribe(); actor.stop(); });
  const identity = $derived(JSON.stringify([repo,headRef,origin.path,origin.symbol,origin.line,origin.character,origin.rev,origin.base,origin.kind]));
  const previewKey=$derived(JSON.stringify([identity,origin.preview]));
  const preview=$derived(origin.preview ? {file:origin.preview.path,line:origin.preview.line,rev:origin.rev,base:origin.base,side:'right',view:'source'} : null);
  const changedPaths=$derived(new Set((comparison.files ?? []).flatMap(file=>[file.path,file.previousPath].filter(Boolean))));
  function change(path){return referenceDiffLocation(origin,path,comparison);}
  function kind(path){const target=change(path);return target ? target.side==='left' ? 'PR change · original' : 'PR change' : changedPaths.has(path) ? 'Other revision' : 'Repository context';}
  const definitionActor=createActor(reviewLookupMachine,{input:{lookup:({request,signal})=>repoDefinition(request.repo,request.rev,request.headRef,request.path,request.symbol,{line:request.line,character:request.character},signal)}}).start();
  let definitionSnapshot=$state(definitionActor.getSnapshot());
  const definitionSubscription=definitionActor.subscribe(next=>{definitionSnapshot=next;if(next.matches('ready') && next.context.result?.definition && next.context.request.previewKey===previewKey)onSelect(next.context.result.definition);});
  $effect(()=>{previewKey;untrack(()=>definitionActor.send({type:'CANCEL'}));});
  $effect(()=>()=>{definitionSubscription.unsubscribe();definitionActor.stop();});
  function lookupDefinition(symbol,path,position){if(!position || !preview)return;definitionActor.send({type:'LOAD',request:{repo,headRef,symbol,path,...position,rev:origin.rev,previewKey}});}
  function openSymbol(definition,request,beside){if(beside)onOpenBeside?.(definition,request);else onSelect(definition);}

  $effect(() => { identity; untrack(() => { filter = ''; if(origin.kind==='context')actor.send({type:'CANCEL'});else actor.send({ type: 'LOAD', request: { repo, headRef, ...origin } }); }); });
  onMount(() => closeButton?.focus({ preventScroll: true }));
  const references = $derived(snapshot.context.result?.references ?? []);
  const groups = $derived.by(() => {
    const groups = new Map();
    for (const entry of references) {
      if (filter && !`${entry.path} ${entry.line} ${entry.text}`.toLowerCase().includes(filter.toLowerCase())) continue;
      if (!groups.has(entry.path)) groups.set(entry.path, []);
      groups.get(entry.path).push(entry);
    }
    return [...groups];
  });
</script>
<aside class="reference-panel" data-code-overlay aria-label="Symbol references" onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); preview && origin.kind!=='context' ? onPreviewClose() : onClose(); } }}>
  <header><div><strong>{origin.kind==='context' ? 'Code context' : 'References'} · {origin.symbol}</strong><small>{repo} · {origin.rev.slice(0, 8)}</small></div><button bind:this={closeButton} aria-label="Close references" onclick={onClose}>×</button></header>
  <div class="reference-origin"><button onclick={() => onSelect({ path: origin.path, line: origin.line, character: origin.character })}>Return to caller</button><span title={origin.path}>{origin.path}:{origin.line}</span></div>
  {#if preview}
    <section class="reference-context" aria-label="Repository file context">
      <div class="context-heading">{#if origin.kind==='context'}<button onclick={onClose}>Close context</button>{:else}<button onclick={onPreviewClose}>← Back to references</button>{/if}<strong>{preview.file}:{preview.line}</strong><small>{changedPaths.has(preview.file) ? 'Different revision from the displayed PR comparison' : 'Not changed in this PR'} · Read-only · {origin.rev.slice(0,8)}</small></div>
      {#if definitionSnapshot.matches('loading') || definitionSnapshot.matches('retrying')}<p role="status">Finding definition…</p>{:else if definitionSnapshot.matches('error') || definitionSnapshot.matches('unavailable') || definitionSnapshot.matches('empty')}<p role="status">{definitionSnapshot.context.error || 'No definition available for this source.'}</p>{:else if definitionSnapshot.matches('ready')}<p role="status">Multiple candidates; inspect the symbol card to choose a definition.</p>{/if}
      <div class="workspace-scroll"><WorkspaceSource {repo} {headRef} pane={preview} onNavigate={patch=>onSelect({path:preview.file,line:patch.line,character:0})} onDefinition={lookupDefinition} onReferences={onContextReferences} onOpenSymbol={openSymbol} /></div>
    </section>
  {:else if snapshot.matches('loading') || snapshot.matches('retrying')}
    <p role="status">Finding semantic references… <button onclick={onClose}>Cancel</button></p>
  {:else if snapshot.matches('error') || snapshot.matches('unavailable')}
    <p role="alert">{snapshot.matches('error') ? snapshot.context.error : 'Semantic references are unavailable for this source or revision.'} <button onclick={() => actor.send({ type: 'RETRY' })}>Retry references</button></p>
  {:else if snapshot.matches('empty')}<p role="status">No semantic references found.</p>
  {:else if snapshot.matches('ready')}
    <div class="reference-controls"><span>{references.length} locations · includes declarations</span><input type="search" aria-label="Filter references" placeholder="Filter paths or code…" bind:value={filter} /></div>
    {#if snapshot.context.result.coverage?.limited}<p class="limited" role="status">Partial results: {snapshot.context.result.coverage.reasons.join(', ')}.</p>{/if}
    <p class="scope">Semantic matches in tracked JS/TS and Svelte scripts. Large repositories use candidate discovery; results may be incomplete. Dynamic runtime connections are outside this analysis.</p>
    <div class="reference-results">{#each groups as [path, entries]}<section><h3><a class="reference-file" href={hrefFor(entries[0])} aria-label={`${change(path) ? 'Open PR diff for' : 'Inspect context for'} ${path}`} onclick={event=>{if(event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;event.preventDefault();onSelect(entries[0]);}}>{path}</a><span>{entries.length}</span><small class:pr-change={Boolean(change(path))}>{kind(path)}</small></h3>{#each entries as entry}<a href={hrefFor(entry)} title={entry.text} data-event="open-symbol-reference" data-path={entry.path} data-line={entry.line} onclick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelect(entry); }}><span class="reference-line">{entry.line}:{entry.character + 1}</span><code>{entry.text}</code>{#if entry.isDefinition}<small>Declaration</small>{/if}</a>{/each}</section>{/each}</div>
  {/if}
</aside>
<style>
  .reference-context{display:flex;flex-direction:column;flex:1;min-height:0;}.context-heading{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-bottom:1px solid var(--border);}.context-heading button{text-align:left;padding:0;}.context-heading strong{font:11px/1.5 monospace;overflow-wrap:anywhere;}.context-heading small{color:var(--muted);font-size:10px;}.workspace-scroll{overflow:auto;flex:1;min-height:0;}.reference-file{display:block;padding:0;border:0;background:transparent;overflow-wrap:anywhere;}h3{flex-wrap:wrap;}h3 .reference-file{flex:1;min-width:0;}h3 small{flex-basis:100%;font:9px/1.4 system-ui;}h3 .pr-change{color:var(--link);}
  .reference-panel { position: fixed; z-index: 90; right: 8px; top: 44px; bottom: 40px; width: min(420px, calc(100vw - 32px)); display: flex; flex-direction: column; color: var(--text); background: var(--panel); border: 1px solid var(--border); border-radius: 9px; box-shadow: 0 10px 30px #0005; font-size: 12px; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); } header div { display: flex; flex-direction: column; gap: 4px; } header small, .scope { color: var(--muted); } header button { font-size: 20px; padding: 0 5px; }
  button { color: var(--link); background: transparent; border: 0; cursor: pointer; } button:focus-visible { outline: 2px solid var(--link); }
  p { padding: 8px 12px; margin: 0; } .reference-origin { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); } .reference-origin button { text-align: left; padding: 0; } .reference-origin span { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
  .reference-controls { display: grid; gap: 7px; padding: 10px 12px; } input { width: 100%; padding: 6px 8px; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; } .limited { color: var(--warning, #e9b766); } .scope { font-size: 10px; }
  .reference-results { flex: 1; min-height: 0; overflow: auto; padding-bottom: 10px; } h3 { display: flex; gap: 8px; justify-content: space-between; margin: 0; padding: 9px 12px; font: 10px/1.4 monospace; overflow-wrap: anywhere; color: var(--muted); background: var(--hover); } a { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 7px; padding: 7px 12px; color: inherit; text-decoration: none; border-bottom: 1px solid var(--border-soft); } a:hover, a:focus-visible { background: var(--hover); outline: 1px solid var(--link); } code { font: 10px/1.6 monospace; overflow: hidden; text-overflow: ellipsis; white-space: pre; } .reference-line { font: 10px/1.6 monospace; color: var(--muted); } a small { grid-column: 2; color: var(--link); font-size: 9px; }
</style>
