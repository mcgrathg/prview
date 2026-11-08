import type { AnalyzedFile, Capture, CapturedFile } from './analysis.ts';

export interface ImportFact {
  specifier: string;
  typeOnly: boolean;
  bindings: { imported: string; local: string; typeOnly: boolean }[];
  line: number;
  excerpt: string;
  changed: boolean;
}

export interface CallFact {
  specifier: string;
  imported: string;
  expression: string;
  kind: string;
  line: number;
  excerpt: string;
  changed: boolean;
}

export interface SourceBundle {
  schemaVersion: number;
  repository: string;
  headSha: string;
  reportedBaseSha: string;
  files: {
    path: string;
    status: string;
    side: string;
    revision: string;
    gitBlobSha?: string;
    lineCount?: number;
    imports?: ImportFact[];
    importedCalls?: CallFact[];
    fileReferences?: { specifier: string; line: number; excerpt: string; changed: boolean }[];
  }[];
}

export interface ReferenceEvidence {
  line: number;
  excerpt: string;
  changed: boolean;
  url: string;
}

export interface ReferenceEdge {
  from: string;
  to: string;
  kind: 'import' | 'imported_function_call' | 'imported_member_call' | 'imported_constructor' | 'file_path';
  typeOnly: boolean;
  specifier: string;
  resolution: 'literal_changed_path' | 'source_extension_candidate' | 'extensionless_candidate';
  observations: number;
  evidence: ReferenceEvidence[];
}

export interface ReferenceGraph {
  edges: ReferenceEdge[];
  diagnostics: string[];
  coverage: { parsedHeadFiles: number; resolvedImports: number; unresolvedRelativeImports: number; packageImports: number; baseFilesExcluded: number };
}

export const comparisonKey = (capture: Capture) => `${capture.repository}@${capture.reported_base_sha}..${capture.head_sha}`;
export const followsImportFlow = (edge: ReferenceEdge) => !edge.typeOnly && edge.kind !== 'file_path';

function relativePath(from: string, specifier: string) {
  if (!/^\.\.?\//.test(specifier) || /[?#\\]/.test(specifier)) return { status: 'unsupported' as const };
  const parts = from.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '.' || !part) continue;
    if (part === '..') { if (!parts.length) return { status: 'outside_repository' as const }; parts.pop(); }
    else parts.push(part);
  }
  return { status: 'normalized' as const, path: parts.join('/') };
}

export function resolveChangedFilePath(from: string, specifier: string, files: Pick<CapturedFile, 'filename' | 'status'>[]) {
  const normalized = relativePath(from, specifier);
  if (normalized.status !== 'normalized') return normalized;
  if (files.some(file => file.status !== 'removed' && file.filename === normalized.path)) {
    return { status: 'resolved' as const, path: normalized.path, resolution: 'literal_changed_path' as const };
  }
  return { status: 'not_changed' as const };
}

export function resolveChangedImport(from: string, specifier: string, files: Pick<CapturedFile, 'filename' | 'status'>[]) {
  const normalized = relativePath(from, specifier);
  if (normalized.status !== 'normalized') return normalized;
  const base = normalized.path;
  const alternatives = new Set([base]);
  if (/\.js$/.test(base)) { alternatives.add(base.slice(0, -3) + '.ts'); alternatives.add(base.slice(0, -3) + '.tsx'); }
  else if (/\.mjs$/.test(base)) alternatives.add(base.slice(0, -4) + '.mts');
  else if (/\.cjs$/.test(base)) alternatives.add(base.slice(0, -4) + '.cts');
  else if (!/\.[^/]+$/.test(base)) {
    for (const extension of ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']) {
      alternatives.add(base + extension);
      alternatives.add(base + '/index' + extension);
    }
  }
  const candidates = files.filter(file => file.status !== 'removed' && alternatives.has(file.filename));
  if (candidates.length === 1) return {
    status: 'resolved' as const,
    path: candidates[0]!.filename,
    resolution: candidates[0]!.filename === base ? 'literal_changed_path' as const : /\.[^/]+$/.test(base) ? 'source_extension_candidate' as const : 'extensionless_candidate' as const,
  };
  return { status: candidates.length ? 'ambiguous' as const : 'not_changed' as const };
}

