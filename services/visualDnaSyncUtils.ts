import { VisualDNA } from "../types";

export const LEGACY_FALLBACK_TIMESTAMP = 1;

export function extractTimestampFromDnaId(id: string | undefined): number | undefined {
  if (!id) return undefined;
  const match = id.match(/^(\d{13})/);
  if (match) {
    const ts = parseInt(match[1], 10);
    // basic sanity check: after 2020 and before 2100
    if (ts > 1577836800000 && ts < 4102444800000) {
      return ts;
    }
  }
  return undefined;
}

export interface LegacyMigrationResult {
  record: VisualDNA;
  wasMigrated: boolean;
}

export function migrateLegacyMetadata(dna: VisualDNA): LegacyMigrationResult {
  if (dna.createdAt !== undefined && dna.updatedAt !== undefined && dna.revision !== undefined) {
    return { record: dna, wasMigrated: false };
  }
  
  const record = { ...dna };
  const extractedTs = extractTimestampFromDnaId(dna.id);
  const fallbackTs = extractedTs !== undefined ? extractedTs : LEGACY_FALLBACK_TIMESTAMP;
  
  record.createdAt = record.createdAt !== undefined ? record.createdAt : fallbackTs;
  record.updatedAt = record.updatedAt !== undefined ? record.updatedAt : record.createdAt;
  record.revision = record.revision !== undefined ? record.revision : 1;
  
  return { record, wasMigrated: true };
}

export type CanonicalValue =
  | null
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export function canonicalizeValue(value: unknown): CanonicalValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const arr: CanonicalValue[] = [];
    for (const item of value) {
      const canonicalItem = canonicalizeValue(item);
      if (canonicalItem !== undefined) {
        arr.push(canonicalItem);
      } else {
        arr.push(null); // Keep array length and order
      }
    }
    return arr;
  }
  if (typeof value === 'object') {
    const obj: { [key: string]: CanonicalValue } = {};
    const keys = Object.keys(value as object).sort();
    for (const k of keys) {
      const canonicalVal = canonicalizeValue((value as Record<string, unknown>)[k]);
      if (canonicalVal !== undefined) {
        obj[k] = canonicalVal;
      }
    }
    return obj;
  }
  return undefined;
}

export function canonicalizeDnaContent(dna: VisualDNA): CanonicalValue {
  const ignoreKeys = ['imageUrl', 'userId', 'createdAt', 'updatedAt', 'revision'];
  const contentOnly: Record<string, unknown> = {};
  for (const k of Object.keys(dna)) {
    if (!ignoreKeys.includes(k)) {
      contentOnly[k] = (dna as unknown as Record<string, unknown>)[k];
    }
  }
  return canonicalizeValue(contentOnly) || {};
}

export function areDnaContentsEquivalent(a: VisualDNA, b: VisualDNA): boolean {
  return JSON.stringify(canonicalizeDnaContent(a)) === JSON.stringify(canonicalizeDnaContent(b));
}

export function consolidateEquivalentRecords(local: VisualDNA, cloud: VisualDNA): {
  canonical: VisualDNA;
  localNeedsWrite: boolean;
  cloudNeedsWrite: boolean;
} {
  const revision = Math.max(local.revision ?? 1, cloud.revision ?? 1);
  const createdAt = Math.min(
    local.createdAt ?? LEGACY_FALLBACK_TIMESTAMP,
    cloud.createdAt ?? LEGACY_FALLBACK_TIMESTAMP
  );
  const updatedAt = Math.max(
    local.updatedAt ?? createdAt,
    cloud.updatedAt ?? createdAt
  );

  // We should preserve the content of the most recently updated one or just one of them.
  // Since contents are semantically equivalent, we can use local as the base and just patch metadata.
  // Wait, the prompt says: "preserve the content of the most complete version" but also says "atualize o lado que possui metadados desatualizados".
  
  // We use local as the base, because semantically they are equal.
  // To be safer, we can use the one with the higher revision or updatedAt.
  const baseRecord = (local.revision ?? 1) >= (cloud.revision ?? 1) ? local : cloud;
  
  const canonical = { ...baseRecord, revision, createdAt, updatedAt };
  
  // Also preserve best local image only for the local write, but we handle image separately.
  // Let's just say canonical is the agreed upon metadata and content.
  
  const localNeedsWrite = local.revision !== revision || local.createdAt !== createdAt || local.updatedAt !== updatedAt;
  const cloudNeedsWrite = cloud.revision !== revision || cloud.createdAt !== createdAt || cloud.updatedAt !== updatedAt;

  return { canonical, localNeedsWrite, cloudNeedsWrite };
}

