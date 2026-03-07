// ============================================================
// Muse — Cloud Sync Hook
// Bi-directional sync: pushes on local changes, polls remote
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { useMuseStore } from '../store/useMuseStore';
import {
  cloudPush,
  cloudPull,
  cloudGetVersion,
  getCloudUser,
  isCloudConfigured,
  onAuthStateChange,
} from '../utils/cloudSync';

const PUSH_DEBOUNCE = 3000;   // 3s debounce for pushing local changes
const POLL_INTERVAL = 15000;  // 15s polling for remote changes

export function useCloudSync() {
  const tasks = useMuseStore((s) => s.tasks);
  const events = useMuseStore((s) => s.events);
  const lists = useMuseStore((s) => s.lists);
  const settings = useMuseStore((s) => s.settings);

  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushHash = useRef<string>('');
  const lastRemoteVersion = useRef<string | null>(null);
  const isPulling = useRef(false);    // guard against pull→push loops

  // ── Pull remote state and apply it ──
  const pullRemote = useCallback(async (force = false) => {
    if (!isCloudConfigured()) return;
    try {
      const user = await getCloudUser();
      if (!user) return;

      // Check version first (lightweight)
      const remoteVersion = await cloudGetVersion();
      if (!remoteVersion) return; // no remote data yet

      // Skip if version hasn't changed (unless forced)
      if (!force && remoteVersion === lastRemoteVersion.current) return;

      const remote = await cloudPull();
      if (!remote) return;

      isPulling.current = true;
      lastRemoteVersion.current = remoteVersion;

      // Apply remote state
      const currentSettings = useMuseStore.getState().settings;
      useMuseStore.setState({
        tasks: remote.tasks,
        events: remote.events,
        lists: remote.lists.length > 0 ? remote.lists : useMuseStore.getState().lists,
        settings: { ...currentSettings, ...remote.settings },
      });
      useMuseStore.getState().persist();

      // Update push hash so we don't immediately re-push what we just pulled
      const hash = buildHash(remote.tasks, remote.events, remote.lists, remote.settings);
      lastPushHash.current = hash;

      console.log('[Muse Cloud] Pulled remote state', remoteVersion);

      // Trigger recalculate to refresh scheduling — blocks may be stale or missing
      useMuseStore.getState().recalculate();

      // Release guard after recalculate debounce + buffer
      setTimeout(() => { isPulling.current = false; }, 1500);
    } catch (e) {
      isPulling.current = false;
      console.error('[Muse Cloud] Pull failed:', e);
    }
  }, []);

  // ── Pull on auth state change (handles sign-in after mount) ──
  useEffect(() => {
    if (!isCloudConfigured()) return;
    const { data } = onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // User just signed in — pull remote data immediately
        console.log('[Muse Cloud] Auth signed in — pulling remote data');
        pullRemote(true);
      }
    });
    return () => { data.subscription.unsubscribe(); };
  }, [pullRemote]);

  // ── Also try pulling on mount (for page refresh when already signed in) ──
  useEffect(() => {
    pullRemote(true);
  }, [pullRemote]);

  // ── Periodic polling for remote changes ──
  useEffect(() => {
    if (!isCloudConfigured()) return;
    const interval = setInterval(() => pullRemote(), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [pullRemote]);

  // ── Push local state on changes (debounced) ──
  const debouncedPush = useCallback(() => {
    if (!isCloudConfigured() || isPulling.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);

    pushTimer.current = setTimeout(async () => {
      if (isPulling.current) return; // double-check guard
      try {
        const user = await getCloudUser();
        if (!user) return;

        const state = useMuseStore.getState();
        const payload = {
          tasks: state.tasks,
          events: state.events,
          lists: state.lists,
          settings: state.settings,
        };

        // Skip if nothing changed (hash includes settings now)
        const hash = buildHash(payload.tasks, payload.events, payload.lists, payload.settings);
        if (hash === lastPushHash.current) return;
        lastPushHash.current = hash;

        await cloudPush(payload);
        // After pushing, update our known remote version
        const newVersion = await cloudGetVersion();
        if (newVersion) lastRemoteVersion.current = newVersion;

        console.log('[Muse Cloud] Pushed state');
      } catch (e) {
        console.error('[Muse Cloud] Push failed:', e);
      }
    }, PUSH_DEBOUNCE);
  }, []);

  useEffect(() => {
    debouncedPush();
  }, [tasks, events, lists, settings, debouncedPush]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, []);
}

/** Build a hash string to detect meaningful state changes (includes settings) */
function buildHash(tasks: any[], events: any[], lists: any[], settings?: any): string {
  return JSON.stringify({
    tc: tasks.length,
    ec: events.length,
    lc: lists.length,
    // Include recent updatedAt timestamps to catch edits
    tu: tasks.map((t: any) => `${t.id}:${t.updatedAt || ''}`).sort().join(','),
    eu: events.map((e: any) => `${e.id}:${e.updatedAt || ''}`).sort().join(','),
    // Include settings hash so settings-only changes get synced
    sh: settings ? JSON.stringify(settings) : '',
  });
}

