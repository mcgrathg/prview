import { test, expect } from 'bun:test';
import { createReviewConfirmation } from './reviewConfirmation.js';
import { reviewShortcutInfo } from './reviewShortcutInfo.js';

const scope = 'sample/project#12@head-a';
test('shortcut confirmation requires one matching explicit Yes; No and repeated Yes never dispatch', async () => {
  const gate = createReviewConfirmation();
  const writes = [];
  const run = async () => { if (await gate.request({ scope, title: 'Change shared labels?' })) writes.push('changed'); };
  const canceled = run();
  expect(gate.actor.getSnapshot().matches('confirming')).toBe(true);
  expect(writes).toEqual([]);
  gate.cancel(); await canceled;
  expect(writes).toEqual([]);
  const accepted = run();
  expect(await gate.request({ scope, title: 'Overwrite?' })).toBe(false);
  expect(gate.actor.getSnapshot().context.pending.title).toBe('Change shared labels?');
  gate.confirm(scope); gate.confirm(scope); await accepted;
  expect(writes).toEqual(['changed']);
  expect(gate.actor.getSnapshot().matches('idle')).toBe(true);
  gate.stop();
});
test('a changed PR/head and teardown cancel pending shortcut effects', async () => {
  const gate = createReviewConfirmation();
  const pending = gate.request({ scope, title: 'Save Viewed?' });
  gate.confirm('sample/project#12@head-b');
  expect(await pending).toBe(false);
  const unmounted = gate.request({ scope, title: 'Assign?' });
  gate.stop();
  expect(await unmounted).toBe(false);
});
test('command help follows the selected file, boundary positions and unavailable capabilities', () => {
  const c = { tab: 'files', file: 'src/second.ts', index: 1, count: 3, viewedAllowed: true, editable: true, desktop: false, reply: false, live: true, mergeReason: 'Checks are failing', head: 'feature', base: 'main' };
  expect(reviewShortcutInfo('J', c).help).toContain('src/second.ts');
  expect(reviewShortcutInfo('J', c).disabledReason).toBe('');
  expect(reviewShortcutInfo('J', { ...c, index: 2 }).disabledReason).toContain('No next file');
  expect(reviewShortcutInfo('K', { ...c, index: 0 }).disabledReason).toContain('No previous file');
  expect(reviewShortcutInfo('v', c).effect).toContain('confirmation required');
  expect(reviewShortcutInfo('v', { ...c, viewedAllowed: false }).disabledReason).toContain('current comparison');
  expect(reviewShortcutInfo('m', c).disabledReason).toBe('Checks are failing');
  expect(reviewShortcutInfo('E', c).disabledReason).toContain('desktop app');
  expect(reviewShortcutInfo('r', c).disabledReason).toContain('no unresolved');
  expect(reviewShortcutInfo('s', c).effect).toContain('shared change on confirmation');
  expect(reviewShortcutInfo('d', { ...c, blocked: true }).disabledReason).toContain('Close the current dialog');
  expect(reviewShortcutInfo('a', { ...c, live: false }).disabledReason).toContain('open pull request');
});
