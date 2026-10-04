import { VisualDNA, TokenUsageLog } from '../types';
import { assertDnaOperationContext, captureDnaOperationContext, notifyDnaChanges, subscribeDnaChanges, isDnaOperationContextCurrent } from './dnaAccountContext';
import { canonicalizeValue } from './visualDnaSyncUtils';

const DB_NAME = 'GrimoireArtificerDB';
const DB_VERSION = 3;
const LEGACY_STORE = 'visualDNA';
const OWNED_STORE = 'ownedVisualDNA';
const TOMBSTONES_STORE = 'visualDnaTombstones';
const TOKEN_LOGS_STORE = 'tokenUsageLogs';

export interface DnaTombstone {
  storageKey: string;
  id: string;
  ownerId: string | null;
  deletedAt: number;
  cloudDeleted: boolean;
  cloudDocumentId?: string;
}

let dbInstance: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

export const closeLocalDatabase = (): void => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    opening = null;
  }
};

export const initDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let rejected = false;
    request.onerror = () => {
      rejected = true;
      reject(request.error);
    };
    request.onblocked = () => {
      rejected = true;
      reject(new Error('The local library upgrade is blocked. Close other Grimoire tabs, then retry.'));
    };
    request.onsuccess = () => {
      const openedDatabase = request.result;
      if (rejected) {
        openedDatabase.close();
        return;
      }
      dbInstance = openedDatabase;
      openedDatabase.onversionchange = () => {
        openedDatabase.close();
        if (dbInstance === openedDatabase) {
          dbInstance = null;
          opening = null;
        }
      };
      resolve(openedDatabase);
    };
    request.onupgradeneeded = () => {
      if (rejected) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      for (const name of [LEGACY_STORE, TOKEN_LOGS_STORE]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      for (const name of [OWNED_STORE, TOMBSTONES_STORE]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'storageKey' });
      }
      // Existing unowned references stay in their original store. Logging in never claims them.
    };
  }).catch(error => { opening = null; throw error; });
  return opening;
};

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('Transaction failed'));
  });
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const scopeKey = (ownerId: string | null, id: string) => JSON.stringify([ownerId, id]);
const storeName = (ownerId: string | null) => ownerId === null ? LEGACY_STORE : OWNED_STORE;
const recordKey = (ownerId: string | null, id: string) => ownerId === null ? id : scopeKey(ownerId, id);
const unwrap = (stored: any, ownerId: string | null): VisualDNA | undefined => ownerId === null ? stored : stored?.record;

export function areLocalDnaSnapshotsEqual(a?: VisualDNA | null, b?: VisualDNA | null): boolean {
  return JSON.stringify(canonicalizeValue(a ?? null)) === JSON.stringify(canonicalizeValue(b ?? null));
}

export const saveTokenLog = async (log: TokenUsageLog): Promise<void> => {
  const db = await initDB();
  const transaction = db.transaction(TOKEN_LOGS_STORE, 'readwrite');
  const completed = transactionCompletion(transaction);
  transaction.objectStore(TOKEN_LOGS_STORE).put(log);
  await completed;
};

export const getTokenLogs = async (): Promise<TokenUsageLog[]> => {
  const db = await initDB();
  return (await readRequest(db.transaction(TOKEN_LOGS_STORE, 'readonly').objectStore(TOKEN_LOGS_STORE).getAll())) || [];
};

export const clearTokenLogs = async (): Promise<void> => {
  const db = await initDB();
  const transaction = db.transaction(TOKEN_LOGS_STORE, 'readwrite');
  const completed = transactionCompletion(transaction);
  transaction.objectStore(TOKEN_LOGS_STORE).clear();
  await completed;
};

// expected=null means create only. The comparison and mutation share one IndexedDB transaction.
export const saveLocalDNA = async (
  dna: VisualDNA,
  ownerId: string | null = captureDnaOperationContext().ownerId,
  expected?: VisualDNA | null,
  allowRestore = false,
): Promise<void> => {
  const db = await initDB();
  assertDnaOperationContext({ ownerId });
  if (dna.ownerId !== undefined && dna.ownerId !== ownerId) throw new Error('Reference belongs to another library.');
  const name = storeName(ownerId);
  const transaction = db.transaction([name, TOMBSTONES_STORE], 'readwrite');
  const completed = transactionCompletion(transaction);
  const records = transaction.objectStore(name);
  const tombstones = transaction.objectStore(TOMBSTONES_STORE);
  let conflict: Error | undefined;
  const current = records.get(recordKey(ownerId, dna.id));
  current.onsuccess = () => {
    if (expected !== undefined && !areLocalDnaSnapshotsEqual(unwrap(current.result, ownerId), expected)) {
      conflict = new Error('Reference changed or was deleted during this operation.');
      transaction.abort();
      return;
    }
    const deleted = tombstones.get(scopeKey(ownerId, dna.id));
    deleted.onsuccess = () => {
      if (!allowRestore && deleted.result) {
        conflict = new Error('Reference was deleted during synchronization.');
        transaction.abort();
        return;
      }
      try { assertDnaOperationContext({ ownerId }); } catch (error) {
        conflict = error as Error;
        transaction.abort();
        return;
      }
      const record = { ...dna, ownerId };
      records.put(ownerId === null ? record : { storageKey: scopeKey(ownerId, dna.id), ownerId, record });
      tombstones.delete(scopeKey(ownerId, dna.id));
    };
  };
  try { await completed; } catch (error) { throw conflict || error; }
  notifyDnaChanges();
};

