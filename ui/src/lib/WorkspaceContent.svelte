<script>
  let { content, store, id } = $props();
  let pane = $derived(store.context.panes.find(p => p.id === id));
</script>
{#if pane}{@render content(pane)}{/if}
