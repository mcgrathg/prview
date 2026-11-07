import { expect, test } from 'bun:test';
import { fetchReviewAttachmentCapability, uploadReviewAttachment } from './api.js';
import { insertReviewAttachment } from './reviewAttachmentMarkdown.js';
const asset = { name: 'shot.png', contentType: 'image/png', url: 'https://github.com/user-attachments/assets/id' };
test('successful image upload inserts at the captured selection; a newer pane edit is preserved', () => {
  const selection = { body: 'before select after', start: 7, end: 13 };
  expect(insertReviewAttachment(selection.body, asset, selection)).toBe(`before ![shot.png](${asset.url}) after`);
  expect(insertReviewAttachment('newer text', asset, selection)).toBe(`newer text\n\n![shot.png](${asset.url})`);
  expect(insertReviewAttachment('', { ...asset, contentType: 'video/mp4' }, { body: '', start: 0, end: 0 })).toBe(`\n\n${asset.url}\n\n`);
});
test('attachment API keeps tokens and upload destinations server-side and sends the captured account/repo/visibility', async () => {
  const original = globalThis.fetch, requests = [];
  const capability = { available: true, accountId: 'U_viewer', repositoryId: 1234, visibility: 'PRIVATE' };
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return Response.json(init?.method === 'POST' ? asset : capability); };
  try {
    const controller = new AbortController();
    expect(await fetchReviewAttachmentCapability('example/repository', 7, controller.signal)).toEqual(capability);
    const file = new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'shot.png', { type: 'image/png' });
    expect(await uploadReviewAttachment('example/repository', 7, capability, file, controller.signal)).toEqual(asset);
    expect(requests.map(request => request.url)).toEqual(['/api/pr/example/repository/7/attachments','/api/pr/example/repository/7/attachments']);
    const form = requests[1].init.body;
    expect([...form.keys()].sort()).toEqual(['accountId','file','repositoryId','visibility']);
    expect(form.get('accountId')).toBe('U_viewer'); expect(form.get('repositoryId')).toBe('1234'); expect(form.get('visibility')).toBe('PRIVATE'); expect(requests[1].init.signal).toBe(controller.signal);
  } finally { globalThis.fetch = original; }
});
test('failed attachment request surfaces the server message and makes no automatic retry', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: 'GitHub refused this credential' }, { status: 403 }); };
  try {
    await expect(uploadReviewAttachment('example/repository', 7, { accountId: 'U', repositoryId: 1, visibility: 'PUBLIC' }, new File(['x'], 'shot.png'), new AbortController().signal)).rejects.toThrow('GitHub refused this credential');
    expect(calls).toBe(1);
  } finally { globalThis.fetch = original; }
});

test('two composers synchronize completed uploads and a stale keystroke cannot lose the new URL', async () => {
  const { createActor } = await import('xstate');
  const { reviewComposerMachine } = await import('./reviewComposerMachine.js');
  const { createReviewDraftStore } = await import('./reviewDrafts.js');
  const values = new Map(), store = createReviewDraftStore(() => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }));
  const target = { repo: 'example/repository', number: 7, headSha: 'a'.repeat(40), path: 'a.ts', side: 'RIGHT', line: 1 };
  store.write(target, 'review text');
  const connect = () => {
    const actor = createActor(reviewComposerMachine, { input: { target, body: store.read(target), save: (body, before) => store.update(target, body, before), submit: async () => {}, close: () => {} } }).start();
    actor.send({ type: 'OPEN' });
    const unsubscribe = store.subscribe(target, body => { if (actor.getSnapshot().context.body !== body) actor.send({ type: 'SYNC', body }); });
    return { actor, close() { unsubscribe(); actor.stop(); } };
  };
  const first = connect(), second = connect();
  const oldBody = second.actor.getSnapshot().context.body;
  store.write(target, insertReviewAttachment(store.read(target), asset, { body: oldBody, start: oldBody.length, end: oldBody.length }));
  expect(second.actor.getSnapshot().context.body).toContain(asset.url);
  second.actor.send({ type: 'CHANGE', body: oldBody + ' next keystroke', previousBody: oldBody });
  expect(store.read(target)).toContain(asset.url); expect(first.actor.getSnapshot().context.body).toContain(asset.url);
  const seen = second.actor.getSnapshot().context.body;
  second.actor.send({ type: 'CHANGE', body: 'intentionally removed', previousBody: seen });
  expect(store.read(target)).toBe('intentionally removed');
  first.close(); second.close();
});

test('late completion after one composer unmounts survives another pane edit and reload', async () => {
  const { createActor } = await import('xstate');
  const { reviewComposerMachine } = await import('./reviewComposerMachine.js');
  const { createReviewDraftStore } = await import('./reviewDrafts.js');
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const store = createReviewDraftStore(() => storage);
  const target = { repo: 'example/repository', number: 7, headSha: 'b'.repeat(40), path: 'a.ts', side: 'LEFT', line: 4 };
  store.write(target, 'original draft');
  const detached = createActor(reviewComposerMachine, { input: { target, body: store.read(target), save: (body, before) => store.update(target, body, before), submit: async () => {}, close: () => {} } }).start(); detached.send({ type: 'OPEN' });
  const remaining = createActor(reviewComposerMachine, { input: { target, body: store.read(target), save: (body, before) => store.update(target, body, before), submit: async () => {}, close: () => {} } }).start(); remaining.send({ type: 'OPEN' });
  const previousBody = remaining.getSnapshot().context.body;
  detached.stop();
  store.write(target, insertReviewAttachment(store.read(target), asset, { body: previousBody, start: 0, end: 0 }));
  remaining.send({ type: 'CHANGE', body: previousBody + ' another edit', previousBody });
  expect(store.read(target)).toContain(asset.url);
  expect(createReviewDraftStore(() => storage).read(target)).toContain(asset.url);
  expect(store.read({ ...target, headSha: 'c'.repeat(40) })).toBe(''); remaining.stop();
});

test('attachment lifecycle requires access before upload and rejects refresh or duplicate start while sending', async () => {
  const { nextReviewAttachmentState: next } = await import('./reviewAttachmentState.js');
  expect(next('loading', 'START')).toBeNull(); expect(next('loading', 'ACCESS_READY')).toBe('idle');
  expect(next('idle', 'START')).toBe('uploading'); expect(next('uploading', 'START')).toBeNull(); expect(next('uploading', 'REFRESH')).toBeNull();
  expect(next('uploading', 'FAILED')).toBe('error'); expect(next('error', 'START')).toBe('uploading'); expect(next('uploading', 'SUCCEEDED')).toBe('done');
});
