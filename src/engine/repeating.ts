// ============================================================
// Muse — Repeating Instance Generator
// Expands repeating tasks/events into concrete instances
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Task, CalendarEvent, RepeatingRule, RepeatFrequency } from '../types';
import {
  parseISO,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  format,
  isBefore,
  isAfter,
  differenceInMinutes,
  differenceInDays,
} from 'date-fns';

function toLocalISO(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

// ============================================================
// Generate task instances from a repeating parent
// ============================================================

export function generateRepeatingTaskInstances(
  parentTask: Task,
  existingInstances: Task[],
  cutoff: Date,
  maxUpcoming: number = 3
): Task[] {
  if (!parentTask.repeatingRule) return [];

  const rule = parentTask.repeatingRule;
  const baseDate = parentTask.dueDate
    ? parseISO(parentTask.dueDate)
    : parentTask.startAfter
    ? parseISO(parentTask.startAfter)
    : parseISO(parentTask.createdAt);

  // Collect dates for which an instance already exists (completed or not)
  const existingDueDates = new Set(
    existingInstances
      .filter((t) => t.parentRepeatingId === parentTask.id)
      .map((t) => t.dueDate ? t.dueDate.slice(0, 10) : '')
      .filter(Boolean)
  );

  // Count existing uncompleted future instances for this parent
  const now = new Date();
  const existingFutureCount = existingInstances.filter(
    (t) =>
      t.parentRepeatingId === parentTask.id &&
      !t.completed &&
      t.dueDate &&
      !isBefore(parseISO(t.dueDate), now)
  ).length;

  // Only generate enough to fill up to maxUpcoming
  const needed = Math.max(0, maxUpcoming - existingFutureCount);
  if (needed === 0) return [];

  const newInstances: Task[] = [];
  let occurrenceCount = 0;
  const maxOccurrences = rule.count || 365;
  let current = baseDate;

  // Start from next occurrence after the base
  current = getNextOccurrence(current, rule);

  while (
    isBefore(current, cutoff) &&
    occurrenceCount < maxOccurrences &&
    newInstances.length < needed
  ) {
    // Check end date
    if (rule.endDate && isAfter(current, parseISO(rule.endDate))) break;

    const dateKey = format(current, 'yyyy-MM-dd');

    // Only create if instance doesn't already exist
    if (!existingDueDates.has(dateKey)) {
      const instance: Task = {
        ...parentTask,
        id: uuidv4(),
        isRepeatingInstance: true,
        parentRepeatingId: parentTask.id,
        repeatingRule: null, // instances don't repeat
        dueDate: toLocalISO(current),
        // Preserve the parent's startAfter-to-dueDate gap so the scheduler
        // has the same scheduling window for each instance
        startAfter: parentTask.startAfter && parentTask.dueDate
          ? toLocalISO(addDays(current, -differenceInDays(
              parseISO(parentTask.dueDate),
              parseISO(parentTask.startAfter)
            )))
          : parentTask.startAfter
            ? toLocalISO(addDays(current, -1)) // fallback: 1 day before due
            : null,
        completed: false,
        completedAt: null,
        progress: 0,
        scheduledBlocks: [],
        createdAt: toLocalISO(new Date()),
        updatedAt: toLocalISO(new Date()),
      };
      newInstances.push(instance);
    }

    occurrenceCount++;
    current = getNextOccurrence(current, rule);
  }

  return newInstances;
}

// ============================================================
// Generate event instances from a repeating parent
// ============================================================

export function generateRepeatingEventInstances(
  parentEvent: CalendarEvent,
  existingEvents: CalendarEvent[],
  cutoff: Date,
  maxUpcoming: number = 3
): CalendarEvent[] {
  if (!parentEvent.repeatingRule) return [];

  const rule = parentEvent.repeatingRule;
  const baseStart = parseISO(parentEvent.startTime);
  const baseEnd = parseISO(parentEvent.endTime);
  const durationMinutes = differenceInMinutes(baseEnd, baseStart);

  const existingStartDates = new Set(
    existingEvents
      .filter((e) => e.externalId === `repeat-${parentEvent.id}`)
      .map((e) => e.startTime.slice(0, 10))
  );

  // Count existing uncompleted future instances
  const now = new Date();
  const existingFutureCount = existingEvents.filter(
    (e) =>
      e.externalId === `repeat-${parentEvent.id}` &&
      !isBefore(parseISO(e.startTime), now)
  ).length;

  const needed = Math.max(0, maxUpcoming - existingFutureCount);
  if (needed === 0) return [];

  const newInstances: CalendarEvent[] = [];
  let occurrenceCount = 0;
  const maxOccurrences = rule.count || 365;
  let current = baseStart;

  current = getNextOccurrence(current, rule);

  while (
    isBefore(current, cutoff) &&
    occurrenceCount < maxOccurrences &&
    newInstances.length < needed
  ) {
    if (rule.endDate && isAfter(current, parseISO(rule.endDate))) break;

    const dateKey = format(current, 'yyyy-MM-dd');

    if (!existingStartDates.has(dateKey)) {
      const instanceStart = new Date(current);
      instanceStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
      const instanceEnd = new Date(instanceStart);
      instanceEnd.setMinutes(instanceEnd.getMinutes() + durationMinutes);

      const instance: CalendarEvent = {
        ...parentEvent,
        id: uuidv4(),
        startTime: toLocalISO(instanceStart),
        endTime: toLocalISO(instanceEnd),
        repeatingRule: null,
        externalId: `repeat-${parentEvent.id}`,
        createdAt: toLocalISO(new Date()),
        updatedAt: toLocalISO(new Date()),
      };
      newInstances.push(instance);
    }

    occurrenceCount++;
    current = getNextOccurrence(current, rule);
  }

  return newInstances;
}

// ============================================================
// Date advancement based on repeating rule
// ============================================================

function getNextOccurrence(current: Date, rule: RepeatingRule): Date {
  const interval = rule.interval || 1;

  switch (rule.frequency) {
    case RepeatFrequency.Daily:
      return addDays(current, interval);

    case RepeatFrequency.Weekly:
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        // For weekly with interval, we must respect the interval cycle.
        // First try remaining matching days in the current week.
        const sortedDays = [...rule.daysOfWeek].sort((a, b) => a - b);
        const currentDay = current.getDay();
        
        // Find the next matching day in the SAME week (after current day)
        const nextInSameWeek = sortedDays.find((d) => d > currentDay);
        if (nextInSameWeek !== undefined) {
          return addDays(current, nextInSameWeek - currentDay);
        }
        
        // No more matching days this week — jump forward by `interval` weeks
        // to the first matching day of that target week
        const daysUntilWeekEnd = 7 - currentDay; // days to get to Sunday (0)
        const firstMatchDay = sortedDays[0];
        const daysToJump = daysUntilWeekEnd + (interval - 1) * 7 + firstMatchDay;
        return addDays(current, daysToJump);
      }
      return addWeeks(current, interval);

    case RepeatFrequency.Biweekly:
      return addWeeks(current, 2 * interval);

    case RepeatFrequency.Monthly:
      if (rule.dayOfMonth) {
        const next = addMonths(current, interval);
        next.setDate(Math.min(rule.dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
        return next;
      }
      return addMonths(current, interval);

    case RepeatFrequency.Yearly:
      return addYears(current, interval);

    case RepeatFrequency.Custom:
      return addDays(current, interval);

    default:
      return addDays(current, 1);
  }
}
