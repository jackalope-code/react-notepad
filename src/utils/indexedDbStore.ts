import type { StoredWorkspaceV3 } from './notepadTypes';

// ---------------------------------------------------------------------------
// Thin promise-based wrapper around a single IndexedDB database/object-store
// keyed by a fixed workspace id. There is only ever one workspace record.
// ---------------------------------------------------------------------------

const DB_NAME = 'react-notepad';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const WORKSPACE_KEY = 'workspace-v3';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      /* v8 ignore next 3 -- always true on first-ever open; defensive guard for future DB_VERSION bumps */
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    /* v8 ignore next -- only reachable on real browser storage failures (quota/hardware), not reproducible with fake-indexeddb */
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

export async function getWorkspace(): Promise<StoredWorkspaceV3 | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(WORKSPACE_KEY);
    request.onsuccess = () => resolve((request.result as StoredWorkspaceV3 | undefined) ?? null);
    /* v8 ignore next -- only reachable on real browser storage failures, not reproducible with fake-indexeddb */
    request.onerror = () => reject(request.error ?? new Error('Failed to read workspace from IndexedDB.'));
    tx.oncomplete = () => db.close();
  });
}

export async function putWorkspace(workspace: StoredWorkspaceV3): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(workspace, WORKSPACE_KEY);
    request.onsuccess = () => resolve();
    /* v8 ignore next -- only reachable on real browser storage failures, not reproducible with fake-indexeddb */
    request.onerror = () => reject(request.error ?? new Error('Failed to write workspace to IndexedDB.'));
    tx.oncomplete = () => db.close();
  });
}
