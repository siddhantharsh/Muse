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
  endOfDay,
  isBefore,
  isAfter,
  isSameDay,
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

  // Step 1: Compute urgency colors for all tasks
  let updatedTasks = tasks.map((task) => ({
    ...task,
    urgencyColor: computeUrgencyColor(task, now),
  }));

  // Step 2: Handle auto-ignore for repeating tasks with missed deadlines
  updatedTasks = handleAutoIgnore(updatedTasks, now);

  // Step 3: Filter tasks that need scheduling
  const tasksToSchedule = updatedTasks.filter(
    (t) =>
      t.autoSchedule &&
      !t.completed &&
      !t.inInbox &&
      t.duration - t.progress > 0
  );

  // Step 4: Sort tasks by scheduling priority
  const sortedTasks = sortBySchedulingPriority(tasksToSchedule);

  // Step 5: Build the busy map (events + manually pinned tasks)
  const busySlots = buildBusyMap(events, updatedTasks, now, cutoffDate);

  // Step 6: Build available slots per scheduling hours profile
  const availableSlots = buildAvailableSlots(
    settings,
    busySlots,
    now,
    cutoffDate
  );

  // Step 7: Clear all existing auto-scheduled blocks
  updatedTasks = updatedTasks.map((t) => {
    if (t.autoSchedule && !t.completed) {
      return { ...t, scheduledBlocks: [] };
    }
    return t;
  });

  // Step 8: Run the constraint-satisfaction placement algorithm
  updatedTasks = placeTasksInSlots(
    updatedTasks,
    sortedTasks,
    availableSlots,
    busySlots,
    settings,
    now,
    cutoffDate
  );

  // Step 9: Recalculate urgency colors after placement
  updatedTasks = updatedTasks.map((task) => ({
    ...task,
    urgencyColor: computeUrgencyColor(task, now),
  }));

  return updatedTasks;
}

// ============================================================
// URGENCY COLOR COMPUTATION
// Green = normal, Orange = close to deadline, Red = overdue
// ============================================================

