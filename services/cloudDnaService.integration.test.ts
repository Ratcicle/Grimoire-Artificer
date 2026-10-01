import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createIndexedDbMock, deferred, flushPromises } from './storageTestUtils';
import type { VisualDNA } from '../types';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'A' } as { uid: string } | null },
  getDocs: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), createThumbnail: vi.fn(),
}));
vi.mock('./firebase', () => ({ auth: mocks.auth, db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  query: (_collection: unknown, constraint: unknown) => constraint,
  where: (_field: string, _operator: string, owner: string) => ({ owner }),
  getDocs: mocks.getDocs, setDoc: mocks.setDoc, deleteDoc: mocks.deleteDoc,
}));
vi.mock('./imageUtils', () => ({ createThumbnail: mocks.createThumbnail }));

let memory: ReturnType<typeof createIndexedDbMock>;
let cloud: Map<string, VisualDNA & { userId: string }>;
const record = (overrides: Partial<VisualDNA> = {}): VisualDNA => ({
  id: 'one', name: 'Reference', summary: 'old', tags: [], scores: {},
  imageUrl: 'data:image/png;base64,FULL', createdAt: 10, updatedAt: 10, revision: 1,
  ...overrides,
} as VisualDNA);
const snapshot = () => ({ docs: [...cloud.entries()].filter(([, value]) => value.userId === mocks.auth.currentUser?.uid).map(([id, value]) => ({ id, data: () => structuredClone(value) })) });
const cloudRecord = (id: string) => [...cloud.values()].find(record => record.id === id);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.auth.currentUser = { uid: 'A' };
  memory = createIndexedDbMock();
  cloud = new Map();
  vi.stubGlobal('indexedDB', memory.indexedDB);
  const preferences = new Map([['grimoire_cloud_sync_enabled', 'true']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => preferences.get(key) ?? null,
    setItem: (key: string, value: string) => preferences.set(key, value),
  });
  mocks.getDocs.mockImplementation(async () => snapshot());
  mocks.setDoc.mockImplementation(async (reference, value) => { cloud.set(reference.id, structuredClone(value)); });
  mocks.deleteDoc.mockImplementation(async reference => { cloud.delete(reference.id); });
  mocks.createThumbnail.mockResolvedValue({ success: true, thumbnail: 'data:image/jpeg;base64,THUMB' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('DATA storage orchestration through actual services', () => {
  it('DATA-02 does not upload again after full image becomes a cloud thumbnail', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    await service.saveDNA(record());
    mocks.setDoc.mockClear();
    const result = await service.syncCloudAndLocal();
    expect(result.completed).toBe(true);
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect((await local.getLocalDNA())[0].imageUrl).toBe('data:image/png;base64,FULL');
  });

  it('DATA-03 keeps an explicit offline deletion deleted when reconnecting', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    await service.saveDNA(record());
    service.setCloudSyncEnabled(false);
    await service.deleteDNA('one');
    service.setCloudSyncEnabled(true);
    await service.syncCloudAndLocal();
    expect(await local.getLocalDNA()).toEqual([]);
    expect(Boolean(cloudRecord('one'))).toBe(false);
  });

  it('DATA-04 an older delayed thumbnail cannot overwrite a newer save', async () => {
    const service = await import('./cloudDnaService');
    const slow = deferred<any>();
    mocks.createThumbnail.mockImplementationOnce(() => slow.promise);
    const first = service.saveDNA(record());
    await flushPromises();
    const second = service.saveDNA(record({ summary: 'new' }));
    await flushPromises();
    slow.resolve({ success: true, thumbnail: 'data:image/jpeg;base64,OLD' });
    await Promise.all([first, second]);
    expect(cloudRecord('one')?.summary).toBe('new');
  });

  it('DATA-04 deletion during thumbnail cannot recreate the cloud document', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    const slow = deferred<any>();
    mocks.createThumbnail.mockImplementationOnce(() => slow.promise);
    const first = service.saveDNA(record());
    await flushPromises();
    const deletion = service.deleteDNA('one');
    await flushPromises();
    slow.resolve({ success: true, thumbnail: 'data:image/jpeg;base64,OLD' });
    await Promise.all([first, deletion]);
    expect(await local.getLocalDNA()).toEqual([]);
    expect(Boolean(cloudRecord('one'))).toBe(false);
  });

  it('DATA-05 preserves an edit made while the cloud read was pending', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    await local.saveLocalDNA(record());
    const read = deferred<any>();
    mocks.getDocs.mockImplementationOnce(() => read.promise);
    const syncing = service.syncCloudAndLocal();
    await flushPromises();
    service.setCloudSyncEnabled(false);
    await service.saveDNA(record({ summary: 'local edit', revision: 3 }));
    read.resolve({ docs: [{ data: () => ({ ...record({ summary: 'cloud old', revision: 2 }), userId: 'A' }) }] });
    await syncing;
    expect((await local.getLocalDNA())[0].summary).toBe('local edit');
  });

  it('DATA-06 never sends a captured save under the next account', async () => {
    const service = await import('./cloudDnaService');
    const slow = deferred<any>();
    mocks.createThumbnail.mockImplementationOnce(() => slow.promise);
    const saving = service.saveDNA(record());
    await flushPromises();
    mocks.auth.currentUser = { uid: 'B' };
    slow.resolve({ success: true, thumbnail: 'data:image/jpeg;base64,OLD' });
    await saving.catch(() => {});
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('DATA-07 defers a first upload when thumbnail generation fails', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    mocks.createThumbnail.mockResolvedValue({ success: false, error: 'decode failed' });
    await service.saveDNA(record());
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect((await local.getLocalDNA())[0].imageUrl).toBe('data:image/png;base64,FULL');
  });

  it('DATA-08 a failed read consumes the existing twenty-second cooldown', async () => {
    const service = await import('./cloudDnaService');
    mocks.getDocs.mockRejectedValue(new Error('offline'));
    await service.syncCloudAndLocal();
    await service.syncCloudAndLocal();
    expect(mocks.getDocs).toHaveBeenCalledTimes(1);
  });

  it('DATA-02 changing the source image uploads one new thumbnail', async () => {
    const service = await import('./cloudDnaService');
    const original = await service.saveDNA(record());
    mocks.setDoc.mockClear();
    const changed = await service.saveDNA({ ...original, imageUrl: 'data:image/png;base64,NEW' });
    expect(changed.imageFingerprint).not.toBe(original.imageFingerprint);
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    mocks.setDoc.mockClear();
    await service.syncCloudAndLocal();
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.createThumbnail).toHaveBeenLastCalledWith('data:image/png;base64,NEW', 180, 180, 0.6);
  });

  it('DATA-03 tombstones survive module reload after a failed cloud deletion', async () => {
    let service = await import('./cloudDnaService');
    await service.saveDNA(record());
    mocks.deleteDoc.mockRejectedValueOnce(new Error('offline'));
    await service.deleteDNA('one');
    vi.resetModules();
    service = await import('./cloudDnaService');
    await service.syncCloudAndLocal();
    const local = await import('./localDbService');
    expect(await local.getLocalDNA()).toEqual([]);
    expect(Boolean(cloudRecord('one'))).toBe(false);
    expect(mocks.deleteDoc).toHaveBeenCalledTimes(2);
  });

  it('DATA-03 restores a legitimate cloud-only reference with no deletion intent', async () => {
    const service = await import('./cloudDnaService');
    cloud.set('one', { ...record({ imageUrl: 'data:image/jpeg;base64,THUMB' }), userId: 'A' });
    await service.syncCloudAndLocal();
    const local = await import('./localDbService');
    expect((await local.getLocalDNA()).map(item => item.id)).toEqual(['one']);
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });

  it('DATA-05 deletion while a cloud read is pending is not restored from that response', async () => {
    const service = await import('./cloudDnaService');
    await service.saveDNA(record());
    const response = snapshot();
    const read = deferred<any>();
    mocks.getDocs.mockImplementationOnce(() => read.promise);
    const syncing = service.syncCloudAndLocal();
    await flushPromises();
    await service.deleteDNA('one');
    read.resolve(response);
    await syncing;
    const local = await import('./localDbService');
    expect(await local.getLocalDNA()).toEqual([]);
    expect(Boolean(cloudRecord('one'))).toBe(false);
  });

  it('DATA-05 compare-and-save rejects a stale reanalysis snapshot', async () => {
    const service = await import('./cloudDnaService');
    const snapshot = await service.saveDNA(record());
    await service.saveDNA({ ...snapshot, summary: 'user edit' });
    mocks.setDoc.mockClear();
    await expect(service.saveDNA({ ...snapshot, summary: 'stale analysis' }, { expected: snapshot })).rejects.toThrow(/changed|deleted/i);
    const local = await import('./localDbService');
    expect((await local.getLocalDNA())[0].summary).toBe('user edit');
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('DATA-05 compare-and-save cannot resurrect a deleted analysis target', async () => {
    const service = await import('./cloudDnaService');
    const snapshot = await service.saveDNA(record());
    await service.deleteDNA('one');
    await expect(service.saveDNA({ ...snapshot, summary: 'late analysis' }, { expected: snapshot })).rejects.toThrow(/changed|deleted/i);
    const local = await import('./localDbService');
    expect(await local.getLocalDNA()).toEqual([]);
  });

  it('DATA-05 create-only imports cannot overwrite an existing ID', async () => {
    const service = await import('./cloudDnaService');
    await service.saveDNA(record());
    await expect(service.saveDNA(record({ summary: 'duplicate import' }), { expected: null })).rejects.toThrow(/changed|deleted/i);
    expect(cloudRecord('one')?.summary).toBe('old');
  });

  it.each([{ uid: 'B' }, null])('DATA-06 account transition %j during a cloud read returns no old-account records', async nextAccount => {
    const service = await import('./cloudDnaService');
    const read = deferred<any>();
    mocks.getDocs.mockImplementationOnce(() => read.promise);
    const syncing = service.syncCloudAndLocal();
    await flushPromises();
    mocks.auth.currentUser = nextAccount;
    read.resolve({ docs: [{ data: () => ({ ...record(), userId: 'A' }) }] });
    const result = await syncing;
    expect(result.records).toEqual([]);
    expect(result.completed).toBe(false);
    expect(result.failures.some(failure => failure.operation === 'auth')).toBe(true);
    expect(mocks.setDoc).not.toHaveBeenCalled();
    const local = await import('./localDbService');
    expect(await local.getLocalDNA()).toEqual([]);
  });

  it('DATA-06 a queued save is rejected after the owning account changes', async () => {
    const service = await import('./cloudDnaService');
    const slow = deferred<any>();
    mocks.createThumbnail.mockImplementationOnce(() => slow.promise);
    const first = service.saveDNA(record());
    await flushPromises();
    const second = service.saveDNA(record({ summary: 'queued' }));
    const rejected = expect(second).rejects.toThrow(/account/i);
    mocks.auth.currentUser = { uid: 'B' };
    slow.resolve({ success: true, thumbnail: 'data:image/jpeg;base64,OLD' });
    await first;
    await rejected;
    const local = await import('./localDbService');
    expect(await local.getLocalDNA()).toEqual([]);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('DATA-07 thumbnail failure during an update preserves the previous cloud image', async () => {
    const service = await import('./cloudDnaService');
    await service.saveDNA(record());
    mocks.setDoc.mockClear();
    mocks.createThumbnail.mockResolvedValue({ success: false, error: 'decode failed' });
    await service.saveDNA(record({ summary: 'local update', imageUrl: 'data:image/png;base64,NEW' }));
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(cloudRecord('one')?.imageUrl).toBe('data:image/jpeg;base64,THUMB');
    const local = await import('./localDbService');
    expect((await local.getLocalDNA())[0].summary).toBe('local update');
  });

  it('DATA-08 counts only writes actually started before the quota restriction', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    for (const id of ['one', 'two', 'three']) await local.saveLocalDNA(record({ id }));
    mocks.setDoc.mockRejectedValue(new Error('resource-exhausted'));
    const result = await service.syncCloudAndLocal();
    expect(result.cloudWritesAttempted).toBe(1);
    expect(result.cloudWritesFailed).toBe(1);
    expect(result.cloudWritesSucceeded).toBe(0);
    expect(result.quotaExceeded).toBe(true);
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    expect((await local.getLocalDNA())).toHaveLength(3);
  });

  it('DATA-08 successful cloud reads do not clear a write quota restriction', async () => {
    const service = await import('./cloudDnaService');
    mocks.setDoc.mockRejectedValueOnce(new Error('resource-exhausted'));
    await service.saveDNA(record());
    mocks.setDoc.mockClear();
    const result = await service.syncCloudAndLocal();
    expect(result.cloudReadsSucceeded).toBe(true);
    expect(result.quotaExceeded).toBe(true);
    expect(result.cloudWritesAttempted).toBe(0);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('DATA-08 thumbnail failure is not reported as an attempted cloud write', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    await local.saveLocalDNA(record());
    mocks.createThumbnail.mockRejectedValue(new Error('decode failed'));
    const result = await service.syncCloudAndLocal();
    expect(result.cloudWritesAttempted).toBe(0);
    expect(result.cloudWritesFailed).toBe(0);
    expect(result.completed).toBe(false);
    expect(result.failures[0].operation).toBe('thumbnail');
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('DATA-03 an old ordinary save cannot reopen a completed deletion', async () => {
    const service = await import('./cloudDnaService');
    const old = await service.saveDNA(record());
    await service.deleteDNA(old.id);
    await expect(service.saveDNA(old)).rejects.toThrow(/deleted/i);
    const local = await import('./localDbService');
    expect(await local.getLocalDNA()).toEqual([]);
    expect(Boolean(cloudRecord('one'))).toBe(false);
  });

  it('DATA-06 references with the same local ID use different remote documents for different owners', async () => {
    const service = await import('./cloudDnaService');
    await service.saveDNA(record());
    mocks.auth.currentUser = { uid: 'B' };
    await service.saveDNA(record({ summary: 'account B' }));
    expect(cloud.size).toBe(2);
    expect([...cloud.values()].map(item => item.userId).sort()).toEqual(['A', 'B']);
    await service.deleteDNA('one');
    expect([...cloud.values()].map(item => item.userId)).toEqual(['A']);
  });

  it('DATA-06 edits and deletes use the queried legacy document path without moving it', async () => {
    const service = await import('./cloudDnaService');
    const remote = { ...record({ imageUrl: 'data:image/jpeg;base64,THUMB' }), userId: 'A' };
    cloud.set('legacy-document', remote);
    mocks.getDocs.mockResolvedValue({ docs: [{ id: 'legacy-document', data: () => remote }] });
    await service.syncCloudAndLocal();
    const local = await import('./localDbService');
    const saved = (await local.getLocalDNA())[0];
    await service.saveDNA({ ...saved, summary: 'edited legacy' });
    expect(cloud.size).toBe(1);
    expect(cloud.get('legacy-document')?.summary).toBe('edited legacy');
    await service.deleteDNA('one');
    expect(cloud.size).toBe(0);
  });

  it('DATA-04 sync does not repeat a save that completed after its cloud snapshot', async () => {
    const service = await import('./cloudDnaService');
    const write = deferred<void>();
    mocks.setDoc.mockImplementationOnce(async (reference, value) => {
      await write.promise;
      cloud.set(reference.id, structuredClone(value));
    });
    const saving = service.saveDNA(record());
    await flushPromises();
    const syncing = service.syncCloudAndLocal();
    await flushPromises();
    write.resolve();
    await Promise.all([saving, syncing]);
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    expect(cloudRecord('one')?.summary).toBe('old');
  });

  it('DATA-04 sync does not repeat a deletion that completed after its cloud snapshot', async () => {
    const service = await import('./cloudDnaService');
    await service.saveDNA(record());
    const write = deferred<void>();
    mocks.deleteDoc.mockImplementationOnce(async reference => {
      await write.promise;
      cloud.delete(reference.id);
    });
    const deleting = service.deleteDNA('one');
    await flushPromises();
    const syncing = service.syncCloudAndLocal();
    await flushPromises();
    write.resolve();
    await Promise.all([deleting, syncing]);
    expect(mocks.deleteDoc).toHaveBeenCalledTimes(1);
    expect(cloudRecord('one')).toBeUndefined();
  });

  it('DATA-08 cloud deletion success is not counted as failed when its local acknowledgement aborts', async () => {
    const service = await import('./cloudDnaService');
    await service.saveDNA(record());
    service.setCloudSyncEnabled(false);
    await service.deleteDNA('one');
    service.setCloudSyncEnabled(true);
    mocks.deleteDoc.mockImplementationOnce(async reference => {
      cloud.delete(reference.id);
      memory.failNextWrite();
    });
    const result = await service.syncCloudAndLocal();
    expect(result.cloudWritesAttempted).toBe(1);
    expect(result.cloudWritesSucceeded).toBe(1);
    expect(result.cloudWritesFailed).toBe(0);
    expect(result.failures.some(failure => failure.operation === 'local')).toBe(true);
    expect(result.completed).toBe(false);
  });

  it('DATA-03 repeated deletion retains the legacy cloud path in its durable intent', async () => {
    const service = await import('./cloudDnaService');
    cloud.set('legacy-document', { ...record(), userId: 'A' });
    await service.syncCloudAndLocal();
    service.setCloudSyncEnabled(false);
    await service.deleteDNA('one');
    service.setCloudSyncEnabled(true);
    await service.deleteDNA('one');
    expect(cloud.size).toBe(0);
  });

  it('DATA-02 a newer cloud image with the same revision keeps its own source fingerprint', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    await local.saveLocalDNA(record({ revision: 2, updatedAt: 20, imageFingerprint: 'old' }));
    cloud.set('legacy-document', { ...record({ revision: 2, updatedAt: 30, imageFingerprint: 'new', imageUrl: 'data:image/jpeg;base64,NEW_THUMB' }), userId: 'A' });
    await service.syncCloudAndLocal();
    expect((await local.getLocalDNA())[0].imageFingerprint).toBe('new');
    expect((await local.getLocalDNA())[0].imageUrl).toBe('data:image/jpeg;base64,NEW_THUMB');
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('DATA-02 a changed cloud image does not stamp its fingerprint onto legacy local pixels', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    await local.saveLocalDNA(record());
    cloud.set('legacy-document', { ...record({ revision: 2, updatedAt: 30, imageFingerprint: 'new-source', imageUrl: 'data:image/jpeg;base64,NEW_THUMB' }), userId: 'A' });
    await service.syncCloudAndLocal();
    const synced = (await local.getLocalDNA())[0];
    expect(synced.imageUrl).toBe('data:image/jpeg;base64,NEW_THUMB');
    expect(synced.imageFingerprint).toBe('new-source');
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('DATA-02 unchanged legacy source pixels remain full-sized when the cloud gains a fingerprint', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    const saved = await service.saveDNA(record());
    await local.saveLocalDNA({ ...saved, imageFingerprint: undefined });
    const remote = cloudRecord('one')!;
    remote.revision = (saved.revision ?? 0) + 1;
    mocks.setDoc.mockClear();
    await service.syncCloudAndLocal();
    const synced = (await local.getLocalDNA())[0];
    expect(synced.imageUrl).toBe('data:image/png;base64,FULL');
    expect(synced.imageFingerprint).toBe(saved.imageFingerprint);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('DATA-08 disabling sync during thumbnail preparation reports a deferred upload', async () => {
    const service = await import('./cloudDnaService');
    const local = await import('./localDbService');
    await local.saveLocalDNA(record());
    const thumbnail = deferred<any>();
    mocks.createThumbnail.mockImplementationOnce(() => thumbnail.promise);
    const syncing = service.syncCloudAndLocal();
    await flushPromises();
    service.setCloudSyncEnabled(false);
    thumbnail.resolve({ success: true, thumbnail: 'data:image/jpeg;base64,THUMB' });
    const result = await syncing;
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(result.cloudWritesAttempted).toBe(0);
    expect(result.completed).toBe(false);
    expect(result.failures.some(failure => failure.operation === 'upload')).toBe(true);
    expect((await local.getLocalDNA())[0].imageUrl).toBe('data:image/png;base64,FULL');
  });
});
