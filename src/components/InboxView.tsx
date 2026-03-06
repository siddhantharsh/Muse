// ============================================================
// Muse — Inbox View
// Staging ground for unstructured task capture
// Bi-directional state: tasks can move in/out of inbox
// ============================================================

import React, { useState } from 'react';
import {
  Inbox as InboxIcon,
  Plus,
  Check,
  Trash2,
  ChevronRight,
  Clock,
  CalendarDays,
  GripVertical,
  ArrowRight,
  CheckSquare,
  Layers,
  Flag,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import { Task, Priority } from '../types';
import { durationToReadable } from '../utils/dateUtils';
import { format, parseISO } from 'date-fns';

export function InboxView() {
  const {
    tasks,
    lists,
    addTask,
    updateTask,
    deleteTask,
    completeTask,
    bulkDeleteTasks,
    bulkCompleteTasks,
    bulkMoveTasks,
    ui,
    toggleMultiSelect,
    toggleMultiSelectItem,
    clearMultiSelect,
    openFloatingModal,
  } = useMuseStore();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showBulkMoveDropdown, setShowBulkMoveDropdown] = useState(false);

  const inboxTasks = tasks.filter((t) => t.inInbox && !t.completed);
  const completedInbox = tasks.filter((t) => t.inInbox && t.completed).slice(0, 10);

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    addTask({
      title: newTaskTitle.trim(),
      inInbox: true,
      autoSchedule: false,
    });
    setNewTaskTitle('');
  };

  return (
    <div className="h-full flex flex-col bg-nord0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-nord3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8  bg-nord8/15 flex items-center justify-center">
            <InboxIcon size={18} className="text-nord8" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-nord6">Inbox</h1>
            <p className="text-xs text-nord3">
              {inboxTasks.length} task{inboxTasks.length !== 1 ? 's' : ''} · Capture now, schedule later
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
                <CheckSquare size={12} />
                Complete ({ui.multiSelectIds.length})
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowBulkMoveDropdown(!showBulkMoveDropdown)}
                  className="btn-primary text-xs flex items-center gap-1"
                >
                  <ArrowRight size={12} />
                  Move to List
                </button>
                {showBulkMoveDropdown && (
                  <div className="absolute top-full right-0 mt-1 z-10 bg-nord1 border border-nord3  shadow-none py-1 min-w-[160px] dropdown-menu">
                    {lists.map((list) => (
                      <button
                        key={list.id}
                        onClick={() => {
                          bulkMoveTasks(ui.multiSelectIds, list.id);
                          setShowBulkMoveDropdown(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-nord4 hover:bg-nord2 hover:text-nord6"
                      >
                        <div className="w-2 h-2 " style={{ backgroundColor: list.color }} />
                        {list.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
        </div>
      </div>

      {/* Quick Add */}
      <div className="px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Plus
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-nord3"
            />
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTask();
              }}
              placeholder="Add a task to inbox..."
              className="w-full pl-9 pr-3 py-2.5  bg-nord1 border border-nord3 text-sm text-nord6 placeholder:text-nord3 focus:outline-none focus:border-nord8 transition-all"
            />
          </div>
          <button onClick={handleAddTask} className="btn-primary">
            Add
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto scrollable px-6 pb-6">
        {inboxTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16  bg-nord1 border border-nord3 flex items-center justify-center mb-4">
              <InboxIcon size={28} className="text-nord3" />
            </div>
            <h3 className="text-sm font-medium text-nord4 mb-1">
              Inbox is empty
            </h3>
            <p className="text-xs text-nord3 max-w-[260px]">
              Quickly capture tasks here. Move them to lists when you're ready to schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {inboxTasks.map((task) => (
              <InboxTaskRow
                key={task.id}
                task={task}
                multiSelectMode={ui.multiSelectMode}
                isSelected={ui.multiSelectIds.includes(task.id)}
                onSelect={() => toggleMultiSelectItem(task.id)}
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
                onComplete={() => completeTask(task.id)}
              />
            ))}
          </div>
        )}

        {/* Recently Completed */}
        {completedInbox.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-nord3 uppercase tracking-wider mb-2">
              Recently Completed
            </h3>
            <div className="space-y-1 opacity-60">
              {completedInbox.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-3 py-2  text-sm"
                >
                  <div className="w-4 h-4  bg-nord14 flex items-center justify-center flex-shrink-0">
                    <Check size={10} className="text-nord0" />
                  </div>
                  <span className="line-through text-nord3 flex-1 truncate">
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Inbox Task Row ----

function InboxTaskRow({
  task,
  multiSelectMode,
  isSelected,
  onSelect,
  onClick,
  onComplete,
}: {
  task: Task;
  multiSelectMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onClick: (e: React.MouseEvent) => void;
  onComplete: () => void;
}) {
  const priorityColors: Record<Priority, string> = {
    [Priority.High]: 'text-nord11',
    [Priority.Medium]: 'text-yellow-400',
    [Priority.Low]: 'text-blue-400',
    [Priority.None]: 'text-nord3',
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5  cursor-pointer group transition-all ${
        isSelected
          ? 'bg-nord8/10 border border-nord8/30'
          : 'hover:bg-nord1 border border-transparent'
      }`}
      onClick={onClick}
    >
      {multiSelectMode ? (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          className="checkbox"
        />
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          className="w-5 h-5  border-2 border-nord3 hover:border-nord8 flex-shrink-0 transition-colors"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="text-sm text-nord6 truncate">
          {task.title || 'Untitled Task'}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-[11px] text-nord3">
            <Clock size={10} />
            {durationToReadable(task.duration)}
          </span>
          {task.dueDate && (
            <span className="flex items-center gap-1 text-[11px] text-nord3">
              <CalendarDays size={10} />
              {format(parseISO(task.dueDate), 'MMM d')}
            </span>
          )}
          {task.priority !== Priority.None && (
            <span className={`flex items-center gap-1 text-[11px] ${priorityColors[task.priority]}`}>
              <Flag size={10} />
              {task.priority}
            </span>
          )}
        </div>
      </div>

      <ChevronRight
        size={14}
        className="text-nord3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      />
    </div>
  );
}
