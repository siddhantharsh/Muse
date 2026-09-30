// ============================================================
// Repeating series — generation tests (fixed clock via `now`)
// ============================================================

import { describe, it, expect } from 'vitest';
import { generateRepeatingTaskInstances, generateRepeatingEventInstances } from '../repeating';
import { RepeatFrequency } from '../../types';
import { makeEvent, makeTask } from '../../test/factories';

// Wednesday 2026-01-14, 12:00 local
const NOW = new Date(2026, 0, 14, 12, 0, 0);
const CUTOFF = new Date(2026, 3, 14);

const daily = { frequency: RepeatFrequency.Daily, interval: 1 };
const days = (tasks: { dueDate: string | null }[]) => tasks.map((t) => t.dueDate!.slice(0, 10));

describe('task series', () => {
  it('includes the first occurrence (the template’s own due date)', () => {
    const parent = makeTask({ id: 'p', dueDate: '2026-01-14T18:00:00', repeatingRule: daily });
    const out = generateRepeatingTaskInstances(parent, [parent], CUTOFF, 3, NOW);
    expect(days(out)).toEqual(['2026-01-14', '2026-01-15', '2026-01-16']);
    expect(out[0].dueDate).toBe('2026-01-14T18:00:00');
  });

  it('never backfills occurrences whose deadline already passed', () => {
    const parent = makeTask({ id: 'p', dueDate: '2026-01-01T09:00:00', repeatingRule: daily });
    const out = generateRepeatingTaskInstances(parent, [parent], CUTOFF, 5, NOW);
    // 09:00 today has already passed at 12:00, so the first is tomorrow.
    expect(days(out)[0]).toBe('2026-01-15');
    expect(out).toHaveLength(5);
  });

  it('does not drift on month-end dates', () => {
    const parent = makeTask({
      id: 'p',
      dueDate: '2026-01-31T10:00:00',
      repeatingRule: { frequency: RepeatFrequency.Monthly, interval: 1 },
    });
    const out = generateRepeatingTaskInstances(parent, [parent], new Date(2026, 5, 30), 5, NOW);
    expect(days(out)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('skips deleted occurrences and existing ones', () => {
    const parent = makeTask({
      id: 'p',
      dueDate: '2026-01-14T18:00:00',
      repeatingRule: { ...daily, exceptions: ['2026-01-15'] },
    });
    const existing = makeTask({ id: 'x', isRepeatingInstance: true, parentRepeatingId: 'p', dueDate: '2026-01-16T18:00:00' });
    const out = generateRepeatingTaskInstances(parent, [parent, existing], CUTOFF, 3, NOW);
    expect(days(out)).toEqual(['2026-01-14', '2026-01-17']);
  });

  it('stops after `count` occurrences in total', () => {
    const parent = makeTask({ id: 'p', dueDate: '2026-01-14T18:00:00', repeatingRule: { ...daily, count: 2 } });
    const out = generateRepeatingTaskInstances(parent, [parent], CUTOFF, 10, NOW);
    expect(days(out)).toEqual(['2026-01-14', '2026-01-15']);
  });

  it('gives a template without a due time an end-of-day deadline', () => {
    const parent = makeTask({ id: 'p', createdAt: '2026-01-10T08:30:00', repeatingRule: daily });
    const out = generateRepeatingTaskInstances(parent, [parent], CUTOFF, 1, NOW);
    expect(out[0].dueDate).toBe('2026-01-14T23:59:00');
    expect(out[0].startAfter).toBe('2026-01-14T00:00:00');
  });

  it('keeps the template’s start-before-due window', () => {
    const parent = makeTask({
      id: 'p',
      startAfter: '2026-01-12T09:00:00',
      dueDate: '2026-01-16T17:00:00',
      repeatingRule: { frequency: RepeatFrequency.Weekly, interval: 1 },
    });
    const out = generateRepeatingTaskInstances(parent, [parent], CUTOFF, 2, NOW);
    expect(out[1].dueDate).toBe('2026-01-23T17:00:00');
    expect(out[1].startAfter).toBe('2026-01-19T09:00:00');
  });

  it('weekly on specific days follows the chosen weekdays', () => {
    const parent = makeTask({
      id: 'p',
      dueDate: '2026-01-14T18:00:00', // Wednesday
      repeatingRule: { frequency: RepeatFrequency.Weekly, interval: 1, daysOfWeek: [1, 3] },
    });
    const out = generateRepeatingTaskInstances(parent, [parent], CUTOFF, 3, NOW);
    expect(days(out)).toEqual(['2026-01-14', '2026-01-19', '2026-01-21']);
  });

  it('stops for a completed template', () => {
    const parent = makeTask({ id: 'p', dueDate: '2026-01-14T18:00:00', repeatingRule: daily, completed: true });
    expect(generateRepeatingTaskInstances(parent, [parent], CUTOFF, 3, NOW)).toHaveLength(0);
  });
});

describe('event series', () => {
  it('treats the parent as the first occurrence and generates the rest', () => {
    const parent = makeEvent({
      id: 'e',
      startTime: '2026-01-14T15:00:00',
      endTime: '2026-01-14T16:00:00',
      repeatingRule: daily,
    });
    const out = generateRepeatingEventInstances(parent, [parent], CUTOFF, 2, NOW);
    expect(out.map((e) => e.startTime)).toEqual(['2026-01-15T15:00:00', '2026-01-16T15:00:00']);
    expect(out[0].endTime).toBe('2026-01-15T16:00:00');
    expect(out[0].externalId).toBe('repeat-e');
  });

  it('skips past occurrences and deleted dates', () => {
    const parent = makeEvent({
      id: 'e',
      startTime: '2026-01-01T09:00:00',
      endTime: '2026-01-01T10:00:00',
      repeatingRule: { ...daily, exceptions: ['2026-01-15'] },
    });
    const out = generateRepeatingEventInstances(parent, [parent], CUTOFF, 2, NOW);
    expect(out.map((e) => e.startTime.slice(0, 10))).toEqual(['2026-01-16', '2026-01-17']);
  });
});
