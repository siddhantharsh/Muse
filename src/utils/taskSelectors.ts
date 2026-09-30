// ============================================================
// Muse — Shared Task Selectors
// One definition of "which tasks does the person actually see",
// used by every list, count and badge so they always agree.
// ============================================================

import { parseISO, isBefore } from 'date-fns';
import type { Task } from '../types';

/** A repeating task's template. Its generated instances are the real work items. */
export function isRepeatingTemplate(task: Task): boolean {
  return !!task.repeatingRule && !task.isRepeatingInstance;
}

/** Past its due date and still open. Templates are never "missed". */
export function isMissed(task: Task, now: Date = new Date()): boolean {
  return (
    !task.completed &&
    !isRepeatingTemplate(task) &&
    !!task.dueDate &&
    isBefore(parseISO(task.dueDate), now)
  );
}

/**
 * Open tasks as a person thinks of them: templates hidden, and each
 * repeating series collapsed to its missed occurrences plus the next
 * upcoming one (instead of ~60 future copies).
 */
export function getVisibleOpenTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const nextInstanceBySeries = new Map<string, Task>();
  const visible: Task[] = [];

  for (const task of tasks) {
    if (task.completed || task.inInbox || isRepeatingTemplate(task)) continue;

    if (task.isRepeatingInstance && task.parentRepeatingId && !isMissed(task, now)) {
      const current = nextInstanceBySeries.get(task.parentRepeatingId);
      const due = task.dueDate ? parseISO(task.dueDate).getTime() : Infinity;
      const currentDue = current?.dueDate ? parseISO(current.dueDate).getTime() : Infinity;
      if (!current || due < currentDue) nextInstanceBySeries.set(task.parentRepeatingId, task);
      continue;
    }

    visible.push(task);
  }

  return [...visible, ...nextInstanceBySeries.values()];
}

/**
 * Open tasks with a deadline in the past that still need a decision.
 * Auto-ignored repeating occurrences are excluded — the engine closes those.
 */
export function getMissedTasks(tasks: Task[], now: Date = new Date()): Task[] {
  return tasks.filter((t) => isMissed(t, now) && !(t.isRepeatingInstance && t.autoIgnore));
}
