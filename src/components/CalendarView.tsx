// ============================================================
// Muse — Calendar View (Terminal-style Nord theme)
// ============================================================

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  addMinutes,
  isSameDay,
  isToday,
  isAfter,
  parseISO,
  differenceInMinutes,
  setHours,
  getISOWeek,
} from 'date-fns';
import { ViewMode, CalendarEvent, Task, ScheduledBlock, UrgencyColor } from '../types';

const HOUR_HEIGHT = 64;
const MIN_BLOCK_HEIGHT = 18;

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

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = (now.getHours() - 1) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, scrollTo);
    }
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
        const weekStart = startOfWeek(selectedDate, {
          weekStartsOn: settings.weekStartsOn,
        });
        return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      }
    }
  }, [ui.selectedDate, ui.viewMode, settings.weekStartsOn]);

  const hours = useMemo(() => {
    const slots: number[] = [];
    for (let h = settings.dayStartHour; h <= settings.dayEndHour; h++) {
      slots.push(h);
    }
    return slots;
  }, [settings.dayStartHour, settings.dayEndHour]);

  // Filter tasks by selected list
  const filteredTasks = useMemo(() => {
    if (ui.selectedListId) {
      return tasks.filter((t) => t.listId === ui.selectedListId);
    }
    return tasks;
  }, [tasks, ui.selectedListId]);

  const navigateBack = () => {
    const offset = ui.viewMode === ViewMode.Week ? -7 : ui.viewMode === ViewMode.ThreeDay ? -3 : -1;
    setSelectedDate(format(addDays(selectedDate, offset), 'yyyy-MM-dd'));
  };

  const navigateForward = () => {
    const offset = ui.viewMode === ViewMode.Week ? 7 : ui.viewMode === ViewMode.ThreeDay ? 3 : 1;
    setSelectedDate(format(addDays(selectedDate, offset), 'yyyy-MM-dd'));
  };

  const goToToday = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = (now.getHours() - 1) * HOUR_HEIGHT;
      scrollRef.current.scrollTo({ top: Math.max(0, scrollTo), behavior: 'smooth' });
    }
  };

  const handleTimeSlotClick = (date: Date, hour: number, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const yOffset = e.clientY - rect.top;
    const minuteOffset = Math.floor((yOffset / HOUR_HEIGHT) * 60);
    const roundedMinutes = Math.round(minuteOffset / 15) * 15;

    const startTime = new Date(date);
    startTime.setHours(hour, roundedMinutes, 0, 0);
    const endTime = addMinutes(startTime, settings.defaultTaskDuration);

    // Use local ISO format (no timezone shift)
    const toLocalISO = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss");

    const newTask = addTask({
      title: '',
      duration: settings.defaultTaskDuration,
      autoSchedule: false,
      startAfter: toLocalISO(startTime),
      dueDate: null,
      inInbox: false,
    });

    useMuseStore.getState().updateTask(newTask.id, {
      scheduledBlocks: [{
        id: newTask.id + '-block',
        taskId: newTask.id,
        startTime: toLocalISO(startTime),
        endTime: toLocalISO(endTime),
        duration: settings.defaultTaskDuration,
        isManuallyPinned: true,
      }],
    });

    openFloatingModal({
      type: 'task',
      id: newTask.id,
      x: Math.min(e.clientX, window.innerWidth - 400),
      y: Math.min(e.clientY, window.innerHeight - 500),
    });
  };

  const cutoffDate = addWeeks(new Date(), settings.autoSchedulingCutoffWeeks);

  // ---- Drag-and-drop handlers ----
  const toLocalISO = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    const { type, id, durationMinutes, grabOffsetY } = JSON.parse(data) as {
      type: 'task' | 'event';
      id: string;
      durationMinutes: number;
      grabOffsetY?: number;
    };

    // Calculate time from Y position relative to column, accounting for grab offset
    const col = (e.currentTarget as HTMLElement);
    const rect = col.getBoundingClientRect();
    const yOffset = e.clientY - rect.top - (grabOffsetY || 0);
    const totalMinutes = Math.max(0, (yOffset / HOUR_HEIGHT) * 60) + settings.dayStartHour * 60;
    const snappedMinutes = Math.round(totalMinutes / 15) * 15;
    const hour = Math.floor(snappedMinutes / 60);
    const min = snappedMinutes % 60;

    const newStart = new Date(date);
    newStart.setHours(hour, min, 0, 0);
    const newEnd = addMinutes(newStart, durationMinutes);

    if (type === 'task') {
      updateTask(id, {
        autoSchedule: false,
        scheduledBlocks: [{
          id: id + '-dnd-block',
          taskId: id,
          startTime: toLocalISO(newStart),
          endTime: toLocalISO(newEnd),
          duration: durationMinutes,
          isManuallyPinned: true,
        }],
      });
    } else {
      updateEvent(id, {
        startTime: toLocalISO(newStart),
        endTime: toLocalISO(newEnd),
      });
    }
  }, [settings.dayStartHour, updateTask, updateEvent]);

  return (
    <div className="h-full flex flex-col font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-nord3/10 bg-nord1">
        <div className="flex items-center gap-2">
          <button onClick={goToToday} className="btn-secondary text-[10px] px-2 py-0.5">
            today
          </button>
          <div className="flex items-center">
            <button onClick={navigateBack} className="px-1.5 py-0.5 hover:bg-nord2 transition-colors">
              <ChevronLeft size={14} className="text-nord4" />
            </button>
            <button onClick={navigateForward} className="px-1.5 py-0.5 hover:bg-nord2 transition-colors">
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
              {lists.find(l => l.id === ui.selectedListId)?.name || 'list'}
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
                  today
                    ? 'text-nord0 bg-nord8 w-6 h-6 flex items-center justify-center mx-auto'
                    : 'text-nord4'
                }`}
              >
                {format(date, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-Day Events */}
      <AllDayRow columns={columns} events={events} />

      {/* Time Grid */}
      <div ref={scrollRef} className="flex-1 calendar-scroll relative">
        <div className="flex" style={{ minHeight: hours.length * HOUR_HEIGHT }}>
          {/* Time Gutter */}
          <div className="w-14 flex-shrink-0 border-r border-nord3/[0.08]">
            {hours.map((hour) => (
              <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute -top-2 right-1.5 text-[10px] text-nord3 font-mono">
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

            const dayEvents = events.filter((ev) => {
              if (ev.allDay) return false;
              return isSameDay(parseISO(ev.startTime), date);
            });

            const dayBlocks: (ScheduledBlock & { task: Task })[] = [];
            for (const task of filteredTasks) {
              if (task.completed) continue;
              for (const block of task.scheduledBlocks) {
                if (isSameDay(parseISO(block.startTime), date)) {
                  dayBlocks.push({ ...block, task });
                }
              }
            }

            return (
              <div
                key={dayStr}
                className={`flex-1 relative ${
                  colIdx < columns.length - 1 ? 'border-r border-nord3/[0.06]' : ''
                } ${isBeyondCutoff ? 'cutoff-stripes' : ''} ${today ? 'bg-nord8/[0.03]' : ''}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, date)}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-t border-nord3/[0.06] cursor-pointer hover:bg-nord2/30 transition-colors"
                    style={{ height: HOUR_HEIGHT }}
                    onDoubleClick={(e) => handleTimeSlotClick(date, hour, e)}
                  >
                    <div className="border-t border-nord3/[0.03]" style={{ height: 0, marginTop: HOUR_HEIGHT / 2 }} />
                  </div>
                ))}

                {/* Now Line */}
                {today && (
                  <div
                    className="now-line"
                    style={{
                      top: `${
                        ((currentTime.getHours() - settings.dayStartHour) * 60 +
                          currentTime.getMinutes()) *
                        (HOUR_HEIGHT / 60)
                      }px`,
                    }}
                  />
                )}

                {/* Events */}
                {dayEvents.map((event) => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    dayStartHour={settings.dayStartHour}
                    onClick={(e) => {
                      openFloatingModal({
                        type: 'event',
                        id: event.id,
                        x: Math.min(e.clientX, window.innerWidth - 400),
                        y: Math.min(e.clientY, window.innerHeight - 500),
                      });
                    }}
                  />
                ))}

                {/* Task Blocks */}
                {dayBlocks.map((block) => (
                  <TaskBlock
                    key={block.id}
                    block={block}
                    task={block.task}
                    dayStartHour={settings.dayStartHour}
                    smartColor={settings.smartColorCoding}
                    onClick={(e) => {
                      openFloatingModal({
                        type: 'task',
                        id: block.task.id,
                        x: Math.min(e.clientX, window.innerWidth - 400),
                        y: Math.min(e.clientY, window.innerHeight - 500),
                      });
                    }}
                  />
                ))}
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

