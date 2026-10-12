// ============================================================
// Muse — Autonomous Scheduling Engine
// Constraint-satisfaction solver that dynamically maps
// flexible tasks into rigid temporal availability windows
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  CalendarEvent,
  AppSettings,
  ScheduledBlock,
  UrgencyColor,
  Priority,
  DistributionModel,
  SchedulingHoursProfile,
  TimeSlot,
} from '../types';
import {
  parseISO,
  addMinutes,
  addDays,
  addWeeks,
  startOfDay,
  isBefore,
  isAfter,
  differenceInMinutes,
  differenceInDays,
  getDay,
  format,
} from 'date-fns';

// Convert a Date to local ISO string (no timezone shift)
function toLocalISO(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

// ============================================================
// MAIN ENTRY: Run the scheduling engine
// ============================================================

export function runScheduler(
  tasks: Task[],
  events: CalendarEvent[],
  settings: AppSettings
): Task[] {
  const now = new Date();
  const cutoffDate = addWeeks(now, settings.autoSchedulingCutoffWeeks);

  // Step 1: Handle auto-ignore for repeating tasks with missed deadlines
  let updatedTasks = handleAutoIgnore(tasks, now);

  // Step 2: Filter tasks that need scheduling.
  // Repeating templates are excluded — only their instances get scheduled.
  // A repeating occurrence whose deadline already passed is "missed": it
  // waits in Missed Deadlines for a decision instead of piling onto today
  // (the next occurrence already covers the habit going forward).
  const tasksToSchedule = updatedTasks.filter(
    (t) =>
      t.autoSchedule &&
      !t.completed &&
      !t.inInbox &&
      !t.repeatingRule &&
      t.duration - t.progress > 0 &&
      !(t.isRepeatingInstance && t.dueDate && isBefore(parseISO(t.dueDate), now))
  );

  // Step 3: Build the busy map (events + manually pinned tasks)
  const busySlots = buildBusyMap(events, updatedTasks, now, cutoffDate);

  // Step 4: Build available slots per scheduling hours profile
  const availableSlots = buildAvailableSlots(settings, busySlots, now, cutoffDate);

  // Step 5: Estimate urgency from REAL capacity (available minutes before the
  // deadline vs. remaining work) — this ranks tasks for placement order and
  // decides which ones get force-front-loaded. This is only an estimate: the
  // authoritative color is recomputed after placement in Step 8.
  // A dependent can't start until its prerequisites are done, so their
  // remaining work counts against its capacity too.
  const taskIndex = new Map(updatedTasks.map((t) => [t.id, t]));
  const estimated = tasksToSchedule.map((t) => ({
    ...t,
    urgencyColor: estimateUrgency(t, now, availableSlots, prerequisiteMinutes(t, taskIndex)),
  }));
  // Prerequisites inherit the most demanding priority / deadline / urgency of
  // everything waiting on them — otherwise a low-priority prerequisite of an
  // urgent task gets pushed back and drags the urgent task with it.
  const rankedTasks = inheritFromDependents(estimated);

  // Step 6: Clear existing auto-scheduled blocks, but keep any block the
  // user manually pinned (e.g. dragged to a fixed time) and any block that
  // is happening right now — recalculating mid-block must not yank the task
  // someone is working on. The rest of the remaining work is re-placed.
  updatedTasks = updatedTasks.map((t) => {
    if (t.autoSchedule && !t.completed) {
      return { ...t, scheduledBlocks: t.scheduledBlocks.filter((b) => isKept(b, now)) };
    }
    return t;
  });

  // Step 7: Run the constraint-satisfaction placement algorithm.
  // Tasks are placed in dependency-respecting (topological) order — a task
  // is only placed once every incomplete prerequisite has already been
  // placed — with priority/urgency/due-date/duration as the tie-breaker
  // among tasks that are simultaneously ready.
  const { tasks: placedTasks, blockedIds } = scheduleWithDependencies(
    updatedTasks,
    rankedTasks,
    availableSlots,
    settings,
    now,
    cutoffDate
  );
  updatedTasks = placedTasks;

  // Step 8: Recalculate authoritative urgency colors from the actual
  // placement result (not just calendar-day heuristics).
  updatedTasks = updatedTasks.map((task) => ({
    ...task,
    schedulingBlocked: blockedIds.has(task.id),
    urgencyColor: computeFinalUrgencyColor(task, now, blockedIds.has(task.id), cutoffDate),
  }));

  return updatedTasks;
}

// ============================================================
// SHARED HELPERS
// ============================================================

/**
 * The slot pool a task draws from. A task pointing at a profile that no
 * longer exists (deleted, or synced from another device) falls back to the
 * default day window instead of silently never being scheduled.
 */
function resolveProfileId(task: Task, pools: Map<string, TimeSlot[]>): string {
  const id = task.schedulingHoursId || '_default';
  return pools.has(id) ? id : '_default';
}

function isInProgress(block: ScheduledBlock, now: Date): boolean {
  return !isAfter(parseISO(block.startTime), now) && isAfter(parseISO(block.endTime), now);
}

/** Blocks that survive a recalculation: user-pinned ones, and the one happening now. */
function isKept(block: ScheduledBlock, now: Date): boolean {
  return block.isManuallyPinned || isInProgress(block, now);
}

/**
 * Kept blocks that still represent work to come. A pinned block whose time
 * has already passed is history — if that work happened, progress records
 * it — so it no longer counts toward the remaining work.
 */
function lockedBlocks(task: Task, now: Date): ScheduledBlock[] {
  return task.scheduledBlocks.filter(
    (b) => isKept(b, now) && isAfter(parseISO(b.endTime), now)
  );
}

function isTemplate(task: Task): boolean {
  return !!task.repeatingRule && !task.isRepeatingInstance;
}

/** A prerequisite that's done — ticked off, or all its work recorded. */
function isSatisfied(task: Task): boolean {
  return task.completed || task.duration - task.progress <= 0;
}

/** Remaining minutes of every unfinished prerequisite, direct or indirect. */
function prerequisiteMinutes(task: Task, index: Map<string, Task>): number {
  const seen = new Set<string>();
  const stack = [...task.dependsOn];
  let minutes = 0;
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id) || id === task.id) continue;
    seen.add(id);
    const dep = index.get(id);
    if (!dep || isSatisfied(dep)) continue;
    minutes += dep.duration - dep.progress;
    stack.push(...dep.dependsOn);
  }
  return minutes;
}

