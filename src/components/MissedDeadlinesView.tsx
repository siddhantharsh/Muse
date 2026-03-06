// ============================================================
// Muse — Missed Deadlines Resolution Center
// Aggregates all overdue tasks with infinite scroll
// ============================================================

import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CalendarDays,
  Flag,
  Trash2,
  Check,
  ChevronRight,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import { Task, Priority, UrgencyColor } from '../types';
import { format, parseISO, differenceInDays } from 'date-fns';
import { durationToReadable } from '../utils/dateUtils';

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
    clearMultiSelect,
    openFloatingModal,
    recalculate,
  } = useMuseStore();

  const [showBulkMoveDropdown, setShowBulkMoveDropdown] = useState(false);

  // All overdue tasks (red urgency)
  const overdueTasks = tasks.filter(
    (t) =>
      !t.completed &&
      t.dueDate &&
      new Date(t.dueDate) < new Date() &&
      !t.autoIgnore
  );

  const sortedOverdue = overdueTasks.sort((a, b) => {
    // Most overdue first
    const aDays = differenceInDays(new Date(), parseISO(a.dueDate!));
    const bDays = differenceInDays(new Date(), parseISO(b.dueDate!));
    return bDays - aDays;
  });

  return (
    <div className="h-full flex flex-col bg-nord0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-nord3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8  bg-red-500/15 flex items-center justify-center">
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
            <div className="w-16 h-16  bg-nord14/10 border border-green-500/20 flex items-center justify-center mb-4">
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
              const daysOverdue = differenceInDays(new Date(), parseISO(task.dueDate!));
              const list = lists.find((l) => l.id === task.listId);

              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-3  border cursor-pointer group transition-all ${
                    ui.multiSelectIds.includes(task.id)
                      ? 'bg-nord11/10 border-red-500/30'
                      : 'bg-nord1 border-red-500/20 hover:border-red-500/40'
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
                      className="w-5 h-5  border-2 border-red-500/50 hover:border-red-400 flex-shrink-0 transition-colors"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-nord6 truncate">
                        {task.title || 'Untitled'}
                      </span>
                      <span className="text-[10px] bg-nord11/20 text-nord11 px-1.5 py-0.5  font-bold flex-shrink-0">
                        {daysOverdue}d overdue
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
                        // Extend deadline by 3 days
                        const newDue = new Date(task.dueDate!);
                        newDue.setDate(newDue.getDate() + 3);
                        updateTask(task.id, { dueDate: newDue.toISOString() });
                      }}
                      className="px-2 py-1 text-[10px] text-nord3 hover:bg-nord2 hover:text-nord6 transition-all opacity-0 group-hover:opacity-100"
                      title="Extend deadline +3 days"
                    >
                      +3d
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTask(task.id, { dueDate: null });
                      }}
                      className="px-2 py-1 text-[10px] text-nord3 hover:bg-nord2 hover:text-nord6 transition-all opacity-0 group-hover:opacity-100"
                      title="Remove deadline (move to backlog)"
                    >
                      No Due
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTask(task.id);
                      }}
                      className="p-1 text-nord3 hover:bg-nord11/20 hover:text-nord11 transition-all opacity-0 group-hover:opacity-100"
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
