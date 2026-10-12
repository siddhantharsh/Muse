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
import { Priority, UrgencyColor } from '../types';
import { REPEAT_OPTIONS, INTERVAL_UNIT } from '../utils/repeatOptions';
import { parseISO, isBefore, isAfter } from 'date-fns';
import {
  durationToReadable,
  toDateTimeInputValue,
  fromDateTimeInputValue,
} from '../utils/dateUtils';
import { wouldCreateCycle } from '../engine/dependencies';
import { isRepeatingTemplate } from '../utils/taskSelectors';
import { getRootScale, rootViewport } from '../utils/viewport';
import { NumberField } from './NumberField';
import { useFitInViewport, centredOpeningPosition } from '../hooks/useFitInViewport';

const MODAL_WIDTH = 380;

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
    openFloatingModal,
    commitDraftTask,
  } = useMuseStore();

  const modal = ui.floatingModal;
  const task =
    modal && modal.type === 'task' ? tasks.find((t) => t.id === modal.id) : undefined;

  // Hooks must run unconditionally on every render (Rules of Hooks) — if the
  // task backing this modal is deleted or garbage-collected elsewhere while
  // the modal is still open, `task` becomes undefined but this component
  // keeps rendering (its parent's condition only checks `modal.type`), so
  // the early return below must come AFTER every hook, never before.
  // modal.x/y are screen pixels (from mouse events); this window lives inside
  // the zoomed #root, so convert once and keep it on screen.
  const [position, setPosition] = useState(() => {
    if (modal?.draft) return centredOpeningPosition(MODAL_WIDTH);
    const scale = getRootScale();
    const vp = rootViewport(scale);
    return {
      x: Math.max(0, Math.min((modal?.x ?? 0) / scale, vp.width - MODAL_WIDTH - 8)),
      y: Math.max(0, Math.min((modal?.y ?? 0) / scale, vp.height - 240)),
    };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title ?? '');
  // Escape cancels a rename; the blur that follows must not save it.
  const cancelTitleEdit = useRef(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [showDepsDropdown, setShowDepsDropdown] = useState(false);
  const [showRepeatDropdown, setShowRepeatDropdown] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const isDraft = !!modal?.draft;
  useFitInViewport(modalRef, setPosition, !!task);

  // Dragging logic — pointer coordinates are converted into #root CSS pixels
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const scale = getRootScale();
      setIsDragging(true);
      setDragOffset({
        x: e.clientX / scale - position.x,
        y: e.clientY / scale - position.y,
      });
    },
    [position]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const scale = getRootScale();
        const vp = rootViewport(scale);
        setPosition({
          x: Math.max(0, Math.min(e.clientX / scale - dragOffset.x, vp.width - MODAL_WIDTH)),
          y: Math.max(0, Math.min(e.clientY / scale - dragOffset.y, vp.height - 200)),
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

  // Safe now — every hook above has run unconditionally on every render.
  if (!modal || modal.type !== 'task' || !task) return null;

  const list = lists.find((l) => l.id === task.listId);
  const isPastDue = !!task.dueDate && isBefore(parseISO(task.dueDate), new Date());
  const isTemplate = isRepeatingTemplate(task);
  const seriesTemplate = task.parentRepeatingId
    ? tasks.find((t) => t.id === task.parentRepeatingId && isRepeatingTemplate(t))
    : undefined;
  const startsAfterDue =
    !!task.startAfter && !!task.dueDate && isAfter(parseISO(task.startAfter), parseISO(task.dueDate));
  // 80% of the visible height, expressed in #root CSS pixels (the shell is zoomed).
  const maxModalHeight = Math.round(rootViewport().height * 0.8);
  const urgencyBorder =
    task.urgencyColor === UrgencyColor.Red
      ? 'border-nord11/30'
      : task.urgencyColor === UrgencyColor.Orange
      ? 'border-nord12/30'
      : 'border-nord3';

  const priorityLabels: Record<Priority, { label: string; color: string; icon: string }> = {
    [Priority.High]: { label: 'High', color: 'text-nord11', icon: '🔴' },
    [Priority.Medium]: { label: 'Medium', color: 'text-nord13', icon: '🟡' },
    [Priority.Low]: { label: 'Low', color: 'text-nord10', icon: '🔵' },
    [Priority.None]: { label: 'None', color: 'text-nord3', icon: '⚪' },
  };

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-label={task.title || 'Task detail'}
      className={`fixed z-50 w-[380px] bg-nord1  border ${urgencyBorder} floating-modal animate-scale-in flex flex-col`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: maxModalHeight,
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
            {isDraft ? 'New task' : isTemplate ? 'Repeating series' : 'Task Detail'}
          </span>
          {task.urgencyColor === UrgencyColor.Red && !task.schedulingBlocked && (
            <span className="text-[10px] bg-nord11/20 text-nord11 px-1.5 py-0.5  font-semibold">
              {isPastDue ? (task.isRepeatingInstance ? 'MISSED' : 'OVERDUE') : 'WON’T FIT'}
            </span>
          )}
          {task.urgencyColor === UrgencyColor.Orange && (
            <span className="text-[10px] bg-nord12/20 text-nord12 px-1.5 py-0.5  font-semibold">
              DUE SOON
            </span>
          )}
          {task.schedulingBlocked && (
            <span
              className="text-[10px] bg-nord11/20 text-nord11 px-1.5 py-0.5  font-semibold"
              title="An incomplete dependency has no resolvable start time yet"
            >
              BLOCKED
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
      <div className="overflow-y-auto scrollable flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Title + Completion (a series template isn't itself completable —
              its occurrences are; end a series with Repeat → None) */}
          <div className="flex items-start gap-3">
            {!isTemplate && (
              <button
                onClick={() =>
                  task.completed ? uncompleteTask(task.id) : completeTask(task.id)
                }
                aria-label={task.completed ? 'Mark as not done' : 'Mark as done'}
                className={`mt-1 w-5 h-5  border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                  task.completed
                    ? 'bg-nord14 border-nord14'
                    : 'border-nord3 hover:border-nord8'
                }`}
              >
                {task.completed && <Check size={12} className="text-nord0" />}
              </button>
            )}
            <div className="flex-1">
              {editingTitle ? (
                <input
                  autoFocus
                  value={title}
                  aria-label="Task title"
                  data-dirty={String(title !== task.title)}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    if (cancelTitleEdit.current) {
                      cancelTitleEdit.current = false;
                      return;
                    }
                    updateTask(task.id, { title: title.trim() || 'Untitled Task' });
                    setEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') {
                      // Cancel the rename only — the window stays open.
                      e.stopPropagation();
                      cancelTitleEdit.current = true;
                      setTitle(task.title);
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

          {/* Series context */}
          {isTemplate && (
            <p className="text-[11px] leading-relaxed text-nord4 bg-nord0 border border-nord3/60 px-3 py-2">
              This is the template for a repeating series. Changes here apply to every upcoming
              occurrence. Set Repeat to None to end the series.
            </p>
          )}
          {seriesTemplate && (
            <p className="text-[11px] leading-relaxed text-nord4 bg-nord0 border border-nord3/60 px-3 py-2">
              One occurrence of a repeating series. Edits here change only this occurrence.{' '}
              <button
                onClick={() =>
                  openFloatingModal({ type: 'task', id: seriesTemplate.id, x: modal.x, y: modal.y })
                }
                className="text-nord8 hover:text-nord7 font-medium"
              >
                Edit the whole series
              </button>
            </p>
          )}

          {/* List Badge */}
          <div className="relative">
            <button
              onClick={() => setShowListDropdown(!showListDropdown)}
              className="flex items-center gap-2 px-2 py-1  hover:bg-nord2 transition-colors"
            >
              <div
                className="w-2.5 h-2.5 "
                style={{ backgroundColor: list?.color || '#89b4fa' }}
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
                <NumberField
                  value={task.duration}
                  min={5}
                  max={100_000}
                  step={5}
                  onCommit={(duration) => updateTask(task.id, { duration })}
                  aria-label="Duration in minutes"
                  className="w-16 px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 text-center focus:outline-none focus:ring-1 focus:ring-nord8"
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
                aria-label="Due date"
                value={toDateTimeInputValue(task.dueDate)}
                onChange={(e) =>
                  updateTask(task.id, { dueDate: fromDateTimeInputValue(e.target.value) })
                }
                className="px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 focus:outline-none focus:ring-1 focus:ring-nord8"
              />
              {task.dueDate && (
                <button
                  onClick={() => updateTask(task.id, { dueDate: null })}
                  className="text-[10px] text-nord11 hover:text-nord11"
                >
                  Remove
                </button>
              )}
            </PropertyRow>

            {/* Start After */}
            <PropertyRow icon={<ArrowUpRight size={14} />} label="Start After">
              <input
                type="datetime-local"
                aria-label="Start after"
                value={toDateTimeInputValue(task.startAfter)}
                onChange={(e) =>
                  updateTask(task.id, { startAfter: fromDateTimeInputValue(e.target.value) })
                }
                className="px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 focus:outline-none focus:ring-1 focus:ring-nord8"
              />
              {task.startAfter && (
                <button
                  onClick={() => updateTask(task.id, { startAfter: null })}
                  className="text-[10px] text-nord11 hover:text-nord11"
                >
                  Remove
                </button>
              )}
              {startsAfterDue && (
                <p className="w-full text-[10px] text-nord12">
                  This starts after its due date, so it can’t be finished on time.
                </p>
              )}
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
                onClick={() => {
                  const turningOff = task.autoSchedule;
                  updateTask(task.id, {
                    autoSchedule: !turningOff,
                    // Turning off: freeze current blocks in place so they stay
                    // visible and count as busy time. Turning on: release the
                    // pins so the engine is free to re-place all of it again.
                    scheduledBlocks: task.scheduledBlocks.map((b) => ({
                      ...b,
                      isManuallyPinned: turningOff,
                    })),
                  });
                }}
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
                <option value="">
                  Any time ({String(settings.dayStartHour).padStart(2, '0')}:00–
                  {String(settings.dayEndHour).padStart(2, '0')}:00, every day)
                </option>
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
                    <NumberField
                      value={task.minBlockDuration}
                      min={5}
                      max={1440}
                      step={5}
                      onCommit={(minBlockDuration) => updateTask(task.id, { minBlockDuration })}
                      aria-label="Minimum block length in minutes"
                      className="w-12 px-1 py-0.5 bg-nord0 border border-nord3 text-xs text-nord6 text-center focus:outline-none"
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
                {task.schedulingBlocked && (
                  <p className="text-[11px] text-nord11 mb-1">
                    Can't be scheduled yet — waiting on the incomplete dependency below.
                  </p>
                )}
                {task.dependsOn.map((depId) => {
                  const depTask = tasks.find((t) => t.id === depId);
                  return depTask ? (
                    <div
                      key={depId}
                      className="flex items-center gap-1 text-xs text-nord4 bg-nord0 px-2 py-0.5 rounded"
                    >
                      {!depTask.completed && (
                        <span className="w-1.5 h-1.5 rounded-full bg-nord11 flex-shrink-0" title="Not completed yet" />
                      )}
                      <span className="truncate flex-1">{depTask.title}</span>
                      <button
                        onClick={() =>
                          updateTask(task.id, {
                            dependsOn: task.dependsOn.filter((d) => d !== depId),
                          })
                        }
                        className="text-nord11 hover:text-nord11"
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
                            // Templates never get scheduled themselves — depending
                            // on one would block this task forever.
                            !isRepeatingTemplate(t) &&
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

            {/* Repeating — an occurrence follows its series, so only templates
                and one-off tasks can change the rule */}
            {!task.isRepeatingInstance && (
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
                    {REPEAT_OPTIONS.map((freq) => (
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
                <label className="flex items-center gap-1.5 text-[10px] text-nord3">
                  every
                  <NumberField
                    value={task.repeatingRule.interval || 1}
                    min={1}
                    max={99}
                    onCommit={(interval) =>
                      updateTask(task.id, { repeatingRule: { ...task.repeatingRule!, interval } })
                    }
                    aria-label="Repeat interval"
                    className="w-10 px-1 py-0.5 bg-nord0 border border-nord3 text-xs text-nord6 text-center focus:outline-none"
                  />
                  {INTERVAL_UNIT[task.repeatingRule.frequency]}
                </label>
              )}
              {task.repeatingRule && (
                <label className="flex items-center gap-1.5 text-[10px] text-nord3">
                  <input
                    type="checkbox"
                    checked={task.autoIgnore}
                    onChange={(e) => updateTask(task.id, { autoIgnore: e.target.checked })}
                    className="checkbox w-3 h-3"
                  />
                  <span title="When an occurrence's deadline passes, close it quietly instead of listing it under Missed">
                    Skip missed occurrences
                  </span>
                </label>
              )}
            </PropertyRow>
            )}

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
      {isDraft ? (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-nord3/50">
          <span className="text-[10px] text-nord3">Set it up, then add it</span>
          <div className="flex items-center gap-1">
            <button onClick={closeFloatingModal} className="btn-ghost text-xs">
              Cancel
            </button>
            <button
              onClick={commitDraftTask}
              className="btn-primary text-xs flex items-center gap-1"
            >
              <CalendarDays size={12} />
              Add to calendar
            </button>
          </div>
        </div>
      ) : (
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
            {isTemplate ? 'Delete series' : task.isRepeatingInstance ? 'Delete this occurrence' : 'Delete'}
          </button>
        </div>
      </div>
      )}
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
