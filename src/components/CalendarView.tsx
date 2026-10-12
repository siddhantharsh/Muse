// ============================================================
// Muse — Calendar View (Terminal-style Nord theme)
// ============================================================

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Pin } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  addMinutes,
  isToday,
  isAfter,
  isBefore,
  parseISO,
  differenceInMinutes,
  setHours,
  getISOWeek,
  startOfDay,
} from 'date-fns';
import { ViewMode, CalendarEvent, Task, ScheduledBlock, UrgencyColor } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { getRootScale } from '../utils/viewport';
import { isRepeatingTemplate } from '../utils/taskSelectors';

const HOUR_HEIGHT = 64;
const MIN_BLOCK_HEIGHT = 18;
const SNAP_MINUTES = 15;

/** One item's visible part within a single day column. */
interface Segment {
  key: string;
  kind: 'event' | 'task';
  start: Date; // clamped to the column's day
  end: Date;
  event?: CalendarEvent;
  task?: Task;
  block?: ScheduledBlock;
  lane: number;
  lanes: number;
}

/** Clips [start, end) to the given day; null when they don't intersect. */
function clipToDay(start: Date, end: Date, day: Date): { start: Date; end: Date } | null {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  if (!isBefore(start, dayEnd) || !isAfter(end, dayStart)) return null;
  return {
    start: isAfter(start, dayStart) ? start : dayStart,
    end: isBefore(end, dayEnd) ? end : dayEnd,
  };
}

/** Side-by-side lanes for overlapping items (classic calendar layout). */
function assignLanes(segments: Segment[]): Segment[] {
  const sorted = [...segments].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime()
  );
  const result: Segment[] = [];
  let cluster: Segment[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const s of cluster) result.push({ ...s, lanes });
    cluster = [];
    laneEnds = [];
  };

  for (const seg of sorted) {
    const start = seg.start.getTime();
    if (start >= clusterEnd && cluster.length > 0) flush();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.end.getTime());
    } else {
      laneEnds[lane] = seg.end.getTime();
    }
    cluster.push({ ...seg, lane });
    clusterEnd = Math.max(clusterEnd === -Infinity ? 0 : clusterEnd, seg.end.getTime());
  }
  if (cluster.length > 0) flush();
  return result;
}

