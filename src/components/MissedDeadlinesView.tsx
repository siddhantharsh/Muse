// ============================================================
// Muse — Missed Deadlines Resolution Center
// Aggregates all overdue tasks with infinite scroll
// ============================================================

import React from 'react';
import { AlertTriangle, Clock, CalendarDays, Trash2, Check, RefreshCw } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import { format, parseISO, differenceInMinutes, addDays, isAfter } from 'date-fns';
import { durationToReadable, toLocalISO } from '../utils/dateUtils';
import { getMissedTasks } from '../utils/taskSelectors';

/** "40m", "5h", "3d" — how long ago a deadline passed. */
function overdueLabel(dueDate: string, now: Date): string {
  const mins = Math.max(0, differenceInMinutes(now, parseISO(dueDate)));
  if (mins < 60) return `${mins}m overdue`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h overdue`;
  return `${Math.floor(mins / (24 * 60))}d overdue`;
}

/** New deadline three days from now, keeping the original time of day. */
function threeDaysFromNow(dueDate: string, now: Date): string {
  const due = parseISO(dueDate);
  const next = addDays(isAfter(due, now) ? due : now, 3);
  next.setHours(due.getHours(), due.getMinutes(), 0, 0);
  return toLocalISO(next);
}

export function MissedDeadlinesView() {
  const {
    tasks,
    lists,
    updateTask,
    deleteTask,
    completeTask,
    bulkDeleteTasks,
    bulkCompleteTasks,
    ui,
    toggleMultiSelect,
    toggleMultiSelectItem,
    openFloatingModal,
    recalculate,
  } = useMuseStore();

  const now = new Date();
  // Same definition the sidebar badge uses — series templates are excluded,
  // auto-skipped occurrences are closed by the engine.
  const overdueTasks = getMissedTasks(tasks, now);

  // Most overdue first
  const sortedOverdue = [...overdueTasks].sort(
    (a, b) => parseISO(a.dueDate!).getTime() - parseISO(b.dueDate!).getTime()
  );

  return (
    <div className="h-full flex flex-col bg-nord0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-nord3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8  bg-nord11/15 flex items-center justify-center">
            <AlertTriangle size={18} className="text-nord11" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-nord6">Missed Deadlines</h1>
            <p className="text-xs text-nord3">
              {overdueTasks.length} overdue task{overdueTasks.length !== 1 ? 's' : ''} · Resolve to restore balance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ui.multiSelectMode && ui.multiSelectIds.length > 0 && (
            <>
              <button
                onClick={() => bulkCompleteTasks(ui.multiSelectIds)}
                className="btn-secondary text-xs flex items-center gap-1"
              >
                <Check size={12} />
                Complete ({ui.multiSelectIds.length})
              </button>
              <button
                onClick={() => bulkDeleteTasks(ui.multiSelectIds)}
                className="btn-danger text-xs flex items-center gap-1"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </>
          )}
          <button
            onClick={toggleMultiSelect}
            className={`btn-ghost text-xs ${ui.multiSelectMode ? 'bg-nord8/15 text-nord8' : ''}`}
          >
            {ui.multiSelectMode ? 'Cancel' : 'Select'}
          </button>
          <button
            onClick={recalculate}
            className="btn-primary text-xs flex items-center gap-1"
          >
            <RefreshCw size={12} />
            Recalculate
          </button>
        </div>
      </div>

      {/* Overdue Tasks List */}
      <div className="flex-1 overflow-y-auto scrollable px-6 py-4">
        {sortedOverdue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16  bg-nord14/10 border border-nord14/20 flex items-center justify-center mb-4">
              <Check size={28} className="text-nord14" />
            </div>
            <h3 className="text-sm font-medium text-nord4 mb-1">
              All caught up!
            </h3>
            <p className="text-xs text-nord3 max-w-[260px]">
              No missed deadlines. Your schedule is in perfect balance.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedOverdue.map((task) => {
              const list = lists.find((l) => l.id === task.listId);
              // Visible on touch screens (no hover) and on keyboard focus.
              const actionClass =
                'transition-all md:opacity-0 md:group-hover:opacity-100 focus:opacity-100';

              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-3  border cursor-pointer group transition-all ${
                    ui.multiSelectIds.includes(task.id)
                      ? 'bg-nord11/10 border-nord11/30'
                      : 'bg-nord1 border-nord11/20 hover:border-nord11/40'
                  }`}
                  onClick={(e) => {
                    if (ui.multiSelectMode) {
                      toggleMultiSelectItem(task.id);
                    } else {
                      openFloatingModal({
                        type: 'task',
                        id: task.id,
                        x: Math.min(e.clientX, window.innerWidth - 400),
                        y: Math.min(e.clientY, window.innerHeight - 500),
                      });
                    }
                  }}
                >
                  {ui.multiSelectMode ? (
                    <input
                      type="checkbox"
                      checked={ui.multiSelectIds.includes(task.id)}
                      onChange={() => toggleMultiSelectItem(task.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="checkbox"
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        completeTask(task.id);
                      }}
                      aria-label={`Mark “${task.title || 'Untitled'}” as done`}
                      className="w-5 h-5  border-2 border-nord11/50 hover:border-nord11 flex-shrink-0 transition-colors"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-nord6 truncate">
                        {task.title || 'Untitled'}
                      </span>
                      <span className="text-[10px] bg-nord11/20 text-nord11 px-1.5 py-0.5  font-bold flex-shrink-0">
                        {task.isRepeatingInstance ? 'missed · ' : ''}
                        {overdueLabel(task.dueDate!, now)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {list && (
                        <span className="flex items-center gap-1 text-[11px] text-nord3">
                          <div
                            className="w-1.5 h-1.5 "
                            style={{ backgroundColor: list.color }}
                          />
                          {list.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[11px] text-nord3">
                        <Clock size={10} />
                        {durationToReadable(task.duration - task.progress)} left
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-nord11">
                        <CalendarDays size={10} />
                        Due {format(parseISO(task.dueDate!), 'MMM d')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Quick actions */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTask(task.id, { dueDate: threeDaysFromNow(task.dueDate!, now) });
                      }}
                      className={`px-2 py-1 text-[10px] text-nord4 hover:bg-nord2 hover:text-nord6 ${actionClass}`}
                      title="New deadline three days from now — it goes back on the schedule"
                    >
                      +3 days
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTask(task.id, { dueDate: null });
                      }}
                      className={`px-2 py-1 text-[10px] text-nord4 hover:bg-nord2 hover:text-nord6 ${actionClass}`}
                      title="Remove the deadline — it's scheduled whenever there's room"
                    >
                      No deadline
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTask(task.id);
                      }}
                      aria-label={task.isRepeatingInstance ? 'Skip this occurrence' : 'Delete task'}
                      title={task.isRepeatingInstance ? 'Skip this occurrence' : 'Delete task'}
                      className={`p-1 text-nord4 hover:bg-nord11/20 hover:text-nord11 ${actionClass}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
