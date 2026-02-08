import type { ThemeDependency } from './theme-analyzer';

export function buildDependencyGraph(deps: ThemeDependency[]) {
  const graph = new Map<string, Set<string>>();
  for (const dep of deps) {
    const set = graph.get(dep.source) ?? new Set<string>();
    set.add(dep.target);
    graph.set(dep.source, set);
  }
  return graph;
}
