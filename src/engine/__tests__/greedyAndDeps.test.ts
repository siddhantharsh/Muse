// ============================================================
// Front-load ("greedy") placement and dependency propagation
// ============================================================

import { describe, it, expect } from 'vitest';
import { runScheduler } from '../scheduler';
import { DistributionModel, Priority, UrgencyColor } from '../../types';
import { fromNow, iso, makeSettings, makeTask, totalMinutes } from '../../test/factories';

const greedy = makeSettings({ distributionModel: DistributionModel.FrontLoad });
const balanced = makeSettings({ distributionModel: DistributionModel.Balanced });
const byId = (tasks: ReturnType<typeof runScheduler>, id: string) => tasks.find((t) => t.id === id)!;
const sorted = (t: { scheduledBlocks: { startTime: string; endTime: string; duration: number }[] }) =>
  [...t.scheduledBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
const lastEnd = (t: Parameters<typeof sorted>[0]) => new Date(sorted(t).at(-1)!.endTime).getTime();
const firstStart = (t: Parameters<typeof sorted>[0]) => new Date(sorted(t)[0].startTime).getTime();

/** Tomorrow 06:00 — a fully free day in the default 06–22 window. */
const tomorrowMorning = () => fromNow(1, 6);

describe('front-load (greedy)', () => {
  it('fills a free slot with one block instead of back-to-back chunks', () => {
    const out = runScheduler(
      [makeTask({ id: 'A', duration: 240, splittable: true, minBlockDuration: 30, startAfter: tomorrowMorning() })],
      [],
      greedy
    );
    const blocks = sorted(byId(out, 'A'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].duration).toBe(240);
    expect(blocks[0].startTime).toBe(tomorrowMorning());
  });

  it('packs tasks one after another from the earliest free minute', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'A', duration: 90, priority: Priority.High, startAfter: tomorrowMorning() }),
        makeTask({ id: 'B', duration: 60, splittable: true, startAfter: tomorrowMorning() }),
      ],
      [],
      greedy
    );
    expect(sorted(byId(out, 'A'))[0].startTime).toBe(tomorrowMorning());
    expect(firstStart(byId(out, 'B'))).toBe(lastEnd(byId(out, 'A')));
  });

  it('never splits more than the free time forces it to', () => {
    // 07:00–08:00 busy leaves a 60-min gap first: a 150-min task should be 60 + 90.
    const day = new Date(Date.now() + 86_400_000);
    day.setHours(7, 0, 0, 0);
    const end = new Date(day.getTime() + 60 * 60_000);
    const out = runScheduler(
      [makeTask({ id: 'A', duration: 150, splittable: true, minBlockDuration: 30, startAfter: tomorrowMorning() })],
      [
        {
          id: 'e', title: 'e', description: '', startTime: iso(day), endTime: iso(end), allDay: false, busy: true,
          color: '#000', location: '', notes: '', repeatingRule: null, bufferBefore: 0, bufferAfter: 0,
          calendarId: 'default', isExternal: false, createdAt: iso(new Date()), updatedAt: iso(new Date()),
        },
      ],
      greedy
    );
    expect(sorted(byId(out, 'A')).map((b) => b.duration)).toEqual([60, 90]);
  });
});

