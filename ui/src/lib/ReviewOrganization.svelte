<script>
  import { onDestroy, tick, untrack } from 'svelte';
  import { createActor } from 'xstate';
  import { organizationMachine, organizationKey } from '../../../shared/review-organization/machine.ts';
  import { captureFromDiff } from '../../../shared/review-organization/capture.ts';
  import { organizationModel, emptyGraph } from '../../../shared/review-organization/model.ts';
  import { roleLabels } from '../../../shared/review-organization/analysis.ts';
  import {explainReviewOrder} from './reviewOrderExplanation.js';
  import { beginReviewFileDrag } from './reviewFileDrag.js';
  import { relatedCandidates } from '../../../shared/review-organization/relationships.ts';

  let { comparison, nativeFiles, selectedPath, onChange, onSelect, onOpenBeside = null, docking = false, fileHref = null, onControlsChange = null, restoredControls = null } = $props();
  const actor = createActor(organizationMachine, { input: { comparison: untrack(() => comparison) } });
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe(next => snapshot = next);
  actor.start();
  onDestroy(() => { subscription.unsubscribe(); actor.stop(); });
  $effect(() => { actor.send({ type: 'COMPARISON.SET', comparison }); });

  let controls = $derived(snapshot.context);
  let aligned = $derived(organizationKey(controls.comparison) === organizationKey(comparison));
  let capture = $derived(aligned && controls.result ? controls.result.capture
    : captureFromDiff(comparison.repo, comparison.number, comparison.base, comparison.head, nativeFiles));
  let graph = $derived(aligned && controls.result ? controls.result.graph : emptyGraph());
  let model = $derived(organizationModel(capture, graph, controls));
  $effect(() => {
    const next = { ...model, graph, key: organizationKey(comparison) };
    if (aligned) untrack(() => onChange(next));
  });
  let selected = $derived(model.entries.find(entry => entry.file.filename === selectedPath));
  let related = $derived(selected ? relatedCandidates(selected.file, model.entries.map(entry => entry.file), graph) : []);
  let roles = $derived(Object.entries(roleLabels).map(([role, label]) => ({
    role, label, count: model.entries.filter(entry => entry.file.roles.includes(role)).length,
  })).filter(role => role.count));
  let shownEntries = $derived(model.visible.filter(entry => entry.state !== 'fold'));
  let foldedEntries = $derived(model.visible.filter(entry => entry.state === 'fold'));
  let groups = $derived(controls.folders
    ? [...new Set(shownEntries.map(entry => entry.file.directory))].map(name => ({ name, entries: shownEntries.filter(entry => entry.file.directory === name) }))
    : [{ name: '', entries: shownEntries }]);
  export function restoreControls(controls) { actor.send({ type: 'CONTROLS.RESTORE', controls }); }
  let restoredKey = '';
  $effect(() => {
    const key = JSON.stringify([organizationKey(comparison), restoredControls]);
    if (restoredControls && key !== restoredKey) { restoredKey = key; untrack(() => restoreControls(restoredControls)); }
  });
  const send = event => {
    const before = actor.getSnapshot().context;
    actor.send(event);
    const { order, query, rules, overrides, root, expanded, folders, collapsedFolders } = actor.getSnapshot().context;
    const previous = { order: before.order, query: before.query, rules: before.rules, overrides: before.overrides, root: before.root, expanded: before.expanded, folders: before.folders, collapsedFolders: before.collapsedFolders };
    const next = { order, query, rules, overrides, root, expanded, folders, collapsedFolders };
    if (JSON.stringify(previous) !== JSON.stringify(next)) onControlsChange?.(next, event.type === 'QUERY.SET' ? 'replace' : 'push');
  };
  async function select(path) {
    send({ type: 'FILE.SET', path, visibility: controls.overrides[path] === 'hide' ? 'show' : controls.overrides[path] });
    if (model.folded.includes(path)) send({ type: 'FILE.TOGGLE', path });
    await tick();
    onSelect(path);
  }
  async function reveal(path) { send({ type: 'FILE.SET', path, visibility: 'show' }); await tick(); onSelect(path); }
  export async function revealFile(path, notify = true) {
    if (notify) { send({ type: 'QUERY.SET', query: '' }); await reveal(path); }
    else { actor.send({ type: 'QUERY.SET', query: '' }); actor.send({ type: 'FILE.SET', path, visibility: 'show' }); await tick(); }
  }
  export function toggleTests() { send({ type: 'ROLE.SET', role: 'test', visibility: controls.rules.test === 'hide' ? 'show' : 'hide' }); }
  export function toggleFold(path) { send({ type: 'FILE.TOGGLE', path }); }
