// ============================================================
// Muse — Complete Type System
// Based on FlowSavvy PRD: Events, Tasks, Lists, Scheduling
// ============================================================

// ---- Enums ----

export enum Priority {
  None = 'none',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum DistributionModel {
  Balanced = 'balanced',
  FrontLoad = 'front-load',
}

export enum UrgencyColor {
  Green = 'green',   // Standard scheduling
  Orange = 'orange', // Dangerously close to deadline
  Red = 'red',       // Overdue or missing deadline
}

export enum ViewMode {
  Day = 'day',
  ThreeDay = '3day',
  Week = 'week',
}

export enum RepeatFrequency {
  Daily = 'daily',
  Weekly = 'weekly',
  Biweekly = 'biweekly',
  Monthly = 'monthly',
  Yearly = 'yearly',
  Custom = 'custom',
}

// ---- Scheduling Hours (Temporal Masks) ----

export interface TimeBlock {
  start: string; // HH:mm format
  end: string;   // HH:mm format
}

export interface DaySchedule {
  enabled: boolean;
  blocks: TimeBlock[];
}

export interface SchedulingHoursProfile {
  id: string;
  name: string;
  color: string;
  // 0=Sunday, 1=Monday, ... 6=Saturday
  weeklySchedule: Record<number, DaySchedule>;
  // Date overrides in ISO format (YYYY-MM-DD)
  dateOverrides: Record<string, DaySchedule>;
}

// ---- Repeating Rule ----

export interface RepeatingRule {
  frequency: RepeatFrequency;
  interval: number;       // e.g., every 2 weeks
  daysOfWeek?: number[];  // 0-6 for weekly
  dayOfMonth?: number;    // for monthly
  endDate?: string;       // ISO date, optional
  count?: number;         // max occurrences
}

// ---- Event Schema (Rigid Temporal Anchors) ----

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;      // ISO datetime
  endTime: string;        // ISO datetime
  allDay: boolean;
  busy: boolean;          // true = blocks scheduling, false = ghost
  color: string;          // hex
  location: string;
  notes: string;
  repeatingRule: RepeatingRule | null;
  bufferBefore: number;   // minutes
  bufferAfter: number;    // minutes
  calendarId: string;     // which calendar it belongs to
  isExternal: boolean;    // synced from external source
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Task Schema (Fluid Algorithmic Entities) ----

export interface Task {
  id: string;
  title: string;
  description: string;
  listId: string;         // which list it belongs to
  autoSchedule: boolean;  // engine controls placement
  duration: number;       // total minutes required
  progress: number;       // minutes completed
  dueDate: string | null; // ISO datetime, absolute deadline
  startAfter: string | null; // ISO datetime, earliest start
  schedulingHoursId: string | null; // link to temporal mask
  priority: Priority;
  splittable: boolean;
  minBlockDuration: number; // minutes, anti-fragmentation
  completed: boolean;
  completedAt: string | null;
  color: string;          // hex or inherited from list
  // Dependencies
  dependsOn: string[];    // task IDs that must complete first
  // Repeating
  repeatingRule: RepeatingRule | null;
  autoIgnore: boolean;    // auto-ignore missed deadlines for repeating
  isRepeatingInstance: boolean;
  parentRepeatingId: string | null;
  // Scheduling result
  scheduledBlocks: ScheduledBlock[];
  urgencyColor: UrgencyColor;
  // Inbox state
  inInbox: boolean;
  // Metadata
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Scheduled Block (Result of Algorithm) ----

export interface ScheduledBlock {
  id: string;
  taskId: string;
  startTime: string;  // ISO datetime
  endTime: string;    // ISO datetime
  duration: number;   // minutes
  isManuallyPinned: boolean;
}

// ---- List (Organizational Hierarchy) ----

export interface TaskList {
  id: string;
  name: string;
  color: string;
  icon: string;           // emoji or icon id
  defaultSchedulingHoursId: string | null;
  defaultCalendarId: string | null;
  sortOrder: number;
  isDefault: boolean;     // the "Muse Calendar" default
  createdAt: string;
  updatedAt: string;
}

// ---- Calendar (Internal / External) ----

export interface Calendar {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;     // "Muse Calendar" internal fallback
  isExternal: boolean;
  externalProvider?: 'google' | 'outlook' | 'icloud';
  externalAccountId?: string;
  syncInbound: boolean;
  syncOutbound: boolean;
  createdAt: string;
}

// ---- App Settings ----

export interface AppSettings {
  distributionModel: DistributionModel;
  autoSchedulingCutoffWeeks: number; // default 8, max 12
  defaultTaskDuration: number;       // minutes
  defaultSplittable: boolean;
  defaultMinBlockDuration: number;
  defaultAutoSchedule: boolean;
  weekStartsOn: 0 | 1;              // 0=Sunday, 1=Monday
  timeFormat: '12h' | '24h';
  showWeekNumbers: boolean;
  smartColorCoding: boolean;         // green/orange/red urgency
  // Notification settings
  notificationsEnabled: boolean;
  notifyMinutesBefore: number;
  // Theme
  theme: 'dark' | 'light';
  // View
  defaultView: ViewMode;
  dayStartHour: number;              // 0-23
  dayEndHour: number;                // 0-23
  // Scheduling hours
  schedulingHoursProfiles: SchedulingHoursProfile[];
}

// ---- UI State ----

export interface FloatingModal {
  type: 'task' | 'event';
  id: string;
  x: number;
  y: number;
}

export interface UIState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  activeView: 'calendar' | 'inbox' | 'missed-deadlines' | 'settings';
  selectedListId: string | null;
  selectedDate: string;           // ISO date
  viewMode: ViewMode;
  floatingModal: FloatingModal | null;
  settingsOpen: boolean;
  multiSelectIds: string[];
  multiSelectMode: boolean;
  isRecalculating: boolean;
  discardChangesModal: boolean;
  commandPaletteOpen: boolean;
  searchQuery: string;
}

// ---- Utility Types ----

export interface TimeSlot {
  start: Date;
  end: Date;
  duration: number; // minutes
}

export interface DayColumn {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isPast: boolean;
  isBeyondCutoff: boolean;
  events: CalendarEvent[];
  scheduledBlocks: (ScheduledBlock & { task: Task })[];
}

export type CreateTaskInput = Omit<Task, 'id' | 'scheduledBlocks' | 'urgencyColor' | 'completed' | 'completedAt' | 'createdAt' | 'updatedAt'>;
export type CreateEventInput = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>;
