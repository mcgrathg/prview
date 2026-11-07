import { describe, expect, test } from 'bun:test';
import { createReviewCodeDraftStore, reviewCodeDraftKey } from './reviewCodeDrafts.js';

const target = { repo: 'example/repository', number: 42, headSha: 'a'.repeat(40), path: 'src/a #?.ts' };
const edit = { content: 'export const value = 2;\n', message: 'fix: preserve edits', eol: '\r\n' };
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

describe('durable code edits', () => {
  test('reopening after a pane close or reload restores code, line endings and commit message at the exact revision', () => {
    const storage = memoryStorage();
    const first = createReviewCodeDraftStore(() => storage);
    expect(first.write(target, edit)).toBe('');
    const reopened = createReviewCodeDraftStore(() => storage);
    expect(reopened.read(target)).toEqual(edit);
    for (const patch of [{ repo: 'other/repository' }, { number: 43 }, { path: 'other.ts' }, { headSha: 'b'.repeat(40) }]) {
      expect(reopened.read({ ...target, ...patch })).toBeNull();
    }
    expect(reopened.read({ ...target, headSha: target.headSha.toUpperCase() })).toEqual(edit);
    expect(reviewCodeDraftKey({ ...target, headSha: 'main' })).toBeNull();
    expect(reopened.discard(target)).toBe('');
    expect(createReviewCodeDraftStore(() => storage).read(target)).toBeNull();
  });

  test('only confirmed commits clear their submitted version, preserving newer pane edits', () => {
    const storage = memoryStorage();
    const drafts = createReviewCodeDraftStore(() => storage);
    drafts.write(target, edit);
    expect(createReviewCodeDraftStore(() => storage).read(target)).toEqual(edit);
    const newer = { ...edit, content: 'newer pane edit' };
    drafts.write(target, newer);
    expect(drafts.committed(target, edit)).toBe('');
    expect(drafts.read(target)).toEqual(newer);
    expect(drafts.committed(target, newer)).toBe('');
    expect(createReviewCodeDraftStore(() => storage).read(target)).toBeNull();
  });

  test('storage failure keeps edits across pane remounts and makes failed discard explicit', () => {
    const drafts = createReviewCodeDraftStore(() => { throw new Error('blocked'); });
    expect(drafts.write(target, edit)).toContain('before reloading');
    expect(drafts.read(target)).toEqual(edit);
    expect(drafts.discard(target)).toContain('could not be removed');
    expect(drafts.read(target)).toEqual(edit);
    expect(drafts.committed(target, edit)).toContain('Changes committed');
    expect(drafts.read(target)).toBeNull();
  });

  test('malformed saved values are never restored as code', () => {
    const storage = memoryStorage();
    storage.setItem(reviewCodeDraftKey(target), JSON.stringify({ version: 1, content: edit.content, message: null, eol: '\n' }));
    expect(createReviewCodeDraftStore(() => storage).read(target)).toBeNull();
  });
});
