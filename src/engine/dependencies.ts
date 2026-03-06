// ============================================================
// Muse — Dependency Graph Utilities
// Transitive circular dependency detection using DFS
// ============================================================

import { Task } from '../types';

/**
 * Checks whether adding a dependency from `taskId` -> `newDepId`
 * would create a circular dependency (including transitive).
 *
 * Returns true if adding the edge would create a cycle.
 */
export function wouldCreateCycle(
  tasks: Task[],
  taskId: string,
  newDepId: string
): boolean {
  // Build adjacency list from all tasks
  const adjList = new Map<string, string[]>();
  for (const task of tasks) {
    adjList.set(task.id, [...task.dependsOn]);
  }

  // Simulate adding the new dependency
  const currentDeps = adjList.get(taskId) || [];
  adjList.set(taskId, [...currentDeps, newDepId]);

  // DFS from newDepId — if we can reach taskId, there's a cycle
  const visited = new Set<string>();
  const stack = [newDepId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true; // Cycle found!
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = adjList.get(current) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        stack.push(dep);
      }
    }
  }

  return false;
}

/**
 * Returns all task IDs that are transitively depended upon by taskId.
 */
export function getTransitiveDeps(tasks: Task[], taskId: string): Set<string> {
  const adjList = new Map<string, string[]>();
  for (const task of tasks) {
    adjList.set(task.id, [...task.dependsOn]);
  }

  const visited = new Set<string>();
  const stack = [...(adjList.get(taskId) || [])];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = adjList.get(current) || [];
    for (const dep of deps) {
      stack.push(dep);
    }
  }

  return visited;
}
