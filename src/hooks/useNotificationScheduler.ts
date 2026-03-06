// ============================================================
// Muse — Notification Scheduler
// Periodically checks for upcoming tasks/events and fires
// desktop notifications via Electron's Notification API
// ============================================================

import { useEffect, useRef } from 'react';
import { useMuseStore } from '../store/useMuseStore';
import { parseISO, differenceInMinutes } from 'date-fns';

// Track which items we've already notified about to avoid duplicates
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

      // Check task scheduled blocks
      for (const task of tasks) {
        if (task.completed) continue;
        for (const block of task.scheduledBlocks) {
          const key = `task-${block.id}`;
          if (notifiedIds.has(key)) continue;

          const blockStart = parseISO(block.startTime);
          const diffMins = differenceInMinutes(blockStart, now);

          if (diffMins >= 0 && diffMins <= minutesBefore) {
            fireNotification(
              `Task: ${task.title}`,
              `Starting in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`
            );
            notifiedIds.add(key);
          }
        }
      }

      // Check events
      for (const event of events) {
        if (event.allDay) continue;
        const key = `event-${event.id}`;
        if (notifiedIds.has(key)) continue;

        const eventStart = parseISO(event.startTime);
        const diffMins = differenceInMinutes(eventStart, now);

        if (diffMins >= 0 && diffMins <= minutesBefore) {
          fireNotification(
            `Event: ${event.title}`,
            `Starting in ${diffMins} minute${diffMins !== 1 ? 's' : ''}${event.location ? ` @ ${event.location}` : ''}`
          );
          notifiedIds.add(key);
        }
      }

      // Clean up old notification IDs (older than 1 hour)
      if (notifiedIds.size > 500) {
        notifiedIds.clear();
      }
    };

    // Check every 30 seconds
    checkNotifications();
    timerRef.current = setInterval(checkNotifications, 30000);

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
