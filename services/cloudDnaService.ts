import { VisualDNA } from '../types';
import {
  acknowledgeDnaDeletion, areLocalDnaSnapshotsEqual, deleteLocalDNA,
  getDnaTombstones, getLocalDNA, saveLocalDNA, type DnaTombstone,
} from './localDbService';
import { db, auth } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { createThumbnail } from './imageUtils';
import {
  canonicalizeValue, createVisualDnaSyncPlan, fingerprintImage, getErrorMessage, isBase64Image,
  migrateLegacyMetadata, type SyncResult,
} from './visualDnaSyncUtils';
import {
  assertDnaOperationContext, captureDnaOperationContext, isDnaOperationContextCurrent,
  setDnaOwnerProvider, type DnaOperationContext,
} from './dnaAccountContext';

export { captureDnaOperationContext, isDnaOperationContextCurrent } from './dnaAccountContext';
export type { DnaOperationContext } from './dnaAccountContext';
setDnaOwnerProvider(() => auth.currentUser?.uid ?? null);

const quotaOwners = new Set<string>();
const operationTails = new Map<string, Promise<unknown>>();
const intentions = new Map<string, number>();
const remoteCompletions = new Map<string, number>();
let syncInProgress = false;
let lastSyncAt = 0;
let hasSyncAttempt = false;
const SYNC_COOLDOWN_MS = 20000;

const operationKey = (ownerId: string | null, id: string) => JSON.stringify([ownerId, id]);
const newCloudDocumentId = (ownerId: string, id: string) => `${encodeURIComponent(ownerId)}:${encodeURIComponent(id)}`;
const reserveIntent = (key: string) => {
  const version = (intentions.get(key) ?? 0) + 1;
  intentions.set(key, version);
  return version;
};
const recordRemoteCompletion = (key: string) => remoteCompletions.set(key, (remoteCompletions.get(key) ?? 0) + 1);

function serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = operationTails.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  operationTails.set(key, current);
  // Handle the cleanup promise too; a failed operation must not leave an unhandled rejection.
  void current.finally(() => {
    if (operationTails.get(key) === current) operationTails.delete(key);
  }).catch(() => {});
  return current;
}

export const isFirestoreQuotaExceeded = (): boolean => {
  const owner = captureDnaOperationContext().ownerId;
  return owner !== null && quotaOwners.has(owner);
};
export const isSyncInProgress = (): boolean => syncInProgress;
export const getLastSyncAt = (): number => lastSyncAt;
export const resetQuotaExceeded = (): void => {
  const owner = captureDnaOperationContext().ownerId;
  if (owner !== null) quotaOwners.delete(owner);
};
export const isCloudSyncEnabled = (): boolean => localStorage.getItem('grimoire_cloud_sync_enabled') === 'true';
export const setCloudSyncEnabled = (enabled: boolean): void => {
  localStorage.setItem('grimoire_cloud_sync_enabled', String(enabled));
};

function rememberQuota(error: unknown, context: DnaOperationContext): void {
  if (context.ownerId && /quota|resource-exhausted/i.test(getErrorMessage(error))) quotaOwners.add(context.ownerId);
}

function mayWriteCloud(context: DnaOperationContext): boolean {
  return context.ownerId !== null && isDnaOperationContextCurrent(context) && isCloudSyncEnabled() && !quotaOwners.has(context.ownerId);
}

async function cloudPayload(record: VisualDNA, context: DnaOperationContext): Promise<Record<string, unknown>> {
  let imageUrl = record.imageUrl;
  if (isBase64Image(imageUrl)) {
    const thumbnail = await createThumbnail(imageUrl, 180, 180, 0.6);
    assertDnaOperationContext(context);
    if (!thumbnail.success || !thumbnail.thumbnail) throw new Error(thumbnail.error || 'Failed to create thumbnail');
    imageUrl = thumbnail.thumbnail;
  }
  // Omit undefined recursively. Never substitute the local full-size image after
  // thumbnail failure: deferring this upload preserves any existing cloud image.
  const { cloudDocumentId: _documentId, ...content } = record;
  return canonicalizeValue({ ...content, imageUrl, userId: context.ownerId }) as Record<string, unknown>;
}