export function compareRecordVersions(local: VisualDNA, cloud: VisualDNA): number {
  const localRev = local.revision ?? 1;
  const cloudRev = cloud.revision ?? 1;
  
  if (localRev !== cloudRev) {
    return localRev - cloudRev;
  }
  
  const localUp = local.updatedAt ?? 0;
  const cloudUp = cloud.updatedAt ?? 0;
  
  if (localUp !== cloudUp) {
    return localUp - cloudUp;
  }
  
  return 0; // tie
}

export type ConflictResolution = "local_wins" | "cloud_wins" | "equivalent" | "legacy_conflict";

export function resolveDnaConflict(local: VisualDNA, cloud: VisualDNA): ConflictResolution {
  if (areDnaContentsEquivalent(local, cloud)) {
    return "equivalent";
  }
  
  const versionDiff = compareRecordVersions(local, cloud);
  if (versionDiff > 0) return "local_wins";
  if (versionDiff < 0) return "cloud_wins";
  
  return "legacy_conflict";
}

export function isBase64Image(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('data:image');
}

export function sanitizeCloudImageUrl(candidate: string | undefined, existingCloudImage?: string): string | undefined {
  if (isBase64Image(candidate)) {
    return existingCloudImage && !isBase64Image(existingCloudImage) ? existingCloudImage : undefined;
  }
  return candidate;
}

