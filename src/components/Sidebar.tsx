// ============================================================
// Muse — Left Sidebar (Terminal-style navigation)
// ============================================================

import React, { useState } from 'react';
import {
  Calendar,
  ListTodo,
  AlertTriangle,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Edit3,
  FolderPlus,
  Menu,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export function Sidebar() {
  const {
    ui,
    lists,
    tasks,
    toggleSidebar,
    setActiveView,
    setSelectedListId,
    addList,
    deleteList,
    addTask,
    toggleSettings,
  } = useMuseStore();

  const [listsExpanded, setListsExpanded] = useState(true);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [contextMenuList, setContextMenuList] = useState<string | null>(null);
  const [quickCapture, setQuickCapture] = useState('');
  const isMobile = useIsMobile();

  const inboxCount = tasks.filter((t) => t.inInbox && !t.completed).length;
  const taskCount = tasks.filter((t) => !t.completed).length;
  const missedCount = tasks.filter(
    (t) => !t.completed && t.dueDate && new Date(t.dueDate) < new Date() && !t.autoIgnore
  ).length;

  // On mobile, collapsed sidebar is completely hidden (use header menu button)
  if (!ui.sidebarOpen) {
    if (isMobile) return null;
    return (
      <div className="w-10 bg-nord1 border-r border-nord3 flex flex-col items-center py-2 gap-1 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-nord2 transition-colors text-nord4 text-xs"
          title="expand"
        >
          {isMobile ? <Menu size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          onClick={() => setActiveView('calendar')}
          className={`p-1.5 transition-colors ${
            ui.activeView === 'calendar' ? 'bg-nord2 text-nord8' : 'hover:bg-nord2 text-nord4'
          }`}
        >
          <Calendar size={14} />
        </button>
        <button
          onClick={() => setActiveView('inbox')}
          className={`p-1.5 transition-colors relative ${
            ui.activeView === 'inbox' ? 'bg-nord2 text-nord8' : 'hover:bg-nord2 text-nord4'
          }`}
        >
          <ListTodo size={14} />
        </button>
        <button
          onClick={() => setActiveView('missed-deadlines')}
          className={`p-1.5 transition-colors ${
            ui.activeView === 'missed-deadlines' ? 'bg-nord2 text-nord11' : 'hover:bg-nord2 text-nord4'
          }`}
        >
          <AlertTriangle size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => {
            setActiveView('settings');
            if (isMobile) toggleSidebar(); // Open sidebar so back is available
          }}
          className="p-1.5 hover:bg-nord2 transition-colors text-nord4"
        >
          <Settings size={14} />
        </button>
      </div>
    );
  }

  const handleQuickCapture = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && quickCapture.trim()) {
      addTask({
        title: quickCapture.trim(),
        inInbox: false,
        autoSchedule: true,
      });
      setQuickCapture('');
    }
  };

  const handleAddList = () => {
    const list = addList({ name: 'new-list', color: getRandomColor() });
    setEditingListId(list.id);
    setNewListName('new-list');
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={toggleSidebar}
        />
      )}
      <div
        className={`bg-nord1 border-r border-nord3 flex flex-col overflow-hidden font-mono flex-shrink-0 ${
          isMobile ? 'fixed left-0 top-0 bottom-0 z-50 shadow-lg' : ''
        }`}
        style={{
          width: isMobile ? 'min(260px, 80vw)' : ui.sidebarWidth,
          paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : undefined,
          paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : undefined,
        }}
      >
      {/* Quick Capture — terminal input */}
      <div className="p-2 border-b border-nord3">
        <div className="flex items-center gap-1 bg-nord0 border border-nord3 px-2 py-1.5">
          <span className="text-nord8 text-xs">$</span>
          <input
            type="text"
            value={quickCapture}
            onChange={(e) => setQuickCapture(e.target.value)}
            onKeyDown={handleQuickCapture}
            placeholder="add task..."
            className="flex-1 bg-transparent text-xs text-nord6 placeholder:text-nord3 focus:outline-none"
          />
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto scrollable">
        <div className="p-1">
          <NavItem
            prefix=">"
            label="calendar"
            active={ui.activeView === 'calendar' && !ui.selectedListId}
            onClick={() => {
              setActiveView('calendar');
              setSelectedListId(null);
              if (isMobile) toggleSidebar();
            }}
          />
          <NavItem
            prefix=">"
            label="tasks"
            active={ui.activeView === 'inbox'}
            badge={taskCount > 0 ? taskCount : undefined}
            onClick={() => {
              setActiveView('inbox');
              if (isMobile) toggleSidebar();
            }}
          />
          <NavItem
            prefix="!"
            label="missed"
            active={ui.activeView === 'missed-deadlines'}
            badge={missedCount > 0 ? missedCount : undefined}
            badgeColor="red"
            onClick={() => {
              setActiveView('missed-deadlines');
              if (isMobile) toggleSidebar();
            }}
          />
        </div>

        {/* Separator */}
        <div className="mx-2 border-t border-nord3 border-dashed" />

        {/* Lists Section */}
        <div className="mt-1">
          <div className="px-2 py-1.5 flex items-center justify-between">
            <button
              onClick={() => setListsExpanded(!listsExpanded)}
              className="flex items-center gap-1 text-[10px] font-bold text-nord3 uppercase tracking-widest hover:text-nord4 transition-colors"
            >
              {listsExpanded ? '[-]' : '[+]'}
              <span className="ml-1">lists</span>
            </button>
            <button
              onClick={handleAddList}
              className="p-0.5 hover:bg-nord2 transition-colors text-nord3 hover:text-nord8"
              title="add list"
            >
              <Plus size={12} />
            </button>
          </div>

          {listsExpanded && (
            <div className="px-1 pb-2 space-y-0.5">
              {lists
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((list) => {
                  const taskCount = tasks.filter(
                    (t) => t.listId === list.id && !t.completed && !t.inInbox
                  ).length;

                  return (
                    <div key={list.id} className="relative group">
                      {editingListId === list.id ? (
                        <div className="px-1 py-0.5">
                          <input
                            autoFocus
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            onBlur={() => {
                              if (newListName.trim()) {
                                useMuseStore.getState().updateList(list.id, {
                                  name: newListName.trim(),
                                });
                              }
                              setEditingListId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (newListName.trim()) {
                                  useMuseStore.getState().updateList(list.id, {
                                    name: newListName.trim(),
                                  });
                                }
                                setEditingListId(null);
                              }
                              if (e.key === 'Escape') setEditingListId(null);
                            }}
                            className="w-full px-2 py-1 bg-nord0 border border-nord8 text-xs text-nord6 focus:outline-none"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveView('calendar');
                            setSelectedListId(list.id);
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1 text-xs transition-all ${
                            ui.selectedListId === list.id
                              ? 'bg-nord2 text-nord8'
                              : 'text-nord4 hover:bg-nord2 hover:text-nord6'
                          }`}
                        >
                          <span
                            className="w-2 h-2 flex-shrink-0"
                            style={{ backgroundColor: list.color }}
                          />
                          <span className="truncate flex-1 text-left">{list.name}</span>
                          {taskCount > 0 && (
                            <span className="text-[10px] text-nord3">{taskCount}</span>
                          )}
                        </button>
                      )}

                      {/* Context menu button */}
                      {!list.isDefault && editingListId !== list.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenuList(
                              contextMenuList === list.id ? null : list.id
                            );
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-nord3 transition-all"
                        >
                          <MoreHorizontal size={10} className="text-nord3" />
                        </button>
                      )}

                      {/* Context dropdown */}
                      {contextMenuList === list.id && (
                        <div className="absolute right-0 top-full mt-0.5 z-50 bg-nord1 border border-nord3 py-0.5 min-w-[120px]">
                          <button
                            onClick={() => {
                              setEditingListId(list.id);
                              setNewListName(list.name);
                              setContextMenuList(null);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1 text-xs text-nord4 hover:bg-nord2 hover:text-nord6"
                          >
                            <Edit3 size={10} />
                            rename
                          </button>
                          <button
                            onClick={() => {
                              deleteList(list.id);
                              setContextMenuList(null);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1 text-xs text-nord11 hover:bg-nord11/10"
                          >
                            <Trash2 size={10} />
                            delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Footer: Collapse + Settings */}
      <div className="p-1 border-t border-nord3 flex items-center gap-1">
        <button
          onClick={toggleSidebar}
          className="flex-1 flex items-center gap-1 px-2 py-1 text-[10px] text-nord3 hover:bg-nord2 hover:text-nord4 transition-colors"
        >
          <ChevronRight size={10} className="rotate-180" />
          collapse
        </button>
        <button
          onClick={() => {
            setActiveView('settings');
            if (isMobile) toggleSidebar(); // close sidebar on mobile
          }}
          className={`px-2 py-1 text-[10px] transition-colors ${
            ui.settingsOpen ? 'bg-nord2 text-nord8' : 'text-nord3 hover:bg-nord2 hover:text-nord4'
          }`}
        >
          <Settings size={12} />
        </button>
      </div>
    </div>
    </>
  );
}

// ---- Nav Item Component (Terminal-style) ----

function NavItem({
  prefix,
  label,
  active,
  badge,
  badgeColor = 'primary',
  onClick,
}: {
  prefix: string;
  label: string;
  active: boolean;
  badge?: number;
  badgeColor?: 'primary' | 'red';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs font-mono transition-all ${
        active
          ? 'bg-nord2 text-nord8'
          : 'text-nord4 hover:bg-nord2 hover:text-nord6'
      }`}
    >
      <span className={active ? 'text-nord8' : 'text-nord3'}>{prefix}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span
          className={`min-w-[16px] h-4 px-1 text-[10px] font-bold flex items-center justify-center ${
            badgeColor === 'red'
              ? 'bg-nord11/20 text-nord11'
              : 'bg-nord8/20 text-nord8'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ---- Helpers ----

function getRandomColor(): string {
  const colors = [
    '#88C0D0', '#81A1C1', '#5E81AC', '#8FBCBB',
    '#A3BE8C', '#B48EAD', '#D08770', '#EBCB8B',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
