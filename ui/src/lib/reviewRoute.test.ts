import { describe, expect, test } from 'bun:test';
import { buildReviewHash, normalizeReviewState, parseReviewRoute } from './reviewRoute.js';

describe('review route compatibility', () => {
  test('preserves conversation, Files, agent, action and comment links', () => {
    expect(parseReviewRoute('#/pr/acme/widgets/12')?.tab).toBe('conversation');
    expect(parseReviewRoute('#/pr/acme/widgets/12/files?comment=discussion_r31')?.commentTarget?.id).toBe(31);
    expect(parseReviewRoute('#/pr/acme/widgets/12/agents')?.tab).toBe('agents');
    const sha = 'a'.repeat(40);
    expect(parseReviewRoute(`#/pr/acme/widgets/12/actions?sha=${sha}&job=42`)).toMatchObject({ tab: 'actions', actionSha: sha, actionJob: 42 });
    expect(parseReviewRoute('#/pr/acme/widgets/12/actions?job=no')).toBeNull();
    expect(parseReviewRoute('#/pr/acme/widgets/12/actions?sha=no')).toBeNull();
  });
  test('preserves encoded history paths and symbols', () => {
    expect(parseReviewRoute('#/pr/acme/widgets/12/history/src%2Ffile.ts?symbol=a%26b')).toMatchObject({ tab: 'files', historyPath: 'src/file.ts', historySymbol: 'a&b' });
    expect(parseReviewRoute('#/pr/acme/widgets/12/history/%ZZ')).toBeNull();
  });
  test('rejects unrelated, malformed and unsafe PR identities', () => {
    for (const hash of ['#/actions', '#/pr/a/b/0', '#/pr/a/b/9007199254740992', '#/pr/a/b/2/unknown', '#/pr/a/b/2/files#x']) expect(parseReviewRoute(hash)).toBeNull();
  });
});

describe('shareable review snapshots', () => {
  test('round trips a pinned deleted-line source location with Unicode and reserved characters', () => {
    const review = normalizeReviewState({ file: 'src/日本語 & ?.ts', line: 39, side: 'left', view: 'source', rev: 'b'.repeat(40), base: 'a'.repeat(40), layout: 'unified', search: { mode: 'search', query: 'name & other' } });
    const hash = buildReviewHash('acme/widgets', 12, review);
    expect(hash).toContain('/files?v=1&');
    expect(parseReviewRoute(hash)?.review).toEqual(review);
    expect(buildReviewHash('acme/widgets', 12, parseReviewRoute(hash)?.review)).toBe(hash);
  });
  test('canonical URLs omit default values and ignore invalid optional values', () => {
    expect(buildReviewHash('acme/widgets', 12, {})).toBe('#/pr/acme/widgets/12/files?v=1');
    expect(parseReviewRoute('#/pr/acme/widgets/12/files?file=..%2Fsecret&line=-1&side=no&view=no&layout=no&controls=%7B&panes=%5B')?.review).toEqual(normalizeReviewState({}));
    expect(parseReviewRoute('#/pr/acme/widgets/12/files?file=src%2Fa.ts&line=9007199254740992')?.review.line).toBeNull();
  });
  test('ignores mutable or invalid revisions while retaining immutable SHA identities', () => {
    for (const rev of ['main', 'HEAD~1', 'a'.repeat(39), '../ref']) expect(normalizeReviewState({ rev, base: rev }).rev).toBeNull();
    expect(normalizeReviewState({ rev: 'a'.repeat(40) }).rev).toBe('a'.repeat(40));
  });
  test('keeps bounded organization snapshots readable at their maximum path lengths', () => {
    const paths = Array.from({ length: 250 }, (_, i) => `${i}-${'q'.repeat(2000)}`);
    const review = normalizeReviewState({ controls: { overrides: Object.fromEntries(paths.map(path => [path, 'show'])), expanded: paths, collapsedFolders: paths } });
    expect(parseReviewRoute(buildReviewHash('acme/widgets', 12, review))?.review).toEqual(review);
  });
  test('restores organization defaults, explicit Show all and bounded valid controls', () => {
    const controls = { order: 'flow', query: 'test', rules: {}, overrides: { 'src/a.ts': 'show', '../bad': 'hide', 'src/b.ts': 'invalid' }, root: 'src/a.ts', expanded: ['src/a.ts', '../bad', 'src/a.ts'], folders: true };
    const restored = parseReviewRoute(buildReviewHash('acme/widgets', 12, { controls }))?.review.controls;
    expect(restored).toEqual({ order: 'flow', query: 'test', rules: {}, overrides: { 'src/a.ts': 'show' }, root: 'src/a.ts', expanded: ['src/a.ts'], folders: false, collapsedFolders: [] });
    expect(normalizeReviewState({ controls: {} }).controls.rules).toEqual({ snapshot: 'fold', fixture: 'fold' });
  });
  test('round trips collapsed directories and reads older controls as fully expanded', () => {
    const controls = { folders: true, collapsedFolders: ['src/feature', '../bad', 'Repository root', 'src/feature'] };
    const restored = parseReviewRoute(buildReviewHash('acme/widgets', 12, { controls }))?.review.controls;
    expect(restored?.collapsedFolders).toEqual(['src/feature', 'Repository root']);
    expect(restored?.folders).toBe(true);
    expect(parseReviewRoute('#/pr/acme/widgets/12/files?controls=%7B%22folders%22%3Atrue%7D')?.review.controls?.collapsedFolders).toEqual([]);
  });
  test('restores independent panes and a valid active pane without sharing references', () => {
    const input = { panes: [{ id: 'primary', file: 'a.ts', line: 2, layout: 'split' }, { id: 'other', file: 'b.ts', line: 8, side: 'left', layout: 'unified' }], active: 'other' };
    const review = parseReviewRoute(buildReviewHash('acme/widgets', 12, input))?.review;
    expect(review?.panes.map(p => [p.id, p.file, p.line, p.layout])).toEqual([['primary', 'a.ts', 2, 'split'], ['other', 'b.ts', 8, 'unified']]);
    expect(review?.active).toBe('other');
    input.panes[0].file = 'changed.ts';
    expect(review?.panes[0].file).toBe('a.ts');
    expect(normalizeReviewState({ ...input, active: 'missing' }).active).toBe('primary');
  });
  test('restores auxiliary files and related panes without requiring a selected file', () => {
    const review = { panes: [{ id: 'tree', view: 'files' }, { id: 'neighbors', view: 'related' }], active: 'neighbors' };
    expect(parseReviewRoute(buildReviewHash('acme/widgets', 12, review))?.review.panes?.map(p => [p.id, p.view, p.file])).toEqual([['tree', 'files', null], ['neighbors', 'related', null]]);
    expect(normalizeReviewState({ view: 'files' }).view).toBe('diff');
  });
  test('bounds pane count, removes duplicate IDs and rejects unsafe paths', () => {
    const panes = Array.from({ length: 30 }, (_, i) => ({ id: `pane-${i}`, file: `${i}.ts` }));
    expect(normalizeReviewState({ panes }).panes).toHaveLength(8);
    expect(normalizeReviewState({ panes: [panes[0], panes[0], { id: 'bad', file: '/etc/file' }] }).panes).toHaveLength(1);
    for (const file of ['../a', '/a', 'C:/a', 'a\\b', 'a/../b', 'a\u0000b']) expect(normalizeReviewState({ file }).file).toBeNull();
  });
});
