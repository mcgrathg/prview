import { analyze, orderFiles, visibilityFor, type Capture, type Visibility } from './analysis.ts';
import { orderByImports } from './flow.ts';
import type { ReferenceGraph } from './relationships.ts';
import type { Controls } from './machine.ts';

export const emptyGraph = (): ReferenceGraph => ({ edges: [], diagnostics: [], coverage: {
  parsedHeadFiles: 0, resolvedImports: 0, unresolvedRelativeImports: 0, packageImports: 0, baseFilesExcluded: 0,
} });

function compareReviewPaths(a: string, b: string) {
  const left=a.split('/'),right=b.split('/');
  for(let i=0;i<Math.min(left.length,right.length);i++) {
    if(left[i]===right[i])continue;
    const leftDirectory=i<left.length-1,rightDirectory=i<right.length-1;
    if(leftDirectory!==rightDirectory)return leftDirectory ? -1 : 1;
    return left[i]!<right[i]! ? -1 : 1;
  }
  return left.length-right.length;
}

export function organizationModel(capture: Capture, graph: ReferenceGraph, controls: Controls) {
  const analyzed = analyze(capture);
  const flow = orderByImports(analyzed, graph, controls.root);
  const ordered = controls.order === 'path' ? [...analyzed].sort((a,b)=>compareReviewPaths(a.filename,b.filename)) : controls.order === 'flow' ? flow.ordered : orderFiles(analyzed, controls.order);
  const ranks = new Map(ordered.map((file, index) => [file.filename, index + 1]));
  const entries = ordered.map(file => ({ file, rank: ranks.get(file.filename)!, ...visibilityFor(file, controls.rules, controls.overrides[file.filename]) }));
  const query = controls.query.trim().toLowerCase();
  const matched = entries.filter(entry => !query || entry.file.filename.toLowerCase().includes(query));
  const visible = matched.filter(entry => entry.state !== 'hide');
  const counts = { show: 0, fold: 0, hide: 0 };
  for (const entry of entries) counts[entry.state as Visibility]++;
  return {
    entries, visible, hidden: matched.filter(entry => entry.state === 'hide'), counts, flow, graph,
    paths: visible.map(entry => entry.file.filename),
    folded: visible.filter(entry => entry.state === 'fold' && !controls.expanded.includes(entry.file.filename)).map(entry => entry.file.filename),
  };
}
