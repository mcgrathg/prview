<script>
  import { history, goBackOrFallback, goForward } from "./history.svelte.js";
  import { isTypingTarget, isPromptDialogOpen } from "./dom.js";
  import { isRecordingShortcut } from "./shortcutCapture.js";

  let { backFallback = null, vertical = false } = $props();

  $effect(() => {
    function onKey(e) {
      if (e.defaultPrevented || isRecordingShortcut() || isPromptDialogOpen()) return;
      const commandBracket = e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === "[" || e.key === "]");
      if (!commandBracket && (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target))) return;
      if (e.key === "H" || (commandBracket && e.key === "[")) goBackOrFallback(backFallback);
      else if (e.key === "L" || (commandBracket && e.key === "]")) goForward();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<nav class="histnav" class:vertical aria-label="History navigation">
  <button class="arrow" onclick={() => (location.hash = "#/")} title="Home" aria-label="Home">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </svg>
  </button>
  <button
    class="arrow"
    disabled={!history.canBack && !backFallback}
    onclick={() => goBackOrFallback(backFallback)}
    title={!history.canBack && backFallback ? "Back to inbox" : "Back"}
    aria-label={!history.canBack && backFallback ? "Back to inbox" : "Back"}
  >
    <span aria-hidden="true">←</span>
  </button>
  <button class="arrow" disabled={!history.canForward} onclick={goForward} title="Forward" aria-label="Forward">
    <span aria-hidden="true">→</span>
  </button>
</nav>

<style>
  .histnav {
    display: flex;
    gap: 3px;
    -webkit-app-region: no-drag;
  }
  .histnav.vertical { flex-direction:column; align-items:center; gap:9px; }
  .histnav.vertical .arrow { width:36px; height:36px; }
  .arrow {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 6px;
    color: var(--text-dim);
    font-size: 17px;
    cursor: pointer;
    -webkit-app-region: no-drag;
    transition: background 0.08s ease, color 0.08s ease;
  }
  .arrow:focus-visible { outline:2px solid var(--link); outline-offset:1px; }
  .arrow:hover:not(:disabled) {
    background: var(--panel-raised);
    color: var(--text);
  }
  .arrow:disabled {
    color: var(--text-faint);
    opacity: 0.4;
    cursor: default;
  }
</style>
