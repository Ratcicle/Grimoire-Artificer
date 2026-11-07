export interface DnaOperationContext {
  ownerId: string | null;
}

let ownerProvider: () => string | null = () => null;
const listeners = new Set<() => void>();

export function setDnaOwnerProvider(provider: () => string | null): void {
  ownerProvider = provider;
}

export function captureDnaOperationContext(): DnaOperationContext {
  return { ownerId: ownerProvider() };
}

export function isDnaOperationContextCurrent(context: DnaOperationContext): boolean {
  return context.ownerId === ownerProvider();
}

export function assertDnaOperationContext(context: DnaOperationContext): void {
  if (!isDnaOperationContextCurrent(context)) {
    throw new Error('The account changed during this operation. Reload the current library.');
  }
}

export function subscribeDnaChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let suspensions = 0;
let notificationPending = false;

/** Holds change events during a long batch and delivers one when released. */
export function suspendDnaNotifications(): () => void {
  suspensions++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--suspensions === 0 && notificationPending) {
      notificationPending = false;
      notifyDnaChanges();
    }
  };
}

export function notifyDnaChanges(): void {
  if (suspensions > 0) {
    notificationPending = true;
    return;
  }
  for (const listener of listeners) {
    try { listener(); } catch (error) { console.warn('Library change listener failed:', error); }
  }
}
