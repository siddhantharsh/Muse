// ============================================================
// Randomized invariant checks: hundreds of generated schedules,
// in both planning modes, must always satisfy the rules below.
// ============================================================

import { describe, it, expect } from 'vitest';
import { runScheduler } from '../scheduler';
import { CalendarEvent, DistributionModel, Priority, Task } from '../../types';
import { iso, makeEvent, makeSettings, makeTask } from '../../test/factories';

/** Small deterministic PRNG so any failure is reproducible from its seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIORITIES = [Priority.None, Priority.Low, Priority.Medium, Priority.High];
const ms = (s: string) => new Date(s).getTime();

function generate(seed: number): { tasks: Task[]; events: CalendarEvent[] } {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const count = 3 + Math.floor(r() * 9);
  const tasks: Task[] = [];
  for (let i = 0; i < count; i++) {
    const splittable = r() < 0.5;
    const due = r() < 0.6 ? new Date(Date.now() + (0.5 + r() * 10) * 86_400_000) : null;
    tasks.push(
      makeTask({
        id: `t${i}`,
        duration: 15 * (1 + Math.floor(r() * 24)),
        progress: r() < 0.15 ? 15 : 0,
        priority: pick(PRIORITIES),
        splittable,
        minBlockDuration: pick([15, 30, 45, 60]),
        dueDate: due ? iso(due) : null,
        // Dependencies only point backwards, so the graph is acyclic.
        dependsOn: i > 0 && r() < 0.4 ? [`t${Math.floor(r() * i)}`] : [],
      })
    );
  }
  const events: CalendarEvent[] = [];
  const eventCount = Math.floor(r() * 6);
  for (let i = 0; i < eventCount; i++) {
    const start = new Date(Date.now() + r() * 5 * 86_400_000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + (30 + Math.floor(r() * 4) * 30) * 60_000);
    events.push(
      makeEvent({
        id: `e${i}`,
        startTime: iso(start),
        endTime: iso(end),
        bufferBefore: pick([0, 0, 15]),
        bufferAfter: pick([0, 15]),
      })
    );
  }
  return { tasks, events };
}

function checkInvariants(seed: number, mode: DistributionModel) {
  const { tasks, events } = generate(seed);
  const settings = makeSettings({ distributionModel: mode });
  const out = runScheduler(tasks, events, settings);
  const where = `seed ${seed}, ${mode}`;
  const now = Date.now() - 60_000;

  const blocks = out.flatMap((t) => t.scheduledBlocks.map((b) => ({ ...b, task: t })));

  for (const b of blocks) {
    const s = ms(b.startTime);
    const e = ms(b.endTime);
    // Sane, future, matching its stated length
    expect(e - s, where).toBe(b.duration * 60_000);
    expect(s, `${where}: block in the past`).toBeGreaterThanOrEqual(now);
    // Clean start times: whole minutes, never stray seconds
    expect(b.startTime.endsWith(':00'), `${where}: odd start ${b.startTime}`).toBe(true);
    // Inside the default 06:00–22:00 window
    const start = new Date(s);
    const endD = new Date(e);
    expect(start.getHours(), where).toBeGreaterThanOrEqual(6);
    expect(endD.getHours() * 60 + endD.getMinutes(), where).toBeLessThanOrEqual(22 * 60);
    // Never on top of a meeting or its buffers
    for (const ev of events) {
      const es = ms(ev.startTime) - ev.bufferBefore * 60_000;
      const ee = ms(ev.endTime) + ev.bufferAfter * 60_000;
      expect(s < ee && e > es, `${where}: ${b.task.id} overlaps ${ev.id}`).toBe(false);
    }
  }

  // No two task blocks overlap
  const sorted = [...blocks].sort((a, b) => ms(a.startTime) - ms(b.startTime));
  for (let i = 1; i < sorted.length; i++) {
    expect(ms(sorted[i].startTime), `${where}: ${sorted[i - 1].task.id} overlaps ${sorted[i].task.id}`)
      .toBeGreaterThanOrEqual(ms(sorted[i - 1].endTime));
  }

  for (const t of out) {
    const remaining = t.duration - t.progress;
    const placed = t.scheduledBlocks.reduce((sum, b) => sum + b.duration, 0);
    expect(placed, `${where}: ${t.id} over-scheduled`).toBeLessThanOrEqual(remaining);

    // Non-splittable work is one contiguous block, or nothing
    if (!t.splittable) expect(t.scheduledBlocks.length, `${where}: ${t.id}`).toBeLessThanOrEqual(1);
    if (!t.splittable && t.scheduledBlocks.length === 1) expect(placed, where).toBe(remaining);

    // No needless splitting: a task's own auto-placed pieces never touch end to end
    const own = t.scheduledBlocks
      .filter((b) => !b.isManuallyPinned)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < own.length; i++) {
      expect(own[i].startTime, `${where}: ${t.id} split into touching pieces`).not.toBe(own[i - 1].endTime);
    }

    // Split pieces respect the minimum block (unless the whole task is smaller)
    if (t.splittable) {
      for (const b of t.scheduledBlocks) {
        expect(b.duration, `${where}: ${t.id} fragment`).toBeGreaterThanOrEqual(Math.min(t.minBlockDuration, remaining));
      }
    }

    // A dependent never starts before every prerequisite has finished
    for (const depId of t.dependsOn) {
      const dep = out.find((d) => d.id === depId)!;
      if (t.scheduledBlocks.length === 0) continue;
      const depRemaining = dep.duration - dep.progress;
      if (depRemaining > 0) {
        expect(dep.scheduledBlocks.length, `${where}: ${t.id} placed but prerequisite ${depId} isn't`).toBeGreaterThan(0);
        const depEnd = Math.max(...dep.scheduledBlocks.map((b) => ms(b.endTime)));
        const firstStart = Math.min(...t.scheduledBlocks.map((b) => ms(b.startTime)));
        expect(firstStart, `${where}: ${t.id} starts before ${depId} ends`).toBeGreaterThanOrEqual(depEnd);
      }
    }

    // A dependent of something blocked is blocked too
    if (t.dependsOn.some((d) => out.find((x) => x.id === d)?.schedulingBlocked)) {
      expect(t.schedulingBlocked, `${where}: ${t.id}`).toBe(true);
    }
  }

  // Deterministic: the same input always yields the same placements
  const again = runScheduler(tasks, events, settings);
  const shape = (ts: Task[]) => ts.map((t) => t.scheduledBlocks.map((b) => `${b.startTime}-${b.endTime}`).join('|'));
  expect(shape(again), `${where}: not deterministic`).toEqual(shape(out));
}

describe('scheduler invariants (randomized)', () => {
  for (const mode of [DistributionModel.FrontLoad, DistributionModel.Balanced]) {
    it(`holds for 300 random schedules in ${mode} mode`, () => {
      for (let seed = 1; seed <= 300; seed++) checkInvariants(seed, mode);
    });
  }
});
