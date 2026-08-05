import { SYNC_HANDLE_DB_NAME, SYNC_HANDLE_STORE_NAME } from '../../shared/school-data/defaults.js';

async function openStore() {
  if (!globalThis.indexedDB) return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(SYNC_HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SYNC_HANDLE_STORE_NAME)) {
        request.result.createObjectStore(SYNC_HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function getWorkspaceLocalValue(key) {
  const db = await openStore();
  if (!db) return null;
  return new Promise((resolve) => {
    const transaction = db.transaction(SYNC_HANDLE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(SYNC_HANDLE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onabort = () => { db.close(); resolve(null); };
  });
}

export async function setWorkspaceLocalValue(key, value) {
  const db = await openStore();
  if (!db) return false;
  return new Promise((resolve) => {
    const transaction = db.transaction(SYNC_HANDLE_STORE_NAME, 'readwrite');
    transaction.objectStore(SYNC_HANDLE_STORE_NAME).put(value, key);
    transaction.oncomplete = () => { db.close(); resolve(true); };
    transaction.onerror = () => { db.close(); resolve(false); };
    transaction.onabort = () => { db.close(); resolve(false); };
  });
}

export async function deleteWorkspaceLocalValue(key) {
  const db = await openStore();
  if (!db) return false;
  return new Promise((resolve) => {
    const transaction = db.transaction(SYNC_HANDLE_STORE_NAME, 'readwrite');
    transaction.objectStore(SYNC_HANDLE_STORE_NAME).delete(key);
    transaction.oncomplete = () => { db.close(); resolve(true); };
    transaction.onerror = () => { db.close(); resolve(false); };
    transaction.onabort = () => { db.close(); resolve(false); };
  });
}
