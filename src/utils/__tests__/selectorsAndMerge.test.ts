// ============================================================
// Task selectors, first-link merge, timestamp normalization
// ============================================================

import { describe, it, expect } from 'vitest';
import { getVisibleOpenTasks, getMissedTasks } from '../taskSelectors';
import { mergePayloads } from '../syncMerge';
import { normalizeISO } from '../dateUtils';
import { RepeatFrequency } from '../../types';
import { fromNow, makeSettings, makeTask } from '../../test/factories';

const daily = { frequency: RepeatFrequency.Daily, interval: 1 };

describe('getVisibleOpenTasks', () => {
  it('collapses a series to its next occurrence plus missed ones, hiding the template', () => {
    const tasks = [
      makeTask({ id: 'tpl', repeatingRule: daily, dueDate: fromNow(-5) }),
      makeTask({ id: 'missed', isRepeatingInstance: true, parentRepeatingId: 'tpl', dueDate: fromNow(-1) }),
      makeTask({ id: 'next', isRepeatingInstance: true, parentRepeatingId: 'tpl', dueDate: fromNow(1) }),
      makeTask({ id: 'later', isRepeatingInstance: true, parentRepeatingId: 'tpl', dueDate: fromNow(2) }),
      makeTask({ id: 'plain' }),
      makeTask({ id: 'inbox', inInbox: true }),
      makeTask({ id: 'done', completed: true }),
    ];
    const ids = getVisibleOpenTasks(tasks).map((t) => t.id).sort();
    expect(ids).toEqual(['missed', 'next', 'plain']);
  });
});

describe('getMissedTasks', () => {
  it('lists overdue open work, but not templates or auto-skipped occurrences', () => {
    const tasks = [
      makeTask({ id: 'late', dueDate: fromNow(-1) }),
      makeTask({ id: 'tpl', repeatingRule: daily, dueDate: fromNow(-3) }),
      makeTask({ id: 'skipped', isRepeatingInstance: true, parentRepeatingId: 'tpl', autoIgnore: true, dueDate: fromNow(-1) }),
      makeTask({ id: 'future', dueDate: fromNow(2) }),
    ];
    expect(getMissedTasks(tasks).map((t) => t.id)).toEqual(['late']);
  });
});

describe('mergePayloads', () => {
  const base = { events: [], lists: [], settings: makeSettings({ tutorialCompleted: false }) };

  it('keeps both sides and lets the newer copy of a task win', () => {
    const merged = mergePayloads(
      { ...base, tasks: [makeTask({ id: 'a', title: 'local', updatedAt: '2026-01-02T10:00:00' }), makeTask({ id: 'onlyLocal' })] },
      { ...base, tasks: [makeTask({ id: 'a', title: 'remote', updatedAt: '2026-01-01T10:00:00' }), makeTask({ id: 'onlyRemote' })] }
    );
    expect(merged.tasks.map((t) => t.id).sort()).toEqual(['a', 'onlyLocal', 'onlyRemote']);
    expect(merged.tasks.find((t) => t.id === 'a')!.title).toBe('local');
  });

  it('dedupes the same occurrence generated on two devices, keeping the one with real work', () => {
    const merged = mergePayloads(
      { ...base, tasks: [makeTask({ id: 'x1', isRepeatingInstance: true, parentRepeatingId: 'p', dueDate: '2026-02-01T18:00:00' })] },
      {
        ...base,
        tasks: [makeTask({ id: 'x2', isRepeatingInstance: true, parentRepeatingId: 'p', dueDate: '2026-02-01T18:00:00', completed: true })],
      }
    );
    expect(merged.tasks.map((t) => t.id)).toEqual(['x2']);
  });

  it('remembers a finished tour from either side', () => {
    const merged = mergePayloads(
      { ...base, tasks: [], settings: makeSettings({ tutorialCompleted: true }) },
      { ...base, tasks: [], settings: makeSettings({ tutorialCompleted: false }) }
    );
    expect(merged.settings.tutorialCompleted).toBe(true);
  });
});

describe('normalizeISO', () => {
  it('converts UTC timestamps to local wall-clock format', () => {
    const utc = '2026-03-10T08:30:00.000Z';
    const local = normalizeISO(utc);
    expect(local).not.toMatch(/Z$/);
    expect(new Date(local).getTime()).toBe(new Date(utc).getTime());
  });

  it('leaves local timestamps untouched', () => {
    expect(normalizeISO('2026-03-10T14:00:00')).toBe('2026-03-10T14:00:00');
    expect(normalizeISO(null)).toBeNull();
  });
});
