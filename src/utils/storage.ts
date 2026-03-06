// ============================================================
// Muse — Persistence Layer (IndexedDB primary + LocalStorage fallback)
// ============================================================

const STORAGE_PREFIX = 'muse_';
const IDB_NAME = 'muse_db';
const IDB_STORE = 'keyval';
const IDB_VERSION = 1;

// ---- IndexedDB helpers ----

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

// ---- Public API ----

/** Sync save: writes to localStorage immediately, queues IndexedDB write */
export function saveToStorage<T>(key: string, data: T): void {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, json);
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e);
  }
  // Also persist to IndexedDB (async, fire-and-forget)
  idbSet(`${STORAGE_PREFIX}${key}`, data).catch((e) =>
    console.error(`Failed to save ${key} to IndexedDB:`, e)
  );
}

/** Load: tries localStorage first (fast), falls back to IndexedDB */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw !== null) {
      return JSON.parse(raw) as T;
    }
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage:`, e);
  }
  return defaultValue;
}

/**
 * Async load that checks IndexedDB when localStorage is empty.
 * Call this during hydration to recover data that may have been
 * cleared from localStorage but survives in IndexedDB.
 */
export async function loadFromStorageAsync<T>(
  key: string,
  defaultValue: T
): Promise<T> {
  // Try localStorage first
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw !== null) {
      return JSON.parse(raw) as T;
    }
  } catch (e) {
    // fall through
  }
  // Try IndexedDB fallback
  try {
    const val = await idbGet<T>(`${STORAGE_PREFIX}${key}`);
    if (val !== undefined) {
      // Re-populate localStorage from IndexedDB recovery
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(val));
      } catch (_) { /* ignore */ }
      return val;
    }
  } catch (e) {
    console.error(`Failed to load ${key} from IndexedDB:`, e);
  }
  return defaultValue;
}

export function removeFromStorage(key: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  idbSet(`${STORAGE_PREFIX}${key}`, undefined).catch(() => {});
}

/**
 * Export all Muse data as a JSON blob (for manual backup / cloud sync)
 */
export function exportAllData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) {
      try {
        data[k.slice(STORAGE_PREFIX.length)] = JSON.parse(localStorage.getItem(k)!);
      } catch { /* skip */ }
    }
  }
  return data;
}

/**
 * Import a previously exported data blob
 */
export function importAllData(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    saveToStorage(key, value);
  }
}