export interface SaveDnaOptions {
  context?: DnaOperationContext;
  expected?: VisualDNA | null;
  restoreDeleted?: boolean;
}

export const saveDNA = (dna: VisualDNA, options: SaveDnaOptions = {}): Promise<VisualDNA> => {
  const context = options.context ?? captureDnaOperationContext();
  const key = operationKey(context.ownerId, dna.id);
  const intent = reserveIntent(key);
  return serialize(key, async () => {
    assertDnaOperationContext(context);
    const existing = (await getLocalDNA(context.ownerId)).find(item => item.id === dna.id);
    assertDnaOperationContext(context);
    const metadata = existing ? migrateLegacyMetadata(existing).record : undefined;
    const now = Date.now();
    const toSave: VisualDNA = {
      ...dna,
      ownerId: context.ownerId,
      cloudDocumentId: context.ownerId ? existing?.cloudDocumentId ?? newCloudDocumentId(context.ownerId, dna.id) : undefined,
      createdAt: metadata?.createdAt ?? dna.createdAt ?? now,
      updatedAt: now,
      revision: metadata ? (metadata.revision ?? 1) + 1 : (dna.revision ?? 1),
      imageFingerprint: existing?.imageUrl === dna.imageUrl && existing.imageFingerprint
        ? existing.imageFingerprint : fingerprintImage(dna.imageUrl || ''),
    };
    if (dna.ownerId !== undefined && dna.ownerId !== context.ownerId) throw new Error('Reference belongs to another library.');
    await saveLocalDNA(toSave, context.ownerId, options.expected, options.restoreDeleted === true);
    if (!mayWriteCloud(context) || intentions.get(key) !== intent) return toSave;
    let payload: Record<string, unknown>;
    try { payload = await cloudPayload(toSave, context); } catch (error) {
      console.warn('Reference saved locally; cloud thumbnail upload deferred:', error);
      return toSave;
    }
    if (!mayWriteCloud(context) || intentions.get(key) !== intent) return toSave;
    // A direct local transaction from another caller/tab may have changed the record.
    const current = (await getLocalDNA(context.ownerId)).find(item => item.id === dna.id);
    if (!mayWriteCloud(context) || intentions.get(key) !== intent || !areLocalDnaSnapshotsEqual(current, toSave)) return toSave;
    try {
      await setDoc(doc(db, 'visualDNA', toSave.cloudDocumentId!), payload);
      recordRemoteCompletion(key);
    } catch (error) {
      rememberQuota(error, context);
      console.warn('Reference saved locally; cloud upload failed:', error);
    }
    return toSave;
  });
};

export const deleteDNA = (id: string, options: { context?: DnaOperationContext } = {}): Promise<void> => {
  const context = options.context ?? captureDnaOperationContext();
  const key = operationKey(context.ownerId, id);
  reserveIntent(key);
  return serialize(key, async () => {
    assertDnaOperationContext(context);
    await deleteLocalDNA(id, context.ownerId);
    if (!mayWriteCloud(context)) return;
    const tombstone = (await getDnaTombstones(context.ownerId)).find(item => item.id === id);
    if (!mayWriteCloud(context) || !tombstone) return;
    try {
      await deleteDoc(doc(db, 'visualDNA', tombstone.cloudDocumentId ?? newCloudDocumentId(context.ownerId!, id)));
      recordRemoteCompletion(key);
      assertDnaOperationContext(context);
      await acknowledgeDnaDeletion(tombstone);
    } catch (error) {
      rememberQuota(error, context);
      console.warn('Reference deleted locally; cloud deletion remains pending:', error);
    }
  });
};

