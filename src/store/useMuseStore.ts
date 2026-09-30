// ============================================================
// Muse — Main Store (Zustand)
// Central state management with persistence
// ============================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { parseISO, isBefore, addMinutes } from 'date-fns';
import {
  Task,
  CalendarEvent,
  TaskList,
  AppSettings,
  UIState,
  Priority,
  DistributionModel,
  UrgencyColor,
  ViewMode,
  SchedulingHoursProfile,
  FloatingModal,
  RepeatingRule,
  CloudAccount,
  CloudStatus,
  OnboardingChoice,
} from '../types';
import {
  saveToStorage,
  loadFromStorage,
  loadFromStorageAsync,
  clearDataStorage,
  readFlag,
  writeFlag,
} from '../utils/storage';
import { nowISO, todayISO, toLocalISO, normalizeISO } from '../utils/dateUtils';
import { isRepeatingTemplate, getMissedTasks } from '../utils/taskSelectors';
import { parseICS, exportICS as buildICS } from '../engine/icsSync';
import type { SyncPayload } from '../utils/cloudSync';

// ---- Default Scheduling Hours Profile ----
const defaultSchedulingProfile: SchedulingHoursProfile = {
  id: 'default-profile',
  name: 'Work Hours',
  color: '#88C0D0',
  weeklySchedule: {
    0: { enabled: false, blocks: [] },
    1: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
    2: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
    3: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
    4: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
    5: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
    6: { enabled: false, blocks: [] },
  },
  dateOverrides: {},
};

// ---- Default Settings ----
const defaultSettings: AppSettings = {
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
  notificationsEnabled: true,
  notifyMinutesBefore: 5,
  theme: 'dark',
  defaultView: ViewMode.Week,
  dayStartHour: 6,
  dayEndHour: 22,
  schedulingHoursProfiles: [defaultSchedulingProfile],
  tutorialCompleted: false,
};

// ---- Default UI State ----
const defaultUIState: UIState = {
  sidebarOpen: true,
  sidebarWidth: 280,
  activeView: 'calendar',
  selectedListId: null,
  selectedDate: todayISO(),
  viewMode: ViewMode.Week,
  floatingModal: null,
  settingsOpen: false,
  multiSelectIds: [],
  multiSelectMode: false,
  isRecalculating: false,
  discardChangesModal: false,
  commandPaletteOpen: false,
  searchQuery: '',
  tutorialOpen: false,
  onboardingChoice: null,
  account: null,
  cloudStatus: 'idle',
  cloudError: null,
};

// ---- Device-level flags (never synced) ----
export const FLAG_ONBOARDING = 'onboarding';
export const FLAG_CLOUD_UID = 'cloud_uid';
export const FLAG_LAST_SYNC = 'cloud_last_sync';

function isNarrowScreen(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 768;
}

function readOnboardingChoice(): OnboardingChoice | null {
  const value = readFlag(FLAG_ONBOARDING);
  return value === 'offline' || value === 'account' ? value : null;
}

// ---- Default List ----
const DEFAULT_LIST_ID = 'default-list';
const createDefaultList = (): TaskList => ({
  id: DEFAULT_LIST_ID,
  name: 'Muse Calendar',
  color: '#88C0D0',
  icon: '📋',
  defaultSchedulingHoursId: 'default-profile',
  defaultCalendarId: null,
  sortOrder: 0,
  isDefault: true,
  createdAt: nowISO(),
  updatedAt: nowISO(),
});

const DATA_KEYS = ['tasks', 'events', 'lists', 'settings'];

// ============================================================
// Validation & migration helpers
// ============================================================

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Sanitizes settings so no field can ever feed NaN or an inverted range to the engine. */
function sanitizeSettings(raw: Partial<AppSettings>): AppSettings {
  const s = { ...defaultSettings, ...raw };
  const dayStartHour = clampInt(s.dayStartHour, 0, 23, defaultSettings.dayStartHour);
  const dayEndHour = Math.max(dayStartHour + 1, clampInt(s.dayEndHour, 1, 24, defaultSettings.dayEndHour));
  return {
    ...s,
    dayStartHour,
    dayEndHour,
    autoSchedulingCutoffWeeks: clampInt(s.autoSchedulingCutoffWeeks, 1, 12, 8),
    defaultTaskDuration: clampInt(s.defaultTaskDuration, 5, 1440, 30),
    defaultMinBlockDuration: clampInt(s.defaultMinBlockDuration, 5, 480, 30),
    notifyMinutesBefore: clampInt(s.notifyMinutesBefore, 0, 120, 5),
    weekStartsOn: s.weekStartsOn === 0 ? 0 : 1,
    schedulingHoursProfiles:
      Array.isArray(s.schedulingHoursProfiles) && s.schedulingHoursProfiles.length > 0
        ? s.schedulingHoursProfiles
        : [defaultSchedulingProfile],
    tutorialCompleted: Boolean(s.tutorialCompleted),
  };
}

