// ============================================================
// Muse — Command Palette (Ctrl+K)
// Quick access to all actions
// ============================================================

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar,
  Inbox,
  AlertTriangle,
  Settings,
  Plus,
  RefreshCw,
  Layout,
  Clock,
  Zap,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

interface Command {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  category: string;
}

export function CommandPalette() {
  const {
    setCommandPaletteOpen,
    setActiveView,
    recalculate,
    toggleSettings,
    addTask,
    addEvent,
    setViewMode,
    openFloatingModal,
  } = useMuseStore();

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands: Command[] = useMemo(
    () => [
      {
        id: 'recalculate',
        label: 'Recalculate Schedule',
        description: 'Rebuild the entire schedule from scratch',
        icon: <RefreshCw size={16} />,
        action: () => {
          recalculate();
          setCommandPaletteOpen(false);
        },
        category: 'Engine',
      },
      {
        id: 'add-task',
        label: 'New Task',
        description: 'Create a new task',
        icon: <Plus size={16} />,
        action: () => {
          const task = addTask({ title: '' });
          openFloatingModal({
            type: 'task',
            id: task.id,
            x: window.innerWidth / 2 - 190,
            y: window.innerHeight / 4,
          });
          setCommandPaletteOpen(false);
        },
        category: 'Create',
      },
      {
        id: 'add-event',
        label: 'New Event',
        description: 'Create a new calendar event',
        icon: <Calendar size={16} />,
        action: () => {
          const now = new Date();
          const start = new Date(now);
          start.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
          const end = new Date(start);
          end.setHours(start.getHours() + 1);
          const event = addEvent({
            title: '',
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          });
          openFloatingModal({
            type: 'event',
            id: event.id,
            x: window.innerWidth / 2 - 190,
            y: window.innerHeight / 4,
          });
          setCommandPaletteOpen(false);
        },
        category: 'Create',
      },
      {
        id: 'add-inbox',
        label: 'Quick Capture to Inbox',
        description: 'Add a task directly to inbox',
        icon: <Inbox size={16} />,
        action: () => {
          addTask({ title: 'New inbox item', inInbox: true, autoSchedule: false });
          setActiveView('inbox');
          setCommandPaletteOpen(false);
        },
        category: 'Create',
      },
      {
        id: 'view-calendar',
        label: 'Go to Calendar',
        description: 'Switch to calendar view',
        icon: <Calendar size={16} />,
        action: () => {
          setActiveView('calendar');
          setCommandPaletteOpen(false);
        },
        category: 'Navigate',
      },
      {
        id: 'view-inbox',
        label: 'Go to Inbox',
        description: 'Switch to inbox view',
        icon: <Inbox size={16} />,
        action: () => {
          setActiveView('inbox');
          setCommandPaletteOpen(false);
        },
        category: 'Navigate',
      },
      {
        id: 'view-missed',
        label: 'Go to Missed Deadlines',
        description: 'View overdue tasks',
        icon: <AlertTriangle size={16} />,
        action: () => {
          setActiveView('missed-deadlines');
          setCommandPaletteOpen(false);
        },
        category: 'Navigate',
      },
      {
        id: 'view-settings',
        label: 'Open Settings',
        description: 'Global application settings',
        icon: <Settings size={16} />,
        action: () => {
          setActiveView('settings');
          setCommandPaletteOpen(false);
        },
        category: 'Navigate',
      },
      {
        id: 'view-day',
        label: 'Day View',
        description: 'Switch to single-day calendar',
        icon: <Layout size={16} />,
        action: () => {
          setActiveView('calendar');
          setViewMode('day' as any);
          setCommandPaletteOpen(false);
        },
        category: 'View',
      },
      {
        id: 'view-3day',
        label: '3-Day View',
        description: 'Switch to 3-day calendar',
        icon: <Layout size={16} />,
        action: () => {
          setActiveView('calendar');
          setViewMode('3day' as any);
          setCommandPaletteOpen(false);
        },
        category: 'View',
      },
      {
        id: 'view-week',
        label: 'Week View',
        description: 'Switch to week calendar',
        icon: <Layout size={16} />,
        action: () => {
          setActiveView('calendar');
          setViewMode('week' as any);
          setCommandPaletteOpen(false);
        },
        category: 'View',
      },
    ],
    []
  );

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    }
    if (e.key === 'Enter' && filtered.length > 0) {
      filtered[0].action();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-[520px] bg-nord1  border border-nord3 shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-nord3">
          <Search size={18} className="text-nord3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-nord6 placeholder:text-nord3 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 bg-nord0 border border-nord3 text-[10px] text-nord3 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto scrollable py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-nord3">
              No commands found
            </div>
          ) : (
            <>
              {['Engine', 'Create', 'Navigate', 'View'].map((category) => {
                const catCommands = filtered.filter((c) => c.category === category);
                if (catCommands.length === 0) return null;
                return (
                  <div key={category}>
                    <div className="px-4 py-1">
                      <span className="text-[10px] uppercase tracking-wider text-nord3 font-semibold">
                        {category}
                      </span>
                    </div>
                    {catCommands.map((command) => (
                      <button
                        key={command.id}
                        onClick={command.action}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-nord2 transition-colors"
                      >
                        <span className="text-nord3">{command.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-nord6">{command.label}</div>
                          <div className="text-xs text-nord3 truncate">
                            {command.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-nord3/50 flex items-center gap-4">
          <span className="text-[10px] text-nord3">
            <kbd className="px-1 py-0.5 bg-nord0 border border-nord3 font-mono mr-1">
              ↵
            </kbd>
            to select
          </span>
          <span className="text-[10px] text-nord3">
            <kbd className="px-1 py-0.5 bg-nord0 border border-nord3 font-mono mr-1">
              esc
            </kbd>
            to dismiss
          </span>
        </div>
      </div>
    </div>
  );
}