/**
 * A task as the solver ranks it. Prerequisites carry the most demanding
 * priority, deadline and urgency of everything downstream of them, and are
 * flagged so they're never spread out (that would delay their dependents).
 */
type RankedTask = Task & {
  rankPriority: Priority;
  rankDue: string | null;
  gatesOthers: boolean;
};

const URGENCY_RANK: Record<UrgencyColor, number> = {
  [UrgencyColor.Green]: 0,
  [UrgencyColor.Orange]: 1,
  [UrgencyColor.Red]: 2,
};

function inheritFromDependents(tasks: Task[]): RankedTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dependentsOf = new Map<string, string[]>();
  for (const t of tasks) {
    for (const depId of t.dependsOn) {
      if (!byId.has(depId)) continue;
      if (!dependentsOf.has(depId)) dependentsOf.set(depId, []);
      dependentsOf.get(depId)!.push(t.id);
    }
  }

  type Inherited = { priority: number; due: number; urgency: number };
  const memo = new Map<string, Inherited>();
  const visiting = new Set<string>(); // cycle guard — cycles are blocked later anyway

  const resolve = (id: string): Inherited => {
    const cached = memo.get(id);
    if (cached) return cached;
    const t = byId.get(id)!;
    const own: Inherited = {
      priority: PRIORITY_WEIGHT[t.priority] ?? 1,
      due: t.dueDate ? parseISO(t.dueDate).getTime() : Infinity,
      urgency: URGENCY_RANK[t.urgencyColor] ?? 0,
    };
    visiting.add(id);
    for (const childId of dependentsOf.get(id) ?? []) {
      if (visiting.has(childId)) continue;
      const child = resolve(childId);
      own.priority = Math.max(own.priority, child.priority);
      own.due = Math.min(own.due, child.due);
      own.urgency = Math.max(own.urgency, child.urgency);
    }
    visiting.delete(id);
    memo.set(id, own);
    return own;
  };

  const priorityByWeight = Object.fromEntries(
    Object.entries(PRIORITY_WEIGHT).map(([p, w]) => [w, p as Priority])
  ) as Record<number, Priority>;
  const urgencyByRank = [UrgencyColor.Green, UrgencyColor.Orange, UrgencyColor.Red];

  return tasks.map((t) => {
    const inherited = resolve(t.id);
    return {
      ...t,
      urgencyColor: urgencyByRank[inherited.urgency],
      rankPriority: priorityByWeight[inherited.priority] ?? t.priority,
      rankDue: Number.isFinite(inherited.due) ? toLocalISO(new Date(inherited.due)) : null,
      gatesOthers: dependentsOf.has(t.id),
    };
  });
}

// ============================================================
// URGENCY ESTIMATION (pre-placement)
// Used only to rank/order tasks before the solver runs. Compares the
// remaining work against the actual free capacity available in the task's
// scheduling-hours profile before its deadline.
// ============================================================