export const getLocalDNA = async (ownerId: string | null = captureDnaOperationContext().ownerId): Promise<VisualDNA[]> => {
  const db = await initDB();
  const name = storeName(ownerId);
  const stored = await readRequest(db.transaction(name, 'readonly').objectStore(name).getAll());
  if (ownerId === null) return stored.filter((item: VisualDNA) => item.ownerId == null);
  return stored.filter(item => item.ownerId === ownerId).map(item => item.record);
};

export const deleteLocalDNA = async (id: string, ownerId: string | null = captureDnaOperationContext().ownerId): Promise<void> => {
  const db = await initDB();
  assertDnaOperationContext({ ownerId });
  const name = storeName(ownerId);
  const transaction = db.transaction([name, TOMBSTONES_STORE], 'readwrite');
  const completed = transactionCompletion(transaction);
  const records = transaction.objectStore(name);
  const tombstones = transaction.objectStore(TOMBSTONES_STORE);
  let conflict: Error | undefined;
  const current = records.get(recordKey(ownerId, id));
  current.onsuccess = () => {
    const record = unwrap(current.result, ownerId);
    const previous = tombstones.get(scopeKey(ownerId, id));
    previous.onsuccess = () => {
      try { assertDnaOperationContext({ ownerId }); } catch (error) {
        conflict = error as Error;
        transaction.abort();
        return;
      }
      const cloudDocumentId = record?.cloudDocumentId ?? previous.result?.cloudDocumentId;
      records.delete(recordKey(ownerId, id));
      tombstones.put({
        storageKey: scopeKey(ownerId, id), id, ownerId,
        deletedAt: Math.max(Date.now(), (previous.result?.deletedAt ?? 0) + 1), cloudDeleted: false,
        ...(cloudDocumentId ? { cloudDocumentId } : {}),
      } satisfies DnaTombstone);
    };
  };
  try { await completed; } catch (error) { throw conflict || error; }
  notifyDnaChanges();
};

export const getDnaTombstones = async (ownerId: string | null = captureDnaOperationContext().ownerId): Promise<DnaTombstone[]> => {
  const db = await initDB();
  const stored = await readRequest(db.transaction(TOMBSTONES_STORE, 'readonly').objectStore(TOMBSTONES_STORE).getAll());
  return stored.filter(item => item.ownerId === ownerId);
};

/** One local snapshot: export/preview cannot mix records and deletion intentions from different moments. */
export const readDnaBackupSnapshot = async (ownerId: string | null): Promise<{ records: VisualDNA[]; tombstones: DnaTombstone[] }> => {
  const db = await initDB();
  const transaction = db.transaction([storeName(ownerId), TOMBSTONES_STORE], 'readonly');
  const completed = transactionCompletion(transaction);
  const recordRequest = readRequest(transaction.objectStore(storeName(ownerId)).getAll());
  const tombstoneRequest = readRequest(transaction.objectStore(TOMBSTONES_STORE).getAll());
  const [stored, deleted] = await Promise.all([recordRequest, tombstoneRequest, completed]);
  return {
    records: ownerId === null ? stored.filter(item => item.ownerId == null) : stored.filter(item => item.ownerId === ownerId).map(item => item.record),
    tombstones: deleted.filter(item => item.ownerId === ownerId),
  };
};

export interface DnaBackupMutation {
  id: string;
  expectedRecord: VisualDNA | null;
  expectedTombstone: DnaTombstone | null;
  record?: VisualDNA;
  tombstone?: DnaTombstone;
}

