<script>
  import ReviewAttachments from './ReviewAttachments.svelte';
  import { insertReviewAttachment } from './reviewAttachmentMarkdown.js';
  import { onMount, tick } from 'svelte';
  import { createActor } from 'xstate';
  import { renderMarkdown } from './markdown.js';
  import { reviewDrafts, reviewDraftKey } from './reviewDrafts.js';
  import { reviewComposerMachine } from './reviewComposerMachine.js';
  import { formatReviewSelection } from './reviewFormatting.js';
  import { reviewFileGithubHref, reviewSourceGithubHref } from './reviewGithubLinks.js';
  let { target, currentHead, pendingReviewsEnabled = false, pendingReview = null, pendingReviewStale = false, onSubmit, onClose } = $props();
  let actor;
  let inputBefore;
  let attachments = $state();
  let attachmentBusy = $state(false);
  let snapshot = $state(null);
  let tab = $state('write');
  let textarea = $state();
  let githubHref = $state(null);
  let source = $derived(target.side === 'RIGHT' ? reviewSourceGithubHref(target.repo, target.headSha, target.path, target.startLine ?? target.line, target.line) : null);
  let range = $derived(target.startLine ? `${target.startLine}–${target.line}` : `${target.line}`);
  let stale = $derived(target.headSha !== currentHead);
  let busy = $derived(snapshot?.matches('submitting') ?? false);
  let locked = $derived(attachmentBusy || busy || (snapshot?.matches('saved') ?? false));
  let body = $derived(snapshot?.context.body ?? '');
  let canSubmit = $derived(Boolean(reviewDraftKey(target) && body.trim() && (snapshot?.matches('editing') || snapshot?.matches('error')) && !stale && !attachmentBusy));
  onMount(() => {
    actor = createActor(reviewComposerMachine, { input: {
      target, body: reviewDrafts.read(target),
      save: (text, previousBody) => reviewDrafts.update(target, text, previousBody),
      submit: (identity, text, mode) => reviewDrafts.submit(identity, text, mode, onSubmit),
      close: onClose,
    } });
    const subscription = actor.subscribe(value => { snapshot = value; });
    actor.start(); actor.send({ type: 'OPEN' });
    const unsubscribeDraft = reviewDrafts.subscribe(target, text => {
      if (text !== actor.getSnapshot().context.body) actor.send({ type: 'SYNC', body: text });
    });
    void tick().then(() => textarea?.focus());
    return () => { unsubscribeDraft(); subscription.unsubscribe(); actor.stop(); };
  });
  $effect(() => {
    let active = true;
    githubHref = null;
    reviewFileGithubHref(target.repo, target.number, target.path, target.side, target.startLine ?? target.line, target.line).then(href => { if (active) githubHref = href; }).catch(() => {});
    return () => { active = false; };
  });
  function submit(mode) {
    actor?.send({ type: 'SUBMIT', mode, currentHead, attachmentBusy, stagingAllowed: pendingReviewsEnabled && !pendingReviewStale });
  }
  function keydown(event) {
    if (event.key === 'Escape' && !busy && !attachmentBusy) { event.preventDefault(); event.stopPropagation(); actor?.send({ type: 'CANCEL' }); }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); submit(pendingReviewsEnabled ? 'staged' : 'immediate'); }
  }
  async function format(kind) {
    if (!textarea || busy) return;
    const next = formatReviewSelection(body, textarea.selectionStart, textarea.selectionEnd, kind);
    actor.send({ type: 'CHANGE', body: next.body });
    await tick(); textarea.focus(); textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
  }
  function captureAttachmentSelection() {
    return { target: { ...target }, body, start: textarea?.selectionStart ?? body.length, end: textarea?.selectionEnd ?? body.length };
  }
  function insertAttachment(attachment, selection) {
    const originalTarget = selection.target;
    const current = reviewDrafts.read(originalTarget);
    const next = insertReviewAttachment(current, attachment, selection);
    reviewDrafts.write(originalTarget, next);
    actor?.send({ type: 'CHANGE', body: next });
  }
  function discard() {
    const message = reviewDrafts.discard(target);
    actor?.send(message ? { type: 'FAILURE', message } : { type: 'DISCARD' });
  }