function estimateUrgency(
  task: Task,
  now: Date,
  availableSlots: Map<string, TimeSlot[]>,
  prerequisiteLoad = 0
): UrgencyColor {
  if (task.completed || !task.dueDate) return UrgencyColor.Green;

  const dueDate = parseISO(task.dueDate);
  const pinnedMinutes = lockedBlocks(task, now).reduce((sum, b) => sum + b.duration, 0);
  const ownRemaining = task.duration - task.progress - pinnedMinutes;
  if (ownRemaining <= 0) return UrgencyColor.Green;
  // Unfinished prerequisites have to fit in the same window first.
  const remaining = ownRemaining + prerequisiteLoad;
  if (remaining <= 0) return UrgencyColor.Green;

  // Already overdue
  if (isBefore(dueDate, now)) return UrgencyColor.Red;

  // Capacity only counts from when the task is allowed to start.
  const startAfter = task.startAfter ? parseISO(task.startAfter) : null;
  const windowStart = startAfter && isAfter(startAfter, now) ? startAfter : now;
  const slots = availableSlots.get(resolveProfileId(task, availableSlots)) || [];
  const availableMinutes = sumAvailableMinutesBetween(slots, windowStart, dueDate);

  // Not mathematically enough free capacity to finish in time
  if (availableMinutes < remaining) return UrgencyColor.Red;

  // Capacity is thin — very little slack before the deadline
  if (availableMinutes < remaining * 1.25) return UrgencyColor.Orange;

  // Fits comfortably on paper, but almost no runway left to absorb slippage
  const daysUntilDue = differenceInDays(dueDate, now);
  if (daysUntilDue <= 1 && remaining > 30) return UrgencyColor.Orange;

  return UrgencyColor.Green;
}

function sumAvailableMinutesBetween(slots: TimeSlot[], from: Date, to: Date): number {
  let total = 0;
  for (const slot of slots) {
    if (!isBefore(slot.start, to)) break; // slots are sorted ascending
    const start = isAfter(slot.start, from) ? slot.start : from;
    const end = isBefore(slot.end, to) ? slot.end : to;
    if (isAfter(end, start)) total += differenceInMinutes(end, start);
  }
  return total;
}

// ============================================================
// FINAL URGENCY (post-placement)
// Green = fits comfortably, Orange = fits but tight, Red = overdue,
// blocked, or mathematically cannot make the deadline.
// ============================================================

function computeFinalUrgencyColor(
  task: Task,
  now: Date,
  isBlocked: boolean,
  cutoff: Date
): UrgencyColor {
  // Completed tasks and repeating templates carry no urgency of their own.
  if (task.completed || isTemplate(task)) return UrgencyColor.Green;

  const remaining = task.duration - task.progress;
  if (remaining <= 0) return UrgencyColor.Green;

  // Can't even start — an unresolved prerequisite is blocking it.
  // This applies even without a due date: the task is stuck regardless.
  if (isBlocked) return UrgencyColor.Red;

  if (!task.dueDate) return UrgencyColor.Green;
  const dueDate = parseISO(task.dueDate);

  // Already overdue
  if (isBefore(dueDate, now)) return UrgencyColor.Red;

  // Tasks the engine doesn't place (manual or still in the inbox) can only be
  // judged by their date — "won't fit" would be meaningless for them.
  if (!task.autoSchedule || task.inInbox) {
    return differenceInMinutes(dueDate, now) <= 24 * 60 ? UrgencyColor.Orange : UrgencyColor.Green;
  }

  // Only blocks that haven't ended yet represent work still to come.
  const liveBlocks = task.scheduledBlocks.filter((b) => isAfter(parseISO(b.endTime), now));
  const totalScheduled = liveBlocks.reduce((sum, b) => sum + b.duration, 0);
  if (totalScheduled < remaining) {
    // A deadline past the planning horizon: the rest is simply not planned yet.
    if (isAfter(dueDate, cutoff)) return UrgencyColor.Green;
    // The engine couldn't find enough free capacity (the scheduling-hours
    // profile is too sparse, or everything is taken by higher priorities).
    return UrgencyColor.Red;
  }

  const scheduledBeforeDue = liveBlocks.reduce((sum, b) => {
    return isAfter(parseISO(b.endTime), dueDate) ? sum : sum + b.duration;
  }, 0);
  // Enough total capacity exists, but some of it landed after the deadline
  if (scheduledBeforeDue < remaining) return UrgencyColor.Red;

  // Fully scheduled ahead of the deadline — check how much slack is left
  const lastBlockEnd = liveBlocks.reduce((latest, b) => {
    const end = parseISO(b.endTime);
    return isAfter(end, latest) ? end : latest;
  }, now);
  const slackMinutes = differenceInMinutes(dueDate, lastBlockEnd);
  if (slackMinutes < 120) return UrgencyColor.Orange;

  const daysUntilDue = differenceInDays(dueDate, now);
  if (daysUntilDue <= 1) return UrgencyColor.Orange;

  return UrgencyColor.Green;
}

// ============================================================
// AUTO-IGNORE: Garbage collect missed repeating tasks
// ============================================================

function handleAutoIgnore(tasks: Task[], now: Date): Task[] {
  return tasks.map((task) => {
    if (
      task.autoIgnore &&
      task.isRepeatingInstance &&
      task.dueDate &&
      isBefore(parseISO(task.dueDate), now) &&
      !task.completed
    ) {
      return { ...task, completed: true, completedAt: toLocalISO(now) };
    }
    return task;
  });
}

// ============================================================
// SCHEDULING COMPARATOR
// Priority > Due Date > Duration (shortest first for packing).
// Urgency (Red/Orange, derived from real capacity) supersedes all of it —
// a task that is mathematically at risk of missing its deadline always
// jumps the queue, even ahead of a High-priority task that has slack.
// ============================================================

