// ============================================================
// Muse — App Root Component
// ============================================================

import React, { useEffect, useCallback, useState } from 'react';
import { useMuseStore } from './store/useMuseStore';
import { Sidebar } from './components/Sidebar';
import { CalendarView } from './components/CalendarView';
import { TaskListView } from './components/TaskListView';
import { MissedDeadlinesView } from './components/MissedDeadlinesView';
import { SettingsModal } from './components/SettingsModal';
import { FloatingTaskModal } from './components/FloatingTaskModal';
import { FloatingEventModal } from './components/FloatingEventModal';
import { CommandPalette } from './components/CommandPalette';
import { TitleBar } from './components/TitleBar';
import { PhoneHeader } from './components/PhoneHeader';
import { AuthScreen } from './components/AuthScreen';
import { RecalculateButton } from './components/RecalculateButton';
import { DiscardChangesModal } from './components/DiscardChangesModal';
import { useNotificationScheduler } from './hooks/useNotificationScheduler';
import { useCloudSync } from './hooks/useCloudSync';
import { isCloudConfigured, getCloudSession } from './utils/cloudSync';

function isElectron(): boolean {
  return !!(window as any).electronAPI;
}

export default function App() {
  const ui = useMuseStore((s) => s.ui);
  const settings = useMuseStore((s) => s.settings);
  const closeFloatingModal = useMuseStore((s) => s.closeFloatingModal);
  const setCommandPaletteOpen = useMuseStore((s) => s.setCommandPaletteOpen);
  const deleteTask = useMuseStore((s) => s.deleteTask);
  const deleteEvent = useMuseStore((s) => s.deleteEvent);
  const recalculate = useMuseStore((s) => s.recalculate);

  const isDesktop = isElectron();

  // Cloud auth state — on desktop, skip the auth gate by default
  const [cloudAuthChecked, setCloudAuthChecked] = useState(!isCloudConfigured() || isDesktop);
  const [cloudAuthenticated, setCloudAuthenticated] = useState(false);
  const [cloudSkipped, setCloudSkipped] = useState(isDesktop);

  // Check existing cloud session on mount
  useEffect(() => {
    if (!isCloudConfigured()) {
      setCloudAuthChecked(true);
      return;
    }
    getCloudSession()
      .then((session) => {
        if (session) setCloudAuthenticated(true);
        setCloudAuthChecked(true);
      })
      .catch(() => {
        // Network error or Supabase unreachable — don't block the app
        setCloudAuthChecked(true);
      });
  }, []);

  // Discard changes modal state
  const [showDiscard, setShowDiscard] = React.useState(false);
  const [pendingCloseAction, setPendingCloseAction] = React.useState<(() => void) | null>(null);

  const safeCloseModal = React.useCallback(() => {
    // Check if title input is currently focused (unsaved title)
    const active = document.activeElement;
    const isEditingInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

    if (isEditingInput && ui.floatingModal) {
      // Show discard confirmation
      setShowDiscard(true);
      setPendingCloseAction(() => () => {
        closeFloatingModal();
        setShowDiscard(false);
      });
    } else {
      closeFloatingModal();
    }
  }, [ui.floatingModal, closeFloatingModal]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape: close all popups
      if (e.key === 'Escape') {
        if (showDiscard) {
          setShowDiscard(false);
          setPendingCloseAction(null);
        } else if (ui.commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (ui.floatingModal) {
          safeCloseModal();
        }
        return;
      }

      // Ctrl+K / Cmd+K: command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!ui.commandPaletteOpen);
        return;
      }

      // Delete/Backspace: delete selected item
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        ui.floatingModal &&
        !isInputFocused()
      ) {
        e.preventDefault();
        if (ui.floatingModal.type === 'task') {
          deleteTask(ui.floatingModal.id);
        } else {
          deleteEvent(ui.floatingModal.id);
        }
        closeFloatingModal();
        return;
      }

      // R key: recalculate (when not typing)
      if (e.key === 'r' && !isInputFocused() && !e.ctrlKey && !e.metaKey) {
        recalculate();
        return;
      }
    },
    [ui, closeFloatingModal, setCommandPaletteOpen, deleteTask, deleteEvent, recalculate]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }, [settings.theme]);

  // Initial recalculation
  useEffect(() => {
    recalculate();
  }, []);

  // Desktop notification scheduler
  useNotificationScheduler();

  // Cloud sync (Supabase — pushes/pulls state when authenticated)
  useCloudSync();

  // If cloud is configured but not yet checked, show loading
  if (!cloudAuthChecked) {
    return (
      <div className="h-full flex items-center justify-center bg-nord0">
        <div className="text-nord4 text-sm">Loading...</div>
      </div>
    );
  }

  // If cloud is configured but not authenticated and not skipped, show auth screen
  if (isCloudConfigured() && !cloudAuthenticated && !cloudSkipped) {
    return (
      <AuthScreen
        onAuthenticated={() => setCloudAuthenticated(true)}
        onSkip={() => setCloudSkipped(true)}
      />
    );
  }

  const renderMainContent = () => {
    switch (ui.activeView) {
      case 'inbox':
        return <TaskListView />;
      case 'missed-deadlines':
        return <MissedDeadlinesView />;
      case 'settings':
        return <SettingsModal />;
      default:
        return <CalendarView />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-nord0 font-mono">
      {isDesktop ? <TitleBar /> : <PhoneHeader />}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 relative overflow-hidden">
          {renderMainContent()}
          <RecalculateButton />
        </main>
      </div>

      {/* Floating Modals */}
      {ui.floatingModal?.type === 'task' && <FloatingTaskModal />}
      {ui.floatingModal?.type === 'event' && <FloatingEventModal />}

      {/* Command Palette */}
      {ui.commandPaletteOpen && <CommandPalette />}

      {/* Settings Modal Overlay */}
      {ui.settingsOpen && ui.activeView !== 'settings' && <SettingsModal />}

      {/* Discard Changes Modal */}
      {showDiscard && pendingCloseAction && (
        <DiscardChangesModal
          onDiscard={pendingCloseAction}
          onCancel={() => {
            setShowDiscard(false);
            setPendingCloseAction(null);
          }}
        />
      )}
    </div>
  );
}

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  return (
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.tagName === 'SELECT' ||
    (active as HTMLElement).isContentEditable
  );
}
