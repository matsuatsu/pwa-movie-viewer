import { LineShape } from './types';

const DB_NAME = 'swing-analyzer';
const STORE_NAME = 'drawings';
const VERSION = 1;

function openDrawingDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveDrawing(videoKey: string, lines: LineShape[]): Promise<void> {
  try {
    const db = await openDrawingDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(lines, videoKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to save drawing', err);
  }
}

export async function loadDrawing(videoKey: string): Promise<LineShape[] | null> {
  try {
    const db = await openDrawingDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(videoKey);
      request.onsuccess = () => resolve((request.result as LineShape[] | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to load drawing', err);
    return null;
  }
}
