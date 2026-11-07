const transitions = {
  loading: { REFRESH: 'loading', ACCESS_READY: 'idle', ACCESS_ERROR: 'error' },
  idle: { REFRESH: 'loading', INVALID: 'error', START: 'uploading' },
  uploading: { SUCCEEDED: 'done', FAILED: 'error' },
  done: { REFRESH: 'loading', INVALID: 'error', START: 'uploading' },
  error: { REFRESH: 'loading', INVALID: 'error', START: 'uploading' },
};
export function nextReviewAttachmentState(state, event) { return transitions[state]?.[event] ?? null; }
