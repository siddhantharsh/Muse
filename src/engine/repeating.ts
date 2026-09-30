// ============================================================
// Muse — Repeating Instance Generator
// Expands repeating tasks/events into concrete occurrences.
//
// Rules that keep a series stable across recalculations:
//  - Occurrence k is computed from the series' base date directly
//    (base + k·interval), so month-end dates never drift (Jan 31 →
//    Feb 28 → Mar 31, not → Mar 28).
//  - Occurrences whose deadline has already passed are never created;
//    only real, existing occurrences can become "missed".
//  - Dates the user deleted are stored in rule.exceptions and skipped.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Task, CalendarEvent, RepeatingRule, RepeatFrequency } from '../types';
import {
  parseISO,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  addMinutes,
  format,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  getDaysInMonth,
} from 'date-fns';

// Upper bound on occurrences walked per series (≈ 27 years of daily).
const HARD_CAP = 10_000;

function toLocalISO(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

// ============================================================
// Occurrence sequence
// ============================================================

function nthOccurrence(base: Date, rule: RepeatingRule, k: number, interval: number): Date {
  switch (rule.frequency) {
    case RepeatFrequency.Weekly:
      return addWeeks(base, k * interval);
    case RepeatFrequency.Biweekly:
      return addWeeks(base, 2 * k * interval);
    case RepeatFrequency.Monthly: {
      const d = addMonths(base, k * interval);
      if (rule.dayOfMonth) {
        d.setDate(Math.min(rule.dayOfMonth, getDaysInMonth(d)));
      }
      return d;
    }
    case RepeatFrequency.Yearly:
      return addYears(base, k * interval);
    case RepeatFrequency.Daily:
    case RepeatFrequency.Custom:
    default:
      return addDays(base, k * interval);
  }
}

/** Weekly-on-specific-days: next matching weekday, honoring the week interval. */
function nextWeeklyByDays(current: Date, days: number[], interval: number): Date {
  const currentDay = current.getDay();
  const laterThisWeek = days.find((d) => d > currentDay);
  if (laterThisWeek !== undefined) return addDays(current, laterThisWeek - currentDay);
  // Jump to Sunday of the next cycle week, then to its first matching day.
  return addDays(current, 7 - currentDay + (interval - 1) * 7 + days[0]);
}

/** Yields the series' occurrences in order, starting at the base when includeBase. */
function* occurrences(base: Date, rule: RepeatingRule, includeBase: boolean): Generator<Date> {
  const interval = Math.max(1, Math.floor(rule.interval || 1));

  if (rule.frequency === RepeatFrequency.Weekly && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const days = [...new Set(rule.daysOfWeek)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
    if (days.length === 0) return;
    let current = base;
    if (includeBase && days.includes(base.getDay())) yield base;
    for (let i = 0; i < HARD_CAP; i++) {
      current = nextWeeklyByDays(current, days, interval);
      yield current;
    }
    return;
  }

  for (let k = includeBase ? 0 : 1; k < HARD_CAP; k++) {
    yield nthOccurrence(base, rule, k, interval);
  }
}

function ruleLimits(rule: RepeatingRule) {
  return {
    endDate: rule.endDate ? endOfDay(parseISO(rule.endDate)) : null,
    maxCount: rule.count && rule.count > 0 ? rule.count : Infinity,
    exceptions: new Set(rule.exceptions ?? []),
  };
}

// ============================================================
// Tasks
// ============================================================

export function generateRepeatingTaskInstances(
  parentTask: Task,
  allTasks: Task[],
  cutoff: Date,
  maxUpcoming: number = 3,
  now: Date = new Date()
): Task[] {
  const rule = parentTask.repeatingRule;
  if (!rule || parentTask.completed) return [];

  const hasDue = !!parentTask.dueDate;
  const base = parseISO(parentTask.dueDate ?? parentTask.startAfter ?? parentTask.createdAt);
  if (isNaN(base.getTime())) return [];

  const { endDate, maxCount, exceptions } = ruleLimits(rule);
  const series = allTasks.filter((t) => t.parentRepeatingId === parentTask.id);
  const existingDays = new Set(series.map((t) => t.dueDate?.slice(0, 10)).filter(Boolean));
  let upcoming = series.filter(
    (t) => !t.completed && t.dueDate && !isBefore(parseISO(t.dueDate), now)
  ).length;

  // Preserve the parent's "can start N minutes before it's due" window.
  const leadMinutes =
    parentTask.startAfter && parentTask.dueDate
      ? Math.max(0, differenceInMinutes(parseISO(parentTask.dueDate), parseISO(parentTask.startAfter)))
      : null;

  const created: Task[] = [];
  let index = 0;

  for (const occurrence of occurrences(base, rule, true)) {
    index++;
    if (index > maxCount || !isBefore(occurrence, cutoff) || upcoming >= maxUpcoming) break;
    if (endDate && isAfter(occurrence, endDate)) break;

    // Without a due time on the template, an occurrence is due by the end of its day.
    const due = new Date(hasDue ? occurrence : endOfDay(occurrence));
    due.setSeconds(0, 0);
    if (isBefore(due, now)) continue;

    const dayKey = format(occurrence, 'yyyy-MM-dd');
    if (exceptions.has(dayKey) || existingDays.has(dayKey)) continue;

    const startAfter = leadMinutes !== null ? addMinutes(due, -leadMinutes) : startOfDay(occurrence);
    const stamp = toLocalISO(new Date());

    created.push({
      ...parentTask,
      id: uuidv4(),
      isRepeatingInstance: true,
      parentRepeatingId: parentTask.id,
      repeatingRule: null,
      dueDate: toLocalISO(due),
      startAfter: toLocalISO(startAfter),
      completed: false,
      completedAt: null,
      progress: 0,
      scheduledBlocks: [],
      schedulingBlocked: false,
      createdAt: stamp,
      updatedAt: stamp,
    });
    existingDays.add(dayKey);
    upcoming++;
  }

  return created;
}

// ============================================================
// Events
// ============================================================

export function repeatSeriesKey(parentEventId: string): string {
  return `repeat-${parentEventId}`;
}

export function generateRepeatingEventInstances(
  parentEvent: CalendarEvent,
  allEvents: CalendarEvent[],
  cutoff: Date,
  maxUpcoming: number = 3,
  now: Date = new Date()
): CalendarEvent[] {
  const rule = parentEvent.repeatingRule;
  if (!rule) return [];

  const base = parseISO(parentEvent.startTime);
  const baseEnd = parseISO(parentEvent.endTime);
  if (isNaN(base.getTime()) || isNaN(baseEnd.getTime())) return [];
  const duration = Math.max(0, differenceInMinutes(baseEnd, base));

  const { endDate, maxCount, exceptions } = ruleLimits(rule);
  const seriesKey = repeatSeriesKey(parentEvent.id);
  const series = allEvents.filter((e) => e.externalId === seriesKey);
  // The parent event is itself the first occurrence.
  const existingDays = new Set([parentEvent.startTime.slice(0, 10), ...series.map((e) => e.startTime.slice(0, 10))]);
  let upcoming = series.filter((e) => !isBefore(parseISO(e.endTime), now)).length;

  const created: CalendarEvent[] = [];
  let index = 1;

  for (const start of occurrences(base, rule, false)) {
    index++;
    if (index > maxCount || !isBefore(start, cutoff) || upcoming >= maxUpcoming) break;
    if (endDate && isAfter(start, endDate)) break;

    const end = addMinutes(start, duration);
    if (!isAfter(end, now)) continue;

    const dayKey = format(start, 'yyyy-MM-dd');
    if (exceptions.has(dayKey) || existingDays.has(dayKey)) continue;

    const stamp = toLocalISO(new Date());
    created.push({
      ...parentEvent,
      id: uuidv4(),
      startTime: toLocalISO(start),
      endTime: toLocalISO(end),
      repeatingRule: null,
      externalId: seriesKey,
      createdAt: stamp,
      updatedAt: stamp,
    });
    existingDays.add(dayKey);
    upcoming++;
  }

  return created;
}
