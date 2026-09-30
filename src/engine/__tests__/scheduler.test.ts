// ============================================================
// Scheduler engine — behavior tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { runScheduler } from '../scheduler';
import { DistributionModel, Priority, RepeatFrequency, UrgencyColor } from '../../types';
import {
  allDayProfile,
  fromNow,
  iso,
  makeEvent,
  makeSettings,
  makeTask,
  overlaps,
  totalMinutes,
} from '../../test/factories';

const settings = makeSettings();
const byId = (tasks: ReturnType<typeof runScheduler>, id: string) => tasks.find((t) => t.id === id)!;
const firstStart = (t: { scheduledBlocks: { startTime: string }[] }) =>
  new Date([...t.scheduledBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime))[0].startTime);
const lastEnd = (t: { scheduledBlocks: { endTime: string }[] }) =>
  new Date([...t.scheduledBlocks].sort((a, b) => b.endTime.localeCompare(a.endTime))[0].endTime);

describe('dependencies', () => {
  it('places a prerequisite before its dependent even when the dependent has higher priority', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'A', duration: 120 }),
        makeTask({ id: 'B', duration: 60, priority: Priority.High, dependsOn: ['A'] }),
      ],
      [],
      settings
    );
    const A = byId(out, 'A');
    const B = byId(out, 'B');
    expect(A.scheduledBlocks.length).toBeGreaterThan(0);
    expect(B.scheduledBlocks.length).toBeGreaterThan(0);
    expect(B.schedulingBlocked).toBe(false);
    expect(firstStart(B).getTime()).toBeGreaterThanOrEqual(lastEnd(A).getTime());
  });

  it('orders a whole chain, even when priorities point the other way', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'E', duration: 60 }),
        makeTask({ id: 'F', duration: 60, priority: Priority.Medium, dependsOn: ['E'] }),
        makeTask({ id: 'G', duration: 60, priority: Priority.High, dependsOn: ['F'] }),
      ],
      [],
      settings
    );
    expect(firstStart(byId(out, 'F')).getTime()).toBeGreaterThanOrEqual(lastEnd(byId(out, 'E')).getTime());
    expect(firstStart(byId(out, 'G')).getTime()).toBeGreaterThanOrEqual(lastEnd(byId(out, 'F')).getTime());
  });

  it('blocks a task whose prerequisite can never be placed (e.g. sitting in the inbox)', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'C', duration: 30, autoSchedule: false, inInbox: true }),
        makeTask({ id: 'D', duration: 30, dependsOn: ['C'] }),
      ],
      [],
      settings
    );
    const D = byId(out, 'D');
    expect(D.schedulingBlocked).toBe(true);
    expect(D.scheduledBlocks).toHaveLength(0);
    expect(D.urgencyColor).toBe(UrgencyColor.Red);
  });

  it('waits for a manual prerequisite pinned to a time instead of blocking', () => {
    const pinStart = fromNow(1, 10);
    const pinEnd = fromNow(1, 11);
    const out = runScheduler(
      [
        makeTask({
          id: 'M',
          autoSchedule: false,
          scheduledBlocks: [
            { id: 'm1', taskId: 'M', startTime: pinStart, endTime: pinEnd, duration: 60, isManuallyPinned: true },
          ],
        }),
        makeTask({ id: 'N', duration: 30, dependsOn: ['M'] }),
      ],
      [],
      settings
    );
    const N = byId(out, 'N');
    expect(N.schedulingBlocked).toBe(false);
    expect(firstStart(N).getTime()).toBeGreaterThanOrEqual(new Date(pinEnd).getTime());
  });

  it('survives a circular dependency without throwing, blocking both', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'A', dependsOn: ['B'] }),
        makeTask({ id: 'B', dependsOn: ['A'] }),
      ],
      [],
      settings
    );
    expect(byId(out, 'A').schedulingBlocked).toBe(true);
    expect(byId(out, 'B').schedulingBlocked).toBe(true);
  });
});

