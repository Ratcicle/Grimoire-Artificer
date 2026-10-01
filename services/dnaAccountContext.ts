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

export function notifyDnaChanges(): void {
  for (const listener of listeners) {
    try { listener(); } catch (error) { console.warn('Library change listener failed:', error); }
  }
}
