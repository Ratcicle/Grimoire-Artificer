import { VisualDNA } from "../types";
import { getLocalDNA, saveLocalDNA, deleteLocalDNA } from "./localDbService";
import { db, auth } from "./firebase";
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from "firebase/firestore";
import { createThumbnail } from "./imageUtils";
import { 
  migrateLegacyMetadata, 
  resolveDnaConflict, 
  preserveBestLocalImage,
  upsertWrite,
  getErrorMessage,
  createVisualDnaSyncPlan,
  sanitizeCloudImageUrl,
  SyncResult,
  SyncFailure,
  isBase64Image
} from "./visualDnaSyncUtils";

let quotaExceeded = false;
let syncInProgress = false;
let lastSyncAt = 0;
const SYNC_COOLDOWN_MS = 20000;

export const isFirestoreQuotaExceeded = (): boolean => quotaExceeded;
export const isSyncInProgress = (): boolean => syncInProgress;
export const getLastSyncAt = (): number => lastSyncAt;

export const resetQuotaExceeded = (): void => {
  quotaExceeded = false;
};

export const isCloudSyncEnabled = (): boolean => {
  return localStorage.getItem("grimoire_cloud_sync_enabled") === "true";
};

export const setCloudSyncEnabled = (enabled: boolean): void => {
  localStorage.setItem("grimoire_cloud_sync_enabled", String(enabled));
};

export const saveDNA = async (dna: VisualDNA): Promise<VisualDNA> => {
  const existing = await getLocalDNA().then(list => list.find(d => d.id === dna.id));
  
  const toSave = { ...dna };
  
  if (existing) {
    const { record: migrated } = migrateLegacyMetadata(existing);
    toSave.createdAt = migrated.createdAt;
    toSave.updatedAt = Date.now();
    toSave.revision = migrated.revision! + 1;
  } else {
    toSave.createdAt = toSave.createdAt || Date.now();
    toSave.updatedAt = Date.now();
    toSave.revision = toSave.revision || 1;
  }

  // 1. Save locally exactly once. Do NOT block on quotaExceeded.
  await saveLocalDNA(toSave);
  
  // 2. Sync to cloud if enabled
  if (isCloudSyncEnabled() && auth.currentUser && !quotaExceeded) {
    const docRef = doc(db, "visualDNA", toSave.id);
    
    let firestoreImageUrl = toSave.imageUrl;
    if (isBase64Image(toSave.imageUrl)) {
      try {
        const thumbResult = await createThumbnail(toSave.imageUrl!, 180, 180, 0.6);
        if (thumbResult.success) {
          firestoreImageUrl = thumbResult.thumbnail;
        } else {
          firestoreImageUrl = sanitizeCloudImageUrl(toSave.imageUrl, existing?.imageUrl);
          console.warn("Failed to generate thumbnail for Firestore save:", thumbResult.error);
        }
      } catch (err) {
        firestoreImageUrl = sanitizeCloudImageUrl(toSave.imageUrl, existing?.imageUrl);
        console.warn("Failed to generate thumbnail for Firestore save:", err);
      }
    }

    setDoc(docRef, {
      ...toSave,
      imageUrl: firestoreImageUrl,
      userId: auth.currentUser.uid
    }).catch(e => {
      const msg = getErrorMessage(e);
      const isQuota = msg.includes("Quota") || msg.includes("quota") || msg.includes("resource-exhausted");
      if (isQuota) {
        quotaExceeded = true;
        console.warn("Firestore daily free quota limit exceeded. Saved locally to IndexedDB.");
      } else {
        console.error("Failed to sync save to Firestore in background:", e);
      }
    });
  }

  return toSave;
};

export const deleteDNA = async (id: string): Promise<void> => {
  await deleteLocalDNA(id);
  
  if (isCloudSyncEnabled() && auth.currentUser && !quotaExceeded) {
    try {
      await deleteDoc(doc(db, "visualDNA", id));
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      const isQuota = msg.includes("Quota") || msg.includes("quota") || msg.includes("resource-exhausted");
      if (isQuota) {
        quotaExceeded = true;
        console.warn("Firestore daily free quota limit exceeded. Deleted locally.");
      } else {
        console.error("Failed to delete from Firestore:", e);
      }
    }
  }
};

