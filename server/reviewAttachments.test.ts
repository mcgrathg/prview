import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const moduleUrl = new URL('./reviewAttachments.ts', import.meta.url).href;
const httpUrl = new URL('./http.ts', import.meta.url).href;
const serverUrl = new URL('./cockpitServer.ts', import.meta.url).href;
async function scenario(script: string) {
  const dataDir = mkdtempSync(join(tmpdir(), 'review-attachments-'));
  try {
    const child = Bun.spawn([process.execPath, '-e', script], { env: { ...process.env, COCKPIT_DATA_DIR: dataDir, COCKPIT_GH_BIN: '/bin/echo', COCKPIT_MOCK: '', COCKPIT_MOCK_DATA: '' }, stdout: 'pipe', stderr: 'pipe' });
    const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (exit) throw new Error(stderr); return JSON.parse(stdout.trim());
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
}
const fixture = `
  const { fetchReviewAttachmentCapability, uploadReviewAttachment, validateReviewAttachment, validateReviewAttachmentUrl, readReviewAttachmentForm, REVIEW_ATTACHMENT_MAX_BYTES } = await import(${JSON.stringify(moduleUrl)});
  const png = new Uint8Array([137,80,78,71,13,10,26,10]);
  const context = { repo: 'example/repository', number: 7, accountId: 'U_viewer', repositoryId: 1234, visibility: 'PRIVATE', name: 'shot.png', contentType: 'image/png', bytes: png };
`;
const transport = `
  const nativeFetch = globalThis.fetch;
  let permission = 'WRITE', account = 'U_viewer', repositoryId = 1234, visibility = 'PRIVATE', output = { url: 'https://github.com/user-attachments/assets/abc-123' }, fail = false;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    calls.push({ url: address, authorization: init.headers?.Authorization, method: init.method, redirect: init.redirect, contentType: init.headers?.['Content-Type'], accept: init.headers?.Accept, length: init.headers?.['Content-Length'], bytes: address.includes('uploads.') ? Array.from(new Uint8Array(init.body)) : null });
    if (address === 'https://api.github.com/graphql') return Response.json({ data: { viewer: { id: account, login: 'viewer' }, repository: { nameWithOwner: 'example/repository', databaseId: repositoryId, visibility, viewerPermission: permission, pullRequest: { id: 'PR_7' } } } });
    if (address.startsWith('https://uploads.github.com/user-attachments/assets?')) {
      if (fail) return Response.json({ message: 'Not Found' }, { status: 404 });
      return Response.json(output, { status: 201 });
    }
    throw new Error('unexpected network request ' + address);
  };
`;
test('attachment-only wire request uses raw bytes and the same captured personal credential after permission lookup', async () => {
  const result = await scenario(`${fixture}${transport}
    const capability = await fetchReviewAttachmentCapability(context.repo, context.number);
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const response = await original(url, init);
      if (String(url).includes('/graphql')) { const later = Date.now() + 61_000; Date.now = () => later; process.env.COCKPIT_GH_BIN = '/usr/bin/false'; }
      return response;
    };
    const result = await uploadReviewAttachment({ ...context, name: '../safe shot.png' });
    console.log(JSON.stringify({ capability, result, calls }));
  `);
  expect(result.capability).toMatchObject({ available: true, accountId: 'U_viewer', repositoryId: 1234, visibility: 'PRIVATE', maxBytes: 10 * 1024 * 1024 });
  expect(result.result.name).toBe('safe shot.png');
  const sent = result.calls.find((call: { url: string }) => call.url.includes('uploads.'));
  expect(sent).toMatchObject({ authorization: 'token auth token', method: 'POST', redirect: 'error', contentType: 'application/octet-stream', accept: 'application/vnd.github+json', length: '8', bytes: [137,80,78,71,13,10,26,10] });
  const url = new URL(sent.url); expect(url.origin).toBe('https://uploads.github.com'); expect(url.searchParams.get('repository_id')).toBe('1234'); expect(url.searchParams.get('name')).toBe('safe shot.png'); expect(url.searchParams.get('content_type')).toBe('image/png');
});
test('READ/TRIAGE, unknown permission and stale account/repository/visibility prevent every upload', async () => {
  const result = await scenario(`${fixture}${transport}
    const failures = [];
    for (const denied of ['READ', 'TRIAGE', '', 'UNKNOWN']) { permission = denied; const access = await fetchReviewAttachmentCapability(context.repo, 7); try { await uploadReviewAttachment(context); } catch (e) { failures.push({ available: access.available, status: e.status }); } }
    permission = 'WRITE';
    for (const patch of [{ accountId: 'U_other' }, { repositoryId: 99 }, { visibility: 'PUBLIC' }]) try { await uploadReviewAttachment({ ...context, ...patch }); } catch (e) { failures.push({ status: e.status }); }
    console.log(JSON.stringify({ failures, uploads: calls.filter(call => call.url.includes('uploads.')).length }));
  `);
  expect(result.uploads).toBe(0); expect(result.failures.map((item: { status: number }) => item.status)).toEqual([403,403,403,403,409,409,409]);
});
test('file validation rejects active content, mismatched MIME/signatures, empty and oversized bytes before network', async () => {
  const result = await scenario(`${fixture}
    const errors = [];
    for (const [name, type, bytes] of [['active.svg','image/svg+xml',png],['fake.png','image/jpeg',png],['fake.png','image/png',new TextEncoder().encode('<html>')],['empty.png','image/png',new Uint8Array()],['huge.png','image/png',new Uint8Array(REVIEW_ATTACHMENT_MAX_BYTES+1)]]) try { validateReviewAttachment(name,type,bytes); } catch(e) { errors.push(e.status); }
    const limit = new Uint8Array(REVIEW_ATTACHMENT_MAX_BYTES); limit.set(png);
    const accepted = validateReviewAttachment('a.png','image/png',limit);
    console.log(JSON.stringify({ errors, accepted }));
  `);
  expect(result.errors).toEqual([415,415,415,413,413]); expect(result.accepted.contentType).toBe('image/png');
});
test('video/image signatures distinguish allowed containers and the streaming body limit cancels oversized input', async () => {
  const result = await scenario(`${fixture}
    const mp4 = new Uint8Array(24); mp4.set([0,0,0,24,102,116,121,112,105,115,111,109]);
    const mov = mp4.slice(); mov.set([113,116,32,32],8);
    const webm = new Uint8Array([26,69,223,163,119,101,98,109]);
    const accepted = [['a.jpg','image/jpeg',new Uint8Array([255,216,255])],['a.gif','image/gif',new Uint8Array([71,73,70,56,57,97])],['a.mp4','video/mp4',mp4],['a.mov','video/quicktime',mov],['a.webm','video/webm',webm]].map(([name,type,bytes]) => validateReviewAttachment(name,type,bytes).contentType);
    const rejected = [];
    for (const [name,type,bytes] of [['bad.mov','video/quicktime',mp4],['bad.mp4','video/mp4',mov],['bad.webm','video/webm',mp4]]) try { validateReviewAttachment(name,type,bytes); } catch(e) { rejected.push(e.status); }
    let canceled = false, status;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(REVIEW_ATTACHMENT_MAX_BYTES+65537)); }, cancel() { canceled = true; } });
    try { await readReviewAttachmentForm(new Request('http://localhost/attachments', { method:'POST', headers:{'content-type':'multipart/form-data; boundary=x'}, body:stream })); } catch(e) { status = e.status; }
    console.log(JSON.stringify({ accepted, rejected, canceled, status }));
  `);
  expect(result.accepted).toEqual(['image/jpeg','image/gif','video/mp4','video/quicktime','video/webm']);
  expect(result.rejected).toEqual([415,415,415]); expect(result.status).toBe(413); expect(result.canceled).toBe(true);
});
test('failed/invalid upload responses never retry or return an arbitrary URL', async () => {
  const result = await scenario(`${fixture}${transport}
    const errors = [];
    for (const value of [null, 'https://evil.example/file', 'https://github.com@evil.example/user-attachments/assets/a', 'https://github.com/user-attachments/assets/a?token=x', 'javascript:alert(1)']) try { validateReviewAttachmentUrl(value); } catch(e) { errors.push(e.status); }
    output = {}; try { await uploadReviewAttachment(context); } catch(e) { errors.push(e.status); }
    fail = true; try { await uploadReviewAttachment(context); } catch(e) { errors.push(e.status); }
    console.log(JSON.stringify({ errors, uploads: calls.filter(call => call.url.includes('uploads.')).length }));
  `);
  expect(result.errors).toEqual([502,502,502,502,502,502,404]); expect(result.uploads).toBe(2);
});
test('upload Retry-After blocks subsequent operations across API pools before another request', async () => {
  for (const status of [429, 403]) {
    const result = await scenario(`${fixture}${transport}
      const original = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('uploads.')) { calls.push({ url: String(url) }); return Response.json({ message: 'rate limited' }, { status: ${status}, headers: { 'Retry-After': '120' } }); }
        return original(url, init);
      };
      let first, second;
      try { await uploadReviewAttachment(context); } catch(e) { first = { status: e.status, kind: e.kind }; }
      const count = calls.length;
      try { await fetchReviewAttachmentCapability(context.repo, context.number); } catch(e) { second = { status: e.status, kind: e.kind }; }
      console.log(JSON.stringify({ first, second, before: count, after: calls.length }));
    `);
    expect(result.first.kind).toBe('quota'); expect(result.second.kind).toBe('quota'); expect(result.after).toBe(result.before); expect(result.before).toBe(2);
  }
});
test('bounded multipart parsing and HTTP route preserve identities; cross-origin POST is rejected', async () => {
  const result = await scenario(`${fixture}
    const { buildFetchHandler } = await import(${JSON.stringify(httpUrl)});
    const { startCockpitServer } = await import(${JSON.stringify(serverUrl)});
    const calls = [];
    const handler = buildFetchHandler(4820, { fetchReviewAttachmentCapability: async (repo, number) => ({ available: false, repo, number, reason: 'write access required' }), uploadReviewAttachment: async input => { calls.push({ ...input, bytes: Array.from(input.bytes), signal: undefined }); return { url: 'https://github.com/user-attachments/assets/id', name: input.name, contentType: input.contentType }; } });
    const url = 'http://127.0.0.1:4820/api/pr/example/repository/7/attachments';
    const read = await handler(new Request(url));
    function request(address = url, origin) { const form = new FormData(); form.set('file', new File([png], 'shot.png', { type: 'image/png' })); form.set('accountId', context.accountId); form.set('repositoryId', String(context.repositoryId)); form.set('visibility', context.visibility); return new Request(address, { method: 'POST', body: form, headers: origin ? { origin } : undefined }); }
    const sent = await handler(request());
    const tooLarge = await handler(new Request(url, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(REVIEW_ATTACHMENT_MAX_BYTES + 65537) }, body: 'small' }));
    const server = startCockpitServer(0, handler, '');
    let forbidden;
    try { forbidden = (await fetch(request('http://127.0.0.1:' + server.port + '/api/pr/example/repository/7/attachments', 'https://untrusted.example'))).status; } finally { server.stop(true); }
    console.log(JSON.stringify({ read: await read.json(), readCache: read.headers.get('cache-control'), status: sent.status, sent: await sent.json(), calls, tooLarge: tooLarge.status, forbidden }));
  `);
  expect(result.read.available).toBe(false); expect(result.readCache).toBe('no-store'); expect(result.status).toBe(201); expect(result.tooLarge).toBe(413); expect(result.forbidden).toBe(403); expect(result.calls).toHaveLength(1);
  expect(result.calls[0]).toMatchObject({ repo: 'example/repository', number: 7, accountId: 'U_viewer', repositoryId: 1234, visibility: 'PRIVATE', name: 'shot.png', contentType: 'image/png', bytes: [137,80,78,71,13,10,26,10] });
});
