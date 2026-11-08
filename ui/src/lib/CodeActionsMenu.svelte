<script>
  import { tick } from 'svelte';
  import { createActor, assign, setup } from 'xstate';
  import { REVIEW_NAVIGATION_EVENT } from './reviewHistory.js';
  let { onDefinition, onReferences, onHistory = null, onInspect = null } = $props();
  let menu;
  const machine = setup({}).createMachine({ id: 'code-actions', initial: 'closed', context: { target: null, extras: [], x: 0, y: 0 },
    states: { closed: {}, open: {} },
    on: {
      OPEN: { target: '.open', actions: assign(({ event }) => ({ target: event.target, extras: event.extras, x: event.x, y: event.y })) },
      POSITION: { actions: assign(({ event }) => ({ x: event.x, y: event.y })) },
      CLOSE: { target: '.closed', actions: assign({ target: null, extras: [] }) },
    },
  });
  const actor = createActor(machine).start();
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe(next => snapshot = next);
  $effect(() => () => { subscription.unsubscribe(); actor.stop(); });
  function portal(node) { document.body.append(node); return { destroy() { node.remove(); } }; }
  export async function open(event, target, extras = []) {
    event.preventDefault();
    actor.send({ type: 'OPEN', target, extras, x: event.clientX, y: event.clientY });
    await tick();
    if (!menu || actor.getSnapshot().context.target !== target) return;
    const rect = menu.getBoundingClientRect();
    actor.send({ type: 'POSITION', x: Math.max(8, Math.min(event.clientX, innerWidth - rect.width - 8)), y: Math.max(8, Math.min(event.clientY, innerHeight - rect.height - 8)) });
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  function run(action) { const target = actor.getSnapshot().context.target; actor.send({ type: 'CLOSE' }); action(target); }
  $effect(() => {
    if (!snapshot.matches('open')) return;
    const close = () => actor.send({ type: 'CLOSE' });
    const outside = event => { if (!menu?.contains(event.target)) close(); };
    const keys = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', keys, true);
    for (const name of ['popstate', 'hashchange', REVIEW_NAVIGATION_EVENT]) window.addEventListener(name, close);
    return () => {
      window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', keys, true);
      for (const name of ['popstate', 'hashchange', REVIEW_NAVIGATION_EVENT]) window.removeEventListener(name, close);
    };
  });
</script>
{#if snapshot.matches('open')}
  {@const target = snapshot.context.target}
  <div use:portal bind:this={menu} class="code-actions" data-code-overlay role="menu" aria-label={`Code actions for ${target.symbol}`} style:left={`${snapshot.context.x}px`} style:top={`${snapshot.context.y}px`}>
    <strong>{target.symbol}</strong>
    {#if onInspect}<button role="menuitem" onclick={() => { const event = {clientX:snapshot.context.x,clientY:snapshot.context.y}; run(value => onInspect(event,value,true)); }}>Inspect symbol</button>{/if}
    <button role="menuitem" onclick={() => run(value => onDefinition?.(value.symbol, value.path, value.position))}>Open definition file</button>
    <button role="menuitem" disabled={!onReferences || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(target.symbol)} onclick={() => run(value => onReferences(value.symbol, value.path, value.position))}>Find references <small>Alt-click</small></button>
    {#if onHistory}<button role="menuitem" onclick={() => run(value => onHistory(value.path, value.symbol))}>Mention history</button>{/if}
    {#each snapshot.context.extras as action}<button role="menuitem" onclick={() => run(() => action.run())}>{action.label}</button>{/each}
  </div>
{/if}
<style>
  .code-actions { position: fixed; z-index: 200; width: max-content; min-width: 190px; max-width: 360px; padding: 5px; color: var(--text, #eee); background: var(--panel, #242424); border: 1px solid var(--border, #555); border-radius: 8px; box-shadow: 0 8px 24px #0006; font: 12px/1.4 system-ui; }
  strong { display: block; font: 11px monospace; color: var(--muted, #aaa); padding: 5px 8px; overflow: hidden; text-overflow: ellipsis; }
  button { display: flex; gap: 20px; justify-content: space-between; width: 100%; text-align: left; padding: 7px 8px; border: 0; background: transparent; color: inherit; cursor: pointer; border-radius: 4px; }
  button:hover, button:focus-visible { background: var(--hover, #ffffff18); outline: 1px solid var(--link, #669dff); }
  button:disabled { opacity: .4; cursor: default; } small { color: var(--muted, #aaa); }
</style>
