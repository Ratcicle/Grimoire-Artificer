import { describe, it, expect } from "vitest";
import {
  extractTimestampFromDnaId,
  migrateLegacyMetadata,
  areDnaContentsEquivalent,
  resolveDnaConflict,
  preserveBestLocalImage,
  LEGACY_FALLBACK_TIMESTAMP,
  canonicalizeValue,
  createVisualDnaSyncPlan,
  sanitizeCloudImageUrl,
  consolidateEquivalentRecords
} from "./visualDnaSyncUtils";
import { VisualDNA } from "../types";

describe("visualDnaSyncUtils", () => {
  describe("Metadata and IDs", () => {
    it("extracts timestamp correctly from 13 digit prefix ID", () => {
      const validTs = Date.now();
      const id = validTs.toString() + "abcde";
      expect(extractTimestampFromDnaId(id)).toBe(validTs);
    });

    it("returns undefined for invalid or very old IDs", () => {
      expect(extractTimestampFromDnaId("legacy-id-123")).toBeUndefined();
      expect(extractTimestampFromDnaId("123456")).toBeUndefined();
      expect(extractTimestampFromDnaId("9999999999999abc")).toBeUndefined();
    });

    it("migrates legacy metadata with extracted timestamp", () => {
      const ts = Date.now();
      const dna: VisualDNA = { id: ts.toString() + "x", tags: ["a"] } as any;
      const { record, wasMigrated } = migrateLegacyMetadata(dna);
      expect(wasMigrated).toBe(true);
      expect(record.createdAt).toBe(ts);
      expect(record.updatedAt).toBe(ts);
      expect(record.revision).toBe(1);
    });
  });

  describe("Canonicalization and Equivalency", () => {
    it("detects equivalent content ignoring specific fields", () => {
      const a: VisualDNA = { id: "1", createdAt: 1, updatedAt: 2, revision: 1, imageUrl: "data:a", summary: "hi", tags: [] } as any;
      const b: VisualDNA = { id: "1", createdAt: 9, updatedAt: 9, revision: 5, imageUrl: "https://b", summary: "hi", tags: [] } as any;
      expect(areDnaContentsEquivalent(a, b)).toBe(true);
    });

    it("detects equivalent content with different key order", () => {
      const a = { subjectProfile: { scale: "large", presence: "dominant" } } as any;
      const b = { subjectProfile: { presence: "dominant", scale: "large" } } as any;
      expect(areDnaContentsEquivalent(a, b)).toBe(true);
    });
    
    it("detects deeply nested equivalent content", () => {
       const a = { a: { b: { c: 1, d: 2 } } } as any;
       const b = { a: { b: { d: 2, c: 1 } } } as any;
       expect(areDnaContentsEquivalent(a, b)).toBe(true);
    });

    it("detects different content", () => {
      const a: VisualDNA = { id: "1", summary: "hello", tags: [] } as any;
      const b: VisualDNA = { id: "1", summary: "hi", tags: [] } as any;
      expect(areDnaContentsEquivalent(a, b)).toBe(false);
    });

    it("preserves false, 0, null, empty string and empty array", () => {
      const val = { a: false, b: 0, c: "", d: null, e: [] };
      expect(canonicalizeValue(val)).toEqual(val);
    });

    it("ignores undefined properties", () => {
      const a = { a: 1, b: undefined };
      expect(canonicalizeValue(a)).toEqual({ a: 1 });
    });

    it("detects array order difference", () => {
      const a = { tags: ["a", "b"] } as any;
      const b = { tags: ["b", "a"] } as any;
      expect(areDnaContentsEquivalent(a, b)).toBe(false);
    });
  });

  describe("Conflict Resolution and Consolidation", () => {
    it("resolves conflict: local wins if higher revision", () => {
      const local: VisualDNA = { id: "1", revision: 2, summary: "a" } as any;
      const cloud: VisualDNA = { id: "1", revision: 1, summary: "b" } as any;
      expect(resolveDnaConflict(local, cloud)).toBe("local_wins");
    });

    it("resolves conflict: cloud wins if higher revision", () => {
      const local: VisualDNA = { id: "1", revision: 1, summary: "a" } as any;
      const cloud: VisualDNA = { id: "1", revision: 2, summary: "b" } as any;
      expect(resolveDnaConflict(local, cloud)).toBe("cloud_wins");
    });

    it("resolves conflict: equivalent", () => {
      const local: VisualDNA = { id: "1", revision: 1, summary: "a" } as any;
      const cloud: VisualDNA = { id: "1", revision: 1, summary: "a" } as any;
      expect(resolveDnaConflict(local, cloud)).toBe("equivalent");
    });
    
    it("resolves tie break on updatedAt", () => {
      const local: VisualDNA = { id: "1", revision: 1, updatedAt: 10, summary: "a" } as any;
      const cloud: VisualDNA = { id: "1", revision: 1, updatedAt: 20, summary: "b" } as any;
      expect(resolveDnaConflict(local, cloud)).toBe("cloud_wins");
    });

    it("consolidates equivalent contents into max revision and min/max dates", () => {
      const local: VisualDNA = { id: "1", revision: 1, createdAt: 5, updatedAt: 10, summary: "a" } as any;
      const cloud: VisualDNA = { id: "1", revision: 5, createdAt: 2, updatedAt: 20, summary: "a" } as any;
      
      const { canonical } = consolidateEquivalentRecords(local, cloud);
      expect(canonical.revision).toBe(5);
      expect(canonical.createdAt).toBe(2);
      expect(canonical.updatedAt).toBe(20);
    });
    
    it("consolidation updates only the outdated side", () => {
      const local: VisualDNA = { id: "1", revision: 1, createdAt: 5, updatedAt: 10, summary: "a" } as any;
      const cloud: VisualDNA = { id: "1", revision: 5, createdAt: 2, updatedAt: 20, summary: "a" } as any;
      
      const { localNeedsWrite, cloudNeedsWrite } = consolidateEquivalentRecords(local, cloud);
      expect(localNeedsWrite).toBe(true);
      expect(cloudNeedsWrite).toBe(false); // cloud is already up to date
    });
  });

  describe("Images", () => {
    it("preserves best local image base64", () => {
      const resolved: VisualDNA = { id: "1", summary: "a" } as any;
      const local: VisualDNA = { id: "1", imageUrl: "data:image/png;base64,123" } as any;
      const cloud: VisualDNA = { id: "1", imageUrl: "https://example.com/img" } as any;
      
      const final = preserveBestLocalImage(resolved, local, cloud);
      expect(final.imageUrl).toBe("data:image/png;base64,123");
    });

    it("sanitizes cloud image URL correctly", () => {
      expect(sanitizeCloudImageUrl("data:image/png;base64,123")).toBeUndefined();
      expect(sanitizeCloudImageUrl("data:image/png;base64,123", "https://old")).toBe("https://old");
      expect(sanitizeCloudImageUrl("https://new", "https://old")).toBe("https://new");
    });
  });

  describe("Sync Planning", () => {
    it("cloud only legacy generates local and cloud writes", () => {
      const cloud = [{ id: "1", summary: "a" } as any];
      const plan = createVisualDnaSyncPlan([], cloud);
      
      expect(plan.localWrites.length).toBe(1);
      expect(plan.cloudWrites.length).toBe(1); // Since it migrated metadata
    });
    
    it("local only legacy generates local and cloud writes", () => {
      const local = [{ id: "1", summary: "a" } as any];
      const plan = createVisualDnaSyncPlan(local, []);
      
      expect(plan.localWrites.length).toBe(1);
      expect(plan.cloudWrites.length).toBe(1);
    });

    it("equivalent records consolidate and write", () => {
      const local = [{ id: "1", revision: 1, createdAt: 10, updatedAt: 10, summary: "a" } as any];
      const cloud = [{ id: "1", revision: 5, createdAt: 5, updatedAt: 20, summary: "a" } as any];
      
      const plan = createVisualDnaSyncPlan(local, cloud);
      expect(plan.localWrites.length).toBe(1); // 1 to 5
      expect(plan.cloudWrites.length).toBe(0); // cloud is already up to date
    });

    it("real conflict creates exactly one new revision", () => {
      const local = [{ id: "1", revision: 1, createdAt: 10, updatedAt: 10, summary: "a" } as any];
      const cloud = [{ id: "1", revision: 1, createdAt: 10, updatedAt: 10, summary: "b" } as any];
      
      const plan = createVisualDnaSyncPlan(local, cloud, { now: () => 50 });
      expect(plan.localWrites[0].revision).toBe(2);
      expect(plan.cloudWrites[0].revision).toBe(2);
      expect(plan.localWrites[0].updatedAt).toBe(50);
      expect(plan.conflictsResolved).toEqual(["1"]);
    });

    it("idempotency: second sync generates empty plan", () => {
      const local = [{ id: "1", revision: 1, createdAt: 10, updatedAt: 10, summary: "a" } as any];
      const cloud = [{ id: "1", revision: 2, createdAt: 10, updatedAt: 20, summary: "b" } as any];
      
      const firstPlan = createVisualDnaSyncPlan(local, cloud);
      // local receives cloud's revision 2 because cloud_wins
      
      const updatedLocal = firstPlan.localWrites.length > 0 ? firstPlan.localWrites : local;
      const updatedCloud = firstPlan.cloudWrites.length > 0 ? firstPlan.cloudWrites : cloud;
      
      const secondPlan = createVisualDnaSyncPlan(updatedLocal, updatedCloud);
      expect(secondPlan.localWrites.length).toBe(0);
      expect(secondPlan.cloudWrites.length).toBe(0);
      expect(secondPlan.conflictsResolved.length).toBe(0);
    });
    
    it("idempotency: base64 difference does not trigger upload", () => {
      const local = [{ id: "1", revision: 1, createdAt: 10, updatedAt: 10, summary: "a", imageUrl: "data:image/123" } as any];
      const cloud = [{ id: "1", revision: 1, createdAt: 10, updatedAt: 10, summary: "a", imageUrl: "https://123" } as any];
      
      const plan = createVisualDnaSyncPlan(local, cloud);
      expect(plan.cloudWrites.length).toBe(0);
      expect(plan.localWrites.length).toBe(0);
    });
  });
});