describe('urgency colors', () => {
  it('is red when the work cannot fit before the deadline', () => {
    const out = runScheduler([makeTask({ id: 'H', duration: 20 * 60, dueDate: fromNow(1) })], [], settings);
    expect(byId(out, 'H').urgencyColor).toBe(UrgencyColor.Red);
  });

  it('is green for a small task with a distant deadline', () => {
    const out = runScheduler([makeTask({ id: 'I', duration: 60, dueDate: fromNow(20) })], [], settings);
    expect(byId(out, 'I').urgencyColor).toBe(UrgencyColor.Green);
  });

  it('is red when the task may only start after its own deadline', () => {
    const out = runScheduler(
      [makeTask({ id: 'S', duration: 60, dueDate: fromNow(2, 12), startAfter: fromNow(3, 9) })],
      [],
      settings
    );
    expect(byId(out, 'S').urgencyColor).toBe(UrgencyColor.Red);
  });

  it('never calls a manual task "won’t fit" just because the engine doesn’t place it', () => {
    const out = runScheduler(
      [makeTask({ id: 'Man', autoSchedule: false, dueDate: fromNow(5) })],
      [],
      settings
    );
    expect(byId(out, 'Man').urgencyColor).toBe(UrgencyColor.Green);
  });

  it('does not flag a deadline beyond the planning horizon as red', () => {
    const short = makeSettings({ autoSchedulingCutoffWeeks: 1 });
    const out = runScheduler(
      [makeTask({ id: 'Far', duration: 200 * 60, splittable: true, dueDate: fromNow(60) })],
      [],
      short
    );
    expect(byId(out, 'Far').urgencyColor).not.toBe(UrgencyColor.Red);
  });

  it('keeps repeating templates neutral', () => {
    const out = runScheduler(
      [
        makeTask({
          id: 'T',
          dueDate: fromNow(-3),
          repeatingRule: { frequency: RepeatFrequency.Daily, interval: 1 },
        }),
      ],
      [],
      settings
    );
    const T = byId(out, 'T');
    expect(T.urgencyColor).toBe(UrgencyColor.Green);
    expect(T.scheduledBlocks).toHaveLength(0);
  });
});

