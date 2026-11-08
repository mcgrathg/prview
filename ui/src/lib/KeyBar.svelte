<script>
  import Kbd from "./Kbd.svelte";

  let { keys, onActivate = null } = $props();
  let activeKey = $state(null);
  let activeHint = $derived(keys.find(item => item.key === activeKey));
</script>

<div class="keybar">
  <div class="keybar-content">
    {#each keys as item}
      {#if onActivate}
        <button class="hint command" type="button" aria-label={item.label} aria-disabled={Boolean(item.disabledReason)} title={`${item.key}: ${item.label}. ${item.disabledReason || item.help}`} data-event="review-footer-command" onmouseenter={() => activeKey = item.key} onmouseleave={() => activeKey = null} onfocus={() => activeKey = item.key} onblur={() => activeKey = null} onclick={() => { if (!item.disabledReason) onActivate(item); }}>
          <Kbd keys={item.key} /><span class="label">{item.label}</span>
        </button>
      {:else}
        <span class="hint"><Kbd keys={item.key} /><span class="label">{item.label}</span></span>
      {/if}
    {/each}
  </div>
</div>
{#if onActivate && activeHint}
  <div class="keybar-help" role="status"><strong>{activeHint.label}</strong><span>{activeHint.disabledReason || activeHint.help}</span><small>{activeHint.disabledReason ? 'Unavailable here' : activeHint.effect ?? 'Local navigation'} · Shortcut {activeHint.key}</small></div>
{/if}

<style>
  .keybar {
    position: fixed;
    left: var(--app-rail-width, 0px);
    right: 0;
    bottom: 0;
    height: 38px;
    display: flex;
    align-items: center;
    padding: 0 var(--app-content-gutter, 24px);
    background: var(--panel);
    border-top: 1px solid var(--border);
    z-index: 20;
    overflow-x: auto;
  }
  .keybar-content {
    display: flex;
    box-sizing: border-box;
    width: fit-content;
    max-width: 100%;
    justify-content: center;
    min-height: 100%;
    align-items: center;
    gap: 5px;
    margin: 0 auto;
    padding-inline: 2px;
  }
  .hint {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }
  .command { border:0; border-radius:5px; background:transparent; padding:5px 6px; cursor:pointer; color:var(--text); font:inherit; }
  .command:hover, .command:focus-visible { background:var(--bg-hover); outline:2px solid var(--link); outline-offset:-2px; }
  .command[aria-disabled='true'] { opacity:.5; cursor:help; }
  .keybar-help { position:fixed; bottom:calc(var(--keybar-height, 38px) + 8px); left:max(var(--app-rail-width, 0px), 16px); z-index:21; display:grid; gap:5px; max-width:min(460px, calc(100vw - 48px)); padding:12px 14px; border:1px solid var(--border); border-radius:8px; background:var(--panel); color:var(--text); box-shadow:var(--shadow-dialog); font-size:12px; pointer-events:none; }
  .keybar-help small { color:var(--text-dim); }
  .label {
    font-size: 11.5px;
    color: var(--text-faint);
    letter-spacing: 0.02em;
  }

  .keybar {
    height: var(--keybar-height);
    padding: 0 var(--app-content-gutter, 28px);
    border-top-color: var(--border);
  }
  .label {
    font-family: var(--sans);
    color: var(--text-dim);
    letter-spacing: 0;
  }

  /* Shortcut hints mean nothing without a keyboard, and the row overflows a
     phone anyway. */
  @media (max-width: 700px), (pointer: coarse) and (max-height: 500px) {
    .keybar {
      display: none;
    }
  }
</style>