export const syncCloudAndLocal = async (): Promise<SyncResult> => {
  const context = captureDnaOperationContext();
  const result: SyncResult = {
    records: [], localWrites: 0, cloudWritesAttempted: 0, cloudWritesSucceeded: 0,
    cloudWritesFailed: 0, cloudReadsSucceeded: false, completed: false, partial: false,
    quotaExceeded: isFirestoreQuotaExceeded(), failures: [],
  };
  const now = Date.now();
  if (syncInProgress || (hasSyncAttempt && now - lastSyncAt < SYNC_COOLDOWN_MS)) {
    result.records = await getLocalDNA(context.ownerId);
    if (!isDnaOperationContextCurrent(context)) result.records = [];
    return result;
  }
  // Acquire before the first await. Failed reads/local operations also consume the cooldown.
  syncInProgress = true;
  hasSyncAttempt = true;
  lastSyncAt = now;
  try {
    const initialLocal = await getLocalDNA(context.ownerId);
    assertDnaOperationContext(context);
    result.records = initialLocal;
    if (!context.ownerId || !isCloudSyncEnabled()) {
      result.failures.push({ operation: 'auth', message: 'Cloud synchronization is disabled or no account is connected.', retryable: false });
      return result;
    }
    const initialById = new Map(initialLocal.map(item => [item.id, item]));
    const initialIntentions = new Map(intentions);
    const initialRemoteCompletions = new Map(remoteCompletions);
    const querySnapshot = await getDocs(query(collection(db, 'visualDNA'), where('userId', '==', context.ownerId)));
    assertDnaOperationContext(context);
    result.cloudReadsSucceeded = true;
    // A successful read says nothing about a previous write quota restriction.
    const cloudById = new Map<string, VisualDNA>();
    for (const document of querySnapshot.docs) {
      const data = document.data() as VisualDNA & { userId?: string };
      if (data.userId !== context.ownerId || (data.ownerId !== undefined && data.ownerId !== context.ownerId)) {
        result.failures.push({ id: data.id, operation: 'auth', message: 'Cloud reference ownership does not match this account.', retryable: false });
        continue;
      }
      const { userId: _userId, ...record } = data;
      cloudById.set(record.id, { ...record, ownerId: context.ownerId, cloudDocumentId: document.id });
    }
    const deleted = await getDnaTombstones(context.ownerId);
    assertDnaOperationContext(context);
    const ids = new Set([...initialById.keys(), ...cloudById.keys(), ...deleted.map(item => item.id)]);
    // One ID at a time keeps the existing concurrency ceiling and allows quota
    // failure to stop subsequent attempts without launching an entire batch.
    for (const id of ids) {
      assertDnaOperationContext(context);
      const key = operationKey(context.ownerId, id);
      await serialize(key, async () => {
        assertDnaOperationContext(context);
        if ((remoteCompletions.get(key) ?? 0) !== (initialRemoteCompletions.get(key) ?? 0)) {
          result.failures.push({ id, operation: 'conflict', message: 'A newer cloud operation completed after this synchronization snapshot.', retryable: true });
          return;
        }
        const current = (await getLocalDNA(context.ownerId)).find(item => item.id === id);
        assertDnaOperationContext(context);
        const tombstone = (await getDnaTombstones(context.ownerId)).find(item => item.id === id);
        assertDnaOperationContext(context);
        if (tombstone) {
          if (!tombstone.cloudDeleted || cloudById.has(id)) {
            await reconcileDeletion({ ...tombstone, cloudDocumentId: cloudById.get(id)?.cloudDocumentId ?? tombstone.cloudDocumentId }, context, result);
          }
          return;
        }
        if ((intentions.get(key) ?? 0) !== (initialIntentions.get(key) ?? 0) || !areLocalDnaSnapshotsEqual(current, initialById.get(id))) {
          result.failures.push({ id, operation: 'conflict', message: 'Local reference changed while synchronization was reading the cloud.', retryable: true });
          return;
        }
        const remote = cloudById.get(id);
        const plannedLocal = current ? { ...current, cloudDocumentId: remote?.cloudDocumentId ?? current.cloudDocumentId ?? newCloudDocumentId(context.ownerId!, id) } : undefined;
        const plan = createVisualDnaSyncPlan(plannedLocal ? [plannedLocal] : [], remote ? [remote] : []);
        if (current && plannedLocal && !areLocalDnaSnapshotsEqual(current, plannedLocal) && !plan.localWrites.length) {
          plan.localWrites.push(plannedLocal);
        }
        let snapshot = current;
        for (const item of plan.localWrites) {
          await saveLocalDNA(item, context.ownerId, snapshot ?? null, false);
          assertDnaOperationContext(context);
          result.localWrites++;
          snapshot = item;
        }
        for (const item of plan.cloudWrites) {
          if (!mayWriteCloud(context)) {
            result.failures.push({ id, operation: 'upload', message: 'Cloud upload deferred while synchronization is disabled or quota is restricted.', retryable: true });
            continue;
          }
          let payload: Record<string, unknown>;
          try { payload = await cloudPayload(item, context); } catch (error) {
            result.failures.push({ id, operation: 'thumbnail', message: getErrorMessage(error), retryable: true });
            continue;
          }
          const latest = (await getLocalDNA(context.ownerId)).find(item => item.id === id);
          assertDnaOperationContext(context);
          if ((intentions.get(key) ?? 0) !== (initialIntentions.get(key) ?? 0) || !areLocalDnaSnapshotsEqual(latest, snapshot)) {
            result.failures.push({ id, operation: 'conflict', message: 'Local reference changed before cloud upload.', retryable: true });
            continue;
          }
          if (!mayWriteCloud(context)) {
            result.failures.push({ id, operation: 'upload', message: 'Cloud upload was deferred because synchronization was disabled or quota became restricted.', retryable: true });
            continue;
          }
          result.cloudWritesAttempted++;
          try {
            await setDoc(doc(db, 'visualDNA', item.cloudDocumentId ?? newCloudDocumentId(context.ownerId!, id)), payload);
            recordRemoteCompletion(key);
            result.cloudWritesSucceeded++;
          } catch (error) {
            rememberQuota(error, context);
            result.cloudWritesFailed++;
            result.failures.push({ id, operation: 'upload', message: getErrorMessage(error), retryable: true });
          }
        }
      });
    }
    result.completed = result.failures.length === 0;
    return result;
  } catch (error) {
    rememberQuota(error, context);
    result.failures.push({ operation: isDnaOperationContextCurrent(context) ? 'read' : 'auth', message: getErrorMessage(error), retryable: true });
    return result;
  } finally {
    result.quotaExceeded = context.ownerId !== null && quotaOwners.has(context.ownerId);
    try {
      result.records = isDnaOperationContextCurrent(context) ? await getLocalDNA(context.ownerId) : [];
      if (!isDnaOperationContextCurrent(context)) result.records = [];
    } catch (error) {
      result.completed = false;
      result.failures.push({ operation: 'local', message: getErrorMessage(error), retryable: true });
    }
    result.partial = (result.localWrites > 0 || result.cloudWritesSucceeded > 0) && !result.completed;
    syncInProgress = false;
  }
};

async function reconcileDeletion(tombstone: DnaTombstone, context: DnaOperationContext, result: SyncResult): Promise<void> {
  if (!mayWriteCloud(context)) {
    result.failures.push({ id: tombstone.id, operation: 'delete', message: 'Cloud deletion remains pending.', retryable: true });
    return;
  }
  result.cloudWritesAttempted++;
  try {
    await deleteDoc(doc(db, 'visualDNA', tombstone.cloudDocumentId ?? newCloudDocumentId(context.ownerId!, tombstone.id)));
  } catch (error) {
    rememberQuota(error, context);
    result.cloudWritesFailed++;
    result.failures.push({ id: tombstone.id, operation: 'delete', message: getErrorMessage(error), retryable: true });
    return;
  }
  recordRemoteCompletion(operationKey(context.ownerId, tombstone.id));
  result.cloudWritesSucceeded++;
  try {
    assertDnaOperationContext(context);
    await acknowledgeDnaDeletion(tombstone);
  } catch (error) {
    result.failures.push({ id: tombstone.id, operation: 'local', message: getErrorMessage(error), retryable: true });
  }
}

export const syncLocalToCloud = (): Promise<SyncResult> => syncCloudAndLocal();