function computeUrgencyColor(task: Task, now: Date): UrgencyColor {
  if (task.completed || !task.dueDate) return UrgencyColor.Green;

  const dueDate = parseISO(task.dueDate);
  const daysUntilDue = differenceInDays(dueDate, now);
  const remainingDuration = task.duration - task.progress;

  // Already overdue
  if (isBefore(dueDate, now)) {
    return UrgencyColor.Red;
  }

  // Less than 1 day remaining and significant work left
  if (daysUntilDue <= 1 && remainingDuration > 60) {
    return UrgencyColor.Red;
  }

  // Within danger zone (remaining work barely fits)
  // If remaining hours > available hours before deadline * 0.7
  if (daysUntilDue <= 2 || (daysUntilDue <= 3 && remainingDuration > 120)) {
    return UrgencyColor.Orange;
  }

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
// PRIORITY SORTING
// Priority > Due Date > Duration (shortest first for packing)
// ============================================================

const PRIORITY_WEIGHT: Record<Priority, number> = {
  [Priority.High]: 4,
  [Priority.Medium]: 3,
  [Priority.Low]: 2,
  [Priority.None]: 1,
};

function sortBySchedulingPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // 1. Red urgency tasks first (forced front-loading)
    const aIsRed = a.urgencyColor === UrgencyColor.Red ? 1 : 0;
    const bIsRed = b.urgencyColor === UrgencyColor.Red ? 1 : 0;
    if (aIsRed !== bIsRed) return bIsRed - aIsRed;

    // 2. Orange urgency tasks next
    const aIsOrange = a.urgencyColor === UrgencyColor.Orange ? 1 : 0;
    const bIsOrange = b.urgencyColor === UrgencyColor.Orange ? 1 : 0;
    if (aIsOrange !== bIsOrange) return bIsOrange - aIsOrange;

    // 3. Priority (High > Medium > Low > None)
    const priDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priDiff !== 0) return priDiff;

    // 4. Due date (earlier deadline first)
    if (a.dueDate && b.dueDate) {
      const dueDiff =
        parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
      if (dueDiff !== 0) return dueDiff;
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;

    // 5. Shorter tasks first (better packing)
    return a.duration - a.progress - (b.duration - b.progress);
  });
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

  // Add manually pinned (non-auto-scheduled) tasks
  for (const task of tasks) {
    if (task.autoSchedule || task.completed || task.inInbox) continue;
    for (const block of task.scheduledBlocks) {
      if (block.isManuallyPinned) {
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

  // Also build a "default" / "any" profile that uses dayStartHour to dayEndHour
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
              start: `${String(settings.dayStartHour).padStart(2, '0')}:00`,
              end: `${String(settings.dayEndHour).padStart(2, '0')}:00`,
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
      profile.dateOverrides[dateStr] || profile.weeklySchedule[dayOfWeek];

    if (daySchedule && daySchedule.enabled) {
      for (const block of daySchedule.blocks) {
        const [startH, startM] = block.start.split(':').map(Number);
        const [endH, endM] = block.end.split(':').map(Number);

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
          // Round up to next 5-minute mark
          const mins = blockStart.getMinutes();
          const roundedMins = Math.ceil(mins / 5) * 5;
          blockStart.setMinutes(roundedMins, 0, 0);
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
// TASK PLACEMENT: Constraint-satisfaction algorithm
// ============================================================

function placeTasksInSlots(
  allTasks: Task[],
  tasksToPlace: Task[],
  availableSlots: Map<string, TimeSlot[]>,
  busySlots: BusySlot[],
  settings: AppSettings,
  now: Date,
  cutoff: Date
): Task[] {
  // Clone available slots for consumption
  const consumableSlots = new Map<string, TimeSlot[]>();
  availableSlots.forEach((slots, key) => {
    consumableSlots.set(
      key,
      slots.map((s) => ({ ...s, start: new Date(s.start), end: new Date(s.end) }))
    );
  });

  // Track placed blocks
  const placedBlocksMap = new Map<string, ScheduledBlock[]>();

  // (balanced daily target is now computed per-task based on its deadline window)

  // Track daily placement for balanced mode (per-task per-day)
  const dailyPlaced = new Map<string, number>();

  for (const task of tasksToPlace) {
    const remainingDuration = task.duration - task.progress;
    if (remainingDuration <= 0) continue;

    // Resolve dependencies: find the earliest start
    let effectiveStart = now;
    if (task.startAfter) {
      const startAfter = parseISO(task.startAfter);
      if (isAfter(startAfter, effectiveStart)) {
        effectiveStart = startAfter;
      }
    }

    // Check dependency chain
    let hasUnscheduledDep = false;
    for (const depId of task.dependsOn) {
      const depTask = allTasks.find((t) => t.id === depId);
      if (depTask && !depTask.completed) {
        // Dependency not complete — push start after its latest scheduled block
        const depBlocks = placedBlocksMap.get(depId) || depTask.scheduledBlocks;
        if (depBlocks.length > 0) {
          const latestEnd = depBlocks.reduce((latest, b) => {
            const end = parseISO(b.endTime);
            return isAfter(end, latest) ? end : latest;
          }, now);
          if (isAfter(latestEnd, effectiveStart)) {
            effectiveStart = latestEnd;
          }
        } else {
          // Dependency has no scheduled blocks and isn't complete — can't schedule dependent
          hasUnscheduledDep = true;
        }
      }
    }

    // Skip scheduling if any dependency is incomplete and unscheduled
    if (hasUnscheduledDep) {
      placedBlocksMap.set(task.id, []);
      continue;
    }

    // Get the correct slot pool — ONLY use the assigned profile (no fallback)
    // If a user chose "Study Hours", tasks MUST schedule within those hours, not random daytime
    const profileId = task.schedulingHoursId || '_default';
    const slots = consumableSlots.get(profileId) || [];

    // Place the task
    const blocks: ScheduledBlock[] = [];
    let remainingToPlace = remainingDuration;

    // For red/orange tasks, bypass balanced distribution — front-load aggressively
    const forceFrontLoad =
      task.urgencyColor === UrgencyColor.Red ||
      task.urgencyColor === UrgencyColor.Orange;

    const isBalanced =
      settings.distributionModel === DistributionModel.Balanced &&
      !forceFrontLoad;

    for (let i = 0; i < slots.length && remainingToPlace > 0; i++) {
      const slot = slots[i];

      // Skip slots before effective start
      if (isBefore(slot.end, effectiveStart)) continue;

      // Skip slots beyond cutoff
      if (isAfter(slot.start, cutoff)) break;

      // Skip slots past due date if exists (but allow overdue tasks to still be scheduled)
      if (task.dueDate && task.urgencyColor !== UrgencyColor.Red &&
          isAfter(slot.start, parseISO(task.dueDate))) break;

      // Adjust slot start if it begins before effective start
      const slotStart = isAfter(slot.start, effectiveStart)
        ? slot.start
        : effectiveStart;
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
        if (slotDuration < task.minBlockDuration && slotDuration < remainingToPlace) {
          continue; // Skip slots smaller than min block (unless it's the last bit)
        }

        // Compute max block size:
        // - Balanced mode: spread across days proportionally
        // - Front-load mode: cap at minBlockDuration to still respect splitting
        const horizonDays = Math.max(1, differenceInDays(
          task.dueDate ? parseISO(task.dueDate) : cutoff,
          slotStart
        ));
        const spreadTarget = Math.max(
          task.minBlockDuration,
          Math.ceil(remainingToPlace / horizonDays)
        );
        const maxPerSlot = isBalanced
          ? spreadTarget
          : Math.max(task.minBlockDuration, Math.min(spreadTarget, task.minBlockDuration * 2));

        const blockDuration = Math.min(
          remainingToPlace,
          slotDuration,
          maxPerSlot
        );

        if (blockDuration >= Math.min(task.minBlockDuration, remainingToPlace)) {
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
          consumableSlots.forEach((otherSlots, key) => {
            if (key === profileId) return;
            for (let j = 0; j < otherSlots.length; j++) {
              if (isBefore(otherSlots[j].end, blockStart) || isAfter(otherSlots[j].start, blockEnd)) continue;
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
          dailyPlaced.set(
            dayKey,
            (dailyPlaced.get(dayKey) || 0) + remainingToPlace
          );

          // Consume the used portion from this profile's slots
          const nsBlockStart = slotStart;
          const nsBlockEnd = addMinutes(slotStart, remainingToPlace);
          consumeSlot(slots, i, nsBlockStart, nsBlockEnd);

          // Also consume from ALL other profiles to prevent cross-profile double-booking
          consumableSlots.forEach((otherSlots, key) => {
            if (key === profileId) return;
            for (let j = 0; j < otherSlots.length; j++) {
              if (isBefore(otherSlots[j].end, nsBlockStart) || isAfter(otherSlots[j].start, nsBlockEnd)) continue;
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

    placedBlocksMap.set(task.id, blocks);
  }

  // Apply placed blocks back to tasks
  return allTasks.map((task) => {
    const blocks = placedBlocksMap.get(task.id);
    if (blocks) {
      return { ...task, scheduledBlocks: blocks };
    }
    return task;
  });
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
