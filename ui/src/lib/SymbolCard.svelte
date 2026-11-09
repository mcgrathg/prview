<script>
  import { tick } from 'svelte';
  import { createSymbolLookup } from './symbolContext.js';
  import {isPromptDialogOpen} from './dom.js';
  import OpenInVscode from './OpenInVscode.svelte';
  import { REVIEW_NAVIGATION_EVENT } from './reviewHistory.js';
  let { context = '', onOpen = null, onReferences = null } = $props();
  let card = $state(null);
  let previousFocus;
  let x = $state(8), y = $state(8), expanded = $state(false), chosen = $state(null);
  const actor = createSymbolLookup({getContext:()=>context,onOpen:(...args)=>onOpen?.(...args)}).start();
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe(next => snapshot = next);
  $effect(() => () => { subscription.unsubscribe(); actor.stop(); });
  $effect(() => { context; close(); });
  let request = $derived(snapshot.context.request);
  let result = $derived(snapshot.context.result);
  let definition = $derived(chosen ?? result?.definition);
  function portal(node) { document.body.append(node); return {destroy() { node.remove(); }}; }
  export function close() { actor.send({type: 'CANCEL'}); }
  export async function inspect(event, target, keyboard = false, intent = 'inspect') {
    previousFocus = event.returnFocus ?? document.activeElement;
    x = Math.max(8, Math.min(event.clientX, innerWidth - 408));
    y = Math.max(8, Math.min(event.clientY + 12, innerHeight - 220));
    expanded = intent==='preview'; chosen = null;
    const captured={...target,intent,cardContext:context};
    actor.send({type: 'LOAD', request: captured});
    await tick();
    if (!card || actor.getSnapshot().context.request !== captured) return;
    if (keyboard) card.querySelector('button')?.focus();
  }
  function dismiss() {
    const restore = card?.contains(document.activeElement);
    close();
    if (restore && previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
  }
  function open(beside) {
    const target = definition, origin = request;
    close(); onOpen?.(target, origin, beside);
  }
  function references() {
    const target = request;
    close(); onReferences?.(target.symbol, target.path, target.position);
  }
  $effect(() => {
    if (snapshot.matches('idle')) return;
    const outside = event => { if (!card?.contains(event.target)) close(); };
    const keys = event => { if (isPromptDialogOpen()) return; if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); dismiss();} };
    const selection = () => { const value = window.getSelection(); if (value?.isCollapsed === false && !card?.contains(value.anchorNode)) close(); };
    const navigate = () => close();
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', keys, true);
    document.addEventListener('selectionchange', selection);
    for (const name of ['popstate', 'hashchange', REVIEW_NAVIGATION_EVENT]) window.addEventListener(name, navigate);
    return () => {
      window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', keys, true);
      document.removeEventListener('selectionchange', selection);
      for (const name of ['popstate', 'hashchange', REVIEW_NAVIGATION_EVENT]) window.removeEventListener(name, navigate);
    };
  });
</script>
{#if request}
  <dialog open use:portal bind:this={card} class="symbol-card" data-code-overlay aria-label={`Symbol ${request.symbol}`} style:left={`${x}px`} style:top={`${y}px`} style:max-height={`calc(100vh - ${y + 8}px)`}>
    <header><strong>{request.symbol}</strong><button class="dismiss" aria-label="Close symbol card" onclick={dismiss}>×</button></header>
    <small>{request.origin.side === 'left' ? 'Original' : 'Source'} · {request.sha?.slice(0, 7)}</small>
    {#if snapshot.matches('loading') || snapshot.matches('retrying')}<p role="status">Finding definition…</p>
    {:else if snapshot.matches('error')}<p role="alert">{snapshot.context.error}</p><button onclick={()=>actor.send({type:'RETRY'})}>Retry lookup</button>
    {:else if snapshot.matches('unavailable')}<p>Definition unavailable ({result?.status}).</p><button onclick={()=>actor.send({type:'RETRY'})}>Retry lookup</button>
    {:else if snapshot.matches('empty')}<p>No definition found at this revision.</p>
    {:else if definition}
      <p class="path" title={definition.path}>{definition.path}:{definition.line ?? 1}</p>
      <pre>{#if expanded && result?.excerpt?.length}{#each result.excerpt as line}<span class:target={line.line === definition.line}>{line.line}  {line.text}
</span>{/each}{:else}{definition.text ?? 'Definition located.'}{/if}</pre>
      {#if result?.excerptStatus}<small>Source excerpt unavailable ({result.excerptStatus}).</small>{/if}
    {:else if result?.candidates?.length}<p>Choose a definition candidate:</p>{/if}
    {#if result?.candidates?.length && !definition}<div class="candidates">{#each result.candidates as candidate}<button onclick={()=>{chosen=candidate; expanded=false;}}>{candidate.path}:{candidate.line}<code>{candidate.text}</code></button>{/each}</div>{/if}
    <footer>
      {#if definition}<button disabled={!result?.excerpt?.length} aria-expanded={expanded} onclick={()=>expanded=!expanded}>Preview definition</button>{/if}
      <button disabled={!onReferences || !/^[A-Za-z_$][\w$]*$/.test(request.symbol)} onclick={references}>Usages</button>
      {#if definition && onOpen}<button onclick={()=>open(false)}>Open in review</button><button onclick={()=>open(true)}>Open beside</button>{/if}
      {#if definition && request.repo}<OpenInVscode repo={request.repo} path={definition.path} line={definition.line ?? 1} />{/if}
    </footer>
  </dialog>
{/if}
<style>
  .symbol-card { position:fixed; margin:0; z-index:210; width:min(400px, calc(100vw - 16px)); max-height: min(440px, calc(100vh - 24px)); overflow:auto; padding:12px; border:1px solid var(--border,#555); border-radius:8px; background:var(--panel,#242424); color:var(--text,#eee); box-shadow:0 10px 32px #0008; font:12px/1.5 system-ui; box-sizing:border-box; }
  header {display:flex; align-items:center; justify-content:space-between; gap:8px;} strong {font:13px var(--font-mono,monospace); overflow-wrap:anywhere;}
  button {padding:5px 8px; border:1px solid var(--border,#555); border-radius:5px; color:inherit; background:transparent; cursor:pointer; font:inherit;}
  button:hover, button:focus-visible {background:var(--hover,#ffffff18); outline:1px solid var(--link,#669dff);} button:disabled {opacity:.4;cursor:default;}
  .dismiss {border:0; font-size:18px; padding:0 5px;} small,.path {color:var(--muted,#aaa);} .path {overflow-wrap:anywhere; margin:9px 0;}
  pre {font:11px/1.6 var(--font-mono,monospace); overflow:auto; max-height:190px; margin:8px 0; background:#0002; padding:7px;}
  pre span {display:block; white-space:pre;} .target {background:#9e6a0320;}
  footer {display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;} .candidates {max-height:200px;overflow:auto;} .candidates button {display:block; text-align:left; width:100%;margin:4px 0;overflow-wrap:anywhere;} code {display:block; font-size:10px;}
</style>