/** Repairs tasks from older versions / other devices (missing fields, UTC timestamps). */
function normalizeTask(t: Task): Task {
  const duration = clampInt(t.duration, 5, 100_000, 30);
  return {
    ...t,
    duration,
    progress: clampInt(t.progress, 0, duration, 0),
    minBlockDuration: clampInt(t.minBlockDuration, 5, 1440, 30),
    dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
    scheduledBlocks: (Array.isArray(t.scheduledBlocks) ? t.scheduledBlocks : []).map((b) => ({
      ...b,
      startTime: normalizeISO(b.startTime),
      endTime: normalizeISO(b.endTime),
    })),
    dueDate: normalizeISO(t.dueDate),
    startAfter: normalizeISO(t.startAfter),
    completedAt: normalizeISO(t.completedAt),
    createdAt: normalizeISO(t.createdAt) ?? nowISO(),
    updatedAt: normalizeISO(t.updatedAt) ?? nowISO(),
    schedulingBlocked: Boolean(t.schedulingBlocked),
    urgencyColor: t.urgencyColor ?? UrgencyColor.Green,
  };
}

function normalizeEvent(e: CalendarEvent): CalendarEvent {
  const startTime = normalizeISO(e.startTime);
  let endTime = normalizeISO(e.endTime);
  // An event must end after it starts; repair inverted/zero-length timed events.
  if (!e.allDay && !isBefore(parseISO(startTime), parseISO(endTime))) {
    endTime = toLocalISO(addMinutes(parseISO(startTime), 60));
  }
  return {
    ...e,
    startTime,
    endTime,
    bufferBefore: clampInt(e.bufferBefore, 0, 1440, 0),
    bufferAfter: clampInt(e.bufferAfter, 0, 1440, 0),
    createdAt: normalizeISO(e.createdAt) ?? nowISO(),
    updatedAt: normalizeISO(e.updatedAt) ?? nowISO(),
  };
}

function normalizeLists(lists: TaskList[]): TaskList[] {
  const valid = Array.isArray(lists) ? lists : [];
  return valid.some((l) => l.id === DEFAULT_LIST_ID) ? valid : [createDefaultList(), ...valid];
}

// ---- Initial load ----
const initialTasks = loadFromStorage<Task[]>('tasks', []).map(normalizeTask);
const initialEvents = loadFromStorage<CalendarEvent[]>('events', []).map(normalizeEvent);
const initialLists = normalizeLists(loadFromStorage<TaskList[]>('lists', []));
const storedSettings = loadFromStorage<Partial<AppSettings> | null>('settings', null);
const initialSettings = sanitizeSettings({
  ...(storedSettings ?? {}),
  // People upgrading with existing data aren't new — don't push the tour on them.
  tutorialCompleted:
    storedSettings?.tutorialCompleted ?? (initialTasks.length > 0 || initialEvents.length > 0),
});

// ============================================================
// Repeating-series helpers
// ============================================================

/** Fields that shape an occurrence's content (not its date). */
const SERIES_CONTENT_FIELDS: (keyof Task)[] = [
  'title',
  'description',
  'duration',
  'priority',
  'splittable',
  'minBlockDuration',
  'schedulingHoursId',
  'color',
  'listId',
  'autoSchedule',
  'autoIgnore',
  'notes',
  'dependsOn',
];

function ruleSignature(rule: RepeatingRule | null): string {
  if (!rule) return '';
  const { exceptions: _ignored, ...shape } = rule;
  return JSON.stringify(shape);
}

/**
 * Keeps a series' open occurrences in step with its template:
 *  - content edits (title, duration, …) are copied onto open occurrences;
 *  - schedule edits (rule, due/start time) drop untouched future occurrences
 *    so they regenerate on the new schedule;
 *  - removing the rule ends the series (untouched occurrences are removed).
 * Occurrences with recorded progress are never discarded.
 */
function syncSeries(tasks: Task[], before: Task, after: Task): Task[] {
  const now = new Date();
  const isUntouchedFuture = (t: Task) =>
    !t.completed &&
    t.progress === 0 &&
    !!t.dueDate &&
    !isBefore(parseISO(t.dueDate), now);

  const scheduleChanged =
    ruleSignature(before.repeatingRule) !== ruleSignature(after.repeatingRule) ||
    before.dueDate !== after.dueDate ||
    before.startAfter !== after.startAfter;

  const changedFields = SERIES_CONTENT_FIELDS.filter(
    (f) => JSON.stringify(before[f]) !== JSON.stringify(after[f])
  );

  return tasks
    .filter((t) => {
      if (t.parentRepeatingId !== after.id) return true;
      if (!after.repeatingRule || scheduleChanged) return !isUntouchedFuture(t);
      return true;
    })
    .map((t) => {
      if (t.parentRepeatingId !== after.id || t.completed || changedFields.length === 0) return t;
      const patch: Partial<Task> = {};
      for (const f of changedFields) (patch as Record<string, unknown>)[f] = after[f];
      const duration = patch.duration ?? t.duration;
      return { ...t, ...patch, progress: Math.min(t.progress, duration), updatedAt: nowISO() };
    });
}

function withException(rule: RepeatingRule, day: string): RepeatingRule {
  const exceptions = new Set(rule.exceptions ?? []);
  exceptions.add(day);
  return { ...rule, exceptions: [...exceptions].sort() };
}

