// ============================================================
// Muse — Sync Client Utility
// Handles data sync between desktop (Electron) and phone (browser)
// ============================================================

import { Task, CalendarEvent, TaskList, AppSettings } from '../types';

export interface SyncData {
  tasks: Task[];
  events: CalendarEvent[];
  lists: TaskList[];
  settings: AppSettings | null;
  _version: number;
}

/** Detect if running inside Electron */
export function isElectron(): boolean {
  return !!(window as any).electronAPI;
}

/** Get the base URL for API calls (phone only) */
function getApiBase(): string {
  return window.location.origin;
}

// ---- PIN storage for phone ----
const PIN_STORAGE_KEY = 'muse_sync_pin';

export function getStoredPin(): string {
  return localStorage.getItem(PIN_STORAGE_KEY) || '';
}

export function setStoredPin(pin: string): void {
  localStorage.setItem(PIN_STORAGE_KEY, pin);
}

export function clearStoredPin(): void {
  localStorage.removeItem(PIN_STORAGE_KEY);
}

/** Get auth headers with PIN */
function getAuthHeaders(): Record<string, string> {
  const pin = getStoredPin();
  if (!pin) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${pin}`,
  };
}

// ---- Desktop (Electron) side ----

/** Get PIN from main process */
export async function desktopGetPin(): Promise<string | null> {
  const api = (window as any).electronAPI;
  if (!api?.syncGetPin) return null;
  return await api.syncGetPin();
}

/** Reset PIN from main process */
export async function desktopResetPin(): Promise<string | null> {
  const api = (window as any).electronAPI;
  if (!api?.syncResetPin) return null;
  return await api.syncResetPin();
}

/** Write state to the sync file via IPC */
export async function desktopPushState(data: Omit<SyncData, '_version'>): Promise<void> {
  const api = (window as any).electronAPI;
  if (!api?.syncWriteData) return;
  await api.syncWriteData(data);
}

/** Read state from the sync file via IPC */
export async function desktopPullState(): Promise<SyncData | null> {
  const api = (window as any).electronAPI;
  if (!api?.syncReadData) return null;
  return await api.syncReadData();
}

/** Get sync server info (URLs, port) */
export async function desktopGetSyncInfo(): Promise<{
  port: number;
  addresses: string[];
  urls: string[];
  running: boolean;
} | null> {
  const api = (window as any).electronAPI;
  if (!api?.syncGetInfo) return null;
  return await api.syncGetInfo();
}

// ---- Phone (browser) side ----

/** Push state to the sync server via HTTP */
export async function phonePushState(data: Omit<SyncData, '_version'>): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/state`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (res.status === 401) return false;
    const json = await res.json();
    return json.ok === true;
  } catch (e) {
    console.error('[Sync] Phone push failed:', e);
    return false;
  }
}

/** Pull state from the sync server via HTTP */
export async function phonePullState(): Promise<SyncData | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/state`, {
      headers: getAuthHeaders(),
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('[Sync] Phone pull failed:', e);
    return null;
  }
}

/** Check the remote version without pulling full state */
export async function phoneCheckVersion(): Promise<number> {
  try {
    const res = await fetch(`${getApiBase()}/api/version`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return json.version || 0;
  } catch {
    return 0;
  }
}

/** Verify a PIN against the server */
export async function phoneVerifyPin(pin: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const json = await res.json();
    return json.ok === true;
  } catch {
    return false;
  }
}