export const syncCloudAndLocal = async (): Promise<SyncResult> => {
  const localData = await getLocalDNA();
  
  const result: SyncResult = {
    records: localData,
    localWrites: 0,
    cloudWritesAttempted: 0,
    cloudWritesSucceeded: 0,
    cloudWritesFailed: 0,
    cloudReadsSucceeded: false,
    completed: false,
    partial: false,
    quotaExceeded: quotaExceeded,
    failures: []
  };

  if (!auth.currentUser) {
    result.failures.push({
      operation: "auth",
      message: "No authenticated user",
      retryable: false
    });
    return result;
  }
  
  if (syncInProgress) {
    return result;
  }

  const now = Date.now();
  if (now - lastSyncAt < SYNC_COOLDOWN_MS) {
    return result;
  }

  syncInProgress = true;
  
  try {
    const q = query(collection(db, "visualDNA"), where("userId", "==", auth.currentUser.uid));
    let cloudData: VisualDNA[] = [];
    try {
      const querySnapshot = await getDocs(q);
      cloudData = querySnapshot.docs.map(doc => doc.data() as VisualDNA);
      quotaExceeded = false;
      result.quotaExceeded = false;
      result.cloudReadsSucceeded = true;
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      const isQuota = msg.includes("Quota") || msg.includes("quota") || msg.includes("resource-exhausted");
      if (isQuota) {
        quotaExceeded = true;
        result.quotaExceeded = true;
      }
      result.failures.push({
        operation: "read",
        message: msg,
        retryable: true
      });
      return result;
    }
    
    const plan = createVisualDnaSyncPlan(localData, cloudData);
    
    // Always persist local writes
    if (plan.localWrites.length > 0) {
      for (const item of plan.localWrites) {
        await saveLocalDNA(item);
        result.localWrites++;
      }
    }

    // Persist cloud writes if quota allows
    if (plan.cloudWrites.length > 0 && !quotaExceeded) {
      const BATCH_SIZE = 5;
      result.cloudWritesAttempted = plan.cloudWrites.length;
      
      const existingCloudMap = new Map(cloudData.map(c => [c.id, c]));

      for (let i = 0; i < plan.cloudWrites.length; i += BATCH_SIZE) {
        if (quotaExceeded) break;
        const batch = plan.cloudWrites.slice(i, i + BATCH_SIZE);
        const uploadPromises = batch.map(async (item) => {
          try {
            const docRef = doc(db, "visualDNA", item.id);
            const cloudItem = { ...item };
            
            if (isBase64Image(item.imageUrl)) {
              try {
                const thumbResult = await createThumbnail(item.imageUrl!, 180, 180, 0.6);
                if (thumbResult.success) {
                  cloudItem.imageUrl = thumbResult.thumbnail;
                } else {
                  cloudItem.imageUrl = sanitizeCloudImageUrl(item.imageUrl, existingCloudMap.get(item.id)?.imageUrl);
                  result.failures.push({
                    id: item.id,
                    operation: "thumbnail",
                    message: thumbResult.error || "Failed to create thumbnail",
                    retryable: true
                  });
                }
              } catch (err) {
                cloudItem.imageUrl = sanitizeCloudImageUrl(item.imageUrl, existingCloudMap.get(item.id)?.imageUrl);
                result.failures.push({
                  id: item.id,
                  operation: "thumbnail",
                  message: getErrorMessage(err),
                  retryable: true
                });
              }
            } else {
              cloudItem.imageUrl = sanitizeCloudImageUrl(item.imageUrl, existingCloudMap.get(item.id)?.imageUrl);
            }
            
            await setDoc(docRef, { ...cloudItem, userId: auth.currentUser!.uid });
            result.cloudWritesSucceeded++;
          } catch (e: unknown) {
            const msg = getErrorMessage(e);
            const isQuota = msg.includes("Quota") || msg.includes("quota") || msg.includes("resource-exhausted");
            if (isQuota) {
              quotaExceeded = true;
              result.quotaExceeded = true;
            }
            result.cloudWritesFailed++;
            result.failures.push({
              id: item.id,
              operation: "upload",
              message: msg,
              retryable: true
            });
          }
        });
        await Promise.all(uploadPromises);
        if (i + BATCH_SIZE < plan.cloudWrites.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } else if (plan.cloudWrites.length > 0 && quotaExceeded) {
       result.cloudWritesAttempted = plan.cloudWrites.length;
       result.cloudWritesFailed = plan.cloudWrites.length;
       result.failures.push({
          operation: "upload",
          message: "Firestore daily free quota limit exceeded.",
          retryable: true
       });
    }

    lastSyncAt = Date.now();
    result.records = await getLocalDNA();
    result.completed = result.failures.length === 0 && (!quotaExceeded || plan.cloudWrites.length === 0);
    result.partial = result.localWrites > 0 && !result.completed;
    
    return result;
  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    const isQuota = msg.includes("Quota") || msg.includes("quota") || msg.includes("resource-exhausted");
    if (isQuota) {
      quotaExceeded = true;
      result.quotaExceeded = true;
    }
    result.failures.push({
      operation: "read", // generic failure
      message: msg,
      retryable: true
    });
    result.records = await getLocalDNA(); // fetch latest anyway
    return result;
  } finally {
    syncInProgress = false;
  }
};

export const syncLocalToCloud = async (): Promise<SyncResult> => {
  return await syncCloudAndLocal();
};