export function buildReferenceGraph(capture: Capture, bundle?: SourceBundle): ReferenceGraph {
  const graph: ReferenceGraph = { edges: [], diagnostics: [], coverage: { parsedHeadFiles: 0, resolvedImports: 0, unresolvedRelativeImports: 0, packageImports: 0, baseFilesExcluded: 0 } };
  if (!bundle || bundle.schemaVersion !== 1 || bundle.repository !== capture.repository || bundle.headSha !== capture.head_sha || bundle.reportedBaseSha !== capture.reported_base_sha) {
    graph.diagnostics.push('No source evidence aligned with this captured comparison.');
    return graph;
  }
  const known = new Map(capture.files.map(file => [file.filename, file]));
  const pathCounts = new Map<string, number>();
  for (const fact of bundle.files) pathCounts.set(fact.path, (pathCounts.get(fact.path) || 0) + 1);
  const edges = new Map<string, ReferenceEdge>();
  for (const fact of bundle.files) {
    const file = known.get(fact.path);
    if (!file || pathCounts.get(fact.path) !== 1) { graph.diagnostics.push(`Unknown or duplicated source identity: ${fact.path}`); continue; }
    if (file.status === 'removed') {
      if (fact.side === 'base' && fact.revision === capture.reported_base_sha) graph.coverage.baseFilesExcluded++;
      else graph.diagnostics.push(`Removed file has misattributed source evidence: ${fact.path}`);
      continue;
    }
    if (fact.status !== 'ok' || fact.side !== 'head' || fact.revision !== capture.head_sha || (file.blob_sha && fact.gitBlobSha !== file.blob_sha)) {
      graph.diagnostics.push(`Source unavailable or mismatched for ${fact.path}`);
      continue;
    }
    graph.coverage.parsedHeadFiles++;
    const imports = fact.imports || [];
    const url = `https://github.com/${capture.repository}/blob/${capture.head_sha}/${fact.path.split('/').map(encodeURIComponent).join('/')}`;
    const add = (to: string, kind: ReferenceEdge['kind'], item: Pick<ImportFact, 'specifier' | 'line' | 'excerpt' | 'changed'>, typeOnly: boolean, resolution: ReferenceEdge['resolution']) => {
      if (to === fact.path || !Number.isInteger(item.line) || item.line < 1 || item.line > (fact.lineCount || 0)) return;
      const key = JSON.stringify([fact.path, to, kind, typeOnly, item.specifier, resolution]);
      let edge = edges.get(key);
      if (!edge) { edge = { from: fact.path, to, kind, typeOnly, specifier: item.specifier, resolution, observations: 0, evidence: [] }; edges.set(key, edge); }
      edge.observations++;
      edge.evidence.push({ line: item.line, excerpt: item.excerpt, changed: item.changed, url: `${url}#L${item.line}` });
    };
    for (const item of imports) {
      const target = resolveChangedImport(fact.path, item.specifier, capture.files);
      if (target.status === 'resolved') { graph.coverage.resolvedImports++; add(target.path, 'import', item, item.typeOnly, target.resolution); }
      else if (!item.specifier.startsWith('.')) graph.coverage.packageImports++;
      else graph.coverage.unresolvedRelativeImports++;
    }
    for (const call of fact.importedCalls || []) {
      if (!['imported_function_call', 'imported_member_call', 'imported_constructor'].includes(call.kind)) continue;
      if (!imports.some(item => item.specifier === call.specifier && item.bindings.some(binding => binding.imported === call.imported && !binding.typeOnly))) continue;
      const target = resolveChangedImport(fact.path, call.specifier, capture.files);
      if (target.status === 'resolved') add(target.path, call.kind as ReferenceEdge['kind'], call, false, target.resolution);
    }
    for (const reference of fact.fileReferences || []) {
      const target = resolveChangedFilePath(fact.path, reference.specifier, capture.files);
      if (target.status === 'resolved') add(target.path, 'file_path', reference, false, target.resolution);
    }
  }
  graph.edges = [...edges.values()].map(edge => {
    const locations = new Map<string, ReferenceEvidence>();
    for (const evidence of edge.evidence.sort((a, b) => Number(b.changed) - Number(a.changed) || a.line - b.line)) {
      const key = JSON.stringify([evidence.line, evidence.excerpt]);
      if (!locations.has(key)) locations.set(key, evidence);
    }
    return { ...edge, evidence: [...locations.values()].slice(0, 3) };
  });
  graph.edges.sort((a, b) => { const left = JSON.stringify([a.from, a.to, a.kind, a.typeOnly]); const right = JSON.stringify([b.from, b.to, b.kind, b.typeOnly]); return left < right ? -1 : left > right ? 1 : 0; });
  return graph;
}

export interface RelatedCandidate {
  file: AnalyzedFile;
  reason: string;
  kind: 'source' | 'heuristic';
  edges: ReferenceEdge[];
}

function fixtureDirectory(path: string) {
  const match = /(?:^|\/)(?:__testfixtures__|__fixtures__|fixtures|mocks)\//.exec(path);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const tail = path.slice(start);
  return path.slice(0, start) + (tail.includes('/') ? tail.split('/')[0] + '/' : '');
}

export function relatedCandidates(file: AnalyzedFile, files: AnalyzedFile[], graph: ReferenceGraph): RelatedCandidate[] {
  const candidates = new Map<string, RelatedCandidate>();
  for (const edge of graph.edges) {
    const targetPath = edge.from === file.filename ? edge.to : edge.to === file.filename ? edge.from : undefined;
    if (!targetPath) continue;
    const target = files.find(candidate => candidate.filename === targetPath);
    if (!target) continue;
    const existing = candidates.get(targetPath);
    if (existing) existing.edges.push(edge);
    else candidates.set(targetPath, { file: target, reason: edge.kind === 'file_path' ? 'Literal file-path candidate from a pinned path.join/resolve call.' : edge.from === file.filename ? 'Outgoing relative-reference candidate from pinned source.' : 'Incoming relative-reference candidate from pinned source.', kind: 'source', edges: [edge] });
  }
  const fixture = fixtureDirectory(file.filename);
  const stem = (name: string) => name.replace(/\.(?:test(?:-d)?|spec)(?=\.)/, '').replace(/\.[^.]+$/, '');
  for (const candidate of files) {
    if (candidate.filename === file.filename || candidates.has(candidate.filename)) continue;
    const sameFixture = fixture && fixtureDirectory(candidate.filename) === fixture;
    const testPair = file.roles.includes('test') !== candidate.roles.includes('test') && file.area === candidate.area && stem(file.name) === stem(candidate.name);
    if (sameFixture || testPair) candidates.set(candidate.filename, { file: candidate, reason: sameFixture ? 'Same fixture directory; path heuristic.' : 'Matching source/test name in the same folder area; heuristic.', kind: 'heuristic', edges: [] });
  }
  return [...candidates.values()].sort((a, b) => Number(a.kind === 'heuristic') - Number(b.kind === 'heuristic') || (a.file.filename < b.file.filename ? -1 : a.file.filename > b.file.filename ? 1 : 0));
}
