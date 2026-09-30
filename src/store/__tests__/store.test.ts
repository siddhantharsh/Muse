// ============================================================
// Store — cross-cutting logic tests (series, deletion, lists,
// settings validation, ICS re-import)
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory persistence so tests never touch real storage.
vi.mock('../../utils/storage', () => {
  const flags = new Map<string, string>();
  return {
    saveToStorage: vi.fn(),
    loadFromStorage: (_key: string, fallback: unknown) => fallback,
    loadFromStorageAsync: async (_key: string, fallback: unknown) => fallback,
    clearDataStorage: vi.fn(),
    readFlag: (key: string) => flags.get(key) ?? null,
    writeFlag: (key: string, value: string | null) => {
      if (value === null) flags.delete(key);
      else flags.set(key, value);
    },
  };
});

import { useMuseStore } from '../useMuseStore';
import { RepeatFrequency } from '../../types';
import { fromNow, makeEvent, makeTask } from '../../test/factories';

const daily = { frequency: RepeatFrequency.Daily, interval: 1 };
const store = () => useMuseStore.getState();
const task = (id: string) => store().tasks.find((t) => t.id === id);

beforeEach(() => {
  // Debounced recalculation never fires — each test sees only its own action.
  vi.useFakeTimers();
  useMuseStore.setState({ tasks: [], events: [] });
});

describe('repeating task series', () => {
  const series = () => [
    makeTask({ id: 'tpl', title: 'Gym', repeatingRule: daily, dueDate: fromNow(0, 23) }),
    makeTask({ id: 'o1', title: 'Gym', isRepeatingInstance: true, parentRepeatingId: 'tpl', dueDate: fromNow(1) }),
    makeTask({ id: 'o2', title: 'Gym', isRepeatingInstance: true, parentRepeatingId: 'tpl', dueDate: fromNow(2), progress: 15 }),
    makeTask({ id: 'done', title: 'Gym', isRepeatingInstance: true, parentRepeatingId: 'tpl', dueDate: fromNow(-1), completed: true }),
  ];

  it('copies template edits onto open occurrences only', () => {
    useMuseStore.setState({ tasks: series() });
    store().updateTask('tpl', { title: 'Gym session', duration: 90 });
    expect(task('o1')!.title).toBe('Gym session');
    expect(task('o1')!.duration).toBe(90);
    expect(task('done')!.title).toBe('Gym');
  });

  it('regenerates untouched future occurrences when the schedule changes, keeping ones with progress', () => {
    useMuseStore.setState({ tasks: series() });
    store().updateTask('tpl', { repeatingRule: { frequency: RepeatFrequency.Weekly, interval: 1 } });
    expect(task('o1')).toBeUndefined();
    expect(task('o2')).toBeDefined();
    expect(task('done')).toBeDefined();
  });

  it('ends the series when the rule is removed', () => {
    useMuseStore.setState({ tasks: series() });
    store().updateTask('tpl', { repeatingRule: null });
    expect(task('o1')).toBeUndefined();
  });

  it('remembers a deleted occurrence so it is not regenerated', () => {
    useMuseStore.setState({ tasks: series() });
    store().deleteTask('o1');
    expect(task('o1')).toBeUndefined();
    expect(task('tpl')!.repeatingRule!.exceptions).toEqual([fromNow(1).slice(0, 10)]);
  });

  it('deleting the template removes open occurrences and keeps finished history', () => {
    useMuseStore.setState({ tasks: series() });
    store().deleteTask('tpl');
    expect(store().tasks.map((t) => t.id)).toEqual(['done']);
  });

  it('a task that becomes a template stops occupying calendar time', () => {
    useMuseStore.setState({
      tasks: [
        makeTask({
          id: 'x',
          scheduledBlocks: [
            { id: 'b', taskId: 'x', startTime: fromNow(1, 9), endTime: fromNow(1, 10), duration: 60, isManuallyPinned: true },
          ],
        }),
      ],
    });
    store().updateTask('x', { repeatingRule: daily });
    expect(task('x')!.scheduledBlocks).toHaveLength(0);
  });
});

