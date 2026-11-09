<script>
  let { label, text = '⋯', children, closeOnAction = false } = $props();
  const id = $props.id();
  let panel, trigger;
  let expanded = $state(false);
  function position() {
    const rect = trigger.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - panel.getBoundingClientRect().width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 5, innerHeight - panel.getBoundingClientRect().height - 8))}px`;
  }
  export function show() {
    panel.showPopover(); expanded = true; position();
    panel.querySelector('button:not(:disabled), select, input, a')?.focus({ preventScroll: true });
  }
  $effect(() => {
    if (!expanded) return;
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  });
  export function close() { if (panel?.matches(':popover-open')) panel.hidePopover(); expanded = false; }
  function clicked(event) {
    if (closeOnAction && event.target.closest('button,a') && !event.target.closest('.vscode-control')) close();
  }
</script>
<button class="popover-trigger" type="button" bind:this={trigger} aria-label={label} title={label} aria-expanded={expanded} aria-controls={id} onclick={() => expanded ? close() : show()}>{text}</button>
<div class="popover-panel" popover="auto" id={id} bind:this={panel} role="dialog" tabindex="-1" aria-label={label} data-prompt-dialog={expanded ? '' : undefined} ontoggle={event => expanded = event.newState === 'open'} onclick={clicked} onkeydown={event => { if(event.key === 'Escape') event.stopPropagation(); }}>
  {@render children()}
</div>
<style>
 .popover-trigger{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:28px;min-height:28px;padding:3px 7px;border:1px solid var(--border-soft);border-radius:5px;background:transparent;color:var(--text-dim);font:13px var(--sans);cursor:pointer;}.popover-trigger:hover,.popover-trigger[aria-expanded=true]{background:var(--surface);color:var(--text);}.popover-trigger:focus-visible{outline:2px solid var(--link);outline-offset:1px;}
 .popover-panel{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:max-content;min-width:205px;max-width:min(340px,calc(100vw - 16px));max-height:min(70vh,560px);overflow:auto;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);box-shadow:var(--shadow-dialog);font:12px/1.5 var(--sans);z-index:100;}
 .popover-panel :global(button:not(.popover-trigger)),.popover-panel :global(a){color:var(--text);}.popover-panel :global(button:focus-visible),.popover-panel :global(a:focus-visible),.popover-panel :global(select:focus-visible){outline:2px solid var(--link);outline-offset:1px;}.popover-panel :global(.menu-action){display:block;width:100%;padding:7px 5px;border:0;border-radius:4px;background:transparent;text-align:left;color:var(--text);font:12px var(--sans);cursor:pointer;text-decoration:none;}.popover-panel :global(.menu-action:hover){background:var(--bg-hover);}.popover-panel :global(.menu-action:disabled){color:var(--text-faint);cursor:default;}.popover-panel :global(hr){border:0;border-top:1px solid var(--border-soft);margin:7px 0;}
</style>
