import { describe, expect, test } from 'bun:test';
import { createActor } from 'xstate';
import { createReviewDraftStore, reviewDraftKey } from './reviewDrafts.js';
import { reviewComposerMachine } from './reviewComposerMachine.js';
import { formatReviewSelection } from './reviewFormatting.js';
import { reviewFileGithubHref, reviewPrGithubHref, reviewSourceGithubHref } from './reviewGithubLinks.js';
const target = { repo: 'example/repository', number: 42, headSha: 'a'.repeat(40), path: 'src/a #?.ts', side: 'RIGHT', startLine: 2, line: 5 };
function memoryStorage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function composer(options = {}) {
  const calls = [];
  const actor = createActor(reviewComposerMachine, { input: { target, body: 'draft', save: body => ({ body, error: '' }), submit: async (...args) => calls.push(args), close: () => calls.push('close'), ...options } }).start();
  actor.send({ type: 'OPEN' });
  return { actor, calls };
}
const submit = (extra = {}) => ({ type: 'SUBMIT', mode: 'staged', currentHead: target.headSha, stagingAllowed: true, ...extra });
describe('durable revision-pinned inline drafts', () => {
  test('reload restores the exact PR/head/path/side/range and isolates every different anchor', () => {
    const storage = memoryStorage(); const first = createReviewDraftStore(() => storage);
    expect(first.write(target, 'keep across reload')).toBe('');
    const restored = createReviewDraftStore(() => storage);
    expect(restored.read(target)).toBe('keep across reload');
    for (const patch of [{ repo: 'other/repository' }, { number: 43 }, { headSha: 'b'.repeat(40) }, { path: 'other.ts' }, { side: 'LEFT' }, { startLine: 3 }, { line: 6 }]) expect(restored.read({ ...target, ...patch })).toBe('');
    expect(restored.discard(target)).toBe(''); expect(restored.read(target)).toBe('');
  });
  test('failure retains the draft; success clears only the submitted text, preserving a newer pane edit', async () => {
    const storage = memoryStorage(); const drafts = createReviewDraftStore(() => storage);
    drafts.write(target, 'old');
    await expect(drafts.submit(target, 'old', 'staged', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(drafts.read(target)).toBe('old');
    let finish; const done = new Promise(resolve => { finish = resolve; });
    const pending = drafts.submit(target, 'old', 'immediate', () => done);
    await settle(); drafts.write(target, 'newer pane text'); finish(); await pending;
    expect(drafts.read(target)).toBe('newer pane text');
    await drafts.submit(target, 'newer pane text', 'immediate', async () => {});
    expect(createReviewDraftStore(() => storage).read(target)).toBe('');
  });
  test('simultaneous identical pane submissions issue one mutation', async () => {
    const storage = memoryStorage(); const drafts = createReviewDraftStore(() => storage); let calls = 0, finish;
    const done = new Promise(resolve => { finish = resolve; });
    drafts.write(target, 'same');
    const send = async () => { calls++; await done; };
    const one = drafts.submit(target, 'same', 'immediate', send);
    const two = drafts.submit(target, 'same', 'immediate', send);
    await settle(); expect(calls).toBe(1); finish(); await Promise.all([one, two]);
  });
  test('storage failures preserve text in memory and surface the reload limitation', () => {
    const store = createReviewDraftStore(() => { throw new Error('blocked'); });
    expect(store.write(target, 'unsaved')).toContain('before reloading'); expect(store.read(target)).toBe('unsaved');
    expect(reviewDraftKey({ ...target, headSha: 'main' })).toBeNull();
  });
});
describe('composer lifecycle', () => {
  test('blocks stale heads, blank bodies and stale staged reviews; immediate action remains explicit', async () => {
    const { actor, calls } = composer();
    actor.send(submit({ currentHead: 'b'.repeat(40) })); expect(actor.getSnapshot().value).toBe('editing');
    actor.send(submit({ stagingAllowed: false })); expect(calls).toHaveLength(0);
    actor.send(submit({ attachmentBusy: true })); expect(calls).toHaveLength(0);
    actor.send({ type: 'CHANGE', body: '  ' }); actor.send(submit()); expect(calls).toHaveLength(0);
    actor.send({ type: 'CHANGE', body: 'draft' });
    actor.send(submit({ mode: 'immediate', stagingAllowed: false })); await settle();
    expect(calls[0][0].headSha).toBe(target.headSha); expect(calls[0][2]).toBe('immediate'); expect(calls.at(-1)).toBe('close'); actor.stop();
  });
  test('submission ignores duplicate clicks and cancel; retry follows failure without changing its anchor', async () => {
    let reject; const attempt = new Promise((_, no) => { reject = no; });
    let attempts = 0;
    const { actor, calls } = composer({ submit: async identity => { expect(identity).toEqual(target); attempts++; if (attempts === 1) await attempt; } });
    actor.send(submit()); actor.send(submit()); actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('submitting'); expect(calls).toEqual([]);
    reject(new Error('network failed')); await settle(); expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.body).toBe('draft'); actor.send(submit()); await settle(); expect(attempts).toBe(2); expect(calls).toEqual(['close']); actor.stop();
  });
  test('late success after pane unmount clears its exact stored draft without closing another pane', async () => {
    const storage = memoryStorage(); const store = createReviewDraftStore(() => storage); store.write(target, 'draft');
    let finish; const done = new Promise(resolve => { finish = resolve; });
    const { actor, calls } = composer({ submit: (...args) => store.submit(...args, () => done) });
    actor.send(submit()); await settle(); actor.stop(); finish(); await settle();
    expect(store.read(target)).toBe(''); expect(calls).toEqual([]);
  });
  test('successful publication with cleanup failure cannot be retried as a second comment', async () => {
    const { actor, calls } = composer({ submit: async () => ({ cleanupError: 'saved but storage is blocked' }) });
    actor.send(submit()); await settle(); expect(actor.getSnapshot().value).toBe('saved'); actor.send(submit()); expect(calls).toEqual([]); actor.stop();
  });
  test('cancel preserves the body; reopening edits the same immutable target', () => {
    const { actor, calls } = composer(); actor.send({ type: 'CANCEL' }); expect(calls).toEqual(['close']);
    expect(actor.getSnapshot().context.body).toBe('draft'); actor.send({ type: 'OPEN' }); expect(actor.getSnapshot().value).toBe('editing'); actor.stop();
  });
});
test('formatting preserves surrounding text and selects the formatted content', () => {
  expect(formatReviewSelection('one two three', 4, 7, 'bold')).toEqual({ body: 'one **two** three', selectionStart: 6, selectionEnd: 9 });
  expect(formatReviewSelection('one\ntwo', 0, 7, 'quote').body).toBe('> one\n> two');
  expect(formatReviewSelection('one\ntwo', 0, 7, 'list').body).toBe('- one\n- two');
  expect(formatReviewSelection('two', 0, 3, 'italic').body).toBe('_two_');
  expect(formatReviewSelection('two', 0, 3, 'code').body).toBe('`two`');
  expect(formatReviewSelection('', 0, 0, 'link').body).toBe('[link text](https://)');
});
test('GitHub links encode source paths and preserve PR diff side and range anchors', async () => {
  expect(reviewPrGithubHref(target.repo, 42)).toBe('https://github.com/example/repository/pull/42');
  expect(reviewPrGithubHref('../evil', 42)).toBeNull();
  expect(reviewSourceGithubHref(target.repo, target.headSha, target.path, 2, 5)).toBe(`https://github.com/example/repository/blob/${target.headSha}/src/a%20%23%3F.ts#L2-L5`);
  const left = await reviewFileGithubHref(target.repo, 42, target.path, 'LEFT', 2, 5);
  const right = await reviewFileGithubHref(target.repo, 42, target.path, 'RIGHT', 2, 5);
  expect(left).toMatch(/^https:\/\/github.com\/example\/repository\/pull\/42\/files#diff-[a-f0-9]{64}L2-L5$/);
  expect(right).toBe(left.replace(/L2-L5$/, 'R2-R5'));
});
