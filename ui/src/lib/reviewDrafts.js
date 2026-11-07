export function reviewDraftKey(target) {
  if (!target || !/^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(target.repo) || !Number.isInteger(target.number) || target.number < 1 || !/^[a-f\d]{40}$/i.test(target.headSha) || !target.path || !['LEFT', 'RIGHT'].includes(target.side) || !Number.isInteger(target.line) || target.line < 1) return null;
  const start = target.startLine ?? target.line;
  if (!Number.isInteger(start) || start < 1) return null;
  return 'cockpit:review-draft:v1:' + JSON.stringify([target.repo, target.number, target.headSha, target.path, target.side, Math.min(start, target.line), Math.max(start, target.line)]);
}

export function createReviewDraftStore(getStorage = () => globalThis.localStorage) {
  const memory = new Map();
  const submissions = new Map();
  const listeners = new Map();
  function notify(key, body) { for (const listener of listeners.get(key) ?? []) listener(body); }
  function subscribe(target, listener) {
    const key = reviewDraftKey(target);
    if (!key) return () => {};
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(listener);
    return () => { const group = listeners.get(key); group?.delete(listener); if (!group?.size) listeners.delete(key); };
  }
  function read(target) {
    const key = reviewDraftKey(target);
    if (!key) return '';
    if (memory.has(key)) return memory.get(key);
    try {
      const saved = JSON.parse(getStorage()?.getItem(key) ?? 'null');
      return saved?.version === 1 && typeof saved.body === 'string' ? saved.body : '';
    } catch { return ''; }
  }
  function write(target, body) {
    const key = reviewDraftKey(target);
    if (!key) return 'This comment needs a pinned PR revision before its draft can be saved.';
    try {
      const storage = getStorage();
      if (!storage) throw new Error('unavailable');
      storage.setItem(key, JSON.stringify({ version: 1, body }));
      memory.delete(key);
      notify(key, body);
      return '';
    } catch { memory.set(key, body); notify(key, body); return 'Draft kept in this tab. Device storage is unavailable; copy the text before reloading.'; }
  }
  function discard(target) {
    const key = reviewDraftKey(target);
    if (!key) return '';
    try { getStorage()?.removeItem(key); }
    catch { return 'The saved draft could not be removed. Try again.'; }
    memory.delete(key);
    notify(key, '');
    return '';
  }
  function update(target, body, previousBody) {
    const current = read(target);
    const references = current.matchAll(/!\[[^\]\r\n]*\]\((https:\/\/github\.com\/user-attachments\/assets\/[A-Za-z0-9-]+)\)|(https:\/\/github\.com\/user-attachments\/assets\/[A-Za-z0-9-]+)/g);
    for (const reference of references) {
      const url = reference[1] ?? reference[2];
      if (!previousBody.includes(url) && !body.includes(url)) body += `\n\n${reference[0]}`;
    }
    return { body, error: write(target, body) };
  }
  async function submit(target, body, mode, send) {
    const key = reviewDraftKey(target);
    if (!key) throw new Error('A pinned PR revision is required.');
    const active = submissions.get(key);
    if (active) {
      if (active.body === body && active.mode === mode) return active.promise;
      throw new Error('This draft is already being submitted in another pane.');
    }
    const promise = Promise.resolve().then(() => send({ ...target, body }, mode)).then(() => {
      if (read(target) === body) {
        const error = discard(target);
        if (error) return { cleanupError: 'Comment saved. The local draft could not be removed; discard it before reusing this anchor.' };
      }
    }).finally(() => submissions.delete(key));
    submissions.set(key, { body, mode, promise });
    return promise;
  }
  return { read, write, update, subscribe, discard, submit };
}

export const reviewDrafts = createReviewDraftStore();
