<script>
  import { onMount } from 'svelte';
  import { nextReviewAttachmentState } from './reviewAttachmentState.js';
  import { fetchReviewAttachmentCapability, uploadReviewAttachment } from './api.js';
  import { reviewPrGithubHref } from './reviewGithubLinks.js';
  let { repo, number, disabled = false, captureSelection, onUploaded, onBusy = () => {} } = $props();
  let capability = $state(null);
  let phase = $state('loading');
  let error = $state('');
  let file = $state(null);
  let retryable = $state(false);
  let selection;
  let picker = $state();
  let controller;
  let active = true;
  let uploading = $derived(phase === 'uploading');
  onMount(() => {
    void refresh();
    return () => { active = false; controller?.abort(); onBusy(false); };
  });
  function transition(event) {
    const next = nextReviewAttachmentState(phase, event);
    if (!next) return false;
    phase = next;
    return true;
  }
  async function refresh() {
    if (!transition('REFRESH')) return;
    controller?.abort(); const operation = new AbortController(); controller = operation;
    error = '';
    try {
      const result = await fetchReviewAttachmentCapability(repo, number, operation.signal);
      if (active && controller === operation) { capability = result; transition('ACCESS_READY'); }
    } catch (failure) { if (active && controller === operation) { transition('ACCESS_ERROR'); error = failure.message; } }
  }
  async function upload(selected, retry = false) {
    if (disabled || uploading || !selected) return;
    if (phase === 'loading' || !capability?.available) {
      error = capability?.reason ?? 'This file was not uploaded. Wait for attachment access, then paste or drop it again.';
      return;
    }
    file = selected; retryable = false;
    if (!capability.allowedTypes.includes(selected.type) || !selected.size || selected.size > capability.maxBytes) {
      error = 'Choose PNG, JPEG, GIF, MP4, MOV or WebM no larger than 10 MiB.'; transition('INVALID'); return;
    }
    if (!transition('START')) return;
    retryable = true;
    if (!retry) selection = captureSelection();
    const chosenSelection = selection;
    controller?.abort(); const operation = new AbortController(); controller = operation;
    error = ''; onBusy(true);
    try {
      const result = await uploadReviewAttachment(repo, number, capability, selected, operation.signal);
      onUploaded(result, chosenSelection);
      if (active && controller === operation) { transition('SUCCEEDED'); file = null; }
    } catch (failure) {
      if (active && controller === operation) { transition('FAILED'); error = failure.name === 'AbortError' ? 'Upload canceled. GitHub may already have accepted the file; your comment text is unchanged.' : failure.message; }
    } finally { if (active && controller === operation) onBusy(false); }
  }
  function picked(event) {
    const chosen = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (chosen) void upload(chosen);
  }
  export function paste(event) {
    const chosen = event.clipboardData?.files?.[0];
    if (!chosen || disabled || uploading) return;
    event.preventDefault(); void upload(chosen);
  }
  export function drop(event) {
    const chosen = event.dataTransfer?.files?.[0];
    if (!chosen || disabled || uploading) return;
    event.preventDefault(); void upload(chosen);
  }
</script>
<div class="review-attachments" aria-label="Review attachments">
  {#if phase === 'loading'}<span role="status">Checking GitHub attachment access…</span>
  {:else if capability?.available}
    <div class="attachment-destination">Attachments upload to <strong>{repo}</strong> ({capability.visibility.toLowerCase()}) as {capability.accountLogin}. {capability.visibility === 'PUBLIC' ? 'Anyone with the attachment URL can read it.' : 'Repository access is required to view uploaded files.'}</div>
    <p class="attachment-note">Choosing, pasting or dropping a file uploads it to GitHub immediately, before you submit this comment.</p>
    <input bind:this={picker} type="file" accept="image/png,image/jpeg,image/gif,video/mp4,video/quicktime,video/webm" onchange={picked} hidden />
    <button class="cbtn ghost" disabled={disabled || uploading} onclick={() => picker?.click()}>Attach image or video</button>
    <span class="attachment-note">Paste or drop one file in Write. Maximum 10 MiB. Removing a draft keeps the uploaded file on GitHub.</span>
  {:else if capability}<div class="attachment-note">{capability.reason}</div>{/if}
  {#if uploading}<div role="status"><progress aria-label="Uploading attachment"></progress> Uploading {file?.name}… <button class="cbtn ghost" onclick={() => controller?.abort()}>Cancel upload</button></div>{/if}
  {#if phase === 'done'}<span role="status">Attachment uploaded and added to this draft.</span>{/if}
  {#if error}<div class="attachment-error" role="alert">{error}</div>
    {#if capability?.available && file && retryable && !uploading}<button class="cbtn ghost" disabled={disabled} onclick={() => upload(file, true)}>Retry upload</button>{/if}<button class="cbtn ghost" onclick={refresh}>Refresh attachment access</button>
  {/if}
  {#if !capability?.available && phase !== 'loading'}<a href={reviewPrGithubHref(repo, number)} target="_blank" rel="noopener noreferrer">Open PR on GitHub</a>{/if}
</div>
<style>
  .review-attachments { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12px; }
  .attachment-destination, .attachment-note { color: var(--text-dim); margin: 5px 0; }
  .attachment-error { color: var(--fail); margin-top: 6px; }
  progress { max-width: 100px; height: 6px; }
</style>
