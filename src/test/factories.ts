// ============================================================
// Muse — Test Factories
// Minimal valid objects for engine/store tests; override what matters.
// ============================================================

import { format } from 'date-fns';
import {
  AppSettings,
  CalendarEvent,
  DistributionModel,
  Priority,
  SchedulingHoursProfile,
  Task,
  UrgencyColor,
  ViewMode,
} from '../types';

export const iso = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss");

/** Local timestamp `days` from now (fractional allowed), optionally at an hour. */
export function fromNow(days: number, hour?: number, minute = 0): string {
  const d = new Date(Date.now() + days * 86_400_000);
  if (hour !== undefined) d.setHours(hour, minute, 0, 0);
  return iso(d);
}

export function allDayProfile(id: string, start = '06:00', end = '22:00'): SchedulingHoursProfile {
  return {
    id,
    name: id,
    color: '#88C0D0',
    weeklySchedule: Object.fromEntries(
      Array.from({ length: 7 }, (_, d) => [d, { enabled: true, blocks: [{ start, end }] }])
    ),
    dateOverrides: {},
  };
}

export function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    distributionModel: DistributionModel.Balanced,
    autoSchedulingCutoffWeeks: 8,
    defaultTaskDuration: 30,
    defaultSplittable: false,
    defaultMinBlockDuration: 30,
    defaultAutoSchedule: true,
    weekStartsOn: 1,
    timeFormat: '24h',
    showWeekNumbers: false,
    smartColorCoding: true,
    notificationsEnabled: false,
    notifyMinutesBefore: 5,
    theme: 'dark',
    defaultView: ViewMode.Week,
    dayStartHour: 6,
    dayEndHour: 22,
    schedulingHoursProfiles: [],
    tutorialCompleted: true,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    description: '',
    listId: 'default-list',
    autoSchedule: true,
    duration: 60,
    progress: 0,
    dueDate: null,
    startAfter: null,
    schedulingHoursId: null,
    priority: Priority.None,
    splittable: false,
    minBlockDuration: 30,
    completed: false,
    completedAt: null,
    color: '#88C0D0',
    dependsOn: [],
    repeatingRule: null,
    autoIgnore: false,
    isRepeatingInstance: false,
    parentRepeatingId: null,
    scheduledBlocks: [],
    urgencyColor: UrgencyColor.Green,
    schedulingBlocked: false,
    inInbox: false,
    notes: '',
    createdAt: iso(new Date()),
    updatedAt: iso(new Date()),
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<CalendarEvent> & { id: string; startTime: string; endTime: string }): CalendarEvent {
  return {
    title: overrides.id,
    description: '',
    allDay: false,
    busy: true,
    color: '#5E81AC',
    location: '',
    notes: '',
    repeatingRule: null,
    bufferBefore: 0,
    bufferAfter: 0,
    calendarId: 'default',
    isExternal: false,
    createdAt: iso(new Date()),
    updatedAt: iso(new Date()),
    ...overrides,
  };
}

/** True when any two blocks from the lists overlap in time. */
export function overlaps(a: Task, b: Task): boolean {
  return a.scheduledBlocks.some((x) =>
    b.scheduledBlocks.some(
      (y) => new Date(x.startTime) < new Date(y.endTime) && new Date(y.startTime) < new Date(x.endTime)
    )
  );
}

export function totalMinutes(task: Task): number {
  return task.scheduledBlocks.reduce((sum, b) => sum + b.duration, 0);
}
