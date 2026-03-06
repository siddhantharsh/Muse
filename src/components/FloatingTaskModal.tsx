// ============================================================
// Muse — Floating Task Detail Modal
// Draggable, non-destructive editing window
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  GripHorizontal,
  Clock,
  CalendarDays,
  Flag,
  Layers,
  Split,
  ArrowUpRight,
  Check,
  Trash2,
  Play,
  Pause,
  ChevronDown,
  Link2,
  Repeat,
  Zap,
  Target,
  AlignLeft,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import { Priority, UrgencyColor, RepeatFrequency } from '../types';
import { format, parseISO } from 'date-fns';
import { durationToReadable } from '../utils/dateUtils';
import { wouldCreateCycle } from '../engine/dependencies';

export function FloatingTaskModal() {
  const {
    ui,
    tasks,
    lists,
    settings,
    closeFloatingModal,
    updateTask,
    deleteTask,
    completeTask,
    uncompleteTask,
    updateTaskProgress,
  } = useMuseStore();

  const modal = ui.floatingModal;
  if (!modal || modal.type !== 'task') return null;

  const task = tasks.find((t) => t.id === modal.id);
  if (!task) return null;

  const [position, setPosition] = useState({ x: modal.x, y: modal.y });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [showDepsDropdown, setShowDepsDropdown] = useState(false);
  const [showRepeatDropdown, setShowRepeatDropdown] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Dragging logic
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [position]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 380)),
          y: Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 200)),
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const list = lists.find((l) => l.id === task.listId);
  const urgencyBorder =
    task.urgencyColor === UrgencyColor.Red
      ? 'border-red-500/30'
      : task.urgencyColor === UrgencyColor.Orange
      ? 'border-orange-500/30'
      : 'border-nord3';

  const priorityLabels: Record<Priority, { label: string; color: string; icon: string }> = {
    [Priority.High]: { label: 'High', color: 'text-nord11', icon: '🔴' },
    [Priority.Medium]: { label: 'Medium', color: 'text-yellow-400', icon: '🟡' },
    [Priority.Low]: { label: 'Low', color: 'text-blue-400', icon: '🔵' },
    [Priority.None]: { label: 'None', color: 'text-nord3', icon: '⚪' },
  };

  return (
    <div
      ref={modalRef}
      className={`fixed z-50 w-[380px] bg-nord1  border ${urgencyBorder} floating-modal animate-scale-in`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: '80vh',
      }}
    >
      {/* Drag Handle */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-nord3/50 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={14} className="text-nord3" />
          <span className="text-[10px] uppercase tracking-wider text-nord3 font-medium">
            Task Detail
          </span>
          {task.urgencyColor === UrgencyColor.Red && (
            <span className="text-[10px] bg-nord11/20 text-nord11 px-1.5 py-0.5  font-semibold">
              OVERDUE
            </span>
          )}
          {task.urgencyColor === UrgencyColor.Orange && (
            <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5  font-semibold">
              DUE SOON
            </span>
          )}
        </div>
        <button
          onClick={closeFloatingModal}
          className="p-1 hover:bg-nord2 transition-colors"
        >
          <X size={14} className="text-nord3" />
        </button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto scrollable" style={{ maxHeight: 'calc(80vh - 100px)' }}>
        <div className="p-4 space-y-4">
          {/* Title + Completion */}
          <div className="flex items-start gap-3">
            <button
              onClick={() =>
                task.completed ? uncompleteTask(task.id) : completeTask(task.id)
              }
              className={`mt-1 w-5 h-5  border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                task.completed
                  ? 'bg-nord14 border-nord14'
                  : 'border-nord3 hover:border-nord8'
              }`}
            >
              {task.completed && <Check size={12} className="text-nord0" />}
            </button>
            <div className="flex-1">
              {editingTitle ? (
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    updateTask(task.id, { title });
                    setEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateTask(task.id, { title });
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full bg-transparent text-lg font-semibold text-nord6 border-b border-nord8 focus:outline-none"
                />
              ) : (
                <h3
                  className={`text-lg font-semibold cursor-text ${
                    task.completed ? 'line-through text-nord3' : 'text-nord6'
                  }`}
                  onClick={() => {
                    setEditingTitle(true);
                    setTitle(task.title);
                  }}
                >
                  {task.title || 'Untitled Task'}
                </h3>
              )}
            </div>
          </div>

          {/* List Badge */}
          <div className="relative">
            <button
              onClick={() => setShowListDropdown(!showListDropdown)}
              className="flex items-center gap-2 px-2 py-1  hover:bg-nord2 transition-colors"
            >
              <div
                className="w-2.5 h-2.5 "
                style={{ backgroundColor: list?.color || '#88C0D0' }}
              />
              <span className="text-xs text-nord4">{list?.name || 'No List'}</span>
              <ChevronDown size={10} className="text-nord3" />
            </button>
            {showListDropdown && (
              <div className="absolute top-full left-0 mt-1 z-10 bg-nord1 border border-nord3  shadow-none py-1 min-w-[160px] dropdown-menu">
                {lists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      useMuseStore.getState().moveTaskToList(task.id, l.id);
                      setShowListDropdown(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-nord4 hover:bg-nord2 hover:text-nord6"
                  >
                    <div className="w-2 h-2 " style={{ backgroundColor: l.color }} />
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Properties Grid */}
          <div className="space-y-3">
            {/* Duration */}
            <PropertyRow icon={<Clock size={14} />} label="Duration">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={task.duration}
                  onChange={(e) =>
                    updateTask(task.id, { duration: Math.max(5, parseInt(e.target.value) || 0) })
                  }
                  className="w-16 px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 text-center focus:outline-none focus:ring-1 focus:ring-nord8"
                  min={5}
                  step={5}
                />
                <span className="text-xs text-nord3">min</span>
                <span className="text-[10px] text-nord3">
                  ({durationToReadable(task.duration)})
                </span>
              </div>
            </PropertyRow>

            {/* Due Date */}
            <PropertyRow icon={<CalendarDays size={14} />} label="Due Date">
              <input
                type="datetime-local"
                value={task.dueDate ? task.dueDate.slice(0, 16) : ''}
                onChange={(e) =>
                  updateTask(task.id, {
                    dueDate: e.target.value ? e.target.value + ':00' : null,
                  })
                }
                className="px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 focus:outline-none focus:ring-1 focus:ring-nord8"
              />
              {task.dueDate && (
                <button
                  onClick={() => updateTask(task.id, { dueDate: null })}
                  className="text-[10px] text-nord11 hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </PropertyRow>

            {/* Start After */}
            <PropertyRow icon={<ArrowUpRight size={14} />} label="Start After">
              <input
                type="datetime-local"
                value={task.startAfter ? task.startAfter.slice(0, 16) : ''}
                onChange={(e) =>
                  updateTask(task.id, {
                    startAfter: e.target.value ? e.target.value + ':00' : null,
                  })
                }
                className="px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 focus:outline-none focus:ring-1 focus:ring-nord8"
              />
            </PropertyRow>

            {/* Priority */}
            <PropertyRow icon={<Flag size={14} />} label="Priority">
              <div className="relative">
                <button
                  onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                  className={`flex items-center gap-1.5 px-2 py-1  border border-nord3 hover:bg-nord2 text-xs ${priorityLabels[task.priority].color}`}
                >
                  <span>{priorityLabels[task.priority].icon}</span>
                  {priorityLabels[task.priority].label}
                  <ChevronDown size={10} />
                </button>
                {showPriorityDropdown && (
                  <div className="absolute top-full left-0 mt-1 z-10 bg-nord1 border border-nord3  shadow-none py-1 min-w-[120px] dropdown-menu">
                    {Object.entries(priorityLabels).map(([key, { label, icon, color }]) => (
                      <button
                        key={key}
                        onClick={() => {
                          updateTask(task.id, { priority: key as Priority });
                          setShowPriorityDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-nord2 ${color}`}
                      >
                        <span>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </PropertyRow>

            {/* Auto-Schedule Toggle */}
            <PropertyRow icon={<Zap size={14} />} label="Auto-Schedule">
              <button
                onClick={() => updateTask(task.id, { autoSchedule: !task.autoSchedule })}
                className={`toggle ${task.autoSchedule ? 'active' : ''}`}
              />
            </PropertyRow>

            {/* Scheduling Hours */}
            <PropertyRow icon={<Clock size={14} />} label="Scheduling Hours">
              <select
                value={task.schedulingHoursId || ''}
                onChange={(e) =>
                  updateTask(task.id, {
                    schedulingHoursId: e.target.value || null,
                  })
                }
                className="px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 focus:outline-none"
              >
                <option value="">Default</option>
                {settings.schedulingHoursProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </PropertyRow>

            {/* Splittable */}
            <PropertyRow icon={<Split size={14} />} label="Splittable">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateTask(task.id, { splittable: !task.splittable })}
                  className={`toggle ${task.splittable ? 'active' : ''}`}
                />
                {task.splittable && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-nord3">Min:</span>
                    <input
                      type="number"
                      value={task.minBlockDuration}
                      onChange={(e) =>
                        updateTask(task.id, {
                          minBlockDuration: Math.max(5, parseInt(e.target.value) || 15),
                        })
                      }
                      className="w-12 px-1 py-0.5 bg-nord0 border border-nord3 text-xs text-nord6 text-center focus:outline-none"
                      min={5}
                      step={5}
                    />
                    <span className="text-[10px] text-nord3">min</span>
                  </div>
                )}
              </div>
            </PropertyRow>

            {/* Progress */}
            <PropertyRow icon={<Target size={14} />} label="Progress">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={task.duration}
                    step={5}
                    value={task.progress}
                    onChange={(e) => updateTaskProgress(task.id, parseInt(e.target.value))}
                    className="flex-1 accent-nord8 h-1"
                  />
                  <span className="text-xs text-nord4 w-16 text-right">
                    {task.progress}/{task.duration}m
                  </span>
                </div>
                <div className="w-full h-1.5 bg-nord3/50  overflow-hidden">
                  <div
                    className="progress-bar h-full"
                    style={{
                      width: `${task.duration > 0 ? (task.progress / task.duration) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </PropertyRow>

            {/* Dependencies */}
            <PropertyRow icon={<Link2 size={14} />} label="Depends On">
              <div className="space-y-1">
                {task.dependsOn.map((depId) => {
                  const depTask = tasks.find((t) => t.id === depId);
                  return depTask ? (
                    <div
                      key={depId}
                      className="flex items-center gap-1 text-xs text-nord4 bg-nord0 px-2 py-0.5 rounded"
                    >
                      <span className="truncate flex-1">{depTask.title}</span>
                      <button
                        onClick={() =>
                          updateTask(task.id, {
                            dependsOn: task.dependsOn.filter((d) => d !== depId),
                          })
                        }
                        className="text-nord11 hover:text-red-300"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : null;
                })}
                <div className="relative">
                  <button
                    onClick={() => setShowDepsDropdown(!showDepsDropdown)}
                    className="text-xs text-nord8 hover:text-nord8Hover"
                  >
                    + Add dependency
                  </button>
                  {showDepsDropdown && (
                    <div className="absolute top-full left-0 mt-1 z-10 bg-nord1 border border-nord3  shadow-none py-1 max-h-40 overflow-y-auto min-w-[200px] dropdown-menu">
                      {tasks
                        .filter(
                          (t) =>
                            t.id !== task.id &&
                            !t.completed &&
                            !task.dependsOn.includes(t.id) &&
                            !wouldCreateCycle(tasks, task.id, t.id)
                        )
                        .map((t) => (
                          <button
                            key={t.id}
                            onClick={() => {
                              updateTask(task.id, {
                                dependsOn: [...task.dependsOn, t.id],
                              });
                              setShowDepsDropdown(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-sm text-nord4 hover:bg-nord2 hover:text-nord6 truncate"
                          >
                            {t.title || 'Untitled'}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </PropertyRow>

            {/* Repeating */}
            <PropertyRow icon={<Repeat size={14} />} label="Repeat">
              <div className="relative">
                <button
                  onClick={() => setShowRepeatDropdown(!showRepeatDropdown)}
                  className="text-xs text-nord4 hover:text-nord6 px-2 py-1 border border-nord3 hover:bg-nord2"
                >
                  {task.repeatingRule ? task.repeatingRule.frequency : 'None'}
                </button>
                {showRepeatDropdown && (
                  <div className="absolute top-full left-0 mt-1 z-10 bg-nord1 border border-nord3  shadow-none py-1 min-w-[140px] dropdown-menu">
                    <button
                      onClick={() => {
                        updateTask(task.id, { repeatingRule: null });
                        setShowRepeatDropdown(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-nord4 hover:bg-nord2"
                    >
                      None
                    </button>
                    {Object.values(RepeatFrequency).map((freq) => (
                      <button
                        key={freq}
                        onClick={() => {
                          updateTask(task.id, {
                            repeatingRule: { frequency: freq, interval: 1 },
                          });
                          setShowRepeatDropdown(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-nord4 hover:bg-nord2 hover:text-nord6 capitalize"
                      >
                        {freq}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {task.repeatingRule && (
                <label className="flex items-center gap-1.5 text-[10px] text-nord3 ml-2">
                  <input
                    type="checkbox"
                    checked={task.autoIgnore}
                    onChange={(e) => updateTask(task.id, { autoIgnore: e.target.checked })}
                    className="checkbox w-3 h-3"
                  />
                  Auto-Ignore
                </label>
              )}
            </PropertyRow>

            {/* Notes */}
            <PropertyRow icon={<AlignLeft size={14} />} label="Notes" fullWidth>
              <textarea
                value={task.notes}
                onChange={(e) => updateTask(task.id, { notes: e.target.value })}
                placeholder="Add notes..."
                className="w-full px-2 py-1.5 bg-nord0 border border-nord3 text-xs text-nord6 placeholder:text-nord3 focus:outline-none focus:ring-1 focus:ring-nord8 resize-none"
                rows={3}
              />
            </PropertyRow>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end px-4 py-2 border-t border-nord3/50">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              deleteTask(task.id);
              closeFloatingModal();
            }}
            className="btn-danger text-xs flex items-center gap-1"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Property Row Component ----

function PropertyRow({
  icon,
  label,
  children,
  fullWidth = false,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={`${fullWidth ? 'space-y-1.5' : 'flex items-center gap-3'}`}>
      <div className="flex items-center gap-2 min-w-[110px]">
        <span className="text-nord3">{icon}</span>
        <span className="text-xs text-nord3 font-medium">{label}</span>
      </div>
      <div className={`${fullWidth ? '' : 'flex-1'} flex items-center gap-2 flex-wrap`}>
        {children}
      </div>
    </div>
  );
}
