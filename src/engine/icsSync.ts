// ============================================================
// Muse — ICS Calendar Import/Export
// Supports the standard iCalendar (.ics) format as exported by
// Google Calendar, Outlook and Apple Calendar.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { CalendarEvent, RepeatingRule, RepeatFrequency } from '../types';
import { format, parseISO } from 'date-fns';

function toLocalISO(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

interface IcsProperty {
  value: string;
  params: Record<string, string>;
}

type IcsEntry = Record<string, IcsProperty[]>;

// ============================================================
// Parse ICS file content into CalendarEvent[]
// ============================================================

export function parseICS(icsContent: string): Partial<CalendarEvent>[] {
  // Unfold continuation lines (RFC 5545 §3.1): a line starting with a space
  // or tab continues the previous one — with CRLF or bare LF endings.
  const lines = icsContent.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

  const entries: IcsEntry[] = [];
  let current: IcsEntry | null = null;
  // Depth inside nested components (VALARM etc.) within a VEVENT; their
  // properties (e.g. an alarm's DESCRIPTION) must not leak into the event.
  let nested = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line === 'BEGIN:VEVENT') {
      current = {};
      nested = 0;
    } else if (line === 'END:VEVENT') {
      if (current) entries.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith('BEGIN:')) nested++;
      else if (line.startsWith('END:')) nested = Math.max(0, nested - 1);
      else if (nested === 0) {
        const colonIdx = line.indexOf(':');
        if (colonIdx <= 0) continue;
        const [name, ...paramParts] = line.slice(0, colonIdx).split(';');
        const params: Record<string, string> = {};
        for (const part of paramParts) {
          const eq = part.indexOf('=');
          if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
        }
        const key = name.toUpperCase();
        (current[key] ??= []).push({ value: line.slice(colonIdx + 1), params });
      }
    }
  }

  const events: Partial<CalendarEvent>[] = [];
  const masterByUid = new Map<string, Partial<CalendarEvent>>();
  const overriddenDays = new Map<string, string[]>();

  for (const entry of entries) {
    const event = icsEntryToEvent(entry);
    if (!event) continue;
    const uid = first(entry, 'UID')?.value;
    const recurrenceId = first(entry, 'RECURRENCE-ID');
    if (recurrenceId && uid) {
      // A modified single occurrence of a recurring event: import it as its
      // own event and exclude that date from the master's series.
      const recurrenceDate = parseICSDate(recurrenceId);
      if (!isNaN(recurrenceDate.getTime())) {
        const day = format(recurrenceDate, 'yyyy-MM-dd');
        overriddenDays.set(uid, [...(overriddenDays.get(uid) ?? []), day]);
      }
      event.externalId = `${uid}#${recurrenceId.value}`;
    } else if (uid) {
      masterByUid.set(uid, event);
    }
    events.push(event);
  }

  for (const [uid, days] of overriddenDays) {
    const master = masterByUid.get(uid);
    if (master?.repeatingRule) {
      master.repeatingRule = {
        ...master.repeatingRule,
        exceptions: [...new Set([...(master.repeatingRule.exceptions ?? []), ...days])].sort(),
      };
    }
  }

  return events;
}

function first(entry: IcsEntry, key: string): IcsProperty | undefined {
  return entry[key]?.[0];
}

function icsEntryToEvent(entry: IcsEntry): Partial<CalendarEvent> | null {
  const dtStart = first(entry, 'DTSTART');
  if (!dtStart) return null;
  // Cancelled events shouldn't block time.
  if (first(entry, 'STATUS')?.value.toUpperCase() === 'CANCELLED') return null;

  const allDay = dtStart.params.VALUE === 'DATE' || /^\d{8}$/.test(dtStart.value);
  const startDate = parseICSDate(dtStart);
  if (isNaN(startDate.getTime())) return null;

  const dtEnd = first(entry, 'DTEND');
  let endDate = dtEnd ? parseICSDate(dtEnd) : null;
  if (!endDate || isNaN(endDate.getTime()) || endDate <= startDate) {
    const duration = parseDuration(first(entry, 'DURATION')?.value);
    endDate = new Date(startDate.getTime() + (duration ?? (allDay ? 24 * 60 : 60)) * 60_000);
  }

  // TRANSP:TRANSPARENT means "show as free".
  const transparent = first(entry, 'TRANSP')?.value.toUpperCase() === 'TRANSPARENT';

  return {
    id: uuidv4(),
    title: unescapeICS(first(entry, 'SUMMARY')?.value || 'Imported Event'),
    description: unescapeICS(first(entry, 'DESCRIPTION')?.value || ''),
    location: unescapeICS(first(entry, 'LOCATION')?.value || ''),
    startTime: toLocalISO(startDate),
    endTime: toLocalISO(endDate),
    allDay,
    busy: !allDay && !transparent,
    color: '#cba6f7',
    notes: '',
    repeatingRule: parseRRule(first(entry, 'RRULE')?.value, entry['EXDATE'] ?? []),
    bufferBefore: 0,
    bufferAfter: 0,
    calendarId: 'external',
    isExternal: true,
    externalId: first(entry, 'UID')?.value || uuidv4(),
  };
}

