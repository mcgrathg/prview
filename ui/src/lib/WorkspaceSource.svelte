<script>
  import { tick } from 'svelte';
  import { createActor, assign, fromPromise, setup } from 'xstate';
  import { langForPath } from './highlight.js';
  import { tokenizeCodeBlock } from './offThreadHighlight.js';
  import { theme } from './theme.svelte.js';
  import CodeActionsMenu from './CodeActionsMenu.svelte';
  import { codeLinkAction } from './codeReference.js';
  import { createDefinitionHover, tokenAtPoint, columnWithin } from './wordAtPoint.js';
  let { repo, pane, headRef = '', onDefinition, onReferences, onHistory = null, onNavigate } = $props();
  let root;
  let codeMenu;
  const definitionHover = createDefinitionHover(() => onDefinition, () => true);
  $effect(() => () => definitionHover.destroy());
  const machine = setup({ actors: { load: fromPromise(async ({ input, signal }) => {
    const sha = input.pane.side === 'left' ? input.pane.base : input.pane.rev;
    if (!sha) throw new Error('This source pane has no pinned revision.');
    const response = await fetch(`/api/repo-file?${new URLSearchParams({ repo: input.repo, sha, headRef: input.headRef, path: input.pane.file })}`, { signal });
    const result = await response.json();
    if (!response.ok || result.status !== 'ok') throw new Error(result.error ?? `Source unavailable (${result.status ?? response.status}).`);
    return result.content.split('\n');
  }) } }).createMachine({ id: 'pinned-source', initial: 'idle', context: { request: null, lines: [], error: '' },
    on: { LOAD: { target: '.loading', reenter: true, actions: assign(({ event }) => ({ request: event.request, lines: [], error: '' })) } },
    states: { idle: {}, loading: { invoke: { src: 'load', input: ({ context }) => context.request,
      onDone: { target: 'ready', actions: assign(({ event }) => ({ lines: event.output })) },
      onError: { target: 'error', actions: assign(({ event }) => ({ error: event.error.message })) } } }, ready: {}, error: {} },
  });
  const actor = createActor(machine).start();
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe(next => snapshot = next);
  $effect(() => () => { subscription.unsubscribe(); actor.stop(); });
  $effect(() => { actor.send({ type: 'LOAD', request: { repo, headRef, pane: { file: pane.file, rev: pane.rev, base: pane.base, side: pane.side } } }); });
  let tokens = $state(null);
  $effect(() => {
    const lines = snapshot.context.lines;
    const lang = langForPath(pane.file);
    const selectedTheme = theme.shiki;
    let cancelled = false;
    tokens = null;
    if (lang && lines.length <= 5000) void tokenizeCodeBlock(lines.join('\n'), lang, selectedTheme).then(result => { if (!cancelled) tokens = result; }).catch(() => {});
    return () => { cancelled = true; };
  });
  $effect(() => {
    if (!snapshot.matches('ready') || !pane.line || !root) return;
    const line = pane.line;
    void tick().then(() => {
      const row = root?.querySelector(`[data-line="${line}"]`);
      const scroller = root?.closest('.workspace-scroll');
      if (row && scroller) scroller.scrollTop += (row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientHeight / 2) / (scroller.getBoundingClientRect().height / scroller.clientHeight || 1);
    });
  });
  function lookup(event) {
    if (!event.target.closest(".source-code")) return;
    const action = codeLinkAction(event, true, window.getSelection()?.isCollapsed === false);
    if (!action) return;
    const token = tokenAtPoint(event.clientX, event.clientY, true);
    const row = event.target.closest('.source-row');
    const code = row?.querySelector('.source-code');
    const character = token && code ? columnWithin(code, token) : null;
    if (!token || character == null) return;
    event.preventDefault();
    (action === "references" ? onReferences : onDefinition)?.(token.word, pane.file, { line: Number(row.dataset.line), character }, pane);
  }
  function contextMenu(event) {
    if (!event.target.closest('.source-code')) return;
    const token = tokenAtPoint(event.clientX, event.clientY, true);
    const row = event.target.closest('.source-row');
    const character = token && columnWithin(row.querySelector('.source-code'), token);
    if (token && character != null) codeMenu?.open(event, { symbol: token.word, path: pane.file, position: { line: Number(row.dataset.line), character } });
  }
</script>
<div class="source-file" bind:this={root} onclick={lookup} oncontextmenu={contextMenu} onmousemove={event => definitionHover.onMouseMove(event, event.target.closest(".source-code"))} onmouseleave={definitionHover.onMouseLeave} title="Click to follow; Alt-click for references; right-click for code actions; drag to select code" role="region" aria-label={`Source ${pane.file}`}>
  {#if snapshot.matches('loading')}<p role="status">Loading pinned source…</p>
  {:else if snapshot.matches('error')}<p role="alert">{snapshot.context.error} <button onclick={() => actor.send({ type: 'LOAD', request: { repo, headRef, pane } })}>Retry source</button></p>
  {:else}
    {#each snapshot.context.lines as line, i}<div class="source-row" class:target={pane.line === i + 1} data-line={i + 1}><button class="line" aria-label={`Select line ${i + 1}`} onclick={() => onNavigate?.({ line: i + 1 })}>{i + 1}</button><span class="source-code">{#if tokens?.[i]}{#each tokens[i] as token}<span style:color={token.color}>{token.content}</span>{/each}{:else}{line}{/if}</span></div>{/each}
  {/if}
</div>
<CodeActionsMenu bind:this={codeMenu} {onDefinition} {onReferences} {onHistory} />
<style>
  .source-file { font: 11px/1.7 var(--font-mono, monospace); min-width: max-content; }
  .source-row { white-space: pre; display: flex; }
  .target { background: #9e6a0330; }
  .line { width: 46px; flex-shrink: 0; color: var(--muted); padding: 0 8px; text-align: right; user-select: none; }
  .source-code { padding-right: 20px; }
</style>
