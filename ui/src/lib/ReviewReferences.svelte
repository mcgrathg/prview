<script>
  import { createActor } from 'xstate';
  import { onMount, untrack } from 'svelte';
  import { reviewLookupMachine } from './reviewLookupMachine.js';
  import { repoReferences } from './api.js';
  let { repo, headRef, origin, onSelect, onClose, hrefFor } = $props();
  let closeButton;
  let filter = $state('');
  const actor = createActor(reviewLookupMachine, { input: { lookup: ({ request, signal }) => repoReferences(request.repo, request.rev, request.headRef, request.path, request.symbol, { line: request.line, character: request.character }, signal) } }).start();
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe(next => snapshot = next);
  $effect(() => () => { subscription.unsubscribe(); actor.stop(); });
  const identity = $derived(JSON.stringify([repo, headRef, origin]));
  $effect(() => { identity; untrack(() => { filter = ''; actor.send({ type: 'LOAD', request: { repo, headRef, ...origin } }); }); });
  onMount(() => closeButton?.focus({ preventScroll: true }));
  const references = $derived(snapshot.context.result?.references ?? []);
  const groups = $derived.by(() => {
    const groups = new Map();
    for (const entry of references) {
      if (filter && !`${entry.path} ${entry.text}`.toLowerCase().includes(filter.toLowerCase())) continue;
      if (!groups.has(entry.path)) groups.set(entry.path, []);
      groups.get(entry.path).push(entry);
    }
    return [...groups];
  });
</script>
<aside class="reference-panel" data-code-overlay aria-label="Symbol references" onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
  <header><div><strong>References · {origin.symbol}</strong><small>{repo} · {origin.rev.slice(0, 8)}</small></div><button bind:this={closeButton} aria-label="Close references" onclick={onClose}>×</button></header>
  <div class="reference-origin"><button onclick={() => onSelect({ path: origin.path, line: origin.line, character: origin.character })}>Return to caller</button><span title={origin.path}>{origin.path}:{origin.line}</span></div>
  {#if snapshot.matches('loading') || snapshot.matches('retrying')}
    <p role="status">Finding semantic references… <button onclick={onClose}>Cancel</button></p>
  {:else if snapshot.matches('error') || snapshot.matches('unavailable')}
    <p role="alert">{snapshot.matches('error') ? snapshot.context.error : 'Semantic references are unavailable for this source or revision.'} <button onclick={() => actor.send({ type: 'RETRY' })}>Retry references</button></p>
  {:else if snapshot.matches('empty')}<p role="status">No semantic references found.</p>
  {:else if snapshot.matches('ready')}
    <div class="reference-controls"><span>{references.length} locations · includes declarations</span><input type="search" aria-label="Filter references" placeholder="Filter paths or code…" bind:value={filter} /></div>
    {#if snapshot.context.result.coverage?.limited}<p class="limited" role="status">Partial results: {snapshot.context.result.coverage.reasons.join(', ')}.</p>{/if}
    <p class="scope">Semantic matches in tracked JS/TS and Svelte scripts. Large repositories use candidate discovery; results may be incomplete. Dynamic runtime connections are outside this analysis.</p>
    <div class="reference-results">{#each groups as [path, entries]}<section><h3>{path}<span>{entries.length}</span></h3>{#each entries as entry}<a href={hrefFor(entry)} title={entry.text} data-event="open-symbol-reference" onclick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelect(entry); }}><span class="reference-line">{entry.line}:{entry.character + 1}</span><code>{entry.text}</code>{#if entry.isDefinition}<small>Declaration</small>{/if}</a>{/each}</section>{/each}</div>
  {/if}
</aside>
<style>
  .reference-panel { position: fixed; z-index: 90; right: 8px; top: 44px; bottom: 40px; width: min(420px, calc(100vw - 32px)); display: flex; flex-direction: column; color: var(--text); background: var(--panel); border: 1px solid var(--border); border-radius: 9px; box-shadow: 0 10px 30px #0005; font-size: 12px; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); } header div { display: flex; flex-direction: column; gap: 4px; } header small, .scope { color: var(--muted); } header button { font-size: 20px; padding: 0 5px; }
  button { color: var(--link); background: transparent; border: 0; cursor: pointer; } button:focus-visible { outline: 2px solid var(--link); }
  p { padding: 8px 12px; margin: 0; } .reference-origin { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); } .reference-origin button { text-align: left; padding: 0; } .reference-origin span { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
  .reference-controls { display: grid; gap: 7px; padding: 10px 12px; } input { width: 100%; padding: 6px 8px; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; } .limited { color: var(--warning, #e9b766); } .scope { font-size: 10px; }
  .reference-results { flex: 1; min-height: 0; overflow: auto; padding-bottom: 10px; } h3 { display: flex; gap: 8px; justify-content: space-between; margin: 0; padding: 9px 12px; font: 10px/1.4 monospace; overflow-wrap: anywhere; color: var(--muted); background: var(--hover); } a { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 7px; padding: 7px 12px; color: inherit; text-decoration: none; border-bottom: 1px solid var(--border-soft); } a:hover, a:focus-visible { background: var(--hover); outline: 1px solid var(--link); } code { font: 10px/1.6 monospace; overflow: hidden; text-overflow: ellipsis; white-space: pre; } .reference-line { font: 10px/1.6 monospace; color: var(--muted); } a small { grid-column: 2; color: var(--link); font-size: 9px; }
</style>