/** ISO-8601 duration like PT1H30M or P1D → minutes. */
function parseDuration(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return null;
  const [, w, d, h, min] = m.map((x) => Number(x || 0));
  return w * 7 * 1440 + d * 1440 + h * 60 + min;
}

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * Maps the RRULE subset Muse can represent exactly. Anything else (e.g.
 * "first Monday of the month") imports as a single event rather than
 * repeating on the wrong dates.
 */
function parseRRule(value: string | undefined, exdates: IcsProperty[]): RepeatingRule | null {
  if (!value) return null;
  const parts = Object.fromEntries(
    value.split(';').map((p) => {
      const [k, v] = p.split('=');
      return [k.toUpperCase(), v ?? ''];
    })
  );

  const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  const rule: RepeatingRule = { frequency: RepeatFrequency.Daily, interval };

  switch (parts.FREQ) {
    case 'DAILY':
      rule.frequency = RepeatFrequency.Daily;
      break;
    case 'WEEKLY': {
      rule.frequency = RepeatFrequency.Weekly;
      if (parts.BYDAY) {
        const days = parts.BYDAY.split(',').map((d) => BYDAY[d.trim()]);
        if (days.some((d) => d === undefined)) return null;
        rule.daysOfWeek = days;
      }
      break;
    }
    case 'MONTHLY':
      if (parts.BYDAY || parts.BYSETPOS) return null;
      rule.frequency = RepeatFrequency.Monthly;
      if (parts.BYMONTHDAY) {
        const day = Number(parts.BYMONTHDAY);
        if (!Number.isInteger(day) || day < 1 || day > 31) return null;
        rule.dayOfMonth = day;
      }
      break;
    case 'YEARLY':
      if (parts.BYDAY || parts.BYSETPOS) return null;
      rule.frequency = RepeatFrequency.Yearly;
      break;
    default:
      return null;
  }

  if (parts.COUNT) rule.count = Math.max(1, Number(parts.COUNT) || 1);
  if (parts.UNTIL) {
    const until = parseICSDate({ value: parts.UNTIL, params: {} });
    if (!isNaN(until.getTime())) rule.endDate = format(until, 'yyyy-MM-dd');
  }

  const exceptions = exdates
    .flatMap((p) => p.value.split(',').map((v) => parseICSDate({ value: v, params: p.params })))
    .filter((d) => !isNaN(d.getTime()))
    .map((d) => format(d, 'yyyy-MM-dd'));
  if (exceptions.length > 0) rule.exceptions = [...new Set(exceptions)].sort();

  return rule;
}

/** Formats: 20240101T090000Z (UTC), 20240101T090000 (+TZID or floating), 20240101 (date). */
function parseICSDate(prop: IcsProperty): Date {
  const raw = prop.value.trim();
  const isUTC = raw.endsWith('Z');
  const clean = raw.replace(/Z$/, '');
  const year = parseInt(clean.slice(0, 4));
  const month = parseInt(clean.slice(4, 6)) - 1;
  const day = parseInt(clean.slice(6, 8));

  if (clean.length === 8) return new Date(year, month, day);

  const hour = parseInt(clean.slice(9, 11)) || 0;
  const min = parseInt(clean.slice(11, 13)) || 0;
  const sec = parseInt(clean.slice(13, 15)) || 0;

  if (isUTC) return new Date(Date.UTC(year, month, day, hour, min, sec));
  if (prop.params.TZID) {
    const zoned = zonedTimeToDate(year, month, day, hour, min, sec, prop.params.TZID);
    if (zoned) return zoned;
  }
  // Floating time — the same wall-clock time everywhere.
  return new Date(year, month, day, hour, min, sec);
}

/** Offset (ms) of a named IANA time zone from UTC at a given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  const wallAsUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return wallAsUTC - instant.getTime();
}

/**
 * Wall-clock time in `timeZone` → the real instant. Returns null for zone
 * names the runtime doesn't know (e.g. Windows names like "Eastern Standard
 * Time"), in which case the caller treats the time as local.
 */
function zonedTimeToDate(
  y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string
): Date | null {
  try {
    const wallAsUTC = Date.UTC(y, mo, d, h, mi, s);
    const firstGuess = wallAsUTC - zoneOffsetMs(new Date(wallAsUTC), timeZone);
    // Re-check at the guessed instant to land correctly across DST changes.
    return new Date(wallAsUTC - zoneOffsetMs(new Date(firstGuess), timeZone));
  } catch {
    return null;
  }
}

function unescapeICS(str: string): string {
  return str
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// ============================================================
// Export CalendarEvent[] to ICS format
// ============================================================

export function exportICS(events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Muse Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    const start = parseISO(event.startTime);
    const end = parseISO(event.endTime);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.externalId || event.id}@muse`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${format(start, 'yyyyMMdd')}`);
      lines.push(`DTEND;VALUE=DATE:${format(end, 'yyyyMMdd')}`);
    } else {
      lines.push(`DTSTART:${formatICSDate(start)}`);
      lines.push(`DTEND:${formatICSDate(end)}`);
    }

    lines.push(`SUMMARY:${escapeICS(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeICS(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeICS(event.location)}`);
    if (!event.busy) lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** UTC timestamps export unambiguously to any calendar app. */
function formatICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
