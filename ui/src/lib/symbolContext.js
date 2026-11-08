import { repoDefinition, repoFile } from './api.js';

export function symbolRequest(symbol, path, position, source) {
  const side = position?.side ?? source.side ?? 'right';
  return { symbol, path, position, repo: source.repo, headRef: source.headRef,
    sha: side === 'left' ? source.base : source.rev,
    origin: { file: path, line: position?.line, side, view: source.view, rev: source.rev, base: source.base } };
}

export async function loadSymbolContext(request, signal, api = { repoDefinition, repoFile }) {
  if (!request.sha || !request.position) return { status: 'missing-revision' };
  const result = await api.repoDefinition(request.repo, request.sha, request.headRef, request.path, request.symbol, request.position, signal);
  if (result.status !== 'ok' || !result.definition) return result;
  let excerpt = [], excerptStatus = '';
  try {
    const file = await api.repoFile(request.repo, request.sha, request.headRef, result.definition.path, signal);
    if (file.status === 'ok' && typeof file.content === 'string') {
      const line = Math.max(1, result.definition.line ?? 1);
      const start = Math.max(0, line - 2);
      excerpt = file.content.split('\n').slice(start, start + 8).map((text, i) => ({ line: start + i + 1, text }));
    } else excerptStatus = file.status ?? 'unavailable';
  } catch (error) {
    if (signal.aborted) throw error;
    excerptStatus = 'unavailable';
  }
  return { ...result, excerpt, excerptStatus };
}

export function symbolDestination(definition, request) {
  return { file: definition.path, line: definition.line ?? 1, view: 'source', side: 'right', rev: request.sha, base: request.origin.base };
}
