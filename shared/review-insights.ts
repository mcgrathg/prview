export interface FunctionMetric { name: string; signature: string; start: number; end: number; complexity: number; nloc: number }
export interface FunctionChange { name: string; base: FunctionMetric | null; head: FunctionMetric | null; delta: number | null; kind: 'changed' | 'added' | 'removed' | 'unmatched'; anchor: {line: number; side: 'left' | 'right'} }
export interface HistoryCommit { sha: string; author: string; timestamp: number; title: string }
export interface FileInsight {
  path: string; basePath: string;
  complexity: { status: 'ok' | 'unsupported' | 'unavailable'; reason?: string; total: number | null; maximum: number | null; changes: FunctionChange[]; limited: boolean };
  activity: { status: 'ok' | 'unavailable'; count: number; authors: string[]; commits: HistoryCommit[]; related: { path: string; commits: number }[] };
  dependencies: { imports: {path: string; line: number}[]; dependents: {path: string; line: number}[]; cycles: {paths: string[]; isNew: boolean}[] };
  score: number | null; signals: number; complexityIncreased: boolean; newCycle: boolean;
}
export interface ReviewInsights {
  status: 'ok'; repo: string; base: string; diffBase: string; head: string; version: 1;
  provider: { name: 'Lizard'; version: string | null; available: boolean; reason?: string };
  files: Record<string, FileInsight>;
  history: { status: 'ok' | 'unavailable'; from: number; until: number; days: number; commitsExamined: number; limited: boolean; reason?: string };
  coverage: { totalFiles: number; selectedFiles: number; headParsed: number; baseParsed: number; measuredFiles: number; dependencyScope: 'changed-files'; limitations: string[] };
}
export const INSIGHT_FILTERS = ['complexity', 'cycle'] as const;
export type InsightFilter = typeof INSIGHT_FILTERS[number];
export function insightMatches(file: FileInsight | undefined, filters: readonly string[]) {
  return filters.every(filter => filter === 'complexity' ? file?.complexityIncreased : filter === 'cycle' ? file?.newCycle : false);
}
export function changedLines(patch: string | null, side: 'base' | 'head') {
  const lines = new Set<number>(); let old = 0, next = 0;
  for (const line of (patch ?? '').split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { old = Number(hunk[1]); next = Number(hunk[2]); continue; }
    if (line.startsWith('+')) { if (side === 'head') lines.add(next); next++; }
    else if (line.startsWith('-')) { if (side === 'base') lines.add(old); old++; }
    else if (line.startsWith(' ')) { old++; next++; }
  }
  return lines;
}
export function compareFunctions(before: FunctionMetric[], after: FunctionMetric[], patch: string | null, added = false, removed = false): FunctionChange[] {
  const oldLines = changedLines(patch, 'base'), newLines = changedLines(patch, 'head');
  const firstChanged = (fn: FunctionMetric, lines: Set<number>) => [...lines].sort((a,b)=>a-b).find(line=>line>=fn.start&&line<=fn.end);
  const touched = (fn: FunctionMetric, lines: Set<number>) => firstChanged(fn,lines)!==undefined;
  const unique = (items: FunctionMetric[], name: string) => items.filter(item => item.name === name);
  const paired = new Set<FunctionMetric>(), changes: FunctionChange[] = [];
  for (const head of after) {
    const candidates = unique(before, head.name);
    const base = candidates.length === 1 && unique(after, head.name).length === 1 ? candidates[0]! : null;
    if (base) paired.add(base);
    if (!touched(head, newLines) && !(base && touched(base, oldLines))) continue;
    changes.push({name: head.name, base, head, delta: base ? head.complexity - base.complexity : null, kind: base ? 'changed' : added || candidates.length === 0 ? 'added' : 'unmatched',anchor:firstChanged(head,newLines)!==undefined?{line:firstChanged(head,newLines)!,side:'right'}:{line:firstChanged(base!,oldLines)!,side:'left'}});
  }
  for (const base of before) if (!paired.has(base) && touched(base, oldLines) && (removed || unique(after, base.name).length === 0)) {
    changes.push({name: base.name, base, head: null, delta: null, kind: 'removed',anchor:{line:firstChanged(base,oldLines)!,side:'left'}});
  }
  return changes;
}
