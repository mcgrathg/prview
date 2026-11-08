<script>
  import { createActor } from 'xstate';
  import { onDestroy, tick, untrack } from 'svelte';
  import { isTypingTarget } from './dom.js';
  import { reviewSidebarMachine } from './reviewSidebarMachine.js';

  let { children, count = null, onSearch, modalOpen = false, variant = 'review', heading = 'Changed files', storageKey = 'pr-cockpit:review-sidebar', defaultPinned = true, shortcuts = null, navigation = null } = $props();
  const preferenceKey = untrack(() => storageKey);
  let savedPinned = untrack(() => defaultPinned);
  try { const saved = localStorage.getItem(preferenceKey); if (saved === 'pinned' || saved === 'collapsed') savedPinned = saved === 'pinned'; } catch {}
  let sidebarLabel = $derived(variant === 'app' ? 'app navigation' : 'file sidebar');
  const actor = createActor(reviewSidebarMachine, { input: { pinned: savedPinned } }).start();
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe(next => snapshot = next);
  onDestroy(() => { subscription.unsubscribe(); actor.stop(); });
  let pinned = $derived(snapshot.matches('pinned'));
  let expanded = $derived(!snapshot.matches('closed'));
  let root = $state();
  let trigger = $state();
  let restoringFocus = false;
  let collapseButton = $state();
  let persistenceError = $state('');
  const panelId = $props.id();

  function send(event) {
    const before = actor.getSnapshot().matches('pinned');
    actor.send(event);
    const after = actor.getSnapshot().matches('pinned');
    if (before !== after) {
      try { localStorage.setItem(preferenceKey, after ? 'pinned' : 'collapsed'); persistenceError = ''; }
      catch { persistenceError = 'This sidebar choice could not be saved on this device.'; }
    }
  }
  async function focusTrigger() {
    restoringFocus = true;
    await tick(); trigger?.focus({ preventScroll: true });
    restoringFocus = false;
  }
  async function pin() {
    send({ type: 'PIN' }); await tick(); collapseButton?.focus({ preventScroll: true });
  }
  export function dismiss() {
    if (pinned) return;
    const returnFocus = root?.contains(document.activeElement);
    send({ type: 'CLOSE' });
    if (returnFocus) void focusTrigger();
  }
  function collapse() {
    send({ type: 'COLLAPSE' });
    void focusTrigger();
  }
  $effect(() => {
    if (pinned || !expanded) return;
    const outside = event => { if (!root?.contains(event.target)) send({ type: 'CLOSE' }); };
    const escape = event => { if (!modalOpen && !root?.contains(event.target) && !isTypingTarget(event.target) && ![...document.querySelectorAll('[role=dialog], [role=alertdialog]')].some(dialog => dialog.getClientRects().length)) keydown(event); };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape, true); };
  });
  $effect(() => { if (modalOpen) send({ type: 'CLOSE' }); });
  function sidebarEvents(node) {
    const content = target => Boolean(target && node.contains(target) && !target.closest?.('[data-sidebar-navigation]'));
    const handlers = {
      pointerover: event => { if (event.pointerType !== 'touch' && content(event.target) && !content(event.relatedTarget)) send({ type:'POINTER_ENTER' }); },
      pointerout: event => { if (content(event.target) && !content(event.relatedTarget)) send({ type:'POINTER_LEAVE' }); },
      pointerdown: event => { if (content(event.target) && !pinned) send({type:'OPEN'}); },
      focusin: event => { if (!restoringFocus && content(event.target) && !content(event.relatedTarget)) send({type:'FOCUS_ENTER'}); },
      focusout: event => { if (content(event.target) && !content(event.relatedTarget)) send({type:'FOCUS_LEAVE',hovered:node.matches(':hover') && !node.querySelector('[data-sidebar-navigation]:hover')}); },
      keydown,
      click: event => { if (variant === 'app' && event.target.closest?.('a[href]')) dismiss(); },
    };
    for (const [name, handler] of Object.entries(handlers)) node.addEventListener(name, handler);
    return { destroy() { for (const [name, handler] of Object.entries(handlers)) node.removeEventListener(name, handler); } };
  }
  function keydown(event) {
    if (event.key === 'Escape' && !event.defaultPrevented && !pinned && expanded) {
      event.preventDefault(); event.stopPropagation(); dismiss();
    }
  }
</script>

