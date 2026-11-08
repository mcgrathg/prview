const SHA = /^[0-9a-f]{40}$/i;
const MAX_COMMITS = 30;
const MAX_BYTES = 512 * 1024;

export interface CommitContextRequest { head: string; base: string; path: string }
export interface ContextCommit { sha: string; title: string; body: string }

export function validCommitContextRequest(value: CommitContextRequest): boolean {
  return SHA.test(value.head) && SHA.test(value.base) && value.path.length > 0 && value.path.length <= 4096
    && !value.path.startsWith('/') && !value.path.includes('\0') && !value.path.split('/').some(part => part === '..');
}

export async function fileCommitContext(checkout: string, request: CommitContextRequest, signal?: AbortSignal) {
  if (!validCommitContextRequest(request)) throw new Error('Invalid commit context request.');
  const proc = Bun.spawn(['git', '--no-lazy-fetch', '-C', checkout, 'log', '--no-ext-diff', '--no-textconv', '-z', `--max-count=${MAX_COMMITS + 1}`,
    '--format=%H%x00%B', `${request.base}..${request.head}`, '--', `:(literal)${request.path}`],
    {stdout:'pipe',stderr:'ignore',signal,timeout:5000,maxBuffer:MAX_BYTES});
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for await (const chunk of proc.stdout) {
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Commit context exceeds the response limit.');
      chunks.push(chunk);
    }
    if (await proc.exited !== 0) throw new Error('Commit context is unavailable for this comparison.');
    const fields = Buffer.concat(chunks).toString('utf8').split('\0');
    if (fields.at(-1) === '') fields.pop();
    const commits: ContextCommit[] = [];
    for (let i = 0; i < fields.length; i += 2) {
      const sha = fields[i] ?? '';
      const message = fields[i + 1];
      if (!SHA.test(sha) || message === undefined) throw new Error('Commit context could not be decoded.');
      const [title = '', ...body] = message.trimEnd().split('\n');
      commits.push({sha,title,body:body.join('\n').trim()});
    }
    return {status:'ok' as const,scope:'file' as const,head:request.head,base:request.base,path:request.path,
      commits:commits.slice(0,MAX_COMMITS),limited:commits.length>MAX_COMMITS};
  } finally {
    proc.kill();
    await proc.exited;
  }
}
