<script>
  import { tick } from 'svelte';
  import { createActor, assign, fromPromise, setup } from 'xstate';
  import { langForPath } from './highlight.js';
  import { tokenizeCodeBlock } from './offThreadHighlight.js';
  import { theme } from './theme.svelte.js';
  import {sourceEvidence} from './sourceEvidence.js';
  import SymbolCard from './SymbolCard.svelte';
  import { symbolRequest } from './symbolContext.js';
  import CodeActionsMenu from './CodeActionsMenu.svelte';
  import { codeLinkAction } from './codeReference.js';
  import { createDefinitionHover, tokenAtPoint, columnWithin } from './wordAtPoint.js';
  let { repo, pane, headRef = '', onDefinition, onReferences, onHistory = null, onNavigate, onOpenSymbol = null } = $props();
  let root;
  let codeMenu;
  let symbolCard;
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
  export function captureEvidence() {
    if(!snapshot.matches('ready') || !snapshot.context.lines.length)return null;
    const selection=window.getSelection();
    const row=node=>(node?.nodeType===Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('.source-row');
    let startLine=pane.line ?? 1,endLine=startLine,endAtLineStart=false;
    if(selection && !selection.isCollapsed && root?.contains(selection.anchorNode) && root?.contains(selection.focusNode)) {
      const range=selection.getRangeAt(0),start=row(range.startContainer),end=row(range.endContainer);
      if(!start || !end)return null;
      startLine=Number(start.dataset.line);endLine=Number(end.dataset.line);
      const code=end.querySelector('.source-code');
      if(!code)return null;
      if(code.contains(range.endContainer)) {
        const prefix=document.createRange();prefix.selectNodeContents(code);prefix.setEnd(range.endContainer,range.endOffset);
        endAtLineStart=prefix.toString().length===0;
      } else {
        const codeStart=document.createRange();codeStart.selectNodeContents(code);codeStart.collapse(true);
        const endpoint=range.cloneRange();endpoint.collapse(false);
        endAtLineStart=endpoint.compareBoundaryPoints(Range.START_TO_START,codeStart)<=0;
      }
    }
    return sourceEvidence({repo,file:pane.file,rev:pane.side==='left' ? pane.base : pane.rev,base:pane.base,lines:snapshot.context.lines,startLine,endLine,endAtLineStart});
  }
  function lookup(event) {
    if (!event.target.closest(".source-code")) return;
    if (event.detail > 1 || window.getSelection()?.isCollapsed === false) symbolCard?.close();
    const action = codeLinkAction(event, true, window.getSelection()?.isCollapsed === false);
    if (!action) return;
    const token = tokenAtPoint(event.clientX, event.clientY, true);
    const row = event.target.closest('.source-row');
    const code = row?.querySelector('.source-code');
    const character = token && code ? columnWithin(code, token) : null;
    if (!token || character == null) return;
    event.preventDefault();
    const position = {line:Number(row.dataset.line), character, side:pane.side ?? 'right'};
    if (action === 'inspect') inspectSymbol(event, {symbol:token.word,path:pane.file,position});
    else (action === "references" ? onReferences : onDefinition)?.(token.word, pane.file, position, pane);
  }
  function inspectSymbol(event, target, keyboard = false) {
    symbolCard?.inspect(event, symbolRequest(target.symbol, target.path, {...target.position, side:pane.side ?? 'right'}, {repo, headRef, ...pane, view:'source'}), keyboard);
  }
  function openSymbol(definition, request, beside) {
    if (onOpenSymbol) onOpenSymbol(definition, request, beside);
    else onDefinition?.(request.symbol, request.path, request.position, pane);
  }
  function contextMenu(event) {
    if (!event.target.closest('.source-code')) return;
    const token = tokenAtPoint(event.clientX, event.clientY, true);
    const row = event.target.closest('.source-row');
    const character = token && columnWithin(row.querySelector('.source-code'), token);
    if (token && character != null) codeMenu?.open(event, { symbol: token.word, path: pane.file, position: { line: Number(row.dataset.line), character } });
  }
</script>
<div class="source-file" bind:this={root} onclick={lookup} oncontextmenu={contextMenu} onmousemove={event => definitionHover.onMouseMove(event, event.target.closest(".source-code"))} onmouseleave={definitionHover.onMouseLeave} title="Click to inspect; Cmd/Ctrl-click to follow; Alt-click for references; right-click for code actions; drag to select code" role="region" aria-label={`Source ${pane.file}`}>
  {#if snapshot.matches('loading')}<p role="status">Loading pinned source…</p>
  {:else if snapshot.matches('error')}<p role="alert">{snapshot.context.error} <button onclick={() => actor.send({ type: 'LOAD', request: { repo, headRef, pane } })}>Retry source</button></p>
  {:else}
    {#each snapshot.context.lines as line, i}<div class="source-row" class:target={pane.line === i + 1} data-line={i + 1}><button class="line" aria-label={`Select line ${i + 1}`} onclick={() => onNavigate?.({ line: i + 1 })}>{i + 1}</button><span class="source-code">{#if tokens?.[i]}{#each tokens[i] as token}<span style:color={token.color}>{token.content}</span>{/each}{:else}{line}{/if}</span></div>{/each}
  {/if}
</div>
<SymbolCard bind:this={symbolCard} context={JSON.stringify([repo,pane.file,pane.rev,pane.base,pane.side,pane.line])} onOpen={openSymbol} {onReferences} />
<CodeActionsMenu bind:this={codeMenu} onInspect={inspectSymbol} {onDefinition} {onReferences} {onHistory} />
<style>
  .source-file { font: 11px/1.7 var(--font-mono, monospace); min-width: max-content; }
  .source-row { white-space: pre; display: flex; }
  .target { background: #9e6a0330; }
  .line { width: 46px; flex-shrink: 0; color: var(--muted); padding: 0 8px; text-align: right; user-select: none; }
  .source-code { padding-right: 20px; }
</style>
