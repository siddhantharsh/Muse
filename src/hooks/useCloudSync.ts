// ============================================================
// Muse — Cloud Sync Hook
// Pushes local state to Supabase on changes, pulls on connect
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { useMuseStore } from '../store/useMuseStore';
import {
  cloudPush,
  cloudPull,
  getCloudUser,
  isCloudConfigured,
} from '../utils/cloudSync';

const CLOUD_PUSH_DEBOUNCE = 3000; // 3s debounce for cloud pushes

export function useCloudSync() {
  const tasks = useMuseStore((s) => s.tasks);
  const events = useMuseStore((s) => s.events);
  const lists = useMuseStore((s) => s.lists);
  const settings = useMuseStore((s) => s.settings);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushRef = useRef<string>('');
  const initialPullDone = useRef(false);

  // Pull remote state on first mount (if authenticated)
  useEffect(() => {
    if (!isCloudConfigured() || initialPullDone.current) return;

    (async () => {
      try {
        const user = await getCloudUser();
        if (!user) return;

        const remote = await cloudPull();
        if (remote && remote.tasks.length > 0) {
          const localTasks = useMuseStore.getState().tasks;
          // Only overwrite if local is empty or remote is newer
          if (localTasks.length === 0) {
            useMuseStore.setState({
              tasks: remote.tasks,
              events: remote.events,
              lists: remote.lists,
              settings: { ...useMuseStore.getState().settings, ...remote.settings },
            });
            useMuseStore.getState().persist();
            console.log('[Muse Cloud] Pulled remote state');
          }
        }
        initialPullDone.current = true;
      } catch (e) {
        console.error('[Muse Cloud] Pull failed:', e);
      }
    })();
  }, []);

  // Push local state on changes (debounced)
  const debouncedPush = useCallback(() => {
    if (!isCloudConfigured()) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);

    pushTimer.current = setTimeout(async () => {
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

        // Skip if payload hasn't changed
        const hash = JSON.stringify({
          t: payload.tasks.length,
          e: payload.events.length,
          l: payload.lists.length,
          u: payload.tasks.map((t) => t.updatedAt).sort().slice(-3).join(','),
        });
        if (hash === lastPushRef.current) return;
        lastPushRef.current = hash;

        await cloudPush(payload);
        console.log('[Muse Cloud] Pushed state');
      } catch (e) {
        console.error('[Muse Cloud] Push failed:', e);
      }
    }, CLOUD_PUSH_DEBOUNCE);
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
