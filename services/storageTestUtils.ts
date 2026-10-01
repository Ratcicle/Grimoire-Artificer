// In-memory IndexedDB boundary for storage regressions. No browser database is opened.
export function createIndexedDbMock() {
  const stores = new Map<string, Map<string, any>>();
  const transactions: any[] = [];
  let autoCommit = true;
  let failNextWrite = false;
  let beforeNextRead: (() => void) | undefined;
  const clone = <T>(value: T): T => value === undefined ? value : structuredClone(value);
  const key = (value: unknown) => JSON.stringify(value);
  const database: any = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => { stores.set(name, new Map()); },
    close() {},
    transaction(names: string | string[], mode: string) {
      const working = new Map<string, Map<string, any>>();
      for (const name of typeof names === 'string' ? [names] : names) {
        if (!stores.has(name)) throw new Error(`Missing object store: ${name}`);
        working.set(name, new Map(stores.get(name)));
      }
      let pending = 0;
      let done = false;
      const tx: any = {
        mode,
        error: null,
        abort() {
          if (done) return;
          done = true;
          tx.error ||= new Error('Transaction aborted');
          tx.onabort?.();
        },
        complete() {
          if (done) return;
          done = true;
          if (mode === 'readwrite') for (const [name, data] of working) stores.set(name, data);
          tx.oncomplete?.();
        },
        objectStore(name: string) {
          const data = working.get(name)!;
          const request = (operation: () => unknown, write = false) => {
            const req: any = { result: undefined, error: null };
            pending++;
            queueMicrotask(() => {
              if (done) return;
              if (write && failNextWrite) {
                failNextWrite = false;
                req.error = tx.error = new Error('Storage write failed');
                req.onerror?.();
                tx.abort();
                return;
              }
              req.result = clone(operation());
              pending--;
              if (!write && beforeNextRead) {
                const callback = beforeNextRead;
                beforeNextRead = undefined;
                callback();
              }
              req.onsuccess?.();
              queueMicrotask(() => {
                if (!pending && (autoCommit || mode === 'readonly')) tx.complete();
              });
            });
            return req;
          };
          return {
            get: (id: unknown) => request(() => data.get(key(id))),
            getAll: () => request(() => [...data.values()]),
            put: (value: any) => request(() => { data.set(key(value.storageKey ?? value.id), clone(value)); }, true),
            delete: (id: unknown) => request(() => data.delete(key(id)), true),
            clear: () => request(() => data.clear(), true),
          };
        },
      };
      transactions.push(tx);
      return tx;
    },
  };
  const indexedDB = {
    open() {
      const req: any = { result: database, error: null };
      queueMicrotask(() => {
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.();
      });
      return req;
    },
  };
  return {
    indexedDB, stores, transactions,
    holdCommits: () => { autoCommit = false; },
    failNextWrite: () => { failNextWrite = true; },
    beforeNextRead: (callback: () => void) => { beforeNextRead = callback; },
    seedLegacy: (record: any) => {
      if (!stores.has('visualDNA')) stores.set('visualDNA', new Map());
      stores.get('visualDNA')!.set(key(record.id), clone(record));
    },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export async function flushPromises() {
  for (let index = 0; index < 40; index++) await Promise.resolve();
}
