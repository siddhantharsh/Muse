// ============================================================
// Muse — First-Link Merge
// When a device signs into an account for the first time, its local
// (offline) data and the account's cloud data are combined instead of
// one silently overwriting the other. After that first link, sync is
// last-write-wins on the whole state.
// ============================================================

import { parseISO } from 'date-fns';
import type { SyncPayload } from './cloudSync';
import type { Task, CalendarEvent } from '../types';

function stamp(value: string | undefined): number {
  if (!value) return 0;
  const t = parseISO(value).getTime();
  return isNaN(t) ? 0 : t;
}

/** Union by id; on a clash the most recently updated copy wins. */
function unionById<T extends { id: string; updatedAt: string }>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const existing = byId.get(item.id);
    if (!existing || stamp(item.updatedAt) >= stamp(existing.updatedAt)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/**
 * Two devices generate their own copy of the same repeating occurrence
 * (different ids, same series + date). Keep one: the one with more real
 * work recorded against it.
 */
function dedupeTaskOccurrences(tasks: Task[]): Task[] {
  const kept = new Map<string, Task>();
  const result: Task[] = [];
  const score = (t: Task) => (t.completed ? 2 : 0) + (t.progress > 0 ? 1 : 0);

  for (const task of tasks) {
    if (!task.isRepeatingInstance || !task.parentRepeatingId || !task.dueDate) {
      result.push(task);
      continue;
    }
    const key = `${task.parentRepeatingId}|${task.dueDate.slice(0, 10)}`;
    const existing = kept.get(key);
    if (
      !existing ||
      score(task) > score(existing) ||
      (score(task) === score(existing) && stamp(task.updatedAt) > stamp(existing.updatedAt))
    ) {
      kept.set(key, task);
    }
  }
  return [...result, ...kept.values()];
}

function dedupeEventOccurrences(events: CalendarEvent[]): CalendarEvent[] {
  const kept = new Map<string, CalendarEvent>();
  const result: CalendarEvent[] = [];
  for (const event of events) {
    if (!event.externalId?.startsWith('repeat-')) {
      result.push(event);
      continue;
    }
    const key = `${event.externalId}|${event.startTime.slice(0, 10)}`;
    if (!kept.has(key)) kept.set(key, event);
  }
  return [...result, ...kept.values()];
}

export function mergePayloads(local: SyncPayload, remote: SyncPayload): SyncPayload {
  return {
    tasks: dedupeTaskOccurrences(unionById(local.tasks, remote.tasks)),
    events: dedupeEventOccurrences(unionById(local.events, remote.events)),
    lists: unionById(local.lists, remote.lists),
    // The account's settings win, but a tour finished on either side stays finished.
    settings: {
      ...local.settings,
      ...remote.settings,
      tutorialCompleted: Boolean(local.settings.tutorialCompleted || remote.settings.tutorialCompleted),
    },
  };
}