<aside class="review-sidebar" class:pinned class:app={variant === 'app'} data-kind={variant} data-pinned={pinned} data-state={snapshot.value} bind:this={root} aria-label={`${heading} sidebar`} use:sidebarEvents>
  {#if navigation}<div class="sidebar-navigation" data-sidebar-navigation>{@render navigation(!pinned)}</div>{/if}
  {#if !pinned}
    <nav class="compact-rail" aria-label={`Compact ${sidebarLabel}`}>
      <button bind:this={trigger} class="rail-button" type="button" aria-label={`Open ${sidebarLabel}`} aria-expanded={expanded} aria-controls={panelId} title={`${heading} — hover to preview, click to open`} onclick={() => send({ type: 'OPEN' })}>
        {@render panelIcon()}{#if count !== null}<small>{count}</small>{/if}
      </button>
      <button class="rail-button" type="button" aria-label={variant === 'app' ? 'Find a pull request' : 'Find files and search code'} title={variant === 'app' ? 'Find a pull request' : 'Find files and search code'} onclick={() => { dismiss(); onSearch?.(); }}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/></svg>
      </button>
      {#if shortcuts}{@render shortcuts()}{/if}
      <button class="rail-button" type="button" aria-label={`Pin ${sidebarLabel} open`} title={`Keep ${sidebarLabel} open`} onclick={pin}>{@render pinIcon()}</button>
    </nav>
  {/if}
  <div class="sidebar-panel" class:preview={!pinned} hidden={!expanded} inert={!expanded} id={panelId}>
    <div class="sidebar-heading"><strong class:history-heading={navigation && pinned}>{heading}{#if count !== null} <small>{count}</small>{/if}</strong><div class="sidebar-actions">
      {#if !pinned}<button type="button" aria-label={`Pin ${sidebarLabel} open`} title={`Keep ${sidebarLabel} open`} onclick={pin}>{@render pinIcon()}</button>{/if}
      <button bind:this={collapseButton} type="button" aria-label={pinned ? `Collapse ${sidebarLabel}` : `Close ${sidebarLabel} preview`} title={pinned ? 'Collapse sidebar — hover the compact rail to reopen' : 'Close preview'} onclick={pinned ? collapse : dismiss}>{@render panelIcon()}</button>
    </div></div>
    {#if persistenceError}<p class="storage-note" role="status">{persistenceError}</p>{/if}
    <div class="sidebar-body">{@render children()}</div>
  </div>
</aside>

{#snippet panelIcon()}<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M7 3v14m7-9-3 2 3 2"/></svg>{/snippet}
{#snippet pinIcon()}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 3 6 0-1 5 3 3H5l3-3-1-5zm3 8v6"/></svg>{/snippet}

<style>
  .review-sidebar { grid-column:1; grid-row:2; position:sticky; top:24px; align-self:start; min-width:0; max-height:calc(var(--general-height) - 140px); z-index:12; }
  .sidebar-panel { display:flex; flex-direction:column; max-height:calc(var(--general-height) - 140px); min-width:0; background:var(--bg); }
  .sidebar-panel[hidden] { display:none; }
  .sidebar-panel.preview { position:absolute; left:46px; top:0; width:min(max(280px, var(--tree-width, 250px)), calc(100vw - 96px)); border:1px solid var(--border); border-radius:10px; background:var(--panel); box-shadow:var(--shadow-dialog); }
  .sidebar-heading { display:flex; align-items:center; justify-content:space-between; gap:6px; min-height:34px; padding:0 8px 8px; }
  .preview .sidebar-heading { padding:8px; }
  strong { font-size:13px; font-weight:500; }
  small { color:var(--text-dim); font-size:10px; }
  strong small { margin-left:5px; }
  .sidebar-actions { display:flex; gap:3px; }
  button { display:inline-flex; align-items:center; justify-content:center; min-width:30px; min-height:30px; padding:5px; border:0; border-radius:6px; background:transparent; color:var(--text-dim); cursor:pointer; }
  button:hover { background:var(--bg-hover); color:var(--text); }
  button:focus-visible { outline:2px solid var(--link); outline-offset:1px; }
  svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
  .sidebar-body { overflow-y:auto; overflow-x:hidden; min-height:0; }
  .compact-rail { display:flex; flex-direction:column; align-items:center; gap:9px; width:44px; min-height:210px; padding-top:2px; border-right:1px solid var(--border-soft); }
  .rail-button { flex-direction:column; gap:4px; width:36px; min-height:36px; }
  .storage-note { font-size:11px; color:var(--text-dim); padding:0 8px; }
  .review-sidebar.app { grid-column:1; grid-row:2; position:relative; top:0; height:100%; max-height:none; z-index:30; }
  .app .sidebar-panel { height:100%; max-height:100%; background:var(--panel); }
  .app .sidebar-panel.preview { top:8px; height:calc(100% - 16px); }
  .app {display:flex; flex-direction:column;}
  .app .compact-rail { flex:1; min-height:0; height:auto; padding-top:12px; padding-bottom:8px; overflow-y:auto; }
  .sidebar-navigation { padding:12px 4px 0; width:44px; box-sizing:border-box; border-right:1px solid var(--border-soft); flex-shrink:0; -webkit-app-region:no-drag; }
  .pinned .sidebar-navigation { position:absolute; z-index:2; top:0; left:4px; width:auto; border:0; }
  .history-heading { visibility:hidden; }
  .app .sidebar-panel.preview { max-height:calc(100% - 16px); }
  .app .sidebar-heading { padding:12px 8px; }
  .app .sidebar-body { flex:1; }
  .compact-rail :global(a) { display:flex; justify-content:center; align-items:center; width:36px; height:36px; border-radius:6px; color:var(--text-dim); }
  .compact-rail :global(a:hover) { background:var(--bg-hover); color:var(--text); }
  .compact-rail :global(a:focus-visible) { outline:2px solid var(--link); }
  .compact-rail :global(a svg) { width:18px; height:18px; }
  @media (max-width:940px) { .review-sidebar { top:12px; } .review-sidebar.pinned:not(.app) { position:relative; grid-column:1 / -1; grid-row:2; margin-bottom:12px; } .pinned:not(.app) .sidebar-panel { max-height:250px; } }
  @media (max-width:700px) {
    .app.pinned .sidebar-navigation { left:50px; top:8px; }
    .app.pinned .sidebar-panel { position:absolute; left:46px; top:8px; width:min(280px, calc(100vw - 80px)); height:calc(100% - 16px); border:1px solid var(--border); border-radius:10px; box-shadow:var(--shadow-dialog); }
  }
</style>
