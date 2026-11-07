import { orderFiles, type AnalyzedFile } from './analysis.ts';
import { followsImportFlow, type ReferenceGraph } from './relationships.ts';

export interface FlowOrder {
  ordered: AnalyzedFile[];
  reachable: Set<string>;
  cycles: string[][];
  root?: string;
}

export function orderByImports(files: AnalyzedFile[], graph: ReferenceGraph, root?: string): FlowOrder {
  const baseline = orderFiles(files, 'attention');
  const priority = new Map(baseline.map((file, index) => [file.filename, index]));
  const neighbors = new Map(files.map(file => [file.filename, new Set<string>()]));
  for (const edge of graph.edges) {
    if (followsImportFlow(edge) && neighbors.has(edge.from) && neighbors.has(edge.to)) neighbors.get(edge.from)!.add(edge.to);
  }
  const indices = new Map<string, number>();
  const lows = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;
  function visit(path: string) {
    indices.set(path, nextIndex); lows.set(path, nextIndex++);
    stack.push(path); onStack.add(path);
    for (const neighbor of neighbors.get(path)!) {
      if (!indices.has(neighbor)) { visit(neighbor); lows.set(path, Math.min(lows.get(path)!, lows.get(neighbor)!)); }
      else if (onStack.has(neighbor)) lows.set(path, Math.min(lows.get(path)!, indices.get(neighbor)!));
    }
    if (lows.get(path) === indices.get(path)) {
      const component: string[] = [];
      let current: string;
      do { current = stack.pop()!; onStack.delete(current); component.push(current); } while (current !== path);
      components.push(component.sort((a, b) => priority.get(a)! - priority.get(b)!));
    }
  }
  for (const file of baseline) if (!indices.has(file.filename)) visit(file.filename);
  const componentOf = new Map<string, number>();
  components.forEach((component, index) => component.forEach(path => componentOf.set(path, index)));
  const componentEdges = components.map(() => new Set<number>());
  for (const [from, targets] of neighbors) for (const to of targets) {
    if (componentOf.get(from) !== componentOf.get(to)) componentEdges[componentOf.get(from)!]!.add(componentOf.get(to)!);
  }
  const componentPriority = components.map(component => Math.min(...component.map(path => priority.get(path)!)));
  const activeRoot = root && componentOf.has(root) ? root : undefined;
  const reachableComponents = new Set<number>();
  function follow(index: number) {
    if (reachableComponents.has(index)) return;
    reachableComponents.add(index);
    for (const target of componentEdges[index]!) follow(target);
  }
  if (activeRoot) follow(componentOf.get(activeRoot)!);
  else components.forEach((_, index) => reachableComponents.add(index));

  function orderedComponents(scope: Set<number>) {
    const incoming = new Map([...scope].map(index => [index, 0]));
    for (const from of scope) for (const to of componentEdges[from]!) if (scope.has(to)) incoming.set(to, incoming.get(to)! + 1);
    const available = [...scope].filter(index => incoming.get(index) === 0);
    const ordered: number[] = [];
    while (available.length) {
      available.sort((a, b) => componentPriority[a]! - componentPriority[b]!);
      const current = available.shift()!;
      ordered.push(current);
      for (const target of componentEdges[current]!) if (scope.has(target)) {
        incoming.set(target, incoming.get(target)! - 1);
        if (incoming.get(target) === 0) available.push(target);
      }
    }
    return ordered;
  }
  const remaining = new Set(components.map((_, index) => index).filter(index => !reachableComponents.has(index)));
  const orderedPaths = [...orderedComponents(reachableComponents), ...orderedComponents(remaining)].flatMap(index => {
    const paths = components[index]!;
    return activeRoot && paths.includes(activeRoot) ? [activeRoot, ...paths.filter(path => path !== activeRoot)] : paths;
  });
  const byPath = new Map(files.map(file => [file.filename, file]));
  return {
    ordered: orderedPaths.map(path => byPath.get(path)!),
    reachable: new Set([...reachableComponents].flatMap(index => components[index]!)),
    cycles: components.filter(component => component.length > 1),
    root: activeRoot,
  };
}
