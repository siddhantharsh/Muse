// ============================================================
// Muse — Task List View
// Shows tasks grouped by Today / Tomorrow / Later
// with time-left, priority, duration, and scheduled info
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  ListTodo,
  Check,
  Clock,
  CalendarDays,
  Flag,
  ChevronDown,
  ChevronRight,
  Timer,
  Zap,
  Target,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import { Task, Priority, UrgencyColor } from '../types';
import { format, parseISO, isToday, isTomorrow, isAfter, differenceInHours, differenceInMinutes, differenceInDays, startOfDay, addDays } from 'date-fns';

export function TaskListView() {
  const {
    tasks,
    lists,
    completeTask,
    uncompleteTask,
    openFloatingModal,
  } = useMuseStore();

  const [expandedSections, setExpandedSections] = useState({
    overdue: true,
    today: true,
    tomorrow: true,
    later: true,
    completed: false,
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const dayAfterTomorrow = startOfDay(addDays(now, 2));

  // Group tasks into sections
  const grouped = useMemo(() => {
    const active = tasks.filter((t) => !t.completed);
    const completed = tasks.filter((t) => t.completed).slice(0, 15);

    const overdue: Task[] = [];
    const today: Task[] = [];
    const tomorrow: Task[] = [];
    const later: Task[] = [];

    for (const task of active) {
      // Determine which section based on:
      // 1. Due date (if has one)
      // 2. Scheduled blocks (next scheduled time)
      // 3. Otherwise → later

      const nextScheduledDate = getNextScheduledDate(task);
      const dueDate = task.dueDate ? parseISO(task.dueDate) : null;

      // Check overdue first
      if (dueDate && dueDate < now && task.urgencyColor === UrgencyColor.Red) {
        overdue.push(task);
        continue;
      }

      // Determine effective date (soonest of due date or next scheduled)
      const effectiveDate = getEffectiveDate(task, dueDate, nextScheduledDate);

      if (!effectiveDate) {
        later.push(task);
      } else if (effectiveDate < tomorrowStart) {
        today.push(task);
      } else if (effectiveDate < dayAfterTomorrow) {
        tomorrow.push(task);
      } else {
        later.push(task);
      }
    }

    // Sort each section: by due date, then by scheduled time, then by priority
    const sortTasks = (arr: Task[]) =>
      arr.sort((a, b) => {
        // Priority first (High first)
        const priOrder = { [Priority.High]: 0, [Priority.Medium]: 1, [Priority.Low]: 2, [Priority.None]: 3 };
        if (priOrder[a.priority] !== priOrder[b.priority]) {
          return priOrder[a.priority] - priOrder[b.priority];
        }
        // Then by due date
        const aDate = a.dueDate ? parseISO(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? parseISO(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      });

    return {
      overdue: sortTasks(overdue),
      today: sortTasks(today),
      tomorrow: sortTasks(tomorrow),
      later: sortTasks(later),
      completed,
    };
  }, [tasks, now.toDateString()]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const totalActive = grouped.overdue.length + grouped.today.length + grouped.tomorrow.length + grouped.later.length;

  return (
    <div className="h-full flex flex-col bg-nord0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-nord3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-nord8/15 flex items-center justify-center">
            <ListTodo size={18} className="text-nord8" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-nord6">Tasks</h1>
            <p className="text-xs text-nord3">
              {totalActive} active task{totalActive !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Task Sections */}
      <div className="flex-1 overflow-y-auto scrollable px-4 pb-6">
        {totalActive === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-nord1 border border-nord3 flex items-center justify-center mb-4">
              <Check size={28} className="text-nord14" />
            </div>
            <h3 className="text-sm font-medium text-nord4 mb-1">All clear</h3>
            <p className="text-xs text-nord3 max-w-[260px]">
              No active tasks. Add one from the sidebar or double-click the calendar.
            </p>
          </div>
        ) : (
          <>
            {/* Overdue */}
            {grouped.overdue.length > 0 && (
              <TaskSection
                title="Overdue"
                count={grouped.overdue.length}
                expanded={expandedSections.overdue}
                onToggle={() => toggleSection('overdue')}
                color="nord11"
                tasks={grouped.overdue}
                onTaskClick={(task, e) =>
                  openFloatingModal({
                    type: 'task',
                    id: task.id,
                    x: Math.min(e.clientX, window.innerWidth - 400),
                    y: Math.min(e.clientY, window.innerHeight - 500),
                  })
                }
                onComplete={(id) => completeTask(id)}
                lists={lists}
                now={now}
              />
            )}

            {/* Today */}
            <TaskSection
              title="Today"
              count={grouped.today.length}
              expanded={expandedSections.today}
              onToggle={() => toggleSection('today')}
              color="nord8"
              tasks={grouped.today}
              onTaskClick={(task, e) =>
                openFloatingModal({
                  type: 'task',
                  id: task.id,
                  x: Math.min(e.clientX, window.innerWidth - 400),
                  y: Math.min(e.clientY, window.innerHeight - 500),
                })
              }
              onComplete={(id) => completeTask(id)}
              lists={lists}
              now={now}
            />

            {/* Tomorrow */}
            <TaskSection
              title="Tomorrow"
              count={grouped.tomorrow.length}
              expanded={expandedSections.tomorrow}
              onToggle={() => toggleSection('tomorrow')}
              color="nord13"
              tasks={grouped.tomorrow}
              onTaskClick={(task, e) =>
                openFloatingModal({
                  type: 'task',
                  id: task.id,
                  x: Math.min(e.clientX, window.innerWidth - 400),
                  y: Math.min(e.clientY, window.innerHeight - 500),
                })
              }
              onComplete={(id) => completeTask(id)}
              lists={lists}
              now={now}
            />

            {/* Later */}
            {grouped.later.length > 0 && (
              <TaskSection
                title="Later"
                count={grouped.later.length}
                expanded={expandedSections.later}
                onToggle={() => toggleSection('later')}
                color="nord3"
                tasks={grouped.later}
                onTaskClick={(task, e) =>
                  openFloatingModal({
                    type: 'task',
                    id: task.id,
                    x: Math.min(e.clientX, window.innerWidth - 400),
                    y: Math.min(e.clientY, window.innerHeight - 500),
                  })
                }
                onComplete={(id) => completeTask(id)}
                lists={lists}
                now={now}
              />
            )}
          </>
        )}

        {/* Completed */}
        {grouped.completed.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => toggleSection('completed')}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-nord3 hover:text-nord4 transition-colors w-full"
            >
              {expandedSections.completed ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span className="uppercase tracking-wider font-bold">Completed</span>
              <span className="text-[10px]">({grouped.completed.length})</span>
            </button>
            {expandedSections.completed && (
              <div className="space-y-0.5 mt-1 opacity-50">
                {grouped.completed.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer hover:bg-nord1 transition-colors"
                    onClick={() => openFloatingModal({
                      type: 'task',
                      id: task.id,
                      x: 200,
                      y: 200,
                    })}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        uncompleteTask(task.id);
                      }}
                      className="w-4 h-4 bg-nord14 flex items-center justify-center flex-shrink-0"
                    >
                      <Check size={10} className="text-nord0" />
                    </button>
                    <span className="line-through text-nord3 flex-1 truncate text-xs">
                      {task.title}
                    </span>
                    {task.completedAt && (
                      <span className="text-[10px] text-nord3">
                        {format(parseISO(task.completedAt), 'MMM d')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Task Section Component
// ============================================================

function TaskSection({
  title,
  count,
  expanded,
  onToggle,
  color,
  tasks,
  onTaskClick,
  onComplete,
  lists,
  now,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  color: string;
  tasks: Task[];
  onTaskClick: (task: Task, e: React.MouseEvent) => void;
  onComplete: (id: string) => void;
  lists: { id: string; name: string; color: string }[];
  now: Date;
}) {
  return (
    <div className="mt-3">
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-2 py-1.5 text-xs text-${color} hover:bg-nord1 transition-colors w-full`}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="uppercase tracking-wider font-bold">{title}</span>
        <span className="text-[10px] opacity-70">({count})</span>
      </button>
      {expanded && (
        <div className="space-y-0.5 mt-0.5">
          {tasks.length === 0 ? (
            <div className="px-4 py-3 text-xs text-nord3 italic">
              No tasks
            </div>
          ) : (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onClick={(e) => onTaskClick(task, e)}
                onComplete={() => onComplete(task.id)}
                lists={lists}
                now={now}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Task Row Component
// ============================================================

function TaskRow({
  task,
  onClick,
  onComplete,
  lists,
  now,
}: {
  task: Task;
  onClick: (e: React.MouseEvent) => void;
  onComplete: () => void;
  lists: { id: string; name: string; color: string }[];
  now: Date;
}) {
  const list = lists.find((l) => l.id === task.listId);

  const priorityConfig: Record<Priority, { color: string; label: string }> = {
    [Priority.High]: { color: 'text-nord11', label: 'H' },
    [Priority.Medium]: { color: 'text-nord13', label: 'M' },
    [Priority.Low]: { color: 'text-nord10', label: 'L' },
    [Priority.None]: { color: 'text-nord3', label: '' },
  };

  // Time left until due
  const timeLeftStr = useMemo(() => {
    if (!task.dueDate) return null;
    const due = parseISO(task.dueDate);
    const diffMins = differenceInMinutes(due, now);
    if (diffMins < 0) {
      const absMins = Math.abs(diffMins);
      if (absMins < 60) return `${absMins}m overdue`;
      const h = Math.floor(absMins / 60);
      if (h < 24) return `${h}h overdue`;
      return `${Math.floor(h / 24)}d overdue`;
    }
    if (diffMins < 60) return `${diffMins}m left`;
    const h = Math.floor(diffMins / 60);
    if (h < 24) return `${h}h left`;
    const d = Math.floor(h / 24);
    return `${d}d left`;
  }, [task.dueDate, now]);

  // Next scheduled time
  const nextScheduled = useMemo(() => {
    if (task.scheduledBlocks.length === 0) return null;
    const upcoming = task.scheduledBlocks
      .filter((b) => isAfter(parseISO(b.endTime), now))
      .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [task.scheduledBlocks, now]);

  const progress = task.duration > 0 ? Math.round((task.progress / task.duration) * 100) : 0;
  const remainingMin = task.duration - task.progress;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 cursor-pointer group transition-all hover:bg-nord1 border-l-2 ${
        task.urgencyColor === UrgencyColor.Red
          ? 'border-l-nord11'
          : task.urgencyColor === UrgencyColor.Orange
          ? 'border-l-orange-400'
          : 'border-l-transparent'
      }`}
      onClick={onClick}
    >
      {/* Completion checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        className="w-4 h-4 border border-nord3 hover:border-nord8 flex-shrink-0 transition-colors flex items-center justify-center"
      />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Priority badge */}
          {task.priority !== Priority.None && (
            <span className={`text-[10px] font-bold ${priorityConfig[task.priority].color}`}>
              {priorityConfig[task.priority].label}
            </span>
          )}
          {/* Title */}
          <span className="text-sm text-nord6 truncate flex-1">
            {task.title || 'Untitled'}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {/* List name */}
          {list && (
            <span className="flex items-center gap-1 text-[10px] text-nord3">
              <span className="w-1.5 h-1.5" style={{ backgroundColor: list.color }} />
              {list.name}
            </span>
          )}

          {/* Duration / remaining */}
          <span className="flex items-center gap-1 text-[10px] text-nord3">
            <Clock size={9} />
            {remainingMin === task.duration
              ? formatDuration(task.duration)
              : `${formatDuration(remainingMin)} left of ${formatDuration(task.duration)}`}
          </span>

          {/* Due date + time left */}
          {task.dueDate && (
            <span
              className={`flex items-center gap-1 text-[10px] ${
                task.urgencyColor === UrgencyColor.Red
                  ? 'text-nord11'
                  : task.urgencyColor === UrgencyColor.Orange
                  ? 'text-orange-400'
                  : 'text-nord3'
              }`}
            >
              <Timer size={9} />
              {timeLeftStr}
            </span>
          )}

          {/* Next scheduled */}
          {nextScheduled && (
            <span className="flex items-center gap-1 text-[10px] text-nord9">
              <CalendarDays size={9} />
              {format(parseISO(nextScheduled.startTime), 'HH:mm')}
            </span>
          )}

          {/* Auto-schedule indicator */}
          {task.autoSchedule && (
            <span className="text-[10px] text-nord8">
              <Zap size={9} />
            </span>
          )}
        </div>

        {/* Progress bar (only if > 0) */}
        {progress > 0 && (
          <div className="mt-1 w-full h-1 bg-nord3/30 overflow-hidden">
            <div
              className="h-full bg-nord8 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Right: due date */}
      <div className="text-right flex-shrink-0">
        {task.dueDate && (
          <span className="text-[10px] text-nord3">
            {format(parseISO(task.dueDate), 'MMM d')}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function getNextScheduledDate(task: Task): Date | null {
  if (task.scheduledBlocks.length === 0) return null;
  const now = new Date();
  const future = task.scheduledBlocks
    .map((b) => parseISO(b.startTime))
    .filter((d) => isAfter(d, now))
    .sort((a, b) => a.getTime() - b.getTime());
  return future.length > 0 ? future[0] : null;
}

function getEffectiveDate(
  task: Task,
  dueDate: Date | null,
  nextScheduled: Date | null
): Date | null {
  if (nextScheduled && dueDate) {
    return nextScheduled < dueDate ? nextScheduled : dueDate;
  }
  return nextScheduled || dueDate || null;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}