const PRIORITY_WEIGHT: Record<Priority, number> = {
  [Priority.High]: 4,
  [Priority.Medium]: 3,
  [Priority.Low]: 2,
  [Priority.None]: 1,
};

function compareForScheduling(a: Task, b: Task): number {
  // 1. Red urgency tasks first (forced front-loading)
  const aIsRed = a.urgencyColor === UrgencyColor.Red ? 1 : 0;
  const bIsRed = b.urgencyColor === UrgencyColor.Red ? 1 : 0;
  if (aIsRed !== bIsRed) return bIsRed - aIsRed;

  // 2. Orange urgency tasks next
  const aIsOrange = a.urgencyColor === UrgencyColor.Orange ? 1 : 0;
  const bIsOrange = b.urgencyColor === UrgencyColor.Orange ? 1 : 0;
  if (aIsOrange !== bIsOrange) return bIsOrange - aIsOrange;

  // 3. Priority (High > Medium > Low > None) — inherited from dependents
  const aPriority = (a as RankedTask).rankPriority ?? a.priority;
  const bPriority = (b as RankedTask).rankPriority ?? b.priority;
  const priDiff = PRIORITY_WEIGHT[bPriority] - PRIORITY_WEIGHT[aPriority];
  if (priDiff !== 0) return priDiff;

  // 4. Due date (earlier deadline first) — inherited from dependents
  const aDue = 'rankDue' in a ? (a as RankedTask).rankDue : a.dueDate;
  const bDue = 'rankDue' in b ? (b as RankedTask).rankDue : b.dueDate;
  if (aDue && bDue) {
    const dueDiff = parseISO(aDue).getTime() - parseISO(bDue).getTime();
    if (dueDiff !== 0) return dueDiff;
  }
  if (aDue && !bDue) return -1;
  if (!aDue && bDue) return 1;

  // 5. Shorter tasks first (better packing)
  return a.duration - a.progress - (b.duration - b.progress);
}

// ============================================================
// BUSY MAP: Build a sorted list of occupied time slots
// ============================================================

interface BusySlot {
  start: Date;
  end: Date;
  type: 'event' | 'buffer' | 'task';
}

function buildBusyMap(
  events: CalendarEvent[],
  tasks: Task[],
  now: Date,
  cutoff: Date
): BusySlot[] {
  const busy: BusySlot[] = [];

  // Add busy events (with buffers)
  for (const event of events) {
    if (!event.busy) continue;

    const start = parseISO(event.startTime);
    const end = parseISO(event.endTime);

    if (isAfter(end, now) && isBefore(start, cutoff)) {
      // Buffer before
      if (event.bufferBefore > 0) {
        busy.push({
          start: addMinutes(start, -event.bufferBefore),
          end: start,
          type: 'buffer',
        });
      }

      busy.push({ start, end, type: 'event' });

      // Buffer after
      if (event.bufferAfter > 0) {
        busy.push({
          start: end,
          end: addMinutes(end, event.bufferAfter),
          type: 'buffer',
        });
      }
    }
  }

  // Add kept blocks — pinned ones (a block can be pinned even on a task that
  // is otherwise auto-scheduled, e.g. one occurrence of a split task dragged
  // to a fixed time) and blocks in progress right now. Everything else flows
  // around them.
  for (const task of tasks) {
    if (task.completed || task.inInbox || isTemplate(task)) continue;
    for (const block of task.scheduledBlocks) {
      if (isKept(block, now)) {
        busy.push({
          start: parseISO(block.startTime),
          end: parseISO(block.endTime),
          type: 'task',
        });
      }
    }
  }

  // Sort by start time
  busy.sort((a, b) => a.start.getTime() - b.start.getTime());

  return busy;
}

// ============================================================
// AVAILABLE SLOTS: Intersect scheduling hours with free time
// ============================================================

function buildAvailableSlots(
  settings: AppSettings,
  busySlots: BusySlot[],
  now: Date,
  cutoff: Date
): Map<string, TimeSlot[]> {
  const slotsMap = new Map<string, TimeSlot[]>();

  // For each scheduling hours profile, build available slots
  for (const profile of settings.schedulingHoursProfiles) {
    const slots = computeProfileSlots(profile, busySlots, now, cutoff);
    slotsMap.set(profile.id, slots);
  }

  // Also build a "default" / "any time" profile spanning dayStartHour → dayEndHour.
  // Clamp defensively: a corrupt setting must never produce NaN dates.
  const startHour = clampHour(settings.dayStartHour, 6, 0, 23);
  const endHour = Math.max(startHour + 1, clampHour(settings.dayEndHour, 22, 1, 24));
  const defaultProfile: SchedulingHoursProfile = {
    id: '_default',
    name: 'Default',
    color: '#88C0D0',
    weeklySchedule: Object.fromEntries(
      Array.from({ length: 7 }, (_, day) => [
        day,
        {
          enabled: true,
          blocks: [
            {
              start: `${String(startHour).padStart(2, '0')}:00`,
              end: `${String(endHour).padStart(2, '0')}:00`,
            },
          ],
        },
      ])
    ),
    dateOverrides: {},
  };
  const defaultSlots = computeProfileSlots(
    defaultProfile,
    busySlots,
    now,
    cutoff
  );
  slotsMap.set('_default', defaultSlots);

  return slotsMap;
}

