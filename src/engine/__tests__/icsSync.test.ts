// ============================================================
// ICS import/export tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseICS, exportICS } from '../icsSync';
import { RepeatFrequency } from '../../types';
import { makeEvent } from '../../test/factories';

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;

describe('parseICS', () => {
  it('converts TZID times to the real instant', () => {
    const [event] = parseICS(
      wrap('BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Standup\r\nDTSTART;TZID=America/New_York:20260115T090000\r\nDTEND;TZID=America/New_York:20260115T093000\r\nEND:VEVENT')
    );
    // 09:00 in New York (EST, UTC−5) is 14:00 UTC.
    expect(new Date(event.startTime!).getTime()).toBe(Date.UTC(2026, 0, 15, 14, 0, 0));
    expect(new Date(event.endTime!).getTime()).toBe(Date.UTC(2026, 0, 15, 14, 30, 0));
  });

  it('reads UTC times', () => {
    const [event] = parseICS(
      wrap('BEGIN:VEVENT\r\nUID:b\r\nDTSTART:20260115T090000Z\r\nDTEND:20260115T100000Z\r\nEND:VEVENT')
    );
    expect(new Date(event.startTime!).getTime()).toBe(Date.UTC(2026, 0, 15, 9, 0, 0));
  });

  it('does not let an alarm’s description overwrite the event’s', () => {
    const [event] = parseICS(
      wrap(
        'BEGIN:VEVENT\r\nUID:c\r\nDTSTART:20260115T090000Z\r\nDESCRIPTION:Agenda\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\nEND:VEVENT'
      )
    );
    expect(event.description).toBe('Agenda');
  });

  it('unfolds long lines (CRLF and LF)', () => {
    const [crlf] = parseICS(wrap('BEGIN:VEVENT\r\nUID:d\r\nDTSTART:20260115T090000Z\r\nSUMMARY:Quarterly\r\n  planning\r\nEND:VEVENT'));
    const [lf] = parseICS('BEGIN:VEVENT\nUID:e\nDTSTART:20260115T090000Z\nSUMMARY:Quarterly\n\tplanning\nEND:VEVENT\n');
    expect(crlf.title).toBe('Quarterly planning');
    expect(lf.title).toBe('Quarterlyplanning');
  });

  it('maps weekly BYDAY rules and rejects ones it can’t represent', () => {
    const [weekly, nthMonday] = parseICS(
      wrap(
        [
          'BEGIN:VEVENT\r\nUID:f\r\nDTSTART:20260115T090000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6\r\nEND:VEVENT',
          'BEGIN:VEVENT\r\nUID:g\r\nDTSTART:20260115T090000Z\r\nRRULE:FREQ=MONTHLY;BYDAY=1MO\r\nEND:VEVENT',
        ].join('\r\n')
      )
    );
    expect(weekly.repeatingRule).toMatchObject({
      frequency: RepeatFrequency.Weekly,
      interval: 2,
      daysOfWeek: [1, 3],
      count: 6,
    });
    expect(nthMonday.repeatingRule).toBeNull();
  });

  it('skips cancelled events and marks transparent ones as free', () => {
    const events = parseICS(
      wrap(
        [
          'BEGIN:VEVENT\r\nUID:h\r\nDTSTART:20260115T090000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT',
          'BEGIN:VEVENT\r\nUID:i\r\nDTSTART:20260115T090000Z\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT',
        ].join('\r\n')
      )
    );
    expect(events).toHaveLength(1);
    expect(events[0].busy).toBe(false);
  });

  it('turns a modified occurrence into its own event and excludes that date from the series', () => {
    const events = parseICS(
      wrap(
        [
          'BEGIN:VEVENT\r\nUID:j\r\nDTSTART:20260115T090000\r\nDTEND:20260115T100000\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT',
          'BEGIN:VEVENT\r\nUID:j\r\nRECURRENCE-ID:20260117T090000\r\nDTSTART:20260117T110000\r\nDTEND:20260117T120000\r\nEND:VEVENT',
        ].join('\r\n')
      )
    );
    const master = events.find((e) => e.externalId === 'j')!;
    const override = events.find((e) => e.externalId !== 'j')!;
    expect(master.repeatingRule?.exceptions).toEqual(['2026-01-17']);
    expect(override.startTime).toBe('2026-01-17T11:00:00');
  });

  it('gives all-day events a whole-day span', () => {
    const [event] = parseICS(wrap('BEGIN:VEVENT\r\nUID:k\r\nDTSTART;VALUE=DATE:20260115\r\nEND:VEVENT'));
    expect(event.allDay).toBe(true);
    expect(event.startTime).toBe('2026-01-15T00:00:00');
    expect(event.endTime).toBe('2026-01-16T00:00:00');
  });
});

describe('exportICS', () => {
  it('round-trips event times through UTC', () => {
    const event = makeEvent({ id: 'x', title: 'Review, notes; etc', startTime: '2026-03-10T14:00:00', endTime: '2026-03-10T15:30:00' });
    const [parsed] = parseICS(exportICS([event]));
    expect(parsed.startTime).toBe(event.startTime);
    expect(parsed.endTime).toBe(event.endTime);
    expect(parsed.title).toBe(event.title);
  });
});
