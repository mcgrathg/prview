<script>
  import { fetchPrDiff } from './api.js';
  import { loadDiffDocument } from './diffDocument.js';
  let { repo, number, pane, comparison, currentFile, currentResources, content } = $props();
  let document = $state.raw(null);
  let error = $state('');
  let retry = $state(0);
  let root;
  let sameComparison = $derived((!pane.rev || pane.rev === comparison.head) && (!pane.base || pane.base === comparison.base));
  let file = $derived(sameComparison ? currentFile : document?.files.find(file => file.path === pane.file));
  let resources = $derived(sameComparison ? currentResources : {
    identity: `${repo}:${pane.base}..${pane.rev}`,
    read: path => document?.read(path),
    warm: (path, visible) => visible ? document?.hydrate(path) : document?.prefetch(path),
    release: path => document?.release(path),
  });
  $effect(() => {
    if (sameComparison) return;
    const source = { repo, number, base: pane.base, head: pane.rev };
    const attempt = retry;
    let cancelled = false;
    let owned;
    const controller = new AbortController();
    document = null; error = '';
    (async () => {
      if (!source.base || !source.head) throw new Error('This pane does not name a complete immutable comparison.');
      const result = await fetchPrDiff(source.repo, source.number, { base: source.base, head: source.head, mode: 'two-dot' }, controller.signal);
      if (!result.ok) throw new Error(result.building ? 'This pinned comparison is still loading. Retry shortly.' : result.error ?? 'Pinned comparison unavailable.');
      owned = await loadDiffDocument(result.bytes);
      if (cancelled) { owned.dispose(); return; }
      document = owned;
    })().catch(e => { if (!cancelled) error = e.message; });
    return () => { cancelled = true; controller.abort(); owned?.dispose(); };
  });
  let fileLocation = '';
  $effect(() => { const location = `${pane.file}:${resources.identity}`; if (location !== fileLocation) { fileLocation = location; const scroller = root?.closest('.workspace-scroll'); if (scroller) scroller.scrollTop = 0; } });

</script>
<div bind:this={root}>
  {#if error}<p role="alert">{error} <button onclick={() => retry++}>Retry comparison</button></p>
  {:else if !sameComparison && !document}<p role="status">Loading pinned comparison…</p>
  {:else if file}{@render content(file, resources)}
  {:else}<p role="status">This file is unavailable in the pinned comparison. Choose another file or close this pane.</p>{/if}
</div>