/**
 * Removes tasks and everything that depended on them existing:
 *  - deleting a template ends the series (open occurrences go too;
 *    finished ones stay as history);
 *  - deleting one occurrence records its date so it isn't regenerated;
 *  - dependency references to deleted tasks are dropped.
 */
function removeTasks(tasks: Task[], ids: string[]): { tasks: Task[]; removed: Set<string> } {
  const removed = new Set(ids);
  for (const id of ids) {
    const task = tasks.find((t) => t.id === id);
    if (task && isRepeatingTemplate(task)) {
      for (const t of tasks) if (t.parentRepeatingId === id && !t.completed) removed.add(t.id);
    }
  }

  const exceptionsByParent = new Map<string, string[]>();
  for (const t of tasks) {
    if (removed.has(t.id) && t.isRepeatingInstance && t.parentRepeatingId && t.dueDate) {
      const days = exceptionsByParent.get(t.parentRepeatingId) ?? [];
      days.push(t.dueDate.slice(0, 10));
      exceptionsByParent.set(t.parentRepeatingId, days);
    }
  }

  const next = tasks
    .filter((t) => !removed.has(t.id))
    .map((t) => {
      let result = t;
      const days = exceptionsByParent.get(t.id);
      if (days && t.repeatingRule) {
        let rule = t.repeatingRule;
        for (const d of days) rule = withException(rule, d);
        result = { ...result, repeatingRule: rule, updatedAt: nowISO() };
      }
      if (result.dependsOn.some((d) => removed.has(d))) {
        result = { ...result, dependsOn: result.dependsOn.filter((d) => !removed.has(d)), updatedAt: nowISO() };
      }
      return result;
    });

  return { tasks: next, removed };
}

/** Closes the detail modal / deselects items that no longer exist. */
function pruneUI(ui: UIState, removed: Set<string>): UIState {
  const modalGone = ui.floatingModal && removed.has(ui.floatingModal.id);
  const selectionChanged = ui.multiSelectIds.some((id) => removed.has(id));
  if (!modalGone && !selectionChanged) return ui;
  return {
    ...ui,
    floatingModal: modalGone ? null : ui.floatingModal,
    multiSelectIds: ui.multiSelectIds.filter((id) => !removed.has(id)),
  };
}

/** Applies a task update, including series propagation for templates. */
function applyTaskUpdate(tasks: Task[], id: string, updates: Partial<Task>): Task[] {
  const before = tasks.find((t) => t.id === id);
  if (!before) return tasks;
  let after = normalizeTask({ ...before, ...updates, updatedAt: nowISO() });
  // A task that becomes a series template stops occupying time itself —
  // its occurrences do that.
  if (isRepeatingTemplate(after) && !isRepeatingTemplate(before)) {
    after = { ...after, scheduledBlocks: [] };
  }
  let next = tasks.map((t) => (t.id === id ? after : t));
  if (isRepeatingTemplate(before) || isRepeatingTemplate(after)) {
    next = syncSeries(next, before, after);
  }
  return next;
}

// ============================================================
// Event-series helpers
// ============================================================

const EVENT_SERIES_FIELDS: (keyof CalendarEvent)[] = [
  'title',
  'description',
  'color',
  'busy',
  'location',
  'notes',
  'bufferBefore',
  'bufferAfter',
  'calendarId',
];

function seriesKeyOf(eventId: string) {
  return `repeat-${eventId}`;
}

function syncEventSeries(events: CalendarEvent[], before: CalendarEvent, after: CalendarEvent): CalendarEvent[] {
  const now = new Date();
  const key = seriesKeyOf(after.id);
  const scheduleChanged =
    ruleSignature(before.repeatingRule) !== ruleSignature(after.repeatingRule) ||
    before.startTime !== after.startTime ||
    before.endTime !== after.endTime ||
    before.allDay !== after.allDay;
  const changedFields = EVENT_SERIES_FIELDS.filter(
    (f) => JSON.stringify(before[f]) !== JSON.stringify(after[f])
  );

  return events
    .filter((e) => {
      if (e.externalId !== key) return true;
      const upcoming = !isBefore(parseISO(e.endTime), now);
      // Series ended or rescheduled: upcoming occurrences regenerate from the new shape.
      return !(upcoming && (!after.repeatingRule || scheduleChanged));
    })
    .map((e) => {
      if (e.externalId !== key || changedFields.length === 0) return e;
      if (isBefore(parseISO(e.endTime), now)) return e;
      const patch: Partial<CalendarEvent> = {};
      for (const f of changedFields) (patch as Record<string, unknown>)[f] = after[f];
      return { ...e, ...patch, updatedAt: nowISO() };
    });
}

// ---- Store Interface ----
interface MuseStore {
  // Data
  tasks: Task[];
  events: CalendarEvent[];
  lists: TaskList[];
  settings: AppSettings;
  ui: UIState;

  // Task Actions
  addTask: (task: Partial<Task>) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  completeTask: (id: string) => void;
  uncompleteTask: (id: string) => void;
  moveTaskToInbox: (id: string) => void;
  moveTaskToList: (id: string, listId: string) => void;
  updateTaskProgress: (id: string, minutes: number) => void;
  bulkDeleteTasks: (ids: string[]) => void;
  bulkCompleteTasks: (ids: string[]) => void;
  bulkMoveTasks: (ids: string[], listId: string) => void;
  addExampleTasks: () => void;

