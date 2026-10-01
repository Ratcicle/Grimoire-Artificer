import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createIndexedDbMock, flushPromises } from './storageTestUtils';
import type { VisualDNA } from '../types';

let memory: ReturnType<typeof createIndexedDbMock>;
beforeEach(() => {
  vi.resetModules();
  memory = createIndexedDbMock();
  vi.stubGlobal('indexedDB', memory.indexedDB);
});
afterEach(() => vi.unstubAllGlobals());

describe('DATA-01 durable local storage', () => {
  it('rejects a blocked schema upgrade with instructions to close other tabs', async () => {
    const request: any = {};
    vi.stubGlobal('indexedDB', { open: () => request });
    const service = await import('./localDbService');
    let message: string | undefined;
    void service.initDB().catch(error => { message = error.message; });
    request.onblocked?.();
    await flushPromises();
    expect(message).toBeTypeOf('string');
    expect(message).toMatch(/close.*tabs/i);
  });

  it('closes a late opened connection after a blocked request was rejected', async () => {
    const requests: any[] = [];
    const close = vi.fn();
    vi.stubGlobal('indexedDB', { open: () => {
      const request: any = { result: { close } };
      requests.push(request);
      return request;
    } });
    const service = await import('./localDbService');
    void service.initDB().catch(() => {});
    requests[0].onblocked?.();
    await flushPromises();
    requests[0].onsuccess?.();
    await flushPromises();
    expect(close).toHaveBeenCalledTimes(1);
    const next = service.initDB();
    expect(requests).toHaveLength(2);
    requests[1].onsuccess?.();
    await next;
  });

  it.each(['saveLocalDNA', 'saveTokenLog', 'deleteLocalDNA', 'clearTokenLogs'] as const)('%s waits for transaction commit after request success', async method => {
    const service = await import('./localDbService');
    memory.holdCommits();
    let resolved = false;
    const argument = method === 'deleteLocalDNA' ? 'one' : { id: 'one', imageUrl: 'full-image' };
    const operation = (service[method] as (...args: any[]) => Promise<void>)(argument).then(() => { resolved = true; });
    await flushPromises();
    expect(resolved).toBe(false);
    memory.transactions.at(-1).complete();
    await operation;
    expect(resolved).toBe(true);
  });

  it('rejects abort after a successful put without publishing a successful save', async () => {
    const service = await import('./localDbService');
    memory.holdCommits();
    const operation = service.saveLocalDNA({ id: 'one', imageUrl: 'full-image' } as VisualDNA);
    const rejected = expect(operation).rejects.toThrow(/abort/i);
    await flushPromises();
    memory.transactions.at(-1).abort();
    await rejected;
    expect(await service.getLocalDNA()).toEqual([]);
  });

  it('publishes library changes only after a committed DNA transaction', async () => {
    const service = await import('./localDbService');
    const context = await import('./dnaAccountContext');
    const changed = vi.fn();
    const unsubscribe = context.subscribeDnaChanges(changed);
    memory.holdCommits();
    const pending = service.saveLocalDNA({ id: 'one' } as VisualDNA);
    await flushPromises();
    expect(changed).not.toHaveBeenCalled();
    memory.transactions.at(-1).complete();
    await pending;
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('retains unowned legacy references without assigning them to the next login', async () => {
    memory.seedLegacy({ id: 'legacy', name: 'Original', imageUrl: 'full' });
    const service = await import('./localDbService');
    const context = await import('./dnaAccountContext');
    expect((await service.getLocalDNA()).map(item => item.id)).toEqual(['legacy']);
    context.setDnaOwnerProvider(() => 'A');
    expect(await service.getLocalDNA()).toEqual([]);
    await service.saveLocalDNA({ id: 'new', imageUrl: 'new-full' } as VisualDNA);
    context.setDnaOwnerProvider(() => 'B');
    expect(await service.getLocalDNA()).toEqual([]);
    context.setDnaOwnerProvider(() => null);
    expect((await service.getLocalDNA()).map(item => item.id)).toEqual(['legacy']);
  });

  it('rolls back deletion together with its tombstone when either write fails', async () => {
    const service = await import('./localDbService');
    await service.saveLocalDNA({ id: 'one', imageUrl: 'full' } as VisualDNA);
    memory.failNextWrite();
    await expect(service.deleteLocalDNA('one')).rejects.toThrow('Storage write failed');
    expect((await service.getLocalDNA()).map(item => item.id)).toEqual(['one']);
    expect(await service.getDnaTombstones()).toEqual([]);
  });

  it('stops deletion if the account changes while its transactional read is pending', async () => {
    const service = await import('./localDbService');
    const context = await import('./dnaAccountContext');
    context.setDnaOwnerProvider(() => 'A');
    await service.saveLocalDNA({ id: 'one', imageUrl: 'full' } as VisualDNA);
    memory.beforeNextRead(() => context.setDnaOwnerProvider(() => 'B'));
    await expect(service.deleteLocalDNA('one')).rejects.toThrow(/account/i);
    context.setDnaOwnerProvider(() => 'A');
    expect((await service.getLocalDNA()).map(item => item.id)).toEqual(['one']);
    expect(await service.getDnaTombstones()).toEqual([]);
  });

  it('stops a deletion acknowledgement if the account changes inside its transaction', async () => {
    const service = await import('./localDbService');
    const context = await import('./dnaAccountContext');
    context.setDnaOwnerProvider(() => 'A');
    await service.deleteLocalDNA('one');
    const tombstone = (await service.getDnaTombstones())[0];
    memory.beforeNextRead(() => context.setDnaOwnerProvider(() => 'B'));
    await expect(service.acknowledgeDnaDeletion(tombstone)).rejects.toThrow(/account/i);
    context.setDnaOwnerProvider(() => 'A');
    expect((await service.getDnaTombstones())[0].cloudDeleted).toBe(false);
  });
});