</script>
<div class="markdown-composer" data-event="review-composer" role="group" aria-label="Inline review comment">
  <div class="composer-anchor">{target.path} · {target.side === 'LEFT' ? 'Original' : 'Changed'} line{target.startLine ? 's' : ''} {range} · <code>{target.headSha.slice(0, 7)}</code></div>
  <div class="composer-tabs" role="tablist" aria-label="Comment editor">
    <button role="tab" onkeydown={keydown} aria-selected={tab === 'write'} onclick={() => { tab = 'write'; }}>Write</button>
    <button role="tab" onkeydown={keydown} aria-selected={tab === 'preview'} onclick={() => { tab = 'preview'; }}>Preview</button>
  </div>
  {#if tab === 'write'}
    <div class="formatting" role="toolbar" aria-label="Markdown formatting">
      {#each [['bold', 'Bold'], ['italic', 'Italic'], ['code', 'Code'], ['link', 'Link'], ['quote', 'Quote'], ['list', 'List']] as [kind, label]}
        <button class="cbtn ghost" disabled={locked} onpointerdown={event => event.preventDefault()} onclick={() => format(kind)}>{label}</button>
      {/each}
    </div>
    <textarea bind:this={textarea} aria-label="Comment Markdown" onkeydown={keydown} onpaste={event => attachments?.paste(event)} ondrop={event => attachments?.drop(event)} ondragover={event => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); }} placeholder={`Comment on line${target.startLine ? 's' : ''} ${range}…`} value={body} disabled={locked} onbeforeinput={event => { inputBefore = event.currentTarget.value; }} oninput={event => { actor?.send({ type: 'CHANGE', body: event.currentTarget.value, previousBody: inputBefore ?? body }); inputBefore = undefined; }}></textarea>
  {:else}
    <div class="md composer-preview" role="tabpanel">{#if body}{@html renderMarkdown(body)}{:else}<p>Nothing to preview.</p>{/if}</div>
  {/if}
  <ReviewAttachments bind:this={attachments} repo={target.repo} number={target.number} disabled={busy || stale || (snapshot?.matches('saved') ?? false)} captureSelection={captureAttachmentSelection} onUploaded={insertAttachment} onBusy={value => { attachmentBusy = value; }} />
  {#if stale}<p class="composer-error" role="alert">The PR revision changed. This draft still targets {target.headSha.slice(0, 7)}. Copy it or discard it, then reopen a comment on the current revision.</p>{/if}
  {#if pendingReviewsEnabled && pendingReviewStale}<p class="composer-note">The pending review targets an older revision. Comment now, or resolve that review before staging another comment.</p>{/if}
  {#if snapshot?.context.error}<p class="composer-error" role="alert">{snapshot.context.error}</p>{/if}
  {#if snapshot?.context.storageError}<p class="composer-error" role="status">{snapshot.context.storageError}</p>{:else}<p class="composer-note">Draft saved on this device as you type. Cancel keeps it.</p>{/if}
  <div class="composer-actions">
    {#if pendingReviewsEnabled}<button class="cbtn primary" disabled={!canSubmit || pendingReviewStale} onclick={() => submit('staged')}>{busy ? 'Saving…' : pendingReview ? 'Add to pending review' : 'Start a pending review'}</button>{/if}
    <button class="cbtn" disabled={!canSubmit} onclick={() => submit('immediate')}>{busy && !pendingReviewsEnabled ? 'Saving…' : 'Comment now'}</button>
    <button class="cbtn ghost" disabled={busy || attachmentBusy} onclick={() => actor?.send({ type: 'CANCEL' })}>Cancel</button>
    <button class="cbtn ghost" disabled={busy || attachmentBusy} onclick={discard}>Discard draft</button>
  </div>
  <div class="composer-handoff">
    {#if githubHref}<a href={githubHref} target="_blank" rel="noopener noreferrer">Open line on GitHub</a>{/if}
    {#if source}<a href={source} target="_blank" rel="noopener noreferrer">Open pinned source</a>{/if}
  </div>
</div>
<style>
  .markdown-composer { padding: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); }
  .composer-anchor, .composer-note, .composer-handoff { font-size: 12px; color: var(--text-dim); overflow-wrap: anywhere; }
  .composer-tabs, .formatting, .composer-actions, .composer-handoff { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .composer-tabs button { padding: 6px 12px; background: none; border: 1px solid var(--border); color: inherit; border-radius: 4px; cursor: pointer; }
  .composer-tabs button[aria-selected="true"] { background: var(--border-soft); font-weight: 600; }
  textarea { display: block; box-sizing: border-box; width: 100%; min-height: 110px; margin-top: 8px; resize: vertical; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 10px; }
  .composer-preview { min-height: 110px; padding: 10px; }
  .composer-error { color: var(--fail); font-size: 12px; }
</style>
