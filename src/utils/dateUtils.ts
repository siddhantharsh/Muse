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
