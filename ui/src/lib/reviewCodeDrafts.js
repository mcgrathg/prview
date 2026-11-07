export function reviewCodeDraftKey(target) {
  if (!target || !/^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(target.repo)
    || !Number.isSafeInteger(target.number) || target.number < 1
    || !/^[a-f\d]{40}$/i.test(target.headSha) || typeof target.path !== 'string' || !target.path) return null;
  return 'cockpit:review-code-draft:v1:' + JSON.stringify([target.repo.toLowerCase(), target.number, target.headSha.toLowerCase(), target.path]);
}

function validDraft(value) {
  return value && typeof value.content === 'string' && typeof value.message === 'string'
    && (value.eol === '\n' || value.eol === '\r\n');
}

export function createReviewCodeDraftStore(getStorage = () => globalThis.localStorage) {
  const memory = new Map();
  function read(target) {
    const key = reviewCodeDraftKey(target);
    if (!key) return null;
    if (memory.has(key)) return memory.get(key);
    try {
      const saved = JSON.parse(getStorage()?.getItem(key) ?? 'null');
      return saved?.version === 1 && validDraft(saved) ? { content: saved.content, message: saved.message, eol: saved.eol } : null;
    } catch { return null; }
  }
  function write(target, draft) {
    const key = reviewCodeDraftKey(target);
    if (!key || !validDraft(draft)) return 'This edit needs a pinned PR revision before its draft can be saved.';
    const saved = { content: draft.content, message: draft.message, eol: draft.eol };
    try {
      const storage = getStorage();
      if (!storage) throw new Error('unavailable');
      storage.setItem(key, JSON.stringify({ version: 1, ...saved }));
      memory.delete(key);
      return '';
    } catch {
      memory.set(key, saved);
      return 'Code draft kept in this tab. Device storage is unavailable; copy your changes before reloading.';
    }
  }
  function discard(target) {
    const key = reviewCodeDraftKey(target);
    if (!key) return '';
    try {
      const storage = getStorage();
      if (!storage) throw new Error('unavailable');
      storage.removeItem(key);
      memory.delete(key);
      return '';
    } catch { return 'The saved code draft could not be removed. Try again.'; }
  }
  function committed(target, submitted) {
    const current = read(target);
    if (!current || current.content !== submitted.content || current.message !== submitted.message || current.eol !== submitted.eol) return '';
    const error = discard(target);
    if (error) memory.set(reviewCodeDraftKey(target), null);
    return error ? 'Changes committed. The saved code draft could not be removed from device storage.' : '';
  }
  return { read, write, discard, committed };
}

export const reviewCodeDrafts = createReviewCodeDraftStore();
