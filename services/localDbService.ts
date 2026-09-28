import { VisualDNA, TokenUsageLog } from "../types";

const DB_NAME = "GrimoireArtificerDB";
const DB_VERSION = 2;
const STORE_NAME = "visualDNA";
const TOKEN_LOGS_STORE = "tokenUsageLogs";

let dbInstance: IDBDatabase | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TOKEN_LOGS_STORE)) {
        db.createObjectStore(TOKEN_LOGS_STORE, { keyPath: "id" });
      }
    };
  });
};

export const saveTokenLog = async (log: TokenUsageLog): Promise<void> => {
  const localDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = localDb.transaction(TOKEN_LOGS_STORE, "readwrite");
    const store = transaction.objectStore(TOKEN_LOGS_STORE);
    const request = store.put(log);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getTokenLogs = async (): Promise<TokenUsageLog[]> => {
  const localDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = localDb.transaction(TOKEN_LOGS_STORE, "readonly");
    const store = transaction.objectStore(TOKEN_LOGS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const clearTokenLogs = async (): Promise<void> => {
  const localDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = localDb.transaction(TOKEN_LOGS_STORE, "readwrite");
    const store = transaction.objectStore(TOKEN_LOGS_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Internal local save, used by sync and explicit save.
export const saveLocalDNA = async (dna: VisualDNA): Promise<void> => {
  const localDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = localDb.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(dna);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getLocalDNA = async (): Promise<VisualDNA[]> => {
  const localDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = localDb.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const deleteLocalDNA = async (id: string): Promise<void> => {
  const localDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = localDb.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