</script>

{#snippet queueEntry(entry)}
        {@const orderExplanation=explainReviewOrder(entry,model.entries,controls.order).join('\n')}
        <a href={fileHref?.(entry.file.filename) ?? "#"} class="queue-file" class:active={entry.file.filename === selectedPath} class:folded={entry.state === 'fold'} title={`${entry.file.filename}\n${orderExplanation}\n${entry.reason}`} aria-label={`${entry.file.filename}, reading position ${entry.rank} of ${model.entries.length}, ${entry.file.additions} lines added, ${entry.file.deletions} lines removed${entry.state === 'fold' ? ', folded' : ''}`} aria-current={entry.file.filename === selectedPath ? 'true' : undefined} data-event="organization-select-file" draggable={!docking && Boolean(onOpenBeside)} onpointerdown={event => { if (docking) beginReviewFileDrag(event, { file: entry.file.filename, rev: comparison.head, base: comparison.base, view: 'diff' }); }} ondragstart={event => { event.dataTransfer.setData('application/x-prview-file', JSON.stringify({ file: entry.file.filename, rev: comparison.head, base: comparison.base, view: 'diff' })); event.dataTransfer.effectAllowed = 'copy'; }} onclick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); select(entry.file.filename); }}>
          <span class="rank" title={orderExplanation}>#{entry.rank}</span><span class="path"><strong>{entry.file.name}</strong><small>{entry.file.directory}</small></span>
          <span class="file-stats" title={`${entry.file.additions} lines added, ${entry.file.deletions} lines removed (${entry.file.changes} changed lines total)`}><span class="added">+{entry.file.additions}</span> <span class="removed">−{entry.file.deletions}</span>{#if entry.state === 'fold'}<span class="fold-label">folded</span>{/if}</span>
        </a>
        {#if onOpenBeside}<button class="open-beside" aria-label={`Open ${entry.file.name} beside`} title="Open in a new pane beside the active file" onclick={() => onOpenBeside(entry.file.filename)}>Open beside</button>{/if}
{/snippet}

<div class="organization" aria-label="Review organization">
  <div class="organization-head"><strong>Review order</strong><button onclick={() => send({ type: 'SHOW_ALL' })}>Show all</button></div>
  <label>Reading order
    <select aria-label="Reading order" value={controls.order} onchange={event => send({ type: 'ORDER.SET', order: event.currentTarget.value })}>
      <option value="attention">Attention</option><option value="original">Original</option><option value="volume">Changed lines</option>
      <option value="flow" disabled={!graph.edges.length}>Import flow</option>
    </select>
  </label>
  <input type="search" aria-label="Find a changed file" placeholder="Find a file or path…" value={controls.query} oninput={event => send({ type: 'QUERY.SET', query: event.currentTarget.value })} />
  <label class="group-toggle"><input type="checkbox" checked={controls.folders} disabled={controls.order === 'flow'} onchange={() => send({ type: 'GROUP.TOGGLE' })} /> Group by folder</label>
  <details>
    <summary>Categories <span>{model.counts.show} shown · {model.counts.fold} folded · {model.counts.hide} hidden</span></summary>
    <p class="note">Roles can overlap. Explicit Show wins over Fold and Hide.</p>
    {#each roles as role}
      <label class="role-rule">{role.label} <span>{role.count}</span>
        <select aria-label={`${role.label} visibility`} value={controls.rules[role.role] ?? 'default'} onchange={event => send(event.currentTarget.value === 'default' ? { type: 'ROLE.RESET', role: role.role } : { type: 'ROLE.SET', role: role.role, visibility: event.currentTarget.value })}>
          <option value="default">Use default</option><option value="show">Show</option><option value="fold">Fold</option><option value="hide">Hide</option>
        </select>
      </label>
    {/each}
  </details>
  {#if snapshot.matches('loading')}<p class="note" role="status">Reading pinned source… Categories remain available.</p>
  {:else if snapshot.matches('error')}<div class="note error" role="alert">{controls.error} <button onclick={() => send({ type: 'RETRY' })}>Retry</button></div>
  {:else}<p class="note">{graph.coverage.parsedHeadFiles} head files parsed · {graph.edges.length} reference candidates</p>{/if}
  {#if controls.order === 'attention'}<p class="note">Implementation first, then tests and supporting files. Hover a rank for why.</p>{/if}
  {#if controls.order === 'flow'}
    <p class="note">Importer before imported module; changed paths only. {controls.root ? `${model.flow.reachable.size} files in the path.` : 'All components.'}
      {#if controls.root}<button onclick={() => send({ type: 'FLOW.FOLLOW' })}>Clear root</button>{/if}
      {#if model.flow.cycles.length}{model.flow.cycles.length} cycle groups.{/if}
    </p>
  {/if}
  {#if selected}
    <details class="file-evidence">
      <summary>File details &amp; related<small>{selected.file.name}</small></summary>
      <label>File visibility
        <select aria-label="Selected file visibility" value={controls.overrides[selected.file.filename] ?? ''} onchange={event => send({ type: 'FILE.SET', path: selected.file.filename, visibility: event.currentTarget.value || undefined })}>
          <option value="">Use category rules</option><option value="show">Show</option><option value="fold">Fold</option><option value="hide">Hide</option>
        </select>
      </label>
      <p class="note">{selected.file.roles.map(role => roleLabels[role]).join(' · ')} · {selected.file.language}</p>
      <ul class="note">{#each selected.file.classification as fact}<li>{fact.reason}</li>{/each}</ul>
      <details><summary>Why this order?</summary><ul class="note">{#each explainReviewOrder(selected,model.entries,controls.order) as reason}<li>{reason}</li>{/each}</ul></details>
      <button class="follow" disabled={!graph.edges.some(edge => edge.from === selected.file.filename && edge.kind !== 'file_path' && !edge.typeOnly)} onclick={() => send({ type: 'FLOW.FOLLOW', path: selected.file.filename })}>Follow imports from this file</button>
      {#if related.length}<strong class="related-label">Related changed files</strong>{/if}
      {#each related as candidate (candidate.file.filename)}
        <a href={fileHref?.(candidate.file.filename) ?? "#"} class="related" title={candidate.file.filename} data-event="organization-related-file" onclick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); reveal(candidate.file.filename); }}>
          <strong>{candidate.file.name}</strong><small>{candidate.reason}</small>
          {#if candidate.edges[0]?.evidence[0]}<small>Source line {candidate.edges[0].evidence[0].line} · {candidate.edges[0].resolution.replaceAll('_', ' ')}</small>{/if}
        </a>
      {/each}
    </details>
  {/if}
  <div class="queue" aria-label="Ordered changed files">
    {#each groups as group}
      <div class="folder-group">
        {#if group.name}
          <button class="folder" aria-expanded={!controls.collapsedFolders.includes(group.name)} aria-label={`${controls.collapsedFolders.includes(group.name) ? 'Expand' : 'Collapse'} folder ${group.name}`} data-event="organization-toggle-folder" onclick={() => send({ type: 'FOLDER.TOGGLE', directory: group.name })}>
            <span class="folder-chevron" aria-hidden="true">{controls.collapsedFolders.includes(group.name) ? '▸' : '▾'}</span><span class="folder-name">{group.name}</span><span class="count">{group.entries.length}</span>
          </button>
        {/if}
        {#if !group.name || !controls.collapsedFolders.includes(group.name)}
          {#each group.entries as entry (entry.file.filename)}
            {@render queueEntry(entry)}
          {/each}
        {/if}
      </div>
    {/each}
    {#if !model.visible.length}<p class="note">No visible files match. <button onclick={() => { send({ type: 'QUERY.SET', query: '' }); send({ type: 'SHOW_ALL' }); }}>Show all files</button></p>{/if}
  </div>
  {#if foldedEntries.length}
    <details open={Boolean(controls.query)}><summary>Folded files ({foldedEntries.length})</summary>
      {#each foldedEntries as entry (entry.file.filename)}{@render queueEntry(entry)}{/each}
    </details>
  {/if}
  {#if model.hidden.length}
    <details><summary>Hidden files ({model.hidden.length})</summary>
      {#each model.hidden as entry (entry.file.filename)}
        <button class="restore-file" data-event="organization-restore-file" title={entry.file.filename} onclick={() => reveal(entry.file.filename)}>{entry.file.name} · Show</button>
      {/each}
    </details>
  {/if}
  <details><summary>Source coverage and limits</summary>{#each graph.diagnostics as diagnostic}<p class="note">{diagnostic}</p>{/each}<p class="note">Aliases and unchanged targets may resolve differently. This is not a complete call graph.</p></details>
</div>

<style>
  a.queue-file, a.related { text-decoration: none; color: inherit; }
  .open-beside { margin: -3px 0 6px 24px; font-size: 10px; color: var(--muted); }
  .organization { padding: 10px 8px 24px; font-size: 12px; color: var(--text); }
  .organization-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
  label { display:flex; gap:6px; align-items:center; justify-content:space-between; margin:8px 0; }
  input[type='search'], select { color:var(--text); background:var(--bg); border:1px solid var(--border-soft); border-radius:5px; padding:6px; min-width:0; }
  input[type='search'] { box-sizing:border-box; width:100%; }
  select { max-width:62%; }
  button { color:var(--link); border:0; background:transparent; cursor:pointer; font:inherit; }
  button:disabled { opacity:.45; cursor:default; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline:2px solid var(--link); outline-offset:2px; }
  .group-toggle { justify-content:flex-start; color:var(--text-dim); }
  details { border-top:1px solid var(--border-soft); padding:9px 2px; }
  summary { cursor:pointer; }
  summary span { display:block; font-size:11px; color:var(--text-dim); padding-top:5px; }
  .note { color:var(--text-dim); line-height:1.5; font-size:11px; overflow-wrap:anywhere; }
  ul.note { padding-left:16px; }
  .error { color:var(--red); }
  .role-rule span { color:var(--text-dim); margin-left:auto; }
  .role-rule select { width:80px; }
  .queue-file { width:100%; display:flex; align-items:center; gap:7px; text-align:left; color:var(--text); padding:9px 4px; border-bottom:1px solid var(--border-soft); }
  .queue-file.active { background:var(--bg-hover); border-left:2px solid var(--link); }
  .queue-file.folded { color:var(--text-dim); }
  .path { flex:1; min-width:0; }
  strong, small { display:block; overflow:hidden; text-overflow:ellipsis; }
  .path strong { font-weight:500; font-family:var(--font-code,monospace); }
  small { color:var(--text-dim); margin-top:4px; font-size:10px; }
  .rank { cursor:help; text-decoration:underline dotted; text-underline-offset:3px; }
  .rank, .count { color:var(--text-faint); font-size:10px; }
  .file-stats { flex:none; text-align:right; font-size:10px; white-space:nowrap; }
  .added { color:var(--add-text, #73c991); }
  .removed { color:var(--del-text, #e99299); }
  .fold-label { display:block; color:var(--text-dim); margin-top:3px; }
  .folder { display:flex; align-items:baseline; gap:6px; width:100%; padding:12px 4px 7px; color:var(--text-dim); text-align:left; }
  .folder:hover { color:var(--text); background:var(--bg-hover); }
  .folder-chevron { flex:none; }
  .folder-name { flex:1; min-width:0; overflow-wrap:anywhere; }
  .restore-file, .related { display:block; width:100%; padding:8px 2px; text-align:left; }
  .related small { white-space:normal; }
  .related-label { margin-top:14px; }
  .follow { margin:10px 0; text-align:left; }
</style>