export function CalendarView() {
  const {
    ui,
    tasks,
    events,
    settings,
    lists,
    setSelectedDate,
    setViewMode,
    openFloatingModal,
    addTask,
    updateTask,
    updateEvent,
  } = useMuseStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const selectedDate = parseISO(ui.selectedDate);

  const columns = useMemo(() => {
    switch (ui.viewMode) {
      case ViewMode.Day:
        return [selectedDate];
      case ViewMode.ThreeDay:
        return Array.from({ length: 3 }, (_, i) => addDays(selectedDate, i - 1));
      case ViewMode.Week:
      default: {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: settings.weekStartsOn });
        return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.selectedDate, ui.viewMode, settings.weekStartsOn]);

  // Filter tasks by selected list
  const filteredTasks = useMemo(() => {
    if (ui.selectedListId) return tasks.filter((t) => t.listId === ui.selectedListId);
    return tasks;
  }, [tasks, ui.selectedListId]);

  // Timed segments per visible column (events + task blocks), with lanes.
  const segmentsByColumn = useMemo(() => {
    return columns.map((date) => {
      const segs: Segment[] = [];
      for (const event of events) {
        if (event.allDay) continue;
        const clip = clipToDay(parseISO(event.startTime), parseISO(event.endTime), date);
        if (clip) segs.push({ key: `e-${event.id}`, kind: 'event', ...clip, event, lane: 0, lanes: 1 });
      }
      for (const task of filteredTasks) {
        if (task.completed || isRepeatingTemplate(task)) continue;
        for (const block of task.scheduledBlocks) {
          const clip = clipToDay(parseISO(block.startTime), parseISO(block.endTime), date);
          if (clip) segs.push({ key: `t-${block.id}`, kind: 'task', ...clip, task, block, lane: 0, lanes: 1 });
        }
      }
      return assignLanes(segs);
    });
  }, [columns, events, filteredTasks]);

  // Visible hours: the configured day, widened to include anything scheduled
  // outside it (e.g. a 05:00 "Deep work" profile) so nothing is ever hidden.
  const { viewStartHour, viewEndHour } = useMemo(() => {
    let start = settings.dayStartHour;
    let end = settings.dayEndHour;
    columns.forEach((date, i) => {
      const dayStart = startOfDay(date);
      for (const seg of segmentsByColumn[i]) {
        start = Math.min(start, Math.floor(differenceInMinutes(seg.start, dayStart) / 60));
        end = Math.max(end, Math.ceil(differenceInMinutes(seg.end, dayStart) / 60));
      }
    });
    return { viewStartHour: Math.max(0, start), viewEndHour: Math.min(24, Math.max(end, start + 1)) };
  }, [columns, segmentsByColumn, settings.dayStartHour, settings.dayEndHour]);

  const hours = useMemo(
    () => Array.from({ length: viewEndHour - viewStartHour }, (_, i) => viewStartHour + i),
    [viewStartHour, viewEndHour]
  );

  /**
   * Where to scroll: an hour before now while the day is running; once the
   * visible day is over (late evening), the top — tomorrow morning is what
   * matters next, not an empty evening.
   */
  const initialScrollTop = useCallback(() => {
    const hour = new Date().getHours();
    if (hour < viewStartHour || hour >= viewEndHour - 1) return 0;
    return Math.max(0, (hour - 1 - viewStartHour) * HOUR_HEIGHT);
  }, [viewStartHour, viewEndHour]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = (direction: 1 | -1) => {
    const step = ui.viewMode === ViewMode.Week ? 7 : ui.viewMode === ViewMode.ThreeDay ? 3 : 1;
    setSelectedDate(format(addDays(selectedDate, step * direction), 'yyyy-MM-dd'));
  };

  const goToToday = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    scrollRef.current?.scrollTo({ top: initialScrollTop(), behavior: 'smooth' });
  };

  /** Pointer position within a column → snapped wall-clock time on that day. */
  const timeAtPointer = useCallback(
    (date: Date, columnEl: HTMLElement, clientY: number, grabOffsetScreenPx = 0) => {
      const scale = getRootScale();
      const rect = columnEl.getBoundingClientRect();
      const y = (clientY - rect.top - grabOffsetScreenPx) / scale;
      const minutes = Math.max(0, y / HOUR_HEIGHT) * 60 + viewStartHour * 60;
      const snapped = Math.min(24 * 60 - SNAP_MINUTES, Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES);
      const time = startOfDay(date);
      time.setMinutes(snapped);
      return time;
    },
    [viewStartHour]
  );

  const handleColumnDoubleClick = (date: Date, e: React.MouseEvent) => {
    // Ignore double-clicks that land on an existing block.
    if ((e.target as HTMLElement).closest('[data-block]')) return;
    const startTime = timeAtPointer(date, e.currentTarget as HTMLElement, e.clientY);
    const endTime = addMinutes(startTime, settings.defaultTaskDuration);

    const newTask = addTask({
      title: '',
      duration: settings.defaultTaskDuration,
      autoSchedule: false,
      startAfter: toLocalISO(startTime),
      dueDate: null,
      inInbox: false,
      listId: ui.selectedListId ?? undefined,
      scheduledBlocks: [],
    });
    updateTask(newTask.id, {
      scheduledBlocks: [
        {
          id: `${newTask.id}-block`,
          taskId: newTask.id,
          startTime: toLocalISO(startTime),
          endTime: toLocalISO(endTime),
          duration: settings.defaultTaskDuration,
          isManuallyPinned: true,
        },
      ],
    });

    openFloatingModal({ type: 'task', id: newTask.id, x: e.clientX, y: e.clientY });
  };

  const cutoffDate = addWeeks(new Date(), settings.autoSchedulingCutoffWeeks);

  // ---- Drag-and-drop handlers ----
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, date: Date) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      let payload: {
        type: 'task' | 'event';
        id: string;
        blockId?: string;
        durationMinutes: number;
        grabOffsetY?: number;
      };
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }
      const { type, id, blockId, durationMinutes, grabOffsetY } = payload;

      const newStart = timeAtPointer(date, e.currentTarget as HTMLElement, e.clientY, grabOffsetY || 0);
      const newEnd = addMinutes(newStart, durationMinutes);

      if (type === 'task') {
        // Reposition just the dragged occurrence and pin it there — sibling
        // blocks of a split task are left untouched, and the task keeps
        // auto-scheduling its remaining (unpinned) work around this fixed spot.
        const task = useMuseStore.getState().getTaskById(id);
        if (!task) return;
        const newBlock: ScheduledBlock = {
          id: blockId || `${id}-dnd-${Date.now()}`,
          taskId: id,
          startTime: toLocalISO(newStart),
          endTime: toLocalISO(newEnd),
          duration: durationMinutes,
          isManuallyPinned: true,
        };
        const hasExistingBlock = !!blockId && task.scheduledBlocks.some((b) => b.id === blockId);
        const scheduledBlocks = hasExistingBlock
          ? task.scheduledBlocks.map((b) => (b.id === blockId ? newBlock : b))
          : [...task.scheduledBlocks, newBlock];
        updateTask(id, { scheduledBlocks });
      } else {
        updateEvent(id, { startTime: toLocalISO(newStart), endTime: toLocalISO(newEnd) });
      }
    },
    [timeAtPointer, updateTask, updateEvent]
  );

  const openItem = (type: 'task' | 'event', id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    const pos =
      'clientX' in e
        ? { x: e.clientX, y: e.clientY }
        : (() => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            return { x: r.right, y: r.top };
          })();
    openFloatingModal({ type, id, ...pos });
  };

  const nowMinutes = (currentTime.getHours() - viewStartHour) * 60 + currentTime.getMinutes();
  const nowVisible = nowMinutes >= 0 && nowMinutes <= (viewEndHour - viewStartHour) * 60;

  return (
    <div className="h-full flex flex-col font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-nord3/10 bg-nord1">
        <div className="flex items-center gap-2">
          <button onClick={goToToday} className="btn-secondary text-[10px] px-2 py-0.5">
            today
          </button>
          <div className="flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="px-1.5 py-0.5 hover:bg-nord2 transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft size={14} className="text-nord4" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="px-1.5 py-0.5 hover:bg-nord2 transition-colors"
              aria-label="Next"
            >
              <ChevronRight size={14} className="text-nord4" />
            </button>
          </div>
          <h2 className="text-xs font-bold text-nord6 uppercase tracking-wider">
            {format(columns[0], 'MMM yyyy')}
            {settings.showWeekNumbers && (
              <span className="text-nord3 ml-2">w{getISOWeek(columns[0])}</span>
            )}
          </h2>
          {ui.selectedListId && (
            <span className="text-[10px] text-nord8 border border-nord8 px-1.5 py-0.5">
              {lists.find((l) => l.id === ui.selectedListId)?.name || 'list'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="flex border border-nord3/20">
            {[
              { mode: ViewMode.Day, label: 'day' },
              { mode: ViewMode.ThreeDay, label: '3d' },
              { mode: ViewMode.Week, label: 'wk' },
            ].map(({ mode, label }, idx) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  ui.viewMode === mode
                    ? 'bg-nord8 text-nord0'
                    : 'text-nord4 hover:bg-nord2 hover:text-nord6'
                } ${idx > 0 ? 'border-l border-nord3/20' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Day Headers */}
      <div className="flex border-b border-nord3/[0.08] bg-nord0 calendar-header-row">
        <div className="w-14 flex-shrink-0 border-r border-nord3/[0.08]" />
        {columns.map((date, i) => {
          const today = isToday(date);
          return (
            <div
              key={date.toISOString()}
              className={`flex-1 px-1 py-1.5 text-center ${
                i < columns.length - 1 ? 'border-r border-nord3/[0.08]' : ''
              } ${today ? 'bg-nord8/10' : ''}`}
            >
              <div className={`text-[10px] font-bold uppercase tracking-wider ${today ? 'text-nord8' : 'text-nord3'}`}>
                {format(date, 'EEE')}
              </div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  today ? 'text-nord0 bg-nord8 w-6 h-6 flex items-center justify-center mx-auto' : 'text-nord4'
                }`}
              >
                {format(date, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-Day Events */}
      <AllDayRow
        columns={columns}
        events={events}
        onOpen={(id, e) => openItem('event', id, e)}
      />

      {/* Time Grid */}
      <div ref={scrollRef} className="flex-1 calendar-scroll relative" data-tour="calendar">
        <div className="flex" style={{ minHeight: hours.length * HOUR_HEIGHT }}>
          {/* Time Gutter */}
          <div className="w-14 flex-shrink-0 border-r border-nord3/[0.08]">
            {hours.map((hour) => (
              <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
                {/* The first label sits inside the grid so it isn't clipped by the header */}
                <span
                  className={`absolute right-1.5 text-[10px] text-nord3 font-mono ${
                    hour === viewStartHour ? 'top-0.5' : '-top-2'
                  }`}
                >
                  {settings.timeFormat === '24h'
                    ? `${String(hour).padStart(2, '0')}:00`
                    : format(setHours(new Date(), hour), 'ha')}
                </span>
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {columns.map((date, colIdx) => {
            const dayStr = format(date, 'yyyy-MM-dd');
            const isBeyondCutoff = isAfter(date, cutoffDate);
            const today = isToday(date);
            const viewStart = addMinutes(startOfDay(date), viewStartHour * 60);

            return (
              <div
                key={dayStr}
                className={`flex-1 relative ${
                  colIdx < columns.length - 1 ? 'border-r border-nord3/[0.06]' : ''
                } ${isBeyondCutoff ? 'cutoff-stripes' : ''} ${today ? 'bg-nord8/[0.03]' : ''}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, date)}
                onDoubleClick={(e) => handleColumnDoubleClick(date, e)}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-t border-nord3/[0.06] cursor-pointer hover:bg-nord2/30 transition-colors"
                    style={{ height: HOUR_HEIGHT }}
                  >
                    <div className="border-t border-nord3/[0.03]" style={{ height: 0, marginTop: HOUR_HEIGHT / 2 }} />
                  </div>
                ))}

                {/* Now Line */}
                {today && nowVisible && (
                  <div className="now-line" style={{ top: `${nowMinutes * (HOUR_HEIGHT / 60)}px` }} />
                )}

                {segmentsByColumn[colIdx].map((seg) => {
                  const top = differenceInMinutes(seg.start, viewStart) * (HOUR_HEIGHT / 60);
                  const height = Math.max(
                    MIN_BLOCK_HEIGHT,
                    differenceInMinutes(seg.end, seg.start) * (HOUR_HEIGHT / 60)
                  );
                  const width = 100 / seg.lanes;
                  const geometry = {
                    top,
                    height,
                    left: `calc(${seg.lane * width}% + 2px)`,
                    width: `calc(${width}% - 4px)`,
                  };
                  return seg.kind === 'event' && seg.event ? (
                    <EventBlock
                      key={seg.key}
                      event={seg.event}
                      segStart={seg.start}
                      segEnd={seg.end}
                      geometry={geometry}
                      onOpen={(e) => openItem('event', seg.event!.id, e)}
                    />
                  ) : seg.task && seg.block ? (
                    <TaskBlock
                      key={seg.key}
                      block={seg.block}
                      task={seg.task}
                      segStart={seg.start}
                      segEnd={seg.end}
                      geometry={geometry}
                      smartColor={settings.smartColorCoding}
                      onOpen={(e) => openItem('task', seg.task!.id, e)}
                    />
                  ) : null;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// All-Day Events Row
// ============================================================

function AllDayRow({
  columns,
  events,
  onOpen,
}: {
  columns: Date[];
  events: CalendarEvent[];
  onOpen: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  const allDayEvents = events.filter((e) => e.allDay);
  if (allDayEvents.length === 0) return null;

  // All-day events cover [start day, end day) — multi-day ones show on each day.
  const coversDay = (event: CalendarEvent, day: Date) => {
    const start = startOfDay(parseISO(event.startTime));
    const endRaw = parseISO(event.endTime);
    const end = isAfter(endRaw, start) ? endRaw : addDays(start, 1);
    const dayStart = startOfDay(day);
    return !isBefore(dayStart, start) && isBefore(dayStart, end);
  };

  return (
    <div className="flex border-b border-nord3/10 bg-nord0/50 calendar-header-row">
      <div className="w-14 flex-shrink-0 flex items-center justify-end pr-1 border-r border-nord3/10">
        <span className="text-[9px] text-nord3 font-mono">ALL</span>
      </div>
      {columns.map((date, i) => {
        const dayEvents = allDayEvents.filter((e) => coversDay(e, date));
        return (
          <div
            key={date.toISOString()}
            className={`flex-1 min-w-0 ${i < columns.length - 1 ? 'border-r border-nord3/10' : ''} px-0.5 py-0.5 min-h-[24px]`}
          >
            {dayEvents.map((event) => (
              <div
                key={event.id}
                role="button"
                tabIndex={0}
                onClick={(e) => onOpen(event.id, e)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(event.id, e)}
                className="text-[10px] px-1.5 py-0.5 truncate cursor-pointer hover:opacity-80 transition-opacity mb-0.5 font-mono"
                style={{
                  backgroundColor: event.color + '25',
                  color: 'rgb(var(--nord6))',
                  borderLeft: `2px solid ${event.color}`,
                }}
              >
                {event.title}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Blocks
// ============================================================

interface Geometry {
  top: number;
  height: number;
  left: string;
  width: string;
}

function startDrag(
  e: React.DragEvent,
  payload: { type: 'task' | 'event'; id: string; blockId?: string; durationMinutes: number }
) {
  const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  e.dataTransfer.setData(
    'application/json',
    // grabOffsetY is in screen pixels; the drop handler converts it with the root scale.
    JSON.stringify({ ...payload, grabOffsetY: e.clientY - blockRect.top })
  );
  e.dataTransfer.effectAllowed = 'move';
}

function EventBlock({
  event,
  segStart,
  segEnd,
  geometry,
  onOpen,
}: {
  event: CalendarEvent;
  segStart: Date;
  segEnd: Date;
  geometry: Geometry;
  onOpen: (e: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  const fullDuration = differenceInMinutes(parseISO(event.endTime), parseISO(event.startTime));

  return (
    <div
      data-block
      role="button"
      tabIndex={0}
      className="absolute px-1.5 py-0.5 cursor-grab overflow-hidden z-10 hover:z-20 hover:brightness-110 transition-all font-mono active:cursor-grabbing focus:outline focus:outline-1 focus:outline-nord8"
      draggable
      onDragStart={(e) => startDrag(e, { type: 'event', id: event.id, durationMinutes: fullDuration })}
      style={{
        ...geometry,
        top: `${geometry.top}px`,
        height: `${geometry.height}px`,
        backgroundColor: event.color + '20',
        border: `1px solid ${event.color}40`,
        borderLeft: `2px solid ${event.color}`,
        opacity: event.busy ? 1 : 0.75,
      }}
      title={event.busy ? undefined : 'Free — tasks may be scheduled over this'}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(e)}
    >
      <div className="text-[10px] font-bold truncate text-nord6">
        {event.title}
      </div>
      {geometry.height > 28 && (
        <div className="text-[9px] text-nord4 truncate">
          {format(segStart, 'HH:mm')}-{format(segEnd, 'HH:mm')}
        </div>
      )}
      {geometry.height > 42 && event.location && (
        <div className="text-[9px] text-nord3 truncate mt-0.5">@ {event.location}</div>
      )}
    </div>
  );
}

function TaskBlock({
  block,
  task,
  segStart,
  segEnd,
  geometry,
  smartColor,
  onOpen,
}: {
  block: ScheduledBlock;
  task: Task;
  segStart: Date;
  segEnd: Date;
  geometry: Geometry;
  smartColor: boolean;
  onOpen: (e: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  const urgencyClasses = smartColor
    ? {
        [UrgencyColor.Green]: 'urgency-green',
        [UrgencyColor.Orange]: 'urgency-orange',
        [UrgencyColor.Red]: 'urgency-red',
      }[task.urgencyColor]
    : '';
  const progress = task.duration > 0 ? (task.progress / task.duration) * 100 : 0;

  return (
    <div
      data-block
      role="button"
      tabIndex={0}
      className={`absolute px-1.5 py-0.5 cursor-grab overflow-hidden z-10 hover:z-20 hover:brightness-110 transition-all font-mono active:cursor-grabbing focus:outline focus:outline-1 focus:outline-nord8 ${urgencyClasses}`}
      draggable
      onDragStart={(e) =>
        startDrag(e, { type: 'task', id: task.id, blockId: block.id, durationMinutes: block.duration })
      }
      style={{
        ...geometry,
        top: `${geometry.top}px`,
        height: `${geometry.height}px`,
        ...(smartColor
          ? {}
          : {
              backgroundColor: task.color + '20',
              border: `1px solid ${task.color}40`,
              borderLeft: `2px solid ${task.color}`,
            }),
      }}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(e)}
    >
      <div className="flex items-center gap-1">
        {block.isManuallyPinned && (
          <Pin size={8} className="text-nord4 flex-shrink-0" aria-label="Pinned" />
        )}
        {task.splittable && <span className="text-[8px] text-nord13">◧</span>}
        <div className="text-[10px] font-bold truncate text-nord6 flex-1">{task.title || 'untitled'}</div>
      </div>
      {geometry.height > 28 && (
        <div className="text-[9px] text-nord4 truncate">
          {format(segStart, 'HH:mm')}-{format(segEnd, 'HH:mm')}
          {task.splittable && ' [split]'}
        </div>
      )}
      {geometry.height > 38 && progress > 0 && (
        <div className="mt-0.5 w-full h-1 bg-nord3/50 overflow-hidden">
          <div className="progress-bar h-full" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