export function preserveBestLocalImage(resolvedRecord: VisualDNA, localRecord?: VisualDNA, cloudRecord?: VisualDNA): VisualDNA {
  const record = { ...resolvedRecord };
  
  if (isBase64Image(localRecord?.imageUrl)) {
    record.imageUrl = localRecord!.imageUrl;
  } else if (isBase64Image(cloudRecord?.imageUrl)) {
    record.imageUrl = cloudRecord!.imageUrl;
  } else if (localRecord?.imageUrl) {
    record.imageUrl = localRecord.imageUrl;
  } else if (cloudRecord?.imageUrl) {
    record.imageUrl = cloudRecord.imageUrl;
  }
  
  return record;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export function upsertWrite(map: Map<string, VisualDNA>, record: VisualDNA): void {
  map.set(record.id, record);
}

export interface SyncFailure {
  id?: string;
  operation: "read" | "upload" | "delete" | "thumbnail" | "auth";
  message: string;
  retryable: boolean;
}

export interface SyncResult {
  records: VisualDNA[];
  localWrites: number;
  cloudWritesAttempted: number;
  cloudWritesSucceeded: number;
  cloudWritesFailed: number;
  cloudReadsSucceeded: boolean;
  completed: boolean;
  partial: boolean;
  quotaExceeded: boolean;
  failures: SyncFailure[];
}

export interface SyncPlan {
  localWrites: VisualDNA[];
  cloudWrites: VisualDNA[];
  unchangedIds: string[];
  conflictsResolved: string[];
}

export function createVisualDnaSyncPlan(
  localRecords: VisualDNA[],
  cloudRecords: VisualDNA[],
  options?: { now?: () => number }
): SyncPlan {
  const now = options?.now ? options.now() : Date.now();
  
  const localMap = new Map(localRecords.map(item => [item.id, item]));
  const cloudMap = new Map(cloudRecords.map(item => [item.id, item]));
  
  const localWritesMap = new Map<string, VisualDNA>();
  const cloudWritesMap = new Map<string, VisualDNA>();
  const unchangedIds: string[] = [];
  const conflictsResolved: string[] = [];

  const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
  
  const isCloudImageUpdateNeeded = (localUrl?: string, cloudUrl?: string) => {
    if (localUrl === cloudUrl) return false;
    if (typeof localUrl === 'string' && localUrl.startsWith('data:image') && 
        typeof cloudUrl === 'string' && cloudUrl.startsWith('http')) {
      return false;
    }
    return true;
  };

  for (const id of allIds) {
    const rawLocalItem = localMap.get(id);
    const rawCloudItem = cloudMap.get(id);
    
    let localItem = rawLocalItem ? { ...rawLocalItem } : undefined;
    let cloudItem = rawCloudItem ? { ...rawCloudItem } : undefined;
    
    let localMigrated = false;
    let cloudMigrated = false;
    
    if (localItem) {
      const result = migrateLegacyMetadata(localItem);
      localItem = result.record;
      localMigrated = result.wasMigrated;
    }
    
    if (cloudItem) {
      const result = migrateLegacyMetadata(cloudItem);
      cloudItem = result.record;
      cloudMigrated = result.wasMigrated;
    }

    if (localItem && !cloudItem) {
      // Local only
      const resolvedLocal = preserveBestLocalImage(localItem, rawLocalItem, rawCloudItem);
      if (localMigrated || JSON.stringify(resolvedLocal) !== JSON.stringify(rawLocalItem)) {
        upsertWrite(localWritesMap, resolvedLocal);
      }
      upsertWrite(cloudWritesMap, localItem);
    } else if (!localItem && cloudItem) {
      // Cloud only
      const resolvedLocal = preserveBestLocalImage(cloudItem, rawLocalItem, rawCloudItem);
      upsertWrite(localWritesMap, resolvedLocal);
      if (cloudMigrated || JSON.stringify(cloudItem) !== JSON.stringify(rawCloudItem)) {
        upsertWrite(cloudWritesMap, cloudItem);
      }
    } else if (localItem && cloudItem) {
      // Both exist
      const resolution = resolveDnaConflict(localItem, cloudItem);
      
      if (resolution === "local_wins") {
        const resolvedLocal = preserveBestLocalImage(localItem, rawLocalItem, rawCloudItem);
        if (localMigrated || JSON.stringify(resolvedLocal) !== JSON.stringify(rawLocalItem)) {
          upsertWrite(localWritesMap, resolvedLocal);
        }
        if (cloudItem.revision !== localItem.revision || cloudItem.updatedAt !== localItem.updatedAt || !areDnaContentsEquivalent(cloudItem, localItem) || isCloudImageUpdateNeeded(localItem.imageUrl, rawCloudItem.imageUrl)) {
          upsertWrite(cloudWritesMap, localItem);
        }
      } else if (resolution === "cloud_wins") {
        const resolvedLocal = preserveBestLocalImage(cloudItem, rawLocalItem, rawCloudItem);
        if (JSON.stringify(resolvedLocal) !== JSON.stringify(rawLocalItem)) {
          upsertWrite(localWritesMap, resolvedLocal);
        }
        if (cloudMigrated || JSON.stringify(cloudItem) !== JSON.stringify(rawCloudItem)) {
          upsertWrite(cloudWritesMap, cloudItem);
        }
      } else if (resolution === "equivalent") {
        const { canonical, localNeedsWrite, cloudNeedsWrite } = consolidateEquivalentRecords(localItem, cloudItem);
        const resolvedLocal = preserveBestLocalImage(canonical, rawLocalItem, rawCloudItem);
        
        if (localNeedsWrite || localMigrated || JSON.stringify(resolvedLocal) !== JSON.stringify(rawLocalItem)) {
          upsertWrite(localWritesMap, resolvedLocal);
        }
        if (cloudNeedsWrite || cloudMigrated || isCloudImageUpdateNeeded(canonical.imageUrl, rawCloudItem.imageUrl)) {
          upsertWrite(cloudWritesMap, canonical);
        }
      } else if (resolution === "legacy_conflict") {
        const resolved = {
          ...localItem,
          createdAt: Math.min(localItem.createdAt!, cloudItem.createdAt!),
          updatedAt: now,
          revision: Math.max(localItem.revision!, cloudItem.revision!) + 1
        };
        const resolvedLocal = preserveBestLocalImage(resolved, rawLocalItem, rawCloudItem);
        
        upsertWrite(localWritesMap, resolvedLocal);
        upsertWrite(cloudWritesMap, resolved);
        conflictsResolved.push(id);
      }
    }
    
    if (!localWritesMap.has(id) && !cloudWritesMap.has(id)) {
      unchangedIds.push(id);
    }
  }

  return {
    localWrites: Array.from(localWritesMap.values()),
    cloudWrites: Array.from(cloudWritesMap.values()),
    unchangedIds,
    conflictsResolved
  };
}