function AllDayRow({ columns, events }: { columns: Date[]; events: CalendarEvent[] }) {
  const allDayEvents = events.filter((e) => e.allDay);
  if (allDayEvents.length === 0) return null;

  return (
    <div className="flex border-b border-nord3/10 bg-nord0/50 calendar-header-row">
      <div className="w-14 flex-shrink-0 flex items-center justify-end pr-1 border-r border-nord3/10">
        <span className="text-[9px] text-nord3 font-mono">ALL</span>
      </div>
      {columns.map((date, i) => {
        const dayEvents = allDayEvents.filter((e) => isSameDay(parseISO(e.startTime), date));
        return (
          <div
            key={date.toISOString()}
            className={`flex-1 ${i < columns.length - 1 ? 'border-r border-nord3/10' : ''} px-0.5 py-0.5 min-h-[24px]`}
          >
            {dayEvents.map((event) => (
              <div
                key={event.id}
                className="text-[10px] px-1.5 py-0.5 truncate cursor-pointer hover:opacity-80 transition-opacity mb-0.5 font-mono"
                style={{
                  backgroundColor: event.color + '25',
                  color: event.color,
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
// Event Block
// ============================================================

function EventBlock({
  event,
  dayStartHour,
  onClick,
}: {
  event: CalendarEvent;
  dayStartHour: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);
  const startMinute = (start.getHours() - dayStartHour) * 60 + start.getMinutes();
  const duration = differenceInMinutes(end, start);
  const top = startMinute * (HOUR_HEIGHT / 60);
  const height = Math.max(MIN_BLOCK_HEIGHT, duration * (HOUR_HEIGHT / 60));

  return (
    <div
      className="absolute left-0.5 right-0.5 px-1.5 py-0.5 cursor-grab overflow-hidden z-10 hover:z-20 hover:brightness-110 transition-all font-mono active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const grabOffsetY = e.clientY - blockRect.top;
        e.dataTransfer.setData('application/json', JSON.stringify({
          type: 'event',
          id: event.id,
          durationMinutes: duration,
          grabOffsetY,
        }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: event.color + '20',
        borderLeft: `2px solid ${event.color}`,
        border: `1px solid ${event.color}40`,
        borderLeftWidth: '2px',
      }}
      onClick={onClick}
    >
      <div className="text-[10px] font-bold truncate" style={{ color: event.color }}>
        {event.title}
      </div>
      {height > 28 && (
        <div className="text-[9px] text-nord4 truncate">
          {format(start, 'HH:mm')}-{format(end, 'HH:mm')}
        </div>
      )}
      {height > 42 && event.location && (
        <div className="text-[9px] text-nord3 truncate mt-0.5">@ {event.location}</div>
      )}
    </div>
  );
}

// ============================================================
// Task Block
// ============================================================

function TaskBlock({
  block,
  task,
  dayStartHour,
  smartColor,
  onClick,
}: {
  block: ScheduledBlock;
  task: Task;
  dayStartHour: number;
  smartColor: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const start = parseISO(block.startTime);
  const end = parseISO(block.endTime);
  const startMinute = (start.getHours() - dayStartHour) * 60 + start.getMinutes();
  const duration = differenceInMinutes(end, start);
  const top = startMinute * (HOUR_HEIGHT / 60);
  const height = Math.max(MIN_BLOCK_HEIGHT, duration * (HOUR_HEIGHT / 60));

  const urgencyClasses = smartColor
    ? { [UrgencyColor.Green]: 'urgency-green', [UrgencyColor.Orange]: 'urgency-orange', [UrgencyColor.Red]: 'urgency-red' }[task.urgencyColor]
    : '';

  const bgColor = smartColor ? undefined : task.color + '20';
  const borderColor = smartColor ? undefined : task.color;
  const progress = task.duration > 0 ? (task.progress / task.duration) * 100 : 0;

  return (
    <div
      className={`absolute left-0.5 right-0.5 px-1.5 py-0.5 cursor-grab overflow-hidden z-10 hover:z-20 hover:brightness-110 transition-all font-mono active:cursor-grabbing ${urgencyClasses}`}
      draggable
      onDragStart={(e) => {
        const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const grabOffsetY = e.clientY - blockRect.top;
        e.dataTransfer.setData('application/json', JSON.stringify({
          type: 'task',
          id: task.id,
          durationMinutes: duration,
          grabOffsetY,
        }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        ...(smartColor
          ? {}
          : {
              backgroundColor: bgColor,
              borderLeft: `2px solid ${borderColor}`,
              border: `1px solid ${borderColor}40`,
              borderLeftWidth: '2px',
            }),
      }}
      onClick={onClick}
    >
      <div className="flex items-center gap-1">
        {task.splittable && <span className="text-[8px] text-nord13">◧</span>}
        <div className="text-[10px] font-bold truncate text-nord6 flex-1">
          {task.title || 'untitled'}
        </div>
      </div>
      {height > 28 && (
        <div className="text-[9px] text-nord4 truncate">
          {format(start, 'HH:mm')}-{format(end, 'HH:mm')}
          {task.splittable && ' [split]'}
        </div>
      )}
      {height > 38 && progress > 0 && (
        <div className="mt-0.5 w-full h-1 bg-nord3/50 overflow-hidden">
          <div className="progress-bar h-full" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
