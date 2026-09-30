// ============================================================
// Muse — Floating Event Detail Modal
// Draggable window for editing calendar events
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  GripHorizontal,
  Clock,
  CalendarDays,
  MapPin,
  AlignLeft,
  Repeat,
  Timer,
  Eye,
  EyeOff,
  Trash2,
  Palette,
  ChevronDown,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import { REPEAT_OPTIONS, INTERVAL_UNIT } from '../utils/repeatOptions';
import { parseISO, differenceInMinutes, addMinutes, addDays, startOfDay, isAfter } from 'date-fns';
import {
  durationToReadable,
  toDateTimeInputValue,
  fromDateTimeInputValue,
  toLocalISO,
} from '../utils/dateUtils';
import { getRootScale, rootViewport } from '../utils/viewport';
import { NumberField } from './NumberField';

const MODAL_WIDTH = 380;

const PRESET_COLORS = [
  '#8FBCBB', '#88C0D0', '#81A1C1', '#5E81AC',
  '#BF616A', '#D08770', '#EBCB8B', '#A3BE8C', '#B48EAD',
];

export function FloatingEventModal() {
  const { ui, events, closeFloatingModal, updateEvent, deleteEvent } = useMuseStore();

  const modal = ui.floatingModal;
  const event =
    modal && modal.type === 'event' ? events.find((e) => e.id === modal.id) : undefined;

  // Hooks must run unconditionally on every render (Rules of Hooks) — if the
  // event backing this modal is deleted elsewhere while the modal is still
  // open, `event` becomes undefined but this component keeps rendering (its
  // parent's condition only checks `modal.type`), so the early return below
  // must come AFTER every hook, never before.
  // modal.x/y are screen pixels; this window lives inside the zoomed #root.
  const [position, setPosition] = useState(() => {
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
  const [title, setTitle] = useState(event?.title ?? '');
  // Escape cancels a rename; the blur that follows must not save it.
  const cancelTitleEdit = useRef(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showRepeatDropdown, setShowRepeatDropdown] = useState(false);

  // Dragging logic-
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
  if (!modal || modal.type !== 'event' || !event) return null;

  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);
  const duration = differenceInMinutes(end, start);
  const isOccurrence = !!event.externalId?.startsWith('repeat-');
  const maxModalHeight = Math.round(rootViewport().height * 0.8);

  // Moving the start keeps the event's length, like every calendar app.
  const changeStart = (value: string) => {
    const nextStart = fromDateTimeInputValue(value);
    if (!nextStart) return;
    const length = Math.max(event.allDay ? 24 * 60 : 15, duration);
    updateEvent(event.id, {
      startTime: nextStart,
      endTime: toLocalISO(addMinutes(parseISO(nextStart), length)),
    });
  };

  // An end at/before the start is rejected — the input snaps back.
  const changeEnd = (value: string) => {
    const nextEnd = fromDateTimeInputValue(value);
    if (!nextEnd || !isAfter(parseISO(nextEnd), start)) return;
    updateEvent(event.id, { endTime: nextEnd });
  };

  // All-day events span whole days [00:00, next 00:00); switching back gives
  // a one-hour 09:00 slot on the same day.
  const toggleAllDay = () => {
    if (!event.allDay) {
      const dayStart = startOfDay(start);
      const dayEnd = isAfter(end, addDays(dayStart, 1)) ? addDays(startOfDay(end), 1) : addDays(dayStart, 1);
      updateEvent(event.id, { allDay: true, startTime: toLocalISO(dayStart), endTime: toLocalISO(dayEnd) });
    } else {
      const nine = addMinutes(startOfDay(start), 9 * 60);
      updateEvent(event.id, {
        allDay: false,
        startTime: toLocalISO(nine),
        endTime: toLocalISO(addMinutes(nine, 60)),
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-label={event.title || 'Event detail'}
      className="fixed z-50 w-[380px] bg-nord1  border border-nord3 floating-modal animate-scale-in flex flex-col"
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
            Event Detail
          </span>
          <div
            className="w-2.5 h-2.5 "
            style={{ backgroundColor: event.color }}
          />
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
          {/* Title */}
          <div className="flex items-start gap-2">
            <div
              className="w-4 h-4 mt-1 flex-shrink-0"
              style={{ backgroundColor: event.color }}
            />
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                aria-label="Event title"
                data-dirty={String(title !== event.title)}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (cancelTitleEdit.current) {
                    cancelTitleEdit.current = false;
                    return;
                  }
                  updateEvent(event.id, { title: title.trim() || 'Untitled Event' });
                  setEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    // Cancel the rename only — the window stays open.
                    e.stopPropagation();
                    cancelTitleEdit.current = true;
                    setTitle(event.title);
                    setEditingTitle(false);
                  }
                }}
                className="flex-1 bg-transparent text-lg font-semibold text-nord6 border-b border-nord8 focus:outline-none"
              />
            ) : (
              <h3
                className="text-lg font-semibold text-nord6 cursor-text flex-1"
                onClick={() => {
                  setEditingTitle(true);
                  setTitle(event.title);
                }}
              >
                {event.title || 'Untitled Event'}
              </h3>
            )}
          </div>

          {/* Properties */}
          <div className="space-y-3">
            {/* Start Time */}
            <PropertyRow icon={<Clock size={14} />} label="Start">
              <input
                type="datetime-local"
                aria-label="Start"
                value={toDateTimeInputValue(event.startTime)}
                onChange={(e) => changeStart(e.target.value)}
                className="px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 focus:outline-none focus:ring-1 focus:ring-nord8"
              />
            </PropertyRow>

            {/* End Time */}
            <PropertyRow icon={<Clock size={14} />} label="End">
              <input
                type="datetime-local"
                aria-label="End"
                value={toDateTimeInputValue(event.endTime)}
                min={toDateTimeInputValue(event.startTime)}
                onChange={(e) => changeEnd(e.target.value)}
                className="px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 focus:outline-none focus:ring-1 focus:ring-nord8"
              />
              <span className="text-xs text-nord3">
                ({durationToReadable(duration)})
              </span>
            </PropertyRow>

            {/* All Day Toggle */}
            <PropertyRow icon={<CalendarDays size={14} />} label="All Day">
              <button
                onClick={toggleAllDay}
                aria-label="All day"
                aria-pressed={event.allDay}
                className={`toggle ${event.allDay ? 'active' : ''}`}
              />
            </PropertyRow>

            {/* Busy/Free Status */}
            <PropertyRow
              icon={event.busy ? <EyeOff size={14} /> : <Eye size={14} />}
              label="Status"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateEvent(event.id, { busy: true })}
                  className={`px-2 py-1 text-xs transition-all ${
                    event.busy
                      ? 'bg-nord11/20 text-nord11 border border-red-500/30'
                      : 'text-nord3 border border-nord3 hover:bg-nord2'
                  }`}
                >
                  Busy
                </button>
                <button
                  onClick={() => updateEvent(event.id, { busy: false })}
                  className={`px-2 py-1 text-xs transition-all ${
                    !event.busy
                      ? 'bg-nord14/20 text-nord14 border border-green-500/30'
                      : 'text-nord3 border border-nord3 hover:bg-nord2'
                  }`}
                >
                  Free
                </button>
              </div>
            </PropertyRow>

            {/* Buffer / Travel Time */}
            <PropertyRow icon={<Timer size={14} />} label="Buffer Before">
              <div className="flex items-center gap-1">
                <NumberField
                  value={event.bufferBefore}
                  min={0}
                  max={1440}
                  step={5}
                  onCommit={(bufferBefore) => updateEvent(event.id, { bufferBefore })}
                  aria-label="Buffer before in minutes"
                  className="w-14 px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 text-center focus:outline-none"
                />
                <span className="text-xs text-nord3">min</span>
              </div>
            </PropertyRow>

            <PropertyRow icon={<Timer size={14} />} label="Buffer After">
              <div className="flex items-center gap-1">
                <NumberField
                  value={event.bufferAfter}
                  min={0}
                  max={1440}
                  step={5}
                  onCommit={(bufferAfter) => updateEvent(event.id, { bufferAfter })}
                  aria-label="Buffer after in minutes"
                  className="w-14 px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 text-center focus:outline-none"
                />
                <span className="text-xs text-nord3">min</span>
              </div>
            </PropertyRow>

            {/* Location */}
            <PropertyRow icon={<MapPin size={14} />} label="Location">
              <input
                type="text"
                value={event.location}
                onChange={(e) => updateEvent(event.id, { location: e.target.value })}
                placeholder="Add location..."
                className="flex-1 px-2 py-1 bg-nord0 border border-nord3 text-xs text-nord6 placeholder:text-nord3 focus:outline-none focus:ring-1 focus:ring-nord8"
              />
            </PropertyRow>

            {/* Repeat — an occurrence follows its series; edit the first event to change it */}
            {isOccurrence ? (
              <p className="text-[11px] leading-relaxed text-nord4 bg-nord0 border border-nord3/60 px-3 py-2">
                One occurrence of a repeating event. Changes here affect only this one;
                edit the first event in the series to change them all.
              </p>
            ) : (
            <PropertyRow icon={<Repeat size={14} />} label="Repeat">
              <div className="relative">
                <button
                  onClick={() => setShowRepeatDropdown(!showRepeatDropdown)}
                  className="text-xs text-nord4 hover:text-nord6 px-2 py-1 border border-nord3 hover:bg-nord2"
                >
                  {event.repeatingRule ? event.repeatingRule.frequency : 'None'}
                </button>
                {showRepeatDropdown && (
                  <div className="absolute top-full left-0 mt-1 z-10 bg-nord1 border border-nord3  shadow-none py-1 min-w-[140px] dropdown-menu">
                    <button
                      onClick={() => {
                        updateEvent(event.id, { repeatingRule: null });
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
                          updateEvent(event.id, {
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
              {event.repeatingRule && (
                <label className="flex items-center gap-1.5 text-[10px] text-nord3">
                  every
                  <NumberField
                    value={event.repeatingRule.interval || 1}
                    min={1}
                    max={99}
                    onCommit={(interval) =>
                      updateEvent(event.id, { repeatingRule: { ...event.repeatingRule!, interval } })
                    }
                    aria-label="Repeat interval"
                    className="w-10 px-1 py-0.5 bg-nord0 border border-nord3 text-xs text-nord6 text-center focus:outline-none"
                  />
                  {INTERVAL_UNIT[event.repeatingRule.frequency]}
                </label>
              )}
            </PropertyRow>
            )}

            {/* Color */}
            <PropertyRow icon={<Palette size={14} />} label="Color">
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="flex items-center gap-2 px-2 py-1 border border-nord3 hover:bg-nord2"
                >
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: event.color }}
                  />
                  <span className="text-xs text-nord4">{event.color}</span>
                </button>
                {showColorPicker && (
                  <div className="absolute top-full left-0 mt-1 z-10 bg-nord1 border border-nord3  shadow-none p-2 dropdown-menu">
                    <div className="grid grid-cols-5 gap-1.5">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            updateEvent(event.id, { color });
                            setShowColorPicker(false);
                          }}
                          className={`w-6 h-6  transition-transform hover:scale-110 ${
                            event.color === color ? 'ring-2 ring-nord6 ring-offset-2 ring-offset-nord1' : ''
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PropertyRow>

            {/* Notes */}
            <PropertyRow icon={<AlignLeft size={14} />} label="Notes" fullWidth>
              <textarea
                value={event.notes}
                onChange={(e) => updateEvent(event.id, { notes: e.target.value })}
                placeholder="Add notes..."
                className="w-full px-2 py-1.5 bg-nord0 border border-nord3 text-xs text-nord6 placeholder:text-nord3 focus:outline-none focus:ring-1 focus:ring-nord8 resize-none"
                rows={3}
              />
            </PropertyRow>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end px-4 py-2 border-t border-nord3/50">
        <button
          onClick={() => {
            deleteEvent(event.id);
            closeFloatingModal();
          }}
          className="btn-danger text-xs flex items-center gap-1"
        >
          <Trash2 size={12} />
          {event.repeatingRule ? 'Delete series' : isOccurrence ? 'Delete this occurrence' : 'Delete event'}
        </button>
      </div>
    </div>
  );
}

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
