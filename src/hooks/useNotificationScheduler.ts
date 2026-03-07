// ============================================================
// Muse — Notification Scheduler
// Checks once per minute for upcoming tasks/events and fires
// exactly ONE notification per item at the configured lead time
// ============================================================

import { useEffect, useRef } from 'react';
import { useMuseStore } from '../store/useMuseStore';
import { parseISO, differenceInMinutes } from 'date-fns';

// Track which items we've already notified about (block/event ID → true)
// Persists across re-renders since it's module-level
const notifiedIds = new Set<string>();

export function useNotificationScheduler() {
  const tasks = useMuseStore((s) => s.tasks);
  const events = useMuseStore((s) => s.events);
  const settings = useMuseStore((s) => s.settings);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!settings.notificationsEnabled) return;

    // Request notification permission if in browser context
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const checkNotifications = () => {
      const now = new Date();
      const minutesBefore = settings.notifyMinutesBefore;

      // Check task scheduled blocks — notify ONCE when within the lead window
      // Key uses task.id + startTime (not block.id) so it's stable across recalculates
      for (const task of tasks) {
        if (task.completed) continue;
        for (const block of task.scheduledBlocks) {
          const key = `task-${task.id}-${block.startTime}`;
          if (notifiedIds.has(key)) continue;

          const blockStart = parseISO(block.startTime);
          const diffMins = differenceInMinutes(blockStart, now);

          // Only notify once: when diff first enters [0, minutesBefore]
          // Once notified, it's added to the set and never fires again
          if (diffMins >= 0 && diffMins <= minutesBefore) {
            const label = diffMins <= 0 ? 'now' : `in ${diffMins} min`;
            fireNotification(`Task: ${task.title}`, `Starting ${label}`);
            notifiedIds.add(key);
          }
          // Also mark as notified if it's already past (missed window)
          if (diffMins < 0) {
            notifiedIds.add(key);
          }
        }
      }

      // Check events — same logic
      for (const event of events) {
        if (event.allDay) continue;
        const key = `event-${event.id}`;
        if (notifiedIds.has(key)) continue;

        const eventStart = parseISO(event.startTime);
        const diffMins = differenceInMinutes(eventStart, now);

        if (diffMins >= 0 && diffMins <= minutesBefore) {
          const label = diffMins <= 0 ? 'now' : `in ${diffMins} min`;
          fireNotification(
            `Event: ${event.title}`,
            `Starting ${label}${event.location ? ` @ ${event.location}` : ''}`
          );
          notifiedIds.add(key);
        }
        if (diffMins < 0) {
          notifiedIds.add(key);
        }
      }

      // Prune old entries periodically (keep set from growing unbounded)
      if (notifiedIds.size > 200) {
        notifiedIds.clear();
      }
    };

    // Check every 60 seconds (not 30 — reduces spam + CPU)
    checkNotifications();
    timerRef.current = setInterval(checkNotifications, 60000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tasks, events, settings.notificationsEnabled, settings.notifyMinutesBefore]);
}

function fireNotification(title: string, body: string) {
  // Try Electron API first
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.sendNotification) {
    electronAPI.sendNotification(title, body);
    return;
  }

  // Fallback to web Notification API
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon.png' });
  }
}
