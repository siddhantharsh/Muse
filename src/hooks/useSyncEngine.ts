// ============================================================
// Muse — Sync Hook
// Manages bidirectional sync between desktop and phone
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { useMuseStore } from '../store/useMuseStore';
import {
  isElectron,
  desktopPushState,
  phonePullState,
  phonePushState,
  phoneCheckVersion,
  SyncData,
} from '../utils/syncClient';

const PHONE_POLL_INTERVAL = 3000; // 3s poll on phone
const DESKTOP_PUSH_DEBOUNCE = 1000; // 1s debounce on desktop writes

export function useSyncEngine() {
  const lastVersionRef = useRef<number>(0);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydratedFromSync = useRef(false);

  // Get store actions and state
  const tasks = useMuseStore((s) => s.tasks);
  const events = useMuseStore((s) => s.events);
  const lists = useMuseStore((s) => s.lists);
  const settings = useMuseStore((s) => s.settings);

  const getStateSnapshot = useCallback((): Omit<SyncData, '_version'> => {
    const state = useMuseStore.getState();
    return {
      tasks: state.tasks,
      events: state.events,
      lists: state.lists,
      settings: state.settings,
    };
  }, []);

  const applyRemoteState = useCallback((data: SyncData) => {
    if (!data) return;
    const store = useMuseStore.getState();

    // Apply remote data to the store
    // Use the set function directly
    useMuseStore.setState({
      tasks: data.tasks || [],
      events: data.events || [],
      lists: data.lists?.length ? data.lists : store.lists,
      settings: data.settings || store.settings,
    });

    // Also persist to localStorage (so it survives reload)
    store.persist();

    lastVersionRef.current = data._version || Date.now();
  }, []);

  // ---- Desktop: push state to file whenever it changes ----
  useEffect(() => {
    if (!isElectron()) return;

    // Debounced push
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      desktopPushState(getStateSnapshot());
    }, DESKTOP_PUSH_DEBOUNCE);

    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [tasks, events, lists, settings, getStateSnapshot]);

  // ---- Phone: initial hydration from server ----
  useEffect(() => {
    if (isElectron()) return;
    if (isHydratedFromSync.current) return;

    // On phone, pull full state on mount
    phonePullState().then((data) => {
      if (data && data.tasks) {
        applyRemoteState(data);
        isHydratedFromSync.current = true;
      }
    });
  }, [applyRemoteState]);

  // ---- Phone: poll for changes ----
  useEffect(() => {
    if (isElectron()) return;

    const interval = setInterval(async () => {
      try {
        const remoteVersion = await phoneCheckVersion();
        if (remoteVersion > lastVersionRef.current) {
          const data = await phonePullState();
          if (data) {
            applyRemoteState(data);
          }
        }
      } catch {
        // Network error, skip this cycle
      }
    }, PHONE_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [applyRemoteState]);

  // ---- Phone: push changes when user makes edits ----
  useEffect(() => {
    if (isElectron()) return;
    if (!isHydratedFromSync.current) return; // Don't push until initial hydration

    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      phonePushState(getStateSnapshot());
    }, DESKTOP_PUSH_DEBOUNCE);

    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [tasks, events, lists, settings, getStateSnapshot]);
}
