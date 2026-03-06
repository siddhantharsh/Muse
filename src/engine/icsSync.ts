// ============================================================
// Muse — ICS Calendar Import/Export
// Supports standard iCalendar (.ics) format
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { CalendarEvent } from '../types';
import { format, parseISO } from 'date-fns';

function toLocalISO(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

// ============================================================
// Parse ICS file content into CalendarEvent[]
// ============================================================

export function parseICS(icsContent: string): Partial<CalendarEvent>[] {
  const events: Partial<CalendarEvent>[] = [];
  const lines = icsContent.replace(/\r\n /g, '').split(/\r?\n/);

  let inEvent = false;
  let current: Record<string, string> = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
    } else if (line === 'END:VEVENT') {
      inEvent = false;
      const event = icsEntryToEvent(current);
      if (event) events.push(event);
    } else if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        // Handle properties with parameters (e.g., DTSTART;TZID=America/New_York:20240101T090000)
        const keyPart = line.slice(0, colonIdx);
        const value = line.slice(colonIdx + 1);
        const key = keyPart.split(';')[0]; // Strip parameters
        current[key] = value;
      }
    }
  }

  return events;
}

function icsEntryToEvent(entry: Record<string, string>): Partial<CalendarEvent> | null {
  const summary = entry['SUMMARY'] || 'Imported Event';
  const dtStart = entry['DTSTART'];
  const dtEnd = entry['DTEND'];
  const description = entry['DESCRIPTION'] || '';
  const location = entry['LOCATION'] || '';
  const uid = entry['UID'] || uuidv4();

  if (!dtStart) return null;

  const startDate = parseICSDate(dtStart);
  const endDate = dtEnd ? parseICSDate(dtEnd) : new Date(startDate.getTime() + 3600000);
  const allDay = dtStart.length === 8; // YYYYMMDD format = all day

  return {
    id: uuidv4(),
    title: unescapeICS(summary),
    description: unescapeICS(description),
    location: unescapeICS(location),
    startTime: toLocalISO(startDate),
    endTime: toLocalISO(endDate),
    allDay,
    busy: !allDay,
    color: '#5E81AC',
    notes: '',
    repeatingRule: null,
    bufferBefore: 0,
    bufferAfter: 0,
    calendarId: 'external',
    isExternal: true,
    externalId: uid,
  };
}

function parseICSDate(dateStr: string): Date {
  // Formats: 20240101T090000Z, 20240101T090000, 20240101
  const clean = dateStr.replace(/Z$/, '');
  if (clean.length === 8) {
    // All day: YYYYMMDD
    return new Date(
      parseInt(clean.slice(0, 4)),
      parseInt(clean.slice(4, 6)) - 1,
      parseInt(clean.slice(6, 8))
    );
  }
  // DateTime: YYYYMMDDTHHMMSS
  return new Date(
    parseInt(clean.slice(0, 4)),
    parseInt(clean.slice(4, 6)) - 1,
    parseInt(clean.slice(6, 8)),
    parseInt(clean.slice(9, 11)),
    parseInt(clean.slice(11, 13)),
    parseInt(clean.slice(13, 15))
  );
}

function unescapeICS(str: string): string {
  return str
    .replace(/\\n/g, '\n')
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
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function formatICSDate(d: Date): string {
  return format(d, "yyyyMMdd'T'HHmmss");
}

function escapeICS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