/** Backup-specific atomic application. No cloud calls, image work, or per-record notifications. */
export const applyLocalDnaBackup = async (ownerId: string | null, plan: DnaBackupMutation[]): Promise<void> => {
  // Capture the entire in-memory plan before any await. The caller cannot change it mid-transaction.
  const changes = structuredClone(plan);
  const ids = new Set<string>();
  for (const change of changes) {
    if (ids.has(change.id) || (!!change.record === !!change.tombstone)) throw new Error('Invalid backup mutation plan.');
    ids.add(change.id);
    for (const value of [change.record, change.tombstone]) {
      if (value && (value.id !== change.id || value.ownerId !== ownerId)) throw new Error('Backup mutation belongs to another scope.');
    }
    if (change.tombstone && (change.expectedRecord || change.tombstone.storageKey !== scopeKey(ownerId, change.id))) {
      throw new Error('Imported deletion cannot remove an active reference.');
    }
  }
  assertDnaOperationContext({ ownerId });
  if (changes.length === 0) return;
  let scopeChanged = false;
  let abortForScopeChange: (() => void) | undefined;
  const assertScope = () => {
    if (scopeChanged) throw new Error('A conta mudou durante a restauração. Prepare uma nova prévia.');
    assertDnaOperationContext({ ownerId });
  };
  const unsubscribe = subscribeDnaChanges(() => {
    if (!isDnaOperationContextCurrent({ ownerId })) {
      scopeChanged = true;
      abortForScopeChange?.();
    }
  });
  try {
    const db = await initDB();
    assertScope();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([storeName(ownerId), TOMBSTONES_STORE], 'readwrite');
      const records = transaction.objectStore(storeName(ownerId));
      const tombstones = transaction.objectStore(TOMBSTONES_STORE);
      let failure: unknown;
      const abort = (error: unknown) => {
        failure ||= error;
        try { transaction.abort(); } catch { /* Already aborted or committed. */ }
      };
      abortForScopeChange = () => abort(new Error('A conta mudou durante a restauração. Prepare uma nova prévia.'));
      transaction.oncomplete = () => resolve();
      // A request success is not a commit. Reject only once the transaction has rolled back.
      transaction.onabort = () => reject(failure || transaction.error || new Error('Backup transaction aborted.'));
      transaction.onerror = () => { failure ||= transaction.error || new Error('Backup transaction failed.'); };
      const snapshots = changes.map(() => ({ record: null as VisualDNA | null, tombstone: null as DnaTombstone | null }));
      let pending = changes.length * 2;
      const ready = () => {
        try {
          assertScope();
          if (--pending !== 0) return;
          changes.forEach((change, index) => {
            const snapshot = snapshots[index];
            if (!areLocalDnaSnapshotsEqual(snapshot.record, change.expectedRecord) ||
                JSON.stringify(canonicalizeValue(snapshot.tombstone)) !== JSON.stringify(canonicalizeValue(change.expectedTombstone))) {
              throw new Error(`A referência ou exclusão "${change.id}" mudou após a prévia. Prepare uma nova prévia.`);
            }
          });
          for (const change of changes) {
            const request = change.record
              ? records.put(ownerId === null ? change.record : { storageKey: scopeKey(ownerId, change.id), ownerId, record: change.record })
              : tombstones.put(change.tombstone);
            const checkScope = () => {
              try { assertScope(); } catch (error) { abort(error); }
            };
            request.onsuccess = checkScope;
            if (change.record && change.expectedTombstone) tombstones.delete(scopeKey(ownerId, change.id)).onsuccess = checkScope;
          }
        } catch (error) { abort(error); }
      };
      changes.forEach((change, index) => {
        const current = records.get(recordKey(ownerId, change.id));
        current.onsuccess = () => { snapshots[index].record = unwrap(current.result, ownerId) ?? null; ready(); };
        const deleted = tombstones.get(scopeKey(ownerId, change.id));
        deleted.onsuccess = () => { snapshots[index].tombstone = deleted.result ?? null; ready(); };
      });
    });
  } finally { unsubscribe(); }
  notifyDnaChanges();
};

export const acknowledgeDnaDeletion = async (tombstone: DnaTombstone): Promise<void> => {
  const db = await initDB();
  assertDnaOperationContext(tombstone);
  const transaction = db.transaction(TOMBSTONES_STORE, 'readwrite');
  const completed = transactionCompletion(transaction);
  const store = transaction.objectStore(TOMBSTONES_STORE);
  let conflict: Error | undefined;
  const current = store.get(tombstone.storageKey);
  current.onsuccess = () => {
    try { assertDnaOperationContext(tombstone); } catch (error) {
      conflict = error as Error;
      transaction.abort();
      return;
    }
    if (current.result?.deletedAt === tombstone.deletedAt) store.put({ ...current.result, cloudDeleted: true });
  };
  try { await completed; } catch (error) { throw conflict || error; }
};
