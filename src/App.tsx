// ============================================================
// Muse — App Root Component
// ============================================================

import React, { useEffect, useCallback, useState } from 'react';
import { useMuseStore, FLAG_CLOUD_UID } from './store/useMuseStore';
import { Sidebar } from './components/Sidebar';
import { CalendarView } from './components/CalendarView';
import { TaskListView } from './components/TaskListView';
import { InboxView } from './components/InboxView';
import { MissedDeadlinesView } from './components/MissedDeadlinesView';
import { SettingsModal } from './components/SettingsModal';
import { FloatingTaskModal } from './components/FloatingTaskModal';
import { FloatingEventModal } from './components/FloatingEventModal';
import { CommandPalette } from './components/CommandPalette';
import { TitleBar } from './components/TitleBar';
import { PhoneHeader } from './components/PhoneHeader';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Tutorial } from './components/Tutorial';
import { RecalculateButton } from './components/RecalculateButton';
import { DiscardChangesModal } from './components/DiscardChangesModal';
import { useNotificationScheduler } from './hooks/useNotificationScheduler';
import { useCloudSync } from './hooks/useCloudSync';
import { readFlag } from './utils/storage';

// The engine re-plans from "now" on this cadence so unfinished past blocks
// roll forward on their own, even when nothing is being edited.
const AUTO_RECALC_MS = 5 * 60 * 1000;
// Never let a slow network hold the app behind the loading screen.
const AUTH_TIMEOUT_MS = 8000;

function isElectron(): boolean {
  return !!(window as any).electronAPI;
}

export default function App() {
  const ui = useMuseStore((s) => s.ui);
  const tutorialCompleted = useMuseStore((s) => s.settings.tutorialCompleted);
  const theme = useMuseStore((s) => s.settings.theme);
  const closeFloatingModal = useMuseStore((s) => s.closeFloatingModal);
  const setCommandPaletteOpen = useMuseStore((s) => s.setCommandPaletteOpen);
  const deleteTask = useMuseStore((s) => s.deleteTask);
  const deleteEvent = useMuseStore((s) => s.deleteEvent);
  const recalculate = useMuseStore((s) => s.recalculate);
  const setAccount = useMuseStore((s) => s.setAccount);
  const openTutorial = useMuseStore((s) => s.openTutorial);

  const isDesktop = isElectron();

  // A device that was linked to an account waits for the session to restore
  // before deciding what to show; everyone else renders immediately.
  const [authResolved, setAuthResolved] = useState(() => !readFlag(FLAG_CLOUD_UID));

  // Only devices with an account load Firebase at startup (to restore the
  // session and notice sign-outs); offline use never downloads it.
  const watchAuth = !!ui.account || !!readFlag(FLAG_CLOUD_UID);

  useEffect(() => {
    if (!watchAuth) {
      setAuthResolved(true);
      return;
    }
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    import('./utils/cloudSync')
      .then(({ onAuthStateChange }) => {
        if (cancelled) return;
        unsubscribe = onAuthStateChange((user) => {
          setAccount(user);
          setAuthResolved(true);
        });
      })
      .catch(() => setAuthResolved(true));
    const timeout = setTimeout(() => setAuthResolved(true), AUTH_TIMEOUT_MS);
    return () => {
      cancelled = true;
      unsubscribe?.();
      clearTimeout(timeout);
    };
  }, [watchAuth, setAccount]);

  const showWelcome = authResolved && !ui.account && ui.onboardingChoice !== 'offline';

  // Show the tour once to anyone new. Signed-in people wait for the first
  // sync, so an existing account's "already seen it" flag can arrive first.
  useEffect(() => {
    if (!authResolved || showWelcome || tutorialCompleted || ui.tutorialOpen) return;
    if (ui.account && ui.cloudStatus !== 'ready' && ui.cloudStatus !== 'error') return;
    openTutorial();
  }, [authResolved, showWelcome, tutorialCompleted, ui.tutorialOpen, ui.account, ui.cloudStatus, openTutorial]);

  // Discard changes modal state
  const [showDiscard, setShowDiscard] = React.useState(false);
  const [pendingCloseAction, setPendingCloseAction] = React.useState<(() => void) | null>(null);

  const safeCloseModal = React.useCallback(() => {
    // Only fields inside the detail window that hold an uncommitted edit
    // count as unsaved (they mark themselves data-dirty). A focused input
    // elsewhere — e.g. the sidebar's quick-add box — is not an edit.
    const hasUnsavedEdit = !!document.querySelector('.floating-modal [data-dirty="true"]');

    if (hasUnsavedEdit && ui.floatingModal) {
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
      // The tour owns the keyboard while it's open.
      if (ui.tutorialOpen) return;

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

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!ui.commandPaletteOpen);
        return;
      }

      // Delete/Backspace: delete the item whose detail window is open
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        ui.floatingModal &&
        !ui.commandPaletteOpen &&
        !isInputFocused()
      ) {
        e.preventDefault();
        if (ui.floatingModal.type === 'task') deleteTask(ui.floatingModal.id);
        else deleteEvent(ui.floatingModal.id);
        closeFloatingModal();
        return;
      }

      // R: recalculate (when not typing)
      if (
        e.key.toLowerCase() === 'r' &&
        !isInputFocused() &&
        !ui.commandPaletteOpen &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        recalculate();
      }
    },
    [ui, showDiscard, closeFloatingModal, setCommandPaletteOpen, deleteTask, deleteEvent, recalculate, safeCloseModal]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme || 'dark');
  }, [theme]);

  // Startup: restore from IndexedDB if localStorage was wiped, then schedule.
  // Afterwards, keep the plan current as time passes.
  useEffect(() => {
    const store = useMuseStore.getState();
    store.recoverFromIndexedDB().finally(() => store.recalculate());

    const interval = setInterval(() => useMuseStore.getState().recalculate(), AUTO_RECALC_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') useMuseStore.getState().recalculate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Desktop notification scheduler
  useNotificationScheduler();

  // Cloud sync (Firebase — active while signed in)
  useCloudSync();

  if (!authResolved) {
    return (
      <div className="h-full flex items-center justify-center bg-nord0">
        <div className="text-nord4 text-sm">Loading…</div>
      </div>
    );
  }

  if (showWelcome) {
    return (
      <div className="h-full flex flex-col bg-nord0 font-mono">
        {isDesktop && <TitleBar />}
        <div className="flex-1 min-h-0">
          <WelcomeScreen />
        </div>
      </div>
    );
  }

  const renderMainContent = () => {
    switch (ui.activeView) {
      case 'tasks':
        return <TaskListView />;
      case 'inbox':
        return <InboxView />;
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

      {/* Floating Modals — keyed so switching items resets their local state */}
      {ui.floatingModal?.type === 'task' && <FloatingTaskModal key={ui.floatingModal.id} />}
      {ui.floatingModal?.type === 'event' && <FloatingEventModal key={ui.floatingModal.id} />}

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

      {/* Guided tour */}
      {ui.tutorialOpen && <Tutorial />}
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
