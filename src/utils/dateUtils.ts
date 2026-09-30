// ============================================================
// Muse — Date Utility Functions
// ============================================================

import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  addMinutes,
  startOfDay,
  endOfDay,
  isSameDay,
  isToday,
  isBefore,
  isAfter,
  isWithinInterval,
  differenceInMinutes,
  differenceInDays,
  parseISO,
  setHours,
  setMinutes,
  getDay,
  eachDayOfInterval,
} from 'date-fns';

export {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  addMinutes,
  startOfDay,
  endOfDay,
  isSameDay,
  isToday,
  isBefore,
  isAfter,
  isWithinInterval,
  differenceInMinutes,
  differenceInDays,
  parseISO,
  setHours,
  setMinutes,
  getDay,
  eachDayOfInterval,
};

export function toISOString(date: Date): string {
  return date.toISOString();
}

export function fromISO(isoString: string): Date {
  return parseISO(isoString);
}

export function formatTime(date: Date, use24h: boolean = true): string {
  return format(date, use24h ? 'HH:mm' : 'h:mm a');
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function formatFullDate(date: Date): string {
  return format(date, 'EEEE, MMMM d, yyyy');
}

export function formatShortDate(date: Date): string {
  return format(date, 'MMM d');
}

export function formatDayHeader(date: Date): string {
  return format(date, 'EEE d');
}

export function getWeekDays(date: Date, weekStartsOn: 0 | 1 = 1): Date[] {
  const start = startOfWeek(date, { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getThreeDays(date: Date): Date[] {
  return Array.from({ length: 3 }, (_, i) => addDays(date, i - 1));
}

export function minutesToTimeStr(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function timeStrToMinutes(str: string): number {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

export function getHourSlots(startHour: number = 0, endHour: number = 24): number[] {
  const slots: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    slots.push(h);
  }
  return slots;
}

export function getMinutePosition(date: Date, startHour: number): number {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return (hours - startHour) * 60 + minutes;
}

export function durationToReadable(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function nowISO(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Every stored timestamp uses one format: local wall-clock time with no
 * zone suffix ("2026-09-30T14:00:00"). parseISO reads that as local time.
 */
export function toLocalISO(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Converts a legacy UTC/offset timestamp ("…Z", "+05:30") to the local
 * format above. Local-format strings pass through unchanged.
 */
export function normalizeISO(value: string): string;
export function normalizeISO(value: string | null): string | null;
export function normalizeISO(value: string | null): string | null {
  if (!value) return value;
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value)) return value;
  const d = parseISO(value);
  return isNaN(d.getTime()) ? value : toLocalISO(d);
}

/** Value for an <input type="datetime-local">, robust to legacy formats. */
export function toDateTimeInputValue(value: string | null): string {
  if (!value) return '';
  const d = parseISO(value);
  return isNaN(d.getTime()) ? '' : format(d, "yyyy-MM-dd'T'HH:mm");
}

/** Parses an <input type="datetime-local"> value into the stored format. */
export function fromDateTimeInputValue(value: string): string | null {
  if (!value) return null;
  const d = parseISO(value);
  return isNaN(d.getTime()) ? null : toLocalISO(d);
}

export function todayISO(): string {
  return formatDate(new Date());
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return isBefore(parseISO(dueDate), new Date());
}

export function daysUntilDue(dueDate: string): number {
  return differenceInDays(parseISO(dueDate), new Date());
}