describe('placement', () => {
  it('schedules higher priority first among independent tasks', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'Low', duration: 480, priority: Priority.Low }),
        makeTask({ id: 'High', duration: 30, priority: Priority.High }),
      ],
      [],
      settings
    );
    expect(firstStart(byId(out, 'High')).getTime()).toBeLessThanOrEqual(firstStart(byId(out, 'Low')).getTime());
  });

  it('keeps a manually pinned block and places only the rest', () => {
    const pinnedStart = fromNow(2, 10);
    const out = runScheduler(
      [
        makeTask({
          id: 'J',
          duration: 180,
          splittable: true,
          scheduledBlocks: [
            {
              id: 'pinned-1',
              taskId: 'J',
              startTime: pinnedStart,
              endTime: fromNow(2, 11),
              duration: 60,
              isManuallyPinned: true,
            },
          ],
        }),
      ],
      [],
      settings
    );
    const J = byId(out, 'J');
    expect(J.scheduledBlocks.find((b) => b.id === 'pinned-1')?.startTime).toBe(pinnedStart);
    expect(totalMinutes(J)).toBe(180);
  });

  it('holds a block that is in progress right now', () => {
    const start = iso(new Date(Date.now() - 10 * 60_000));
    const end = iso(new Date(Date.now() + 20 * 60_000));
    const out = runScheduler(
      [
        makeTask({
          id: 'Now',
          duration: 30,
          scheduledBlocks: [{ id: 'live', taskId: 'Now', startTime: start, endTime: end, duration: 30, isManuallyPinned: false }],
        }),
      ],
      [],
      settings
    );
    const task = byId(out, 'Now');
    expect(task.scheduledBlocks.map((b) => b.id)).toEqual(['live']);
  });

  it('spreads a long splittable task across several days in balanced mode', () => {
    const out = runScheduler(
      [makeTask({ id: 'K', duration: 480, splittable: true, dueDate: fromNow(10) })],
      [],
      settings
    );
    const K = byId(out, 'K');
    const days = new Set(K.scheduledBlocks.map((b) => b.startTime.slice(0, 10)));
    expect(days.size).toBeGreaterThan(1);
    expect(totalMinutes(K)).toBe(480);
  });

  it('never leaves a split fragment shorter than the minimum block', () => {
    const out = runScheduler(
      [makeTask({ id: 'P', duration: 100, splittable: true, minBlockDuration: 30, dueDate: fromNow(6) })],
      [],
      makeSettings({ distributionModel: DistributionModel.FrontLoad })
    );
    const P = byId(out, 'P');
    expect(totalMinutes(P)).toBe(100);
    for (const b of P.scheduledBlocks) expect(b.duration).toBeGreaterThanOrEqual(30);
  });

  it('does not use an event’s buffer time', () => {
    const day = new Date(Date.now() + 86_400_000);
    day.setHours(6, 0, 0, 0);
    const evStart = new Date(day.getTime() + 60 * 60_000);
    const evEnd = new Date(day.getTime() + 10 * 60 * 60_000);
    const out = runScheduler(
      [makeTask({ id: 'L', duration: 30, startAfter: iso(day) })],
      [makeEvent({ id: 'busy', startTime: iso(evStart), endTime: iso(evEnd), bufferBefore: 30, bufferAfter: 30 })],
      settings
    );
    const L = byId(out, 'L');
    const bufferedStart = evStart.getTime() - 30 * 60_000;
    const bufferedEnd = evEnd.getTime() + 30 * 60_000;
    for (const b of L.scheduledBlocks) {
      const s = new Date(b.startTime).getTime();
      const e = new Date(b.endTime).getTime();
      expect(s < bufferedEnd && e > bufferedStart).toBe(false);
    }
  });

  it('needs a contiguous gap for a non-splittable task', () => {
    const day = new Date(Date.now() + 86_400_000);
    day.setHours(6, 0, 0, 0);
    const gapStart = new Date(day.getTime() + 110 * 60_000);
    const out = runScheduler(
      [makeTask({ id: 'Q', duration: 30, startAfter: iso(day) })],
      [
        makeEvent({ id: 'e1', startTime: iso(new Date(day.getTime() + 60 * 60_000)), endTime: iso(gapStart) }),
        makeEvent({
          id: 'e2',
          startTime: iso(new Date(gapStart.getTime() + 20 * 60_000)),
          endTime: iso(new Date(day.getTime() + 16 * 60 * 60_000)),
        }),
      ],
      settings
    );
    const Q = byId(out, 'Q');
    for (const b of Q.scheduledBlocks) {
      const s = new Date(b.startTime).getTime();
      expect(s >= gapStart.getTime() && s < gapStart.getTime() + 20 * 60_000).toBe(false);
    }
  });

  it('honors startAfter', () => {
    const startAfter = fromNow(3);
    const out = runScheduler([makeTask({ id: 'C', startAfter })], [], settings);
    expect(firstStart(byId(out, 'C')).getTime()).toBeGreaterThanOrEqual(new Date(startAfter).getTime());
  });

  it('never double-books two tasks from different profiles covering the same hours', () => {
    const multi = makeSettings({
      distributionModel: DistributionModel.FrontLoad,
      schedulingHoursProfiles: [allDayProfile('work'), allDayProfile('deep')],
    });
    const out = runScheduler(
      [
        makeTask({ id: 'D1', duration: 120, schedulingHoursId: 'work', dueDate: fromNow(1), priority: Priority.High }),
        makeTask({ id: 'D2', duration: 120, schedulingHoursId: 'deep', dueDate: fromNow(30) }),
      ],
      [],
      multi
    );
    expect(byId(out, 'D2').scheduledBlocks.length).toBeGreaterThan(0);
    expect(overlaps(byId(out, 'D1'), byId(out, 'D2'))).toBe(false);
  });

  it('schedules only the remaining work after progress', () => {
    const out = runScheduler([makeTask({ id: 'E', duration: 120, progress: 90 })], [], settings);
    expect(totalMinutes(byId(out, 'E'))).toBe(30);
  });

  it('skips completed tasks', () => {
    const out = runScheduler([makeTask({ id: 'F', completed: true })], [], settings);
    expect(byId(out, 'F').scheduledBlocks).toHaveLength(0);
  });

  it('falls back to the default window when a task’s profile no longer exists', () => {
    const out = runScheduler([makeTask({ id: 'G', schedulingHoursId: 'deleted-profile' })], [], settings);
    expect(totalMinutes(byId(out, 'G'))).toBe(60);
  });

  it('ignores half-edited (empty) profile times instead of producing invalid dates', () => {
    const broken = makeSettings({
      schedulingHoursProfiles: [
        {
          ...allDayProfile('p'),
          weeklySchedule: Object.fromEntries(
            Array.from({ length: 7 }, (_, d) => [
              d,
              { enabled: true, blocks: [{ start: '', end: '17:00' }, { start: '09:00', end: '12:00' }] },
            ])
          ),
        },
      ],
    });
    const out = runScheduler([makeTask({ id: 'Z', schedulingHoursId: 'p' })], [], broken);
    const Z = byId(out, 'Z');
    expect(totalMinutes(Z)).toBe(60);
    for (const b of Z.scheduledBlocks) expect(Number.isNaN(new Date(b.startTime).getTime())).toBe(false);
  });

  it('survives corrupt day-hour settings', () => {
    const corrupt = makeSettings({ dayStartHour: NaN, dayEndHour: NaN });
    const out = runScheduler([makeTask({ id: 'Y' })], [], corrupt);
    expect(totalMinutes(byId(out, 'Y'))).toBe(60);
  });
});

describe('repeating occurrences', () => {
  it('does not schedule a missed occurrence onto today, and marks it red', () => {
    const out = runScheduler(
      [
        makeTask({
          id: 'Missed',
          isRepeatingInstance: true,
          parentRepeatingId: 'parent',
          dueDate: fromNow(-1),
        }),
      ],
      [],
      settings
    );
    const missed = byId(out, 'Missed');
    expect(missed.scheduledBlocks).toHaveLength(0);
    expect(missed.urgencyColor).toBe(UrgencyColor.Red);
  });
});