  // Event Actions
  addEvent: (event: Partial<CalendarEvent>) => CalendarEvent;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;

  // List Actions
  addList: (list: Partial<TaskList>) => TaskList;
  updateList: (id: string, updates: Partial<TaskList>) => void;
  deleteList: (id: string) => void;
  reorderLists: (listIds: string[]) => void;

  // Settings Actions
  updateSettings: (updates: Partial<AppSettings>) => void;
  addSchedulingProfile: (profile: Partial<SchedulingHoursProfile>) => SchedulingHoursProfile;
  updateSchedulingProfile: (id: string, updates: Partial<SchedulingHoursProfile>) => void;
  deleteSchedulingProfile: (id: string) => void;

  // UI Actions
  setActiveView: (view: UIState['activeView']) => void;
  setSelectedListId: (id: string | null) => void;
  setSelectedDate: (date: string) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openFloatingModal: (modal: FloatingModal) => void;
  closeFloatingModal: () => void;
  toggleSettings: () => void;
  toggleMultiSelect: () => void;
  toggleMultiSelectItem: (id: string) => void;
  clearMultiSelect: () => void;
  setIsRecalculating: (val: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  openTutorial: () => void;
  closeTutorial: () => void;

  // Account / cloud
  setOnboardingChoice: (choice: OnboardingChoice | null) => void;
  setAccount: (account: CloudAccount | null) => void;
  setCloudStatus: (status: CloudStatus, error?: string | null) => void;
  getSyncPayload: () => SyncPayload;
  applySyncPayload: (payload: SyncPayload) => void;
  resetLocalData: () => void;

  // Scheduling Engine
  recalculate: () => void;

  // ICS Import/Export
  importICS: (icsContent: string) => Promise<number>;
  exportICS: () => string;

  // Persistence
  persist: () => void;
  recoverFromIndexedDB: () => Promise<void>;

  // Computed helpers
  getTasksByList: (listId: string) => Task[];
  getInboxTasks: () => Task[];
  getMissedDeadlineTasks: () => Task[];
  getTaskById: (id: string) => Task | undefined;
  getEventById: (id: string) => CalendarEvent | undefined;
  getListById: (id: string) => TaskList | undefined;
}

// Debounced recalculate to avoid race conditions with rapid mutations
let _recalcTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedRecalculate(fn: () => void) {
  if (_recalcTimer) clearTimeout(_recalcTimer);
  _recalcTimer = setTimeout(fn, 50);
}

export const useMuseStore = create<MuseStore>((set, get) => {
  /** Persist, then reschedule — every data mutation ends with this. */
  const commit = () => {
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  };

  return {
    // ---- Initial Data ----
    tasks: initialTasks,
    events: initialEvents,
    lists: initialLists,
    settings: initialSettings,
    ui: {
      ...defaultUIState,
      // Phones open on the calendar (the sidebar is an overlay there), and a
      // 7-column week is unreadable at that width — start on 3 days instead.
      sidebarOpen: !isNarrowScreen(),
      viewMode:
        isNarrowScreen() && initialSettings.defaultView === ViewMode.Week
          ? ViewMode.ThreeDay
          : initialSettings.defaultView,
      onboardingChoice: readOnboardingChoice(),
    },

    // ---- Task Actions ----
    addTask: (taskInput) => {
      const state = get();
      const list =
        (taskInput.listId && state.lists.find((l) => l.id === taskInput.listId)) ||
        state.lists.find((l) => l.isDefault);

      const duration = clampInt(taskInput.duration, 5, 100_000, state.settings.defaultTaskDuration);
      const newTask: Task = {
        id: uuidv4(),
        title: taskInput.title || 'Untitled Task',
        description: taskInput.description || '',
        listId: list?.id || DEFAULT_LIST_ID,
        autoSchedule: taskInput.autoSchedule ?? state.settings.defaultAutoSchedule,
        duration,
        progress: 0,
        dueDate: taskInput.dueDate || null,
        startAfter: taskInput.startAfter || null,
        schedulingHoursId:
          taskInput.schedulingHoursId || list?.defaultSchedulingHoursId || null,
        priority: taskInput.priority || Priority.None,
        splittable: taskInput.splittable ?? state.settings.defaultSplittable,
        minBlockDuration: clampInt(
          taskInput.minBlockDuration,
          5,
          1440,
          state.settings.defaultMinBlockDuration
        ),
        completed: false,
        completedAt: null,
        color: taskInput.color || list?.color || '#88C0D0',
        dependsOn: taskInput.dependsOn || [],
        repeatingRule: taskInput.repeatingRule || null,
        autoIgnore: taskInput.autoIgnore ?? false,
        isRepeatingInstance: false,
        parentRepeatingId: null,
        scheduledBlocks: taskInput.scheduledBlocks || [],
        urgencyColor: UrgencyColor.Green,
        schedulingBlocked: false,
        inInbox: taskInput.inInbox ?? false,
        notes: taskInput.notes || '',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };

      set((s) => ({ tasks: [...s.tasks, newTask] }));
      commit();
      return newTask;
    },

    updateTask: (id, updates) => {
      set((state) => ({ tasks: applyTaskUpdate(state.tasks, id, updates) }));
      commit();
    },

    deleteTask: (id) => {
      set((state) => {
        const { tasks, removed } = removeTasks(state.tasks, [id]);
        return { tasks, ui: pruneUI(state.ui, removed) };
      });
      commit();
    },

    completeTask: (id) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                completed: true,
                completedAt: nowISO(),
                // Auto-placed blocks are meaningless once done; pinned ones are
                // kept so un-completing restores the user's own placement.
                scheduledBlocks: t.scheduledBlocks.filter((b) => b.isManuallyPinned),
                updatedAt: nowISO(),
              }
            : t
        ),
      }));
      commit();
    },

    uncompleteTask: (id) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, completed: false, completedAt: null, updatedAt: nowISO() } : t
        ),
      }));
      commit();
    },

    moveTaskToInbox: (id) => {
      set((state) => ({
        tasks: applyTaskUpdate(state.tasks, id, {
          inInbox: true,
          autoSchedule: false,
          scheduledBlocks: [],
        }),
      }));
      commit();
    },

    moveTaskToList: (id, listId) => {
      const list = get().lists.find((l) => l.id === listId);
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      set((state) => ({
        tasks: applyTaskUpdate(state.tasks, id, {
          listId,
          inInbox: false,
          // Leaving the inbox means "schedule this now"; otherwise a manual task stays manual.
          autoSchedule: task.inInbox ? true : task.autoSchedule,
          color: list?.color || task.color,
          schedulingHoursId: list?.defaultSchedulingHoursId || task.schedulingHoursId,
        }),
      }));
      commit();
    },

    updateTaskProgress: (id, minutes) => {
      set((state) => {
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return {};
        return { tasks: applyTaskUpdate(state.tasks, id, { progress: clampInt(minutes, 0, task.duration, 0) }) };
      });
      commit();
    },

    bulkDeleteTasks: (ids) => {
      set((state) => {
        const { tasks, removed } = removeTasks(state.tasks, ids);
        return { tasks, ui: { ...pruneUI(state.ui, removed), multiSelectMode: false, multiSelectIds: [] } };
      });
      commit();
    },

    bulkCompleteTasks: (ids) => {
      const idSet = new Set(ids);
      set((state) => ({
        tasks: state.tasks.map((t) =>
          idSet.has(t.id)
            ? {
                ...t,
                completed: true,
                completedAt: nowISO(),
                scheduledBlocks: t.scheduledBlocks.filter((b) => b.isManuallyPinned),
                updatedAt: nowISO(),
              }
            : t
        ),
      }));
      get().clearMultiSelect();
      commit();
    },

    bulkMoveTasks: (ids, listId) => {
      const list = get().lists.find((l) => l.id === listId);
      set((state) => {
        let tasks = state.tasks;
        for (const id of ids) {
          const task = tasks.find((t) => t.id === id);
          if (!task) continue;
          tasks = applyTaskUpdate(tasks, id, {
            listId,
            inInbox: false,
            autoSchedule: task.inInbox ? true : task.autoSchedule,
            color: list?.color || task.color,
            schedulingHoursId: list?.defaultSchedulingHoursId || task.schedulingHoursId,
          });
        }
        return { tasks };
      });
      get().clearMultiSelect();
      commit();
    },

    /** Seeds three linked tasks so a new person sees the engine work immediately. */
    addExampleTasks: () => {
      const { addTask, updateTask } = get();
      const inDays = (days: number, hour: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        d.setHours(hour, 0, 0, 0);
        return toLocalISO(d);
      };
      const research = addTask({
        title: 'Research for the quarterly report',
        duration: 120,
        splittable: true,
        minBlockDuration: 30,
        priority: Priority.Medium,
        dueDate: inDays(3, 17),
        notes: 'Example task — splittable, so it can be spread across free gaps.',
      });
      const report = addTask({
        title: 'Write the quarterly report',
        duration: 180,
        splittable: true,
        minBlockDuration: 45,
        priority: Priority.High,
        dueDate: inDays(5, 17),
        notes: 'Example task — depends on the research, so it’s always scheduled after it.',
      });
      updateTask(report.id, { dependsOn: [research.id] });
      addTask({
        title: 'Reply to pending emails',
        duration: 30,
        priority: Priority.Low,
        dueDate: inDays(1, 12),
        notes: 'Example task — short, fixed-length, due tomorrow.',
      });
    },

    // ---- Event Actions ----
    addEvent: (eventInput) => {
      const start = eventInput.startTime || nowISO();
      const newEvent = normalizeEvent({
        id: uuidv4(),
        title: eventInput.title || 'Untitled Event',
        description: eventInput.description || '',
        startTime: start,
        endTime: eventInput.endTime || toLocalISO(addMinutes(parseISO(start), 60)),
        allDay: eventInput.allDay ?? false,
        busy: eventInput.busy ?? !eventInput.allDay,
        color: eventInput.color || '#5E81AC',
        location: eventInput.location || '',
        notes: eventInput.notes || '',
        repeatingRule: eventInput.repeatingRule || null,
        bufferBefore: eventInput.bufferBefore || 0,
        bufferAfter: eventInput.bufferAfter || 0,
        calendarId: eventInput.calendarId || 'default',
        isExternal: eventInput.isExternal ?? false,
        externalId: eventInput.externalId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });

      set((state) => ({ events: [...state.events, newEvent] }));
      commit();
      return newEvent;
    },

    updateEvent: (id, updates) => {
      set((state) => {
        const before = state.events.find((e) => e.id === id);
        if (!before) return {};
        const after = normalizeEvent({ ...before, ...updates, updatedAt: nowISO() });
        let events = state.events.map((e) => (e.id === id ? after : e));
        if (before.repeatingRule || after.repeatingRule) {
          events = syncEventSeries(events, before, after);
        }
        return { events };
      });
      commit();
    },

    deleteEvent: (id) => {
      set((state) => {
        const target = state.events.find((e) => e.id === id);
        if (!target) return {};
        const removed = new Set([id]);
        // Deleting a series parent removes every generated occurrence.
        if (target.repeatingRule) {
          for (const e of state.events) if (e.externalId === seriesKeyOf(id)) removed.add(e.id);
        }
        let events = state.events.filter((e) => !removed.has(e.id));
        // Deleting one occurrence: remember its date so it isn't regenerated.
        if (target.externalId?.startsWith('repeat-')) {
          const parentId = target.externalId.slice('repeat-'.length);
          const day = target.startTime.slice(0, 10);
          events = events.map((e) =>
            e.id === parentId && e.repeatingRule
              ? { ...e, repeatingRule: withException(e.repeatingRule, day), updatedAt: nowISO() }
              : e
          );
        }
        return { events, ui: pruneUI(state.ui, removed) };
      });
      commit();
    },

    // ---- List Actions ----
    addList: (listInput) => {
      const state = get();
      const newList: TaskList = {
        id: uuidv4(),
        name: listInput.name || 'New List',
        color: listInput.color || '#88C0D0',
        icon: listInput.icon || '📁',
        defaultSchedulingHoursId: listInput.defaultSchedulingHoursId || 'default-profile',
        defaultCalendarId: listInput.defaultCalendarId || null,
        sortOrder: state.lists.length,
        isDefault: false,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      set((s) => ({ lists: [...s.lists, newList] }));
      get().persist();
      return newList;
    },

    updateList: (id, updates) => {
      set((state) => ({
        lists: state.lists.map((l) => (l.id === id ? { ...l, ...updates, updatedAt: nowISO() } : l)),
        // A list's color is its tasks' color.
        tasks: updates.color
          ? state.tasks.map((t) =>
              t.listId === id ? { ...t, color: updates.color!, updatedAt: nowISO() } : t
            )
          : state.tasks,
      }));
      get().persist();
    },

    deleteList: (id) => {
      const target = get().lists.find((l) => l.id === id);
      if (!target || target.isDefault) return;
      const fallback = get().lists.find((l) => l.isDefault);
      set((state) => ({
        lists: state.lists.filter((l) => l.id !== id),
        // Tasks move to the default list and take on its look.
        tasks: state.tasks.map((t) =>
          t.listId === id
            ? { ...t, listId: fallback?.id || DEFAULT_LIST_ID, color: fallback?.color || t.color, updatedAt: nowISO() }
            : t
        ),
        ui: state.ui.selectedListId === id ? { ...state.ui, selectedListId: null } : state.ui,
      }));
      get().persist();
    },

    reorderLists: (listIds) => {
      set((state) => ({
        lists: state.lists.map((l) => ({ ...l, sortOrder: listIds.indexOf(l.id) })),
      }));
      get().persist();
    },

    // ---- Settings Actions ----
    updateSettings: (updates) => {
      set((state) => ({ settings: sanitizeSettings({ ...state.settings, ...updates }) }));
      commit();
    },

    addSchedulingProfile: (profileInput) => {
      const newProfile: SchedulingHoursProfile = {
        id: uuidv4(),
        name: profileInput.name || 'New Profile',
        color: profileInput.color || '#B48EAD',
        weeklySchedule: profileInput.weeklySchedule || {
          0: { enabled: false, blocks: [] },
          1: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
          2: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
          3: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
          4: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
          5: { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] },
          6: { enabled: false, blocks: [] },
        },
        dateOverrides: {},
      };
      set((state) => ({
        settings: {
          ...state.settings,
          schedulingHoursProfiles: [...state.settings.schedulingHoursProfiles, newProfile],
        },
      }));
      commit();
      return newProfile;
    },

    updateSchedulingProfile: (id, updates) => {
      set((state) => ({
        settings: {
          ...state.settings,
          schedulingHoursProfiles: state.settings.schedulingHoursProfiles.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        },
      }));
      commit();
    },

    deleteSchedulingProfile: (id) => {
      if (id === defaultSchedulingProfile.id) return;
      set((state) => ({
        // Tasks fall back to the default window; lists fall back to Work Hours,
        // so new tasks created in them never point at a profile that's gone.
        tasks: state.tasks.map((t) =>
          t.schedulingHoursId === id ? { ...t, schedulingHoursId: null, updatedAt: nowISO() } : t
        ),
        lists: state.lists.map((l) =>
          l.defaultSchedulingHoursId === id
            ? { ...l, defaultSchedulingHoursId: defaultSchedulingProfile.id, updatedAt: nowISO() }
            : l
        ),
        settings: {
          ...state.settings,
          schedulingHoursProfiles: state.settings.schedulingHoursProfiles.filter((p) => p.id !== id),
        },
      }));
      commit();
    },

    // ---- UI Actions ----
    setActiveView: (view) => set((state) => ({ ui: { ...state.ui, activeView: view } })),
    setSelectedListId: (id) => set((state) => ({ ui: { ...state.ui, selectedListId: id } })),
    setSelectedDate: (date) => set((state) => ({ ui: { ...state.ui, selectedDate: date } })),
    setViewMode: (mode) => set((state) => ({ ui: { ...state.ui, viewMode: mode } })),
    toggleSidebar: () =>
      set((state) => ({ ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen } })),
    setSidebarOpen: (open) => set((state) => ({ ui: { ...state.ui, sidebarOpen: open } })),
    openFloatingModal: (modal) => set((state) => ({ ui: { ...state.ui, floatingModal: modal } })),
    closeFloatingModal: () => set((state) => ({ ui: { ...state.ui, floatingModal: null } })),
    toggleSettings: () =>
      set((state) => ({ ui: { ...state.ui, settingsOpen: !state.ui.settingsOpen } })),
    toggleMultiSelect: () =>
      set((state) => ({
        ui: { ...state.ui, multiSelectMode: !state.ui.multiSelectMode, multiSelectIds: [] },
      })),
    toggleMultiSelectItem: (id) =>
      set((state) => ({
        ui: {
          ...state.ui,
          multiSelectIds: state.ui.multiSelectIds.includes(id)
            ? state.ui.multiSelectIds.filter((i) => i !== id)
            : [...state.ui.multiSelectIds, id],
        },
      })),
    clearMultiSelect: () =>
      set((state) => ({ ui: { ...state.ui, multiSelectMode: false, multiSelectIds: [] } })),
    setIsRecalculating: (val) => set((state) => ({ ui: { ...state.ui, isRecalculating: val } })),
    setCommandPaletteOpen: (open) =>
      set((state) => ({ ui: { ...state.ui, commandPaletteOpen: open } })),
    setSearchQuery: (query) => set((state) => ({ ui: { ...state.ui, searchQuery: query } })),

    openTutorial: () =>
      set((state) => ({
        ui: {
          ...state.ui,
          tutorialOpen: true,
          activeView: 'calendar',
          selectedListId: null,
          floatingModal: null,
          commandPaletteOpen: false,
        },
      })),

    closeTutorial: () => {
      set((state) => ({
        ui: { ...state.ui, tutorialOpen: false },
        settings: { ...state.settings, tutorialCompleted: true },
      }));
      get().persist();
    },

    // ---- Account / cloud ----
    setOnboardingChoice: (choice) => {
      writeFlag(FLAG_ONBOARDING, choice);
      set((state) => ({ ui: { ...state.ui, onboardingChoice: choice } }));
    },
    setAccount: (account) => set((state) => ({ ui: { ...state.ui, account } })),
    setCloudStatus: (status, error = null) =>
      set((state) => ({ ui: { ...state.ui, cloudStatus: status, cloudError: error } })),

    getSyncPayload: () => {
      const { tasks, events, lists, settings } = get();
      return { tasks, events, lists, settings };
    },

    applySyncPayload: (payload) => {
      set((state) => ({
        tasks: (payload.tasks ?? []).map(normalizeTask),
        events: (payload.events ?? []).map(normalizeEvent),
        lists: normalizeLists(payload.lists ?? []),
        settings: sanitizeSettings({ ...state.settings, ...(payload.settings ?? {}) }),
      }));
      commit();
    },

    /**
     * Sign-out: this device's copy is cleared (the account keeps everything)
     * and the next launch asks "log in with email?" again.
     */
    resetLocalData: () => {
      clearDataStorage(DATA_KEYS);
      writeFlag(FLAG_CLOUD_UID, null);
      writeFlag(FLAG_LAST_SYNC, null);
      writeFlag(FLAG_ONBOARDING, null);
      set((state) => ({
        tasks: [],
        events: [],
        lists: [createDefaultList()],
        settings: { ...defaultSettings },
        ui: {
          ...defaultUIState,
          sidebarOpen: state.ui.sidebarOpen,
          onboardingChoice: null,
          account: null,
        },
      }));
      get().persist();
    },

    // ---- ICS Import/Export ----
    importICS: async (icsContent: string) => {
      const parsed = parseICS(icsContent);
      let count = 0;
      set((state) => {
        const events = [...state.events];
        for (const partial of parsed) {
          const incoming = normalizeEvent({
            id: uuidv4(),
            title: partial.title || 'Imported Event',
            description: partial.description || '',
            startTime: partial.startTime || nowISO(),
            endTime: partial.endTime || nowISO(),
            allDay: partial.allDay ?? false,
            busy: partial.busy ?? true,
            color: partial.color || '#5E81AC',
            location: partial.location || '',
            notes: partial.notes || '',
            repeatingRule: partial.repeatingRule || null,
            bufferBefore: 0,
            bufferAfter: 0,
            calendarId: partial.calendarId || 'external',
            isExternal: true,
            externalId: partial.externalId,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          });
          // Re-importing the same calendar updates events instead of duplicating them.
          const existingIndex = incoming.externalId
            ? events.findIndex((e) => e.externalId === incoming.externalId)
            : -1;
          if (existingIndex >= 0) {
            const existing = events[existingIndex];
            events[existingIndex] = { ...incoming, id: existing.id, color: existing.color, createdAt: existing.createdAt };
          } else {
            events.push(incoming);
          }
          count++;
        }
        return { events };
      });
      commit();
      return count;
    },

    exportICS: () => buildICS(get().events),

    // ---- Scheduling Engine (delegated to engine module) ----
    recalculate: () => {
      set((s) => ({ ui: { ...s.ui, isRecalculating: true } }));

      Promise.all([import('../engine/scheduler'), import('../engine/repeating')])
        .then(([{ runScheduler }, { generateRepeatingTaskInstances, generateRepeatingEventInstances }]) => {
          const freshState = get();
          const now = new Date();
          const cutoff = new Date(now);
          cutoff.setDate(cutoff.getDate() + freshState.settings.autoSchedulingCutoffWeeks * 7);

          // Keep enough occurrences to cover the whole planning window (daily ≈ 7/week).
          const maxUpcoming = freshState.settings.autoSchedulingCutoffWeeks * 7 + 7;

          // History cleanup: finished occurrences older than two weeks are dropped.
          // (Missed, still-open occurrences are kept — they need a decision.)
          const historyCutoff = new Date(now);
          historyCutoff.setDate(historyCutoff.getDate() - 14);

          let allTasks = freshState.tasks.filter((t) => {
            if (!t.isRepeatingInstance) return true;
            return !(t.completed && t.dueDate && isBefore(parseISO(t.dueDate), historyCutoff));
          });

          for (const parent of allTasks.filter(isRepeatingTemplate)) {
            const created = generateRepeatingTaskInstances(parent, allTasks, cutoff, maxUpcoming, now);
            if (created.length > 0) allTasks = [...allTasks, ...created];
          }

          // Past occurrences of repeating events stay visible for two weeks of history.
          let allEvents = freshState.events.filter(
            (e) => !(e.externalId?.startsWith('repeat-') && isBefore(parseISO(e.endTime), historyCutoff))
          );
          for (const parent of allEvents.filter((e) => e.repeatingRule)) {
            const created = generateRepeatingEventInstances(parent, allEvents, cutoff, maxUpcoming, now);
            if (created.length > 0) allEvents = [...allEvents, ...created];
          }

          const result = runScheduler(allTasks, allEvents, freshState.settings);
          set((s) => ({
            tasks: result,
            events: allEvents,
            ui: { ...s.ui, isRecalculating: false },
          }));
          get().persist();
        })
        .catch((err) => {
          console.error('[Muse] Recalculation failed:', err);
          set((s) => ({ ui: { ...s.ui, isRecalculating: false } }));
        });
    },

    // ---- Persistence ----
    persist: () => {
      const state = get();
      saveToStorage('tasks', state.tasks);
      saveToStorage('events', state.events);
      saveToStorage('lists', state.lists);
      saveToStorage('settings', state.settings);
    },

    /**
     * localStorage can be cleared by the browser while IndexedDB survives.
     * On startup with no local data, restore from the IndexedDB copy.
     */
    recoverFromIndexedDB: async () => {
      const state = get();
      if (state.tasks.length > 0 || state.events.length > 0) return;
      const [tasks, events, lists, settings] = await Promise.all([
        loadFromStorageAsync<Task[]>('tasks', []),
        loadFromStorageAsync<CalendarEvent[]>('events', []),
        loadFromStorageAsync<TaskList[]>('lists', []),
        loadFromStorageAsync<Partial<AppSettings> | null>('settings', null),
      ]);
      if (tasks.length === 0 && events.length === 0) return;
      console.log('[Muse] Recovered data from IndexedDB');
      set({
        tasks: tasks.map(normalizeTask),
        events: events.map(normalizeEvent),
        lists: normalizeLists(lists),
        settings: sanitizeSettings({ ...(settings ?? {}), tutorialCompleted: true }),
      });
      commit();
    },

    // ---- Computed Helpers ----
    getTasksByList: (listId) =>
      get().tasks.filter((t) => t.listId === listId && !t.inInbox && !t.completed),

    getInboxTasks: () => get().tasks.filter((t) => t.inInbox && !t.completed),

    getMissedDeadlineTasks: () => getMissedTasks(get().tasks),

    getTaskById: (id) => get().tasks.find((t) => t.id === id),
    getEventById: (id) => get().events.find((e) => e.id === id),
    getListById: (id) => get().lists.find((l) => l.id === id),
  };
});