/**
 * Next 5-minute mark at or after `date`, with seconds dropped. Rounding only
 * the minutes field would turn 19:55:30 into 19:55:00 — before "now".
 */
function ceilToFiveMinutes(date: Date): Date {
  const step = 5 * 60_000;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

function clampHour(value: number, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** "HH:mm" → [hours, minutes], or null when the value is empty/malformed. */
function parseClock(value: string | undefined): [number, number] | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null;
  return [h, m];
}

function computeProfileSlots(
  profile: SchedulingHoursProfile,
  busySlots: BusySlot[],
  now: Date,
  cutoff: Date
): TimeSlot[] {
  const allSlots: TimeSlot[] = [];
  // Start 1 day before now so cross-midnight blocks from yesterday
  // (e.g., 22:00→06:00) produce this-morning availability (e.g., 01:30→06:00)
  let current = addDays(startOfDay(now), -1);

  while (isBefore(current, cutoff)) {
    const dayOfWeek = getDay(current);
    const dateStr = format(current, 'yyyy-MM-dd');

    // Check for date override first
    const daySchedule =
      profile.dateOverrides?.[dateStr] || profile.weeklySchedule?.[dayOfWeek];

    if (daySchedule && daySchedule.enabled) {
      for (const block of daySchedule.blocks ?? []) {
        // A half-edited time input can leave "" behind — skip it rather than
        // letting NaN dates poison every slot computation after it.
        const startClock = parseClock(block.start);
        const endClock = parseClock(block.end);
        if (!startClock || !endClock) continue;
        const [startH, startM] = startClock;
        const [endH, endM] = endClock;

        let blockStart = new Date(current);
        blockStart.setHours(startH, startM, 0, 0);

        let blockEnd = new Date(current);
        blockEnd.setHours(endH, endM, 0, 0);

        // Handle midnight crossover: if end time <= start time, the block
        // spans past midnight into the next day (e.g., 19:00 → 00:00)
        if (endH < startH || (endH === startH && endM <= startM)) {
          blockEnd = addDays(blockEnd, 1);
        }

        // Clamp to now if the start is in the past
        if (isBefore(blockStart, now)) {
          blockStart = new Date(now);
          blockStart = ceilToFiveMinutes(now);
        }

        if (isBefore(blockEnd, blockStart)) continue;

        // Subtract busy slots from this block
        const freeInBlock = subtractBusy(blockStart, blockEnd, busySlots);
        allSlots.push(...freeInBlock);
      }
    }

    current = addDays(current, 1);
  }

  // Merge overlapping / adjacent slots (can happen with cross-midnight blocks)
  allSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: TimeSlot[] = [];
  for (const slot of allSlots) {
    const last = merged[merged.length - 1];
    if (last && !isAfter(slot.start, last.end)) {
      // Overlapping or adjacent — extend
      if (isAfter(slot.end, last.end)) {
        last.end = new Date(slot.end);
        last.duration = differenceInMinutes(last.end, last.start);
      }
    } else {
      merged.push({ start: new Date(slot.start), end: new Date(slot.end), duration: slot.duration });
    }
  }
  return merged;
}

function subtractBusy(
  start: Date,
  end: Date,
  busySlots: BusySlot[]
): TimeSlot[] {
  const result: TimeSlot[] = [];
  let currentStart = start;

  for (const busy of busySlots) {
    // Skip busy slots that don't overlap
    if (isAfter(busy.start, end) || isBefore(busy.end, currentStart)) continue;

    // If busy starts after current, we have a free gap
    if (isAfter(busy.start, currentStart)) {
      const gapEnd = isBefore(busy.start, end) ? busy.start : end;
      const duration = differenceInMinutes(gapEnd, currentStart);
      if (duration >= 5) {
        result.push({
          start: new Date(currentStart),
          end: new Date(gapEnd),
          duration,
        });
      }
    }

    // Move past the busy slot
    if (isAfter(busy.end, currentStart)) {
      currentStart = new Date(busy.end);
    }
  }

  // Remaining gap after all busy slots
  if (isBefore(currentStart, end)) {
    const duration = differenceInMinutes(end, currentStart);
    if (duration >= 5) {
      result.push({
        start: new Date(currentStart),
        end: new Date(end),
        duration,
      });
    }
  }

  return result;
}

// ============================================================
// DEPENDENCY-AWARE SCHEDULING DRIVER
// Places tasks in topological order with respect to dependsOn — a task is
// only handed to the placement algorithm once every incomplete prerequisite
// has already been placed. Among tasks that are simultaneously "ready"
// (no unresolved prerequisite), compareForScheduling breaks the tie.
// ============================================================

function scheduleWithDependencies(
  allTasks: Task[],
  tasksToPlace: Task[],
  availableSlots: Map<string, TimeSlot[]>,
  settings: AppSettings,
  now: Date,
  cutoff: Date
): { tasks: Task[]; blockedIds: Set<string> } {
  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const rankedById = new Map(tasksToPlace.map((t) => [t.id, t]));
  const placeableIds = new Set(tasksToPlace.map((t) => t.id));

  const blockedIds = new Set<string>();
  // Unresolved (incomplete) dependency ids, per task-to-place
  const remainingDeps = new Map<string, Set<string>>();
  // Reverse edges: depId -> ids of tasks waiting on it
  const dependents = new Map<string, string[]>();

  for (const t of tasksToPlace) {
    const deps = new Set<string>();
    for (const depId of t.dependsOn) {
      const dep = taskById.get(depId);
      if (!dep || isSatisfied(dep)) continue; // done / not a real dep

      if (!placeableIds.has(depId)) {
        // The prerequisite won't be placed by the engine this run. If the
        // user pinned it to a time (a manual task), its end is a known start
        // point for this one. Otherwise (inbox, missed, unscheduled manual
        // task) there's no start time to wait for, so this task is blocked.
        if (lockedBlocks(dep, now).length === 0) blockedIds.add(t.id);
        continue;
      }

      deps.add(depId);
      if (!dependents.has(depId)) dependents.set(depId, []);
      dependents.get(depId)!.push(t.id);
    }
    remainingDeps.set(t.id, deps);
  }

  // Clone slot pools for consumption during placement
  const consumableSlots = new Map<string, TimeSlot[]>();
  availableSlots.forEach((slots, key) => {
    consumableSlots.set(
      key,
      slots.map((s) => ({ ...s, start: new Date(s.start), end: new Date(s.end) }))
    );
  });
  const dailyPlaced = new Map<string, number>();
  const placedBlocksMap = new Map<string, ScheduledBlock[]>();
  const processed = new Set<string>();

  // Tasks with zero unresolved dependencies are immediately ready
  let ready: Task[] = tasksToPlace.filter(
    (t) => !blockedIds.has(t.id) && remainingDeps.get(t.id)!.size === 0
  );

  while (ready.length > 0) {
    // Pull the highest-ranked ready task (O(n) scan instead of a full re-sort)
    let bestIdx = 0;
    for (let i = 1; i < ready.length; i++) {
      if (compareForScheduling(ready[i], ready[bestIdx]) < 0) bestIdx = i;
    }
    const task = ready.splice(bestIdx, 1)[0];
    processed.add(task.id);

    // Resolve the earliest this task may start
    let effectiveStart = ceilToFiveMinutes(now);
    if (task.startAfter) {
      const startAfter = parseISO(task.startAfter);
      if (isAfter(startAfter, effectiveStart)) effectiveStart = startAfter;
    }
    for (const depId of task.dependsOn) {
      const dep = taskById.get(depId);
      if (!dep || isSatisfied(dep)) continue;
      // Engine-placed prerequisites were placed earlier this run; manual ones
      // keep the blocks the user pinned.
      const depBlocks = placedBlocksMap.get(depId) ?? lockedBlocks(dep, now);
      if (depBlocks.length > 0) {
        const latestEnd = depBlocks.reduce((latest, b) => {
          const end = parseISO(b.endTime);
          return isAfter(end, latest) ? end : latest;
        }, now);
        if (isAfter(latestEnd, effectiveStart)) effectiveStart = latestEnd;
      } else {
        // Dependency was schedulable in principle but the solver found no
        // capacity for it (e.g. it ran into the cutoff) — this task has no
        // known start time this run.
        blockedIds.add(task.id);
      }
    }

    if (blockedIds.has(task.id)) {
      placedBlocksMap.set(task.id, []);
    } else {
      const blocks = placeOneTask(task, consumableSlots, dailyPlaced, settings, effectiveStart, cutoff, now);
      placedBlocksMap.set(task.id, blocks);
    }

    // This task is resolved — release any dependents whose last prerequisite
    // was this one
    for (const dependentId of dependents.get(task.id) || []) {
      const deps = remainingDeps.get(dependentId)!;
      deps.delete(task.id);
      if (deps.size === 0 && !processed.has(dependentId) && !blockedIds.has(dependentId)) {
        const dependentTask = rankedById.get(dependentId);
        if (dependentTask) ready.push(dependentTask);
      }
    }
  }

  // Anything left unprocessed has a circular dependency (should be prevented
  // at the UI layer, but guard against stale/imported data) — block it.
  for (const t of tasksToPlace) {
    if (!processed.has(t.id)) {
      blockedIds.add(t.id);
      placedBlocksMap.set(t.id, []);
    }
  }

  const resultTasks = allTasks.map((t) => {
    const blocks = placedBlocksMap.get(t.id);
    if (blocks !== undefined) {
      return { ...t, scheduledBlocks: blocks };
    }
    return t;
  });

  return { tasks: resultTasks, blockedIds };
}

// ============================================================
// SINGLE-TASK PLACEMENT: Constraint-satisfaction slot filling
// ============================================================

function placeOneTask(
  task: Task,
  consumableSlots: Map<string, TimeSlot[]>,
  dailyPlaced: Map<string, number>,
  settings: AppSettings,
  effectiveStart: Date,
  cutoff: Date,
  now: Date
): ScheduledBlock[] {
  // Pinned blocks (dragged to a fixed time) and the block in progress right
  // now are kept as-is; only the rest of the remaining work needs a slot.
  // (Their time is already excluded from consumableSlots via the busy map.)
  // Past pinned blocks stay for the calendar's history but no longer count.
  const pinnedBlocks = task.scheduledBlocks.filter((b) => isKept(b, now));
  const livePinned = lockedBlocks(task, now);
  const pinnedMinutes = livePinned.reduce((sum, b) => sum + b.duration, 0);
  for (const b of livePinned) {
    const dayKey = `${task.id}-${format(parseISO(b.startTime), 'yyyy-MM-dd')}`;
    dailyPlaced.set(dayKey, (dailyPlaced.get(dayKey) || 0) + b.duration);
  }

  const remainingDuration = task.duration - task.progress - pinnedMinutes;
  if (remainingDuration <= 0) return pinnedBlocks;

  // Use ONLY the task's own scheduling-hours profile — if a user chose
  // "Study Hours", work must land inside those hours, never random daytime.
  // (A profile that no longer exists falls back to the default window.)
  const profileId = resolveProfileId(task, consumableSlots);
  const slots = consumableSlots.get(profileId) || [];

  const blocks: ScheduledBlock[] = [...pinnedBlocks];
  let remainingToPlace = remainingDuration;
  // Old or synced data may lack a sane value; 5 min is the smallest block the UI allows.
  const minBlock = Math.max(5, Number(task.minBlockDuration) || 30);

  // Red/orange tasks bypass balanced distribution and front-load. So does a
  // prerequisite: spreading it out would only delay everything waiting on it.
  const forceFrontLoad =
    task.urgencyColor === UrgencyColor.Red ||
    task.urgencyColor === UrgencyColor.Orange ||
    (task as RankedTask).gatesOthers === true;

  const isBalanced =
    settings.distributionModel === DistributionModel.Balanced && !forceFrontLoad;

  // Safety cap: prevent runaway loops (max iterations = 2× slot count)
  const maxIterations = slots.length * 2 + 100;
  let iterations = 0;

  for (let i = 0; i < slots.length && remainingToPlace > 0; i++) {
    if (++iterations > maxIterations) break; // safety valve
    const slot = slots[i];

    // Skip slots before effective start
    if (isBefore(slot.end, effectiveStart)) continue;

    // Skip slots beyond cutoff
    if (isAfter(slot.start, cutoff)) break;

    // Skip slots past due date if exists (but allow overdue/at-risk tasks to
    // still be scheduled past it — better late than never)
    if (
      task.dueDate &&
      task.urgencyColor !== UrgencyColor.Red &&
      isAfter(slot.start, parseISO(task.dueDate))
    )
      break;

    // Adjust slot start if it begins before effective start
    const slotStart = isAfter(slot.start, effectiveStart) ? slot.start : effectiveStart;
    const slotDuration = differenceInMinutes(slot.end, slotStart);

    if (slotDuration < 5) continue;

    // Balanced distribution: check daily limit for this task
    if (isBalanced) {
      const dayKey = `${task.id}-${format(slotStart, 'yyyy-MM-dd')}`;
      const dayPlaced = dailyPlaced.get(dayKey) || 0;
      const horizonEnd = task.dueDate ? parseISO(task.dueDate) : cutoff;
      const taskHorizon = Math.max(1, differenceInDays(horizonEnd, slotStart));
      const perTaskDailyTarget = Math.ceil(remainingToPlace / taskHorizon);
      // Use per-task target but cap at a global per-task max per day
      if (dayPlaced >= perTaskDailyTarget * 1.3) continue;
    }

    // For splittable tasks, use min block constraint
    if (task.splittable) {
      if (slotDuration < minBlock && slotDuration < remainingToPlace) {
        continue; // Skip slots smaller than min block (unless it's the last bit)
      }

      const horizonDays = Math.max(
        1,
        differenceInDays(task.dueDate ? parseISO(task.dueDate) : cutoff, slotStart)
      );
      const spreadTarget = Math.max(
        minBlock,
        Math.ceil(remainingToPlace / horizonDays)
      );
      // Balanced spreads the work toward the deadline; front-load is greedy —
      // it takes as much of the earliest free slot as the task needs, so free
      // time is only split where something else is actually in the way.
      const maxPerSlot = isBalanced ? spreadTarget : remainingToPlace;

      let blockDuration = Math.min(remainingToPlace, slotDuration, maxPerSlot);

      // Never leave a leftover shorter than the minimum block — it would
      // become exactly the kind of useless fragment minBlockDuration exists
      // to prevent. Absorb it into this block if the slot allows, otherwise
      // shrink this block so the leftover is a full minimum block.
      const leftover = remainingToPlace - blockDuration;
      if (leftover > 0 && leftover < minBlock) {
        blockDuration =
          remainingToPlace <= slotDuration
            ? remainingToPlace
            : remainingToPlace - minBlock;
      }

      if (blockDuration > 0 && blockDuration >= Math.min(minBlock, remainingToPlace)) {
        const block: ScheduledBlock = {
          id: uuidv4(),
          taskId: task.id,
          startTime: toLocalISO(slotStart),
          endTime: toLocalISO(addMinutes(slotStart, blockDuration)),
          duration: blockDuration,
          isManuallyPinned: false,
        };
        blocks.push(block);
        remainingToPlace -= blockDuration;

        // Update daily tracking
        const dayKey = `${task.id}-${format(slotStart, 'yyyy-MM-dd')}`;
        dailyPlaced.set(dayKey, (dailyPlaced.get(dayKey) || 0) + blockDuration);

        // Consume the used portion from this profile's slots
        const blockStart = slotStart;
        const blockEnd = addMinutes(slotStart, blockDuration);
        consumeSlot(slots, i, blockStart, blockEnd);

        // Also consume from ALL other profiles to prevent cross-profile double-booking
        // Use non-strict (<=, >=) so boundary-touching fragments are skipped
        const bsMs = blockStart.getTime();
        const beMs = blockEnd.getTime();
        consumableSlots.forEach((otherSlots, key) => {
          if (key === profileId) return;
          for (let j = 0; j < otherSlots.length; j++) {
            if (otherSlots[j].end.getTime() <= bsMs || otherSlots[j].start.getTime() >= beMs) continue;
            consumeSlot(otherSlots, j, blockStart, blockEnd);
            j--; // re-check after splice
          }
        });

        // Decrement so loop's i++ revisits this index — the after-fragment
        // (remaining available time in this window) now sits here
        i--;
      }
    } else {
      // Non-splittable: need a contiguous block
      if (slotDuration >= remainingToPlace) {
        const block: ScheduledBlock = {
          id: uuidv4(),
          taskId: task.id,
          startTime: toLocalISO(slotStart),
          endTime: toLocalISO(addMinutes(slotStart, remainingToPlace)),
          duration: remainingToPlace,
          isManuallyPinned: false,
        };
        blocks.push(block);

        // Update daily tracking
        const dayKey = `${task.id}-${format(slotStart, 'yyyy-MM-dd')}`;
        dailyPlaced.set(dayKey, (dailyPlaced.get(dayKey) || 0) + remainingToPlace);

        // Consume the used portion from this profile's slots
        const nsBlockStart = slotStart;
        const nsBlockEnd = addMinutes(slotStart, remainingToPlace);
        consumeSlot(slots, i, nsBlockStart, nsBlockEnd);

        // Also consume from ALL other profiles to prevent cross-profile double-booking
        const nsBsMs = nsBlockStart.getTime();
        const nsBeMs = nsBlockEnd.getTime();
        consumableSlots.forEach((otherSlots, key) => {
          if (key === profileId) return;
          for (let j = 0; j < otherSlots.length; j++) {
            if (otherSlots[j].end.getTime() <= nsBsMs || otherSlots[j].start.getTime() >= nsBeMs) continue;
            consumeSlot(otherSlots, j, nsBlockStart, nsBlockEnd);
            j--;
          }
        });

        // Non-splittable is done after one placement, no need to revisit
        i--;

        remainingToPlace = 0;
      }
    }
  }

  return mergeTouchingBlocks(blocks);
}

/**
 * Joins auto-placed pieces of one task that end exactly where the next
 * begins — they're one sitting, and showing them as separate blocks is
 * just noise. Pinned blocks are left exactly as the user placed them.
 */
function mergeTouchingBlocks(blocks: ScheduledBlock[]): ScheduledBlock[] {
  const pinned = blocks.filter((b) => b.isManuallyPinned);
  const auto = blocks
    .filter((b) => !b.isManuallyPinned)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged: ScheduledBlock[] = [];
  for (const block of auto) {
    const last = merged[merged.length - 1];
    if (last && last.endTime === block.startTime) {
      merged[merged.length - 1] = {
        ...last,
        endTime: block.endTime,
        duration: last.duration + block.duration,
      };
    } else {
      merged.push(block);
    }
  }
  return [...pinned, ...merged];
}

// ============================================================
// SLOT CONSUMPTION: Split or remove used slot portions
// ============================================================

function consumeSlot(
  slots: TimeSlot[],
  index: number,
  usedStart: Date,
  usedEnd: Date
): void {
  const slot = slots[index];
  const newSlots: TimeSlot[] = [];

  // Fragment before
  if (isAfter(usedStart, slot.start)) {
    const beforeDuration = differenceInMinutes(usedStart, slot.start);
    if (beforeDuration >= 5) {
      newSlots.push({
        start: new Date(slot.start),
        end: new Date(usedStart),
        duration: beforeDuration,
      });
    }
  }

  // Fragment after
  if (isBefore(usedEnd, slot.end)) {
    const afterDuration = differenceInMinutes(slot.end, usedEnd);
    if (afterDuration >= 5) {
      newSlots.push({
        start: new Date(usedEnd),
        end: new Date(slot.end),
        duration: afterDuration,
      });
    }
  }

  // Replace the original slot with fragments
  slots.splice(index, 1, ...newSlots);
}
