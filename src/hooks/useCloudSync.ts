// ============================================================
// Muse — Cloud Sync Hook
// While someone is signed in: link this device to their account,
// then keep both sides in step — local edits upload (debounced),
// edits from other devices arrive live through a Firestore listener.
// ============================================================

import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useMuseStore, FLAG_CLOUD_UID, FLAG_LAST_SYNC } from '../store/useMuseStore';
import { readFlag, writeFlag } from '../utils/storage';
import type { SyncPayload } from '../utils/cloudSync';

const PUSH_DEBOUNCE_MS = 1500;
const RETRY_MS = 30_000;
const FLAG_DEVICE_ID = 'device_id';

/** Stable per-device id, used to ignore our own writes echoing back. */
export function getDeviceId(): string {
  let id = readFlag(FLAG_DEVICE_ID);
  if (!id) {
    id = uuidv4();
    writeFlag(FLAG_DEVICE_ID, id);
  }
  return id;
}

/**
 * Fingerprint of what's worth uploading. Built from ids + updatedAt, so
 * engine-only changes (re-placed blocks, urgency colors) don't trigger
 * uploads — every device recomputes those itself.
 */
function fingerprint(p: SyncPayload): string {
  return JSON.stringify({
    t: p.tasks.map((t) => `${t.id}:${t.updatedAt}:${t.completed ? 1 : 0}`).sort().join(','),
    e: p.events.map((e) => `${e.id}:${e.updatedAt}`).sort().join(','),
    l: p.lists.map((l) => `${l.id}:${l.updatedAt}:${l.sortOrder}`).sort().join(','),
    s: JSON.stringify(p.settings),
  });
}

export function useCloudSync() {
  const uid = useMuseStore((s) => s.ui.account?.uid ?? null);
  const tasks = useMuseStore((s) => s.tasks);
  const events = useMuseStore((s) => s.events);
  const lists = useMuseStore((s) => s.lists);
  const settings = useMuseStore((s) => s.settings);

  const linked = useRef(false);
  const lastUploaded = useRef('');
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushNowRef = useRef<(() => Promise<void>) | null>(null);

  // ── Link + live subscription for the signed-in account ──
  useEffect(() => {
    linked.current = false;
    pushNowRef.current = null;
    if (!uid) return;

    const store = useMuseStore.getState;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const applyRemote = (payload: SyncPayload, updatedAt: number) => {
      store().applySyncPayload(payload);
      lastUploaded.current = fingerprint(store().getSyncPayload());
      writeFlag(FLAG_LAST_SYNC, String(updatedAt));
    };

    const link = async () => {
      store().setCloudStatus('syncing');
      try {
        const sync = await import('../utils/cloudSync');
        const { mergePayloads } = await import('../utils/syncMerge');
        const deviceId = getDeviceId();

        const pushNow = async () => {
          const payload = store().getSyncPayload();
          const print = fingerprint(payload);
          const updatedAt = await sync.cloudPush(uid, payload, deviceId);
          lastUploaded.current = print;
          writeFlag(FLAG_LAST_SYNC, String(updatedAt));
          if (store().ui.cloudStatus !== 'ready') store().setCloudStatus('ready');
        };

        const remote = await sync.cloudPull(uid);
        if (cancelled) return;

        const linkedUid = readFlag(FLAG_CLOUD_UID);
        const lastSync = Number(readFlag(FLAG_LAST_SYNC)) || 0;
        const belongsToOtherAccount = !!linkedUid && linkedUid !== uid;

        if (belongsToOtherAccount) {
          // This device's data came from a different account — never mix
          // two people's schedules. Take this account's data as-is.
          const settings = store().settings;
          applyRemote(
            remote?.payload ?? { tasks: [], events: [], lists: [], settings: { ...settings, tutorialCompleted: false } },
            remote?.updatedAt ?? 0
          );
          if (!remote) await pushNow();
        } else if (!remote) {
          // Brand-new account (or empty cloud): this device's data seeds it.
          await pushNow();
        } else if (!linkedUid) {
          // First time this device joins an account: combine its offline data
          // with the account's so nothing is lost, then upload the result.
          applyRemote(mergePayloads(store().getSyncPayload(), remote.payload), remote.updatedAt);
          await pushNow();
        } else if (remote.updatedAt > lastSync) {
          // Another device changed things since this one last synced.
          applyRemote(remote.payload, remote.updatedAt);
        } else {
          // Cloud is not newer — upload anything done here while offline.
          await pushNow();
        }
        if (cancelled) return;

        writeFlag(FLAG_CLOUD_UID, uid);
        linked.current = true;
        pushNowRef.current = pushNow;
        store().setCloudStatus('ready');

        unsubscribe = sync.subscribeToRemote(
          uid,
          (change) => {
            if (change.deviceId === deviceId) return; // our own upload echoing back
            const last = Number(readFlag(FLAG_LAST_SYNC)) || 0;
            if (change.updatedAt <= last) return;
            applyRemote(change.payload, change.updatedAt);
          },
          (err) => store().setCloudStatus('error', err.message)
        );
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Sync failed';
        store().setCloudStatus('error', message);
        // Never upload before a successful first pull — it could overwrite
        // the account with stale data. Retry the whole link instead.
        retryTimer = setTimeout(link, RETRY_MS);
      }
    };

    link();

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (retryTimer) clearTimeout(retryTimer);
      if (pushTimer.current) clearTimeout(pushTimer.current);
      linked.current = false;
      pushNowRef.current = null;
    };
  }, [uid]);

  // ── Upload local edits (debounced) ──
  useEffect(() => {
    if (!uid || !linked.current || !pushNowRef.current) return;
    const print = fingerprint({ tasks, events, lists, settings });
    if (print === lastUploaded.current) return;

    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      pushNowRef.current?.().catch((err: Error) =>
        useMuseStore.getState().setCloudStatus('error', err.message)
      );
    }, PUSH_DEBOUNCE_MS);
  }, [uid, tasks, events, lists, settings]);

  // ── Flush a pending upload when the tab is hidden or closed ──
  useEffect(() => {
    const flush = () => {
      if (!pushTimer.current || !pushNowRef.current) return;
      clearTimeout(pushTimer.current);
      pushTimer.current = null;
      pushNowRef.current().catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
}
