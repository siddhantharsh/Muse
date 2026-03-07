// ============================================================
// Muse — Main Store (Zustand)
// Central state management with persistence
// ============================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
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
  ScheduledBlock,
  FloatingModal,
  RepeatingRule,
} from '../types';
import { saveToStorage, loadFromStorage, loadFromStorageAsync } from '../utils/storage';
import { nowISO, todayISO } from '../utils/dateUtils';

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
};

// ---- Default List ----
const defaultList: TaskList = {
  id: 'default-list',
  name: 'Muse Calendar',
  color: '#88C0D0',
  icon: '📋',
  defaultSchedulingHoursId: 'default-profile',
  defaultCalendarId: null,
  sortOrder: 0,
  isDefault: true,
  createdAt: nowISO(),
  updatedAt: nowISO(),
};

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
  openFloatingModal: (modal: FloatingModal) => void;
  closeFloatingModal: () => void;
  toggleSettings: () => void;
  toggleMultiSelect: () => void;
  toggleMultiSelectItem: (id: string) => void;
  clearMultiSelect: () => void;
  setIsRecalculating: (val: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;

  // Scheduling Engine
  recalculate: () => void;

  // ICS Import/Export
  importICS: (icsContent: string) => Promise<number>;
  exportICS: () => string;

  // Persistence
  persist: () => void;
  hydrate: () => void;

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

export const useMuseStore = create<MuseStore>((set, get) => ({
  // ---- Initial Data ----
  tasks: loadFromStorage<Task[]>('tasks', []),
  events: loadFromStorage<CalendarEvent[]>('events', []),
  lists: loadFromStorage<TaskList[]>('lists', [defaultList]),
  settings: loadFromStorage<AppSettings>('settings', defaultSettings),
  ui: defaultUIState,

  // ---- Task Actions ----
  addTask: (taskInput) => {
    const state = get();
    const list = taskInput.listId
      ? state.lists.find((l) => l.id === taskInput.listId)
      : state.lists.find((l) => l.isDefault);

    const newTask: Task = {
      id: uuidv4(),
      title: taskInput.title || 'Untitled Task',
      description: taskInput.description || '',
      listId: list?.id || 'default-list',
      autoSchedule: taskInput.autoSchedule ?? state.settings.defaultAutoSchedule,
      duration: taskInput.duration || state.settings.defaultTaskDuration,
      progress: 0,
      dueDate: taskInput.dueDate || null,
      startAfter: taskInput.startAfter || null,
      schedulingHoursId:
        taskInput.schedulingHoursId || list?.defaultSchedulingHoursId || null,
      priority: taskInput.priority || Priority.None,
      splittable: taskInput.splittable ?? state.settings.defaultSplittable,
      minBlockDuration:
        taskInput.minBlockDuration || state.settings.defaultMinBlockDuration,
      completed: false,
      completedAt: null,
      color: taskInput.color || list?.color || '#88C0D0',
      dependsOn: taskInput.dependsOn || [],
      repeatingRule: taskInput.repeatingRule || null,
      autoIgnore: taskInput.autoIgnore ?? false,
      isRepeatingInstance: false,
      parentRepeatingId: null,
      scheduledBlocks: [],
      urgencyColor: UrgencyColor.Green,
      inInbox: taskInput.inInbox ?? false,
      notes: taskInput.notes || '',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    set((state) => ({
      tasks: [...state.tasks, newTask],
    }));
    get().persist();
    // Trigger recalculation
    debouncedRecalculate(() => get().recalculate());
    return newTask;
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: nowISO() } : t
      ),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  deleteTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  completeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: true,
              completedAt: nowISO(),
              scheduledBlocks: [],
              updatedAt: nowISO(),
            }
          : t
      ),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  uncompleteTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: false,
              completedAt: null,
              updatedAt: nowISO(),
            }
          : t
      ),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  moveTaskToInbox: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              inInbox: true,
              autoSchedule: false,
              scheduledBlocks: [],
              updatedAt: nowISO(),
            }
          : t
      ),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  moveTaskToList: (id, listId) => {
    const list = get().lists.find((l) => l.id === listId);
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              listId,
              inInbox: false,
              autoSchedule: true,
              color: list?.color || t.color,
              schedulingHoursId:
                list?.defaultSchedulingHoursId || t.schedulingHoursId,
              updatedAt: nowISO(),
            }
          : t
      ),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  updateTaskProgress: (id, minutes) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              progress: Math.min(minutes, t.duration),
              updatedAt: nowISO(),
            }
          : t
      ),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  bulkDeleteTasks: (ids) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => !ids.includes(t.id)),
    }));
    get().persist();
    get().clearMultiSelect();
    debouncedRecalculate(() => get().recalculate());
  },

  bulkCompleteTasks: (ids) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        ids.includes(t.id)
          ? {
              ...t,
              completed: true,
              completedAt: nowISO(),
              scheduledBlocks: [],
              updatedAt: nowISO(),
            }
          : t
      ),
    }));
    get().persist();
    get().clearMultiSelect();
    debouncedRecalculate(() => get().recalculate());
  },

  bulkMoveTasks: (ids, listId) => {
    const list = get().lists.find((l) => l.id === listId);
    set((state) => ({
      tasks: state.tasks.map((t) =>
        ids.includes(t.id)
          ? {
              ...t,
              listId,
              inInbox: false,
              autoSchedule: true,
              color: list?.color || t.color,
              updatedAt: nowISO(),
            }
          : t
      ),
    }));
    get().persist();
    get().clearMultiSelect();
    debouncedRecalculate(() => get().recalculate());
  },

  // ---- Event Actions ----
  addEvent: (eventInput) => {
    const newEvent: CalendarEvent = {
      id: uuidv4(),
      title: eventInput.title || 'Untitled Event',
      description: eventInput.description || '',
      startTime: eventInput.startTime || nowISO(),
      endTime: eventInput.endTime || nowISO(),
      allDay: eventInput.allDay ?? false,
      busy: eventInput.busy ?? (eventInput.allDay ? false : true),
      color: eventInput.color || '#5E81AC',
      location: eventInput.location || '',
      notes: eventInput.notes || '',
      repeatingRule: eventInput.repeatingRule || null,
      bufferBefore: eventInput.bufferBefore || 0,
      bufferAfter: eventInput.bufferAfter || 0,
      calendarId: eventInput.calendarId || 'default',
      isExternal: eventInput.isExternal ?? false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    set((state) => ({
      events: [...state.events, newEvent],
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
    return newEvent;
  },

  updateEvent: (id, updates) => {
    set((state) => ({
      events: state.events.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: nowISO() } : e
      ),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  deleteEvent: (id) => {
    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  // ---- List Actions ----
  addList: (listInput) => {
    const state = get();
    const newList: TaskList = {
      id: uuidv4(),
      name: listInput.name || 'New List',
      color: listInput.color || '#88C0D0',
      icon: listInput.icon || '📁',
      defaultSchedulingHoursId:
        listInput.defaultSchedulingHoursId || 'default-profile',
      defaultCalendarId: listInput.defaultCalendarId || null,
      sortOrder: state.lists.length,
      isDefault: false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    set((state) => ({
      lists: [...state.lists, newList],
    }));
    get().persist();
    return newList;
  },

  updateList: (id, updates) => {
    set((state) => ({
      lists: state.lists.map((l) =>
        l.id === id ? { ...l, ...updates, updatedAt: nowISO() } : l
      ),
    }));
    // Update all tasks in this list with new defaults if color changed
    if (updates.color) {
      const tasks = get().tasks.filter((t) => t.listId === id);
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.listId === id ? { ...t, color: updates.color! } : t
        ),
      }));
    }
    get().persist();
  },

  deleteList: (id) => {
    // Move tasks to default list
    set((state) => ({
      lists: state.lists.filter((l) => l.id !== id),
      tasks: state.tasks.map((t) =>
        t.listId === id ? { ...t, listId: 'default-list' } : t
      ),
    }));
    get().persist();
  },

  reorderLists: (listIds) => {
    set((state) => ({
      lists: state.lists.map((l) => ({
        ...l,
        sortOrder: listIds.indexOf(l.id),
      })),
    }));
    get().persist();
  },

  // ---- Settings Actions ----
  updateSettings: (updates) => {
    set((state) => ({
      settings: { ...state.settings, ...updates },
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
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
        schedulingHoursProfiles: [
          ...state.settings.schedulingHoursProfiles,
          newProfile,
        ],
      },
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
    return newProfile;
  },

  updateSchedulingProfile: (id, updates) => {
    set((state) => ({
      settings: {
        ...state.settings,
        schedulingHoursProfiles: state.settings.schedulingHoursProfiles.map(
          (p) => (p.id === id ? { ...p, ...updates } : p)
        ),
      },
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  deleteSchedulingProfile: (id) => {
    // Reassign tasks using this profile to null (will use _default)
    const tasksToFix = get().tasks.filter((t) => t.schedulingHoursId === id);
    if (tasksToFix.length > 0) {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.schedulingHoursId === id ? { ...t, schedulingHoursId: null, updatedAt: nowISO() } : t
        ),
      }));
    }
    set((state) => ({
      settings: {
        ...state.settings,
        schedulingHoursProfiles:
          state.settings.schedulingHoursProfiles.filter((p) => p.id !== id),
      },
    }));
    get().persist();
    debouncedRecalculate(() => get().recalculate());
  },

  // ---- UI Actions ----
  setActiveView: (view) => set((state) => ({ ui: { ...state.ui, activeView: view } })),
  setSelectedListId: (id) => set((state) => ({ ui: { ...state.ui, selectedListId: id } })),
  setSelectedDate: (date) => set((state) => ({ ui: { ...state.ui, selectedDate: date } })),
  setViewMode: (mode) => set((state) => ({ ui: { ...state.ui, viewMode: mode } })),
  toggleSidebar: () =>
    set((state) => ({ ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen } })),
  openFloatingModal: (modal) =>
    set((state) => ({ ui: { ...state.ui, floatingModal: modal } })),
  closeFloatingModal: () =>
    set((state) => ({ ui: { ...state.ui, floatingModal: null } })),
  toggleSettings: () =>
    set((state) => ({ ui: { ...state.ui, settingsOpen: !state.ui.settingsOpen } })),
  toggleMultiSelect: () =>
    set((state) => ({
      ui: {
        ...state.ui,
        multiSelectMode: !state.ui.multiSelectMode,
        multiSelectIds: [],
      },
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
    set((state) => ({
      ui: { ...state.ui, multiSelectMode: false, multiSelectIds: [] },
    })),
  setIsRecalculating: (val) =>
    set((state) => ({ ui: { ...state.ui, isRecalculating: val } })),
  setCommandPaletteOpen: (open) =>
    set((state) => ({ ui: { ...state.ui, commandPaletteOpen: open } })),
  setSearchQuery: (query) =>
    set((state) => ({ ui: { ...state.ui, searchQuery: query } })),

  // ---- ICS Import/Export ----
  importICS: (icsContent: string) => {
    // Return a promise so callers can await the count
    return import('../engine/icsSync').then(({ parseICS }) => {
      const parsedEvents = parseICS(icsContent);
      const newEvents = parsedEvents.map((partialEvent) => ({
        id: (partialEvent as any).id || uuidv4(),
        title: partialEvent.title || 'Imported Event',
        description: partialEvent.description || '',
        startTime: partialEvent.startTime || nowISO(),
        endTime: partialEvent.endTime || nowISO(),
        allDay: partialEvent.allDay ?? false,
        busy: partialEvent.busy ?? true,
        color: partialEvent.color || '#5E81AC',
        location: partialEvent.location || '',
        notes: partialEvent.notes || '',
        repeatingRule: partialEvent.repeatingRule || null,
        bufferBefore: partialEvent.bufferBefore || 0,
        bufferAfter: partialEvent.bufferAfter || 0,
        calendarId: partialEvent.calendarId || 'external',
        isExternal: true,
        externalId: partialEvent.externalId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      })) as CalendarEvent[];
      set((state) => ({
        events: [...state.events, ...newEvents],
      }));
      get().persist();
      debouncedRecalculate(() => get().recalculate());
      return newEvents.length;
    });
  },

  exportICS: () => {
    const state = get();
    // Use the engine's proper ICS export (handles all-day, escaping, DTSTAMP, etc.)
    // Dynamic import returns a promise, but we need sync for download — so we use
    // an inline implementation that mirrors the engine's logic
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Muse Scheduler//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    const escICS = (str: string) => str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const fmtDate = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };
    const now = fmtDate(new Date());
    for (const event of state.events) {
      const s = new Date(event.startTime);
      const e = new Date(event.endTime);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${event.externalId || event.id}@muse`);
      lines.push(`DTSTAMP:${now}`);
      if (event.allDay) {
        const pad = (n: number) => String(n).padStart(2, '0');
        lines.push(`DTSTART;VALUE=DATE:${s.getFullYear()}${pad(s.getMonth() + 1)}${pad(s.getDate())}`);
        lines.push(`DTEND;VALUE=DATE:${e.getFullYear()}${pad(e.getMonth() + 1)}${pad(e.getDate())}`);
      } else {
        lines.push(`DTSTART:${fmtDate(s)}`);
        lines.push(`DTEND:${fmtDate(e)}`);
      }
      lines.push(`SUMMARY:${escICS(event.title)}`);
      if (event.description) lines.push(`DESCRIPTION:${escICS(event.description)}`);
      if (event.location) lines.push(`LOCATION:${escICS(event.location)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  },

  // ---- Scheduling Engine (delegated to engine module) ----
  recalculate: () => {
    set((s) => ({ ui: { ...s.ui, isRecalculating: true } }));

    // Import and run the scheduling engine — always read fresh state inside .then
    Promise.all([
      import('../engine/scheduler'),
      import('../engine/repeating'),
    ]).then(([{ runScheduler }, { generateRepeatingTaskInstances, generateRepeatingEventInstances }]) => {
      const freshState = get();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + freshState.settings.autoSchedulingCutoffWeeks * 7);

      const now = new Date();

      // Clean up: remove uncompleted repeating instances whose due date has passed
      // and trim excess future instances (keep only nearest 3 per parent)
      // Also garbage-collect completed auto-ignored repeating instances older than 14 days
      const gcCutoff = new Date(now);
      gcCutoff.setDate(gcCutoff.getDate() - 14);

      let allTasks = freshState.tasks.filter((t) => {
        if (!t.isRepeatingInstance) return true; // keep non-instances

        // Garbage collect: remove completed repeating instances older than 14 days
        if (t.completed && t.dueDate && new Date(t.dueDate) < gcCutoff) return false;

        if (t.completed) return true; // keep recent completed history
        // Remove past uncompleted instances (missed)
        if (t.dueDate && new Date(t.dueDate) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return false;
        return true;
      });

      // For each repeating parent, keep only the nearest maxUpcoming uncompleted future instances
      const repeatingParentIds = new Set(
        allTasks.filter((t) => t.repeatingRule && !t.isRepeatingInstance).map((t) => t.id)
      );
      const MAX_UPCOMING = 3;
      for (const parentId of repeatingParentIds) {
        const futureInstances = allTasks
          .filter((t) => t.parentRepeatingId === parentId && !t.completed && t.dueDate)
          .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
        if (futureInstances.length > MAX_UPCOMING) {
          const toRemove = new Set(futureInstances.slice(MAX_UPCOMING).map((t) => t.id));
          allTasks = allTasks.filter((t) => !toRemove.has(t.id));
        }
      }

      // Generate repeating task instances (limited to 3 upcoming)
      const repeatingTasks = allTasks.filter((t) => t.repeatingRule && !t.isRepeatingInstance);
      for (const parent of repeatingTasks) {
        const newInstances = generateRepeatingTaskInstances(parent, allTasks, cutoff, MAX_UPCOMING);
        if (newInstances.length > 0) {
          allTasks = [...allTasks, ...newInstances];
        }
      }

      // Clean up repeating event instances similarly
      let allEvents = freshState.events.filter((e) => {
        if (!e.externalId?.startsWith('repeat-')) return true;
        // Remove past event instances
        if (new Date(e.endTime) < now) return false;
        return true;
      });

      // Trim excess future event instances per parent
      const repeatingEventParentIds = new Set(
        allEvents.filter((e) => e.repeatingRule).map((e) => e.id)
      );
      for (const parentId of repeatingEventParentIds) {
        const futureInstances = allEvents
          .filter((e) => e.externalId === `repeat-${parentId}`)
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        if (futureInstances.length > MAX_UPCOMING) {
          const toRemove = new Set(futureInstances.slice(MAX_UPCOMING).map((e) => e.id));
          allEvents = allEvents.filter((e) => !toRemove.has(e.id));
        }
      }

      // Generate repeating event instances (limited to 3 upcoming)
      const repeatingEvents = allEvents.filter((e) => e.repeatingRule);
      for (const parent of repeatingEvents) {
        const newInstances = generateRepeatingEventInstances(parent, allEvents, cutoff, MAX_UPCOMING);
        if (newInstances.length > 0) {
          allEvents = [...allEvents, ...newInstances];
        }
      }

      // Run the scheduler on expanded task/event set
      const result = runScheduler(allTasks, allEvents, freshState.settings);
      set({
        tasks: result,
        events: allEvents,
        ui: { ...get().ui, isRecalculating: false },
      });
      get().persist();
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

  hydrate: () => {
    // Synchronous load from localStorage (fast boot)
    set({
      tasks: loadFromStorage<Task[]>('tasks', []),
      events: loadFromStorage<CalendarEvent[]>('events', []),
      lists: loadFromStorage<TaskList[]>('lists', [defaultList]),
      settings: loadFromStorage<AppSettings>('settings', defaultSettings),
    });

    // Async recovery from IndexedDB if localStorage was empty
    const state = get();
    if (state.tasks.length === 0 && state.events.length === 0) {
      Promise.all([
        loadFromStorageAsync<Task[]>('tasks', []),
        loadFromStorageAsync<CalendarEvent[]>('events', []),
        loadFromStorageAsync<TaskList[]>('lists', [defaultList]),
        loadFromStorageAsync<AppSettings>('settings', defaultSettings),
      ]).then(([tasks, events, lists, settings]) => {
        if (tasks.length > 0 || events.length > 0) {
          console.log('[Muse] Recovered data from IndexedDB');
          set({ tasks, events, lists, settings });
        }
      });
    }
  },

  // ---- Computed Helpers ----
  getTasksByList: (listId) => {
    return get().tasks.filter(
      (t) => t.listId === listId && !t.inInbox && !t.completed
    );
  },

  getInboxTasks: () => {
    return get().tasks.filter((t) => t.inInbox && !t.completed);
  },

  getMissedDeadlineTasks: () => {
    const now = new Date();
    return get().tasks.filter(
      (t) =>
        !t.completed &&
        t.dueDate &&
        new Date(t.dueDate) < now &&
        !t.autoIgnore
    );
  },

  getTaskById: (id) => get().tasks.find((t) => t.id === id),
  getEventById: (id) => get().events.find((e) => e.id === id),
  getListById: (id) => get().lists.find((l) => l.id === id),
}));