describe('dependencies', () => {
  it('does not block a dependent when the prerequisite’s progress is already full', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'A', duration: 60, progress: 60 }),
        makeTask({ id: 'B', duration: 30, dependsOn: ['A'] }),
      ],
      [],
      balanced
    );
    expect(byId(out, 'B').schedulingBlocked).toBe(false);
    expect(totalMinutes(byId(out, 'B'))).toBe(30);
  });

  it('pulls a prerequisite forward so its urgent dependent meets the deadline (balanced)', () => {
    // A has no deadline, so on its own it would be spread thinly over weeks.
    const out = runScheduler(
      [
        makeTask({ id: 'A', duration: 240, splittable: true, minBlockDuration: 30 }),
        makeTask({ id: 'B', duration: 60, priority: Priority.High, dueDate: fromNow(3, 20), dependsOn: ['A'] }),
      ],
      [],
      balanced
    );
    const A = byId(out, 'A');
    const B = byId(out, 'B');
    expect(totalMinutes(A)).toBe(240);
    expect(totalMinutes(B)).toBe(60);
    expect(firstStart(B)).toBeGreaterThanOrEqual(lastEnd(A));
    expect(lastEnd(B)).toBeLessThanOrEqual(new Date(B.dueDate!).getTime());
    expect(B.urgencyColor).not.toBe(UrgencyColor.Red);
  });

  it('lets a prerequisite of high-priority work jump ahead of unrelated medium work', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'filler', duration: 480, priority: Priority.Medium, startAfter: tomorrowMorning() }),
        makeTask({ id: 'A', duration: 60, startAfter: tomorrowMorning() }),
        makeTask({ id: 'B', duration: 60, priority: Priority.High, dependsOn: ['A'], startAfter: tomorrowMorning() }),
      ],
      [],
      greedy
    );
    // A inherits B's priority, so the chain A → B goes before the filler.
    expect(sorted(byId(out, 'A'))[0].startTime).toBe(tomorrowMorning());
    expect(firstStart(byId(out, 'B'))).toBe(lastEnd(byId(out, 'A')));
    expect(firstStart(byId(out, 'filler'))).toBeGreaterThanOrEqual(lastEnd(byId(out, 'B')));
  });

  it('respects an earlier deadline on a dependent when the prerequisite’s own deadline is later', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'A', duration: 180, splittable: true, dueDate: fromNow(14) }),
        makeTask({ id: 'B', duration: 60, dueDate: fromNow(2, 20), dependsOn: ['A'] }),
      ],
      [],
      balanced
    );
    const B = byId(out, 'B');
    expect(totalMinutes(B)).toBe(60);
    expect(lastEnd(B)).toBeLessThanOrEqual(new Date(B.dueDate!).getTime());
  });

  it('flags a dependent as at risk when its prerequisites alone eat all time before its deadline', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'A', duration: 16 * 60 * 3, splittable: true }),
        makeTask({ id: 'B', duration: 60, dueDate: fromNow(2, 12), dependsOn: ['A'] }),
      ],
      [],
      balanced
    );
    expect(byId(out, 'B').urgencyColor).toBe(UrgencyColor.Red);
  });

  it('orders a diamond (A → B, A → C, B+C → D) correctly', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'A', duration: 60 }),
        makeTask({ id: 'B', duration: 60, dependsOn: ['A'] }),
        makeTask({ id: 'C', duration: 60, dependsOn: ['A'] }),
        makeTask({ id: 'D', duration: 60, dependsOn: ['B', 'C'] }),
      ],
      [],
      greedy
    );
    const A = byId(out, 'A'), B = byId(out, 'B'), C = byId(out, 'C'), D = byId(out, 'D');
    expect(firstStart(B)).toBeGreaterThanOrEqual(lastEnd(A));
    expect(firstStart(C)).toBeGreaterThanOrEqual(lastEnd(A));
    expect(firstStart(D)).toBeGreaterThanOrEqual(Math.max(lastEnd(B), lastEnd(C)));
  });

  it('blocks everything downstream of a blocked prerequisite', () => {
    const out = runScheduler(
      [
        makeTask({ id: 'inbox', inInbox: true, autoSchedule: false }),
        makeTask({ id: 'B', dependsOn: ['inbox'] }),
        makeTask({ id: 'C', dependsOn: ['B'] }),
      ],
      [],
      balanced
    );
    expect(byId(out, 'B').schedulingBlocked).toBe(true);
    expect(byId(out, 'C').schedulingBlocked).toBe(true);
    expect(byId(out, 'C').scheduledBlocks).toHaveLength(0);
  });

  it('ignores a dependency on a task that no longer exists', () => {
    const out = runScheduler([makeTask({ id: 'B', dependsOn: ['ghost'] })], [], balanced);
    expect(byId(out, 'B').schedulingBlocked).toBe(false);
    expect(totalMinutes(byId(out, 'B'))).toBe(60);
  });
});