describe('deleting tasks', () => {
  it('drops dependency references to the deleted task', () => {
    useMuseStore.setState({ tasks: [makeTask({ id: 'a' }), makeTask({ id: 'b', dependsOn: ['a'] })] });
    store().deleteTask('a');
    expect(task('b')!.dependsOn).toEqual([]);
  });

  it('closes the detail window of a deleted task', () => {
    useMuseStore.setState({ tasks: [makeTask({ id: 'a' })] });
    store().openFloatingModal({ type: 'task', id: 'a', x: 0, y: 0 });
    store().deleteTask('a');
    expect(store().ui.floatingModal).toBeNull();
  });
});

describe('moving between lists', () => {
  it('keeps a manual task manual, but schedules a task leaving the inbox', () => {
    useMuseStore.setState({
      tasks: [makeTask({ id: 'manual', autoSchedule: false }), makeTask({ id: 'idea', inInbox: true, autoSchedule: false })],
    });
    store().moveTaskToList('manual', 'default-list');
    store().moveTaskToList('idea', 'default-list');
    expect(task('manual')!.autoSchedule).toBe(false);
    expect(task('idea')!.autoSchedule).toBe(true);
    expect(task('idea')!.inInbox).toBe(false);
  });
});

describe('completing tasks', () => {
  it('keeps pinned blocks so un-completing restores the placement', () => {
    const pinned = { id: 'p', taskId: 'a', startTime: fromNow(1, 9), endTime: fromNow(1, 10), duration: 60, isManuallyPinned: true };
    const auto = { ...pinned, id: 'q', isManuallyPinned: false };
    useMuseStore.setState({ tasks: [makeTask({ id: 'a', scheduledBlocks: [pinned, auto] })] });
    store().completeTask('a');
    expect(task('a')!.scheduledBlocks.map((b) => b.id)).toEqual(['p']);
  });
});

describe('settings validation', () => {
  it('rejects NaN and inverted day hours', () => {
    store().updateSettings({ dayStartHour: NaN, dayEndHour: 3 });
    const { dayStartHour, dayEndHour } = store().settings;
    expect(Number.isFinite(dayStartHour)).toBe(true);
    expect(dayEndHour).toBeGreaterThan(dayStartHour);
  });

  it('clamps durations into range', () => {
    store().updateSettings({ defaultTaskDuration: -20, autoSchedulingCutoffWeeks: 99 });
    expect(store().settings.defaultTaskDuration).toBe(5);
    expect(store().settings.autoSchedulingCutoffWeeks).toBe(12);
  });
});

describe('events', () => {
  it('deleting one occurrence of a repeating event records an exception', () => {
    useMuseStore.setState({
      events: [
        makeEvent({ id: 'e', startTime: fromNow(0, 9), endTime: fromNow(0, 10), repeatingRule: daily }),
        makeEvent({ id: 'e2', startTime: fromNow(1, 9), endTime: fromNow(1, 10), externalId: 'repeat-e' }),
      ],
    });
    store().deleteEvent('e2');
    const parent = store().events.find((e) => e.id === 'e')!;
    expect(parent.repeatingRule!.exceptions).toEqual([fromNow(1).slice(0, 10)]);
  });

  it('deleting a series parent removes its occurrences', () => {
    useMuseStore.setState({
      events: [
        makeEvent({ id: 'e', startTime: fromNow(0, 9), endTime: fromNow(0, 10), repeatingRule: daily }),
        makeEvent({ id: 'e2', startTime: fromNow(1, 9), endTime: fromNow(1, 10), externalId: 'repeat-e' }),
      ],
    });
    store().deleteEvent('e');
    expect(store().events).toHaveLength(0);
  });

  it('repairs an event saved with its end before its start', () => {
    useMuseStore.setState({ events: [makeEvent({ id: 'e', startTime: fromNow(1, 9), endTime: fromNow(1, 10) })] });
    store().updateEvent('e', { endTime: fromNow(1, 8) });
    const e = store().events[0];
    expect(new Date(e.endTime).getTime()).toBeGreaterThan(new Date(e.startTime).getTime());
  });

  it('re-importing the same calendar updates events instead of duplicating them', async () => {
    const ics =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:meet-1\r\nSUMMARY:Standup\r\nDTSTART:20260115T090000Z\r\nDTEND:20260115T093000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    await store().importICS(ics);
    await store().importICS(ics.replace('Standup', 'Daily standup'));
    expect(store().events).toHaveLength(1);
    expect(store().events[0].title).toBe('Daily standup');
  });
});
