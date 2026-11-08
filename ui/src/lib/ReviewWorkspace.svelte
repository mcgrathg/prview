<script>
  import { onMount, mount, unmount, untrack } from 'svelte';
  import { createActor } from 'xstate';
  import { createDockview, themeDark } from 'dockview';
  import 'dockview/dist/styles/dockview.css';
  import WorkspaceContent from './WorkspaceContent.svelte';
  import { WorkspaceStore } from './workspaceStore.svelte.js';
  import { REVIEW_FILE_DRAG_EVENT, fileDropPosition } from './reviewFileDrag.js';
  import { theme } from './theme.svelte.js';
  import { normalizeReviewState } from './reviewRoute.js';
  import { workspaceMachine } from './workspaceMachine.js';

  let { content, identity, locations = [], active = null, onChange, availableFiles = [], onReady = null } = $props();
  const actor = createActor(workspaceMachine);
  const store = new WorkspaceStore();
  let container;
  let api;
  let syncing = false;
  let restoring = false;
  let ready = $state(false);
  let dropHint = $state(null);
  const layoutKey = () => `prview:workspace-layout:v1:${identity}`;
  const title = pane => pane.view === 'files' ? 'Changed files' : pane.view === 'related' ? 'Related files' : pane.file?.split('/').at(-1) ?? 'Code';
  const signature = (panes, selected) => { const state = normalizeReviewState({ panes, active: selected }); return JSON.stringify({ panes: state.panes ?? [], active: state.active ?? null }); };
  let emitted = '';
  let lastCodePane = null;
  let historyMode = 'push';
  const isCode = pane => !['files', 'related'].includes(pane?.view);
  function fileDrop(event) {
    try { const value = JSON.parse(event.dataTransfer?.getData('application/x-prview-file') ?? 'null'); return value && availableFiles.includes(value.file) ? value : null; } catch { return null; }
  }

  function saveGeometry() {
    if (!api || restoring) return;
    try { localStorage.setItem(layoutKey(), JSON.stringify(api.toJSON())); } catch {}
  }
  function publish() {
    if (restoring) return;
    const { panes, active } = store.context;
    const key = signature(panes, active);
    if (key === emitted) return;
    emitted = key;
    const mode = historyMode; historyMode = 'push';
    onChange({ panes, active }, mode);
  }
  function reconcile() {
    if (!api || syncing) return;
    syncing = true;
    const { panes, active } = store.context;
    for (const panel of [...api.panels]) if (!panes.some(p => p.id === panel.id)) panel.api.close();
    for (const pane of panes) {
      const panel = api.getPanel(pane.id);
      if (panel) { if (panel.api.title !== title(pane)) panel.api.setTitle(title(pane)); }
      else api.addPanel({ id: pane.id, component: 'review', title: title(pane), renderer: 'always',
        position: api.panels.length ? { referencePanel: api.panels.at(-1).id, direction: 'right' } : undefined });
    }
    if (active && api.getPanel(active) && api.activePanel?.id !== active) api.getPanel(active).api.setActive();
    syncing = false;
    publish();
  }
  const subscription = actor.subscribe(next => { store.context = next.context; const active = next.context.panes.find(p => p.id === next.context.active); if (active && isCode(active)) lastCodePane = active.id; reconcile(); });
  actor.start();

  export function openFile(file, beside = false, location = {}) {
    const pane = store.context.panes.find(p => p.id === (isCode(store.context.panes.find(p => p.id === store.context.active)) ? store.context.active : lastCodePane)) ?? store.context.panes.find(isCode);
    if (beside || !pane) {
      actor.send({ type: 'OPEN', location: { ...pane, id: undefined, file, ...location } });
    } else actor.send({ type: 'NAVIGATE', id: pane.id, patch: { file, line: null, view: 'diff', ...location } });
  }
  export function updatePane(id, patch, mode = 'push') { historyMode = mode; actor.send({ type: 'UPDATE', id, patch }); }
  export function focusPane(id) { if (store.context.active === id) return; actor.send({ type: 'ACTIVATE', id }); }
  export function addView(view) { const pane = store.context.panes.find(p => p.id === store.context.active); actor.send({ type: 'OPEN', location: { view, file: pane?.file } }); }
  export function movePane(id, direction) {
    const panel = api?.getPanel(id);
    if (!panel) return;
    const other = api.panels.find(p => p.id !== id);
    if (!other) return;
    panel.api.moveTo({ group: other.group, position: direction });
    saveGeometry();
  }
  export function closePane(id) { actor.send({ type: 'CLOSE', id }); }
  export function resetLayout() {
    if (!api) return;
    localStorage.removeItem(layoutKey());
    const panes = [...store.context.panes];
    restoring = syncing = true;
    api.clear();
    syncing = false;
    actor.send({ type: 'RESTORE', panes, active: store.context.active });
    restoring = false;
    saveGeometry();
  }

  $effect(() => {
    const key = signature(locations, active);
    if (!ready || key === untrack(() => signature(store.context.panes, store.context.active))) return;
    emitted = key;
    restoring = true;
    actor.send({ type: 'RESTORE', panes: locations, active });
    restoring = false;
  });

  onMount(() => {
    api = createDockview(container, { theme: themeDark, dndStrategy: 'pointer', createComponent: () => {
      const element = document.createElement('div');
      element.style.cssText = 'height:100%;min-height:0;overflow:hidden';
      let component;
      return { element, init(params) { component = mount(WorkspaceContent, { target: element, props: { content, store, id: params.api.id } }); },
        dispose() { if (component) void unmount(component); } };
    } });
    restoring = true;
    actor.send({ type: 'RESTORE', panes: untrack(() => locations), active: untrack(() => active) });
    try {
      const saved = JSON.parse(localStorage.getItem(layoutKey()) ?? 'null');
      const ids = Object.keys(saved?.panels ?? {}).sort();
      const wanted = store.context.panes.map(p => p.id).sort();
      if (saved && JSON.stringify(ids) === JSON.stringify(wanted)) {
        api.fromJSON(saved);
        reconcile();
      }
    } catch { reconcile(); }
    restoring = false;
    const rowDrag = event => {
      const { type, location, x, y } = event.detail;
      if (type === 'cancel' || !availableFiles.includes(location.file)) { dropHint = null; return; }
      const target = api.groups.map(group => ({ group, rect: group.element.getBoundingClientRect() })).find(({ rect }) => fileDropPosition(rect, x, y));
      if (!target) { dropHint = null; return; }
      const direction = fileDropPosition(target.rect, x, y);
      if (type === 'move') {
        const rect = target.rect;
        const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        if (direction === 'left' || direction === 'right') { box.width /= 2; if (direction === 'right') box.left += box.width; }
        if (direction === 'top' || direction === 'bottom') { box.height /= 2; if (direction === 'bottom') box.top += box.height; }
        const scale = theme.generalScale / 100;
        dropHint = { left: box.left / scale, top: box.top / scale, width: box.width / scale, height: box.height / scale, direction };
      } else if (type === 'drop') {
        dropHint = null;
        if (store.context.panes.length >= 8) return;
        actor.send({ type: 'OPEN', location });
        api.getPanel(store.context.active)?.api.moveTo({ group: target.group, position: direction });
        saveGeometry();
      }
    };
    window.addEventListener(REVIEW_FILE_DRAG_EVENT, rowDrag);
    const subscriptions = [
      api.onDidActivePanelChange(({ panel }) => { if (!syncing && !restoring && panel) actor.send({ type: 'ACTIVATE', id: panel.id }); }),
      api.onDidRemovePanel(panel => { if (!syncing && !restoring) actor.send({ type: 'CLOSE', id: panel.id }); }),
      api.onDidLayoutChange(saveGeometry),
      api.onUnhandledDragOver(event => { if (event.nativeEvent.dataTransfer?.types.includes('application/x-prview-file')) event.accept(); }),
      api.onDidDrop(event => {
        if (event.getData()) return;
        const location = fileDrop(event.nativeEvent);
        if (!location || store.context.panes.length >= 8) return;
        actor.send({ type: 'OPEN', location });
        const panel = api.getPanel(store.context.active);
        if (panel && event.group) panel.api.moveTo({ group: event.group, position: event.position, index: event.index });
        saveGeometry();
      }),
    ];
    const focusNext = event => {
      if (event.key !== 'F6' || !api.panels.length) return;
      event.preventDefault();
      const current = api.panels.findIndex(panel => panel.id === store.context.active);
      const next = api.panels[(current + (event.shiftKey ? api.panels.length - 1 : 1)) % api.panels.length];
      next.api.setActive();
      container.querySelector(`[data-pane-id="${next.id}"] button`)?.focus();
    };
    container.addEventListener('keydown', focusNext);
    const fit = () => {
      const scale = theme.generalScale / 100;
      const bottom = window.innerWidth < 700 ? 76 : 48;
      const height = Math.max(260, (window.innerHeight - Math.max(0, container.getBoundingClientRect().top) - bottom) / scale);
      if (Math.abs(container.clientHeight - height) > 1) container.style.height = `${height}px`;
      api.layout(container.clientWidth, container.clientHeight);
    };
    const resize = new ResizeObserver(fit);
    resize.observe(container);
    window.addEventListener('resize', fit);
    fit();
    ready = true;
    onReady?.();
    return () => { window.removeEventListener(REVIEW_FILE_DRAG_EVENT, rowDrag); container.removeEventListener('keydown', focusNext); window.removeEventListener('resize', fit); resize.disconnect(); subscriptions.forEach(s => s.dispose()); subscription.unsubscribe(); actor.stop(); api.dispose(); };
  });
</script>
<div class="review-workspace" bind:this={container} aria-label="Dockable review workspace"></div>
{#if dropHint}<div class="file-drop-hint" style:left={`${dropHint.left}px`} style:top={`${dropHint.top}px`} style:width={`${dropHint.width}px`} style:height={`${dropHint.height}px`} role="status">{dropHint.direction === 'center' ? 'Drop to add a tab' : `Drop to split ${dropHint.direction}`}</div>{/if}
<style>
  .file-drop-hint { position: fixed; z-index: 1000; pointer-events: none; background: #3785d644; border: 2px solid #5a9ee7; color: var(--text); display: grid; place-items: center; font-size: 13px; border-radius: 4px; }

  .review-workspace { height: 420px; min-height: 260px; width: 100%; }
  .review-workspace :global(.dv-tabs-and-actions-container) { font: 12px var(--font-mono, monospace); }
</style>
