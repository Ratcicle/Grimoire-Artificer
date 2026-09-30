import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisualDNA } from "../types";
import {
  analyzeReferenceImage,
  GeminiOperationError
} from "./geminiService";
import {
  createVisualDNAPatch,
  mergeVisualDNASafe,
  hasPersistentChanges
} from "./visualDnaMerge";
import {
  isCalibratedRecord,
  normalizeVisualDNAAnalysis
} from "./visualTags";

const { generateContentMock } = vi.hoisted(() => {
  return {
    generateContentMock: vi.fn()
  };
});

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: generateContentMock
    };
  }
  return {
    Type: {
      OBJECT: "OBJECT",
      STRING: "STRING",
      ARRAY: "ARRAY",
      NUMBER: "NUMBER",
      BOOLEAN: "BOOLEAN"
    },
    GoogleGenAI: MockGoogleGenAI
  };
});

describe("GRIMOIRE ARTIFICER — RODADA 3B: Merge Seguro de Reanálises Parciais", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createFullBaseRef = (id = "ref-dragoon-1"): VisualDNA => ({
    id,
    name: "Red-Eyes Dark Dragoon",
    imageUrl: "data:image/png;base64,dragonArtBase64",
    summary: "A colossal dark dragon fusion monster with obsidian dragon scales and gold trim.",
    linework: "Heavy black variable contour lines with tapered flourishes.",
    rendering: "Multi-layered anime shading with high-contrast specular reflections.",
    palette: "Dominant black and crimson with gold metallic accents and magenta glow.",
    silhouette: "Towering draconic knight silhouette with segmented wings and sweeping tail.",
    pose: "Frontal dynamic stance with dragon lance poised.",
    framing: "Three-quarter close-up view with dramatic low angle.",
    composition: "Centrally anchored vertical composition with radiating magical particles.",
    lighting: "Strong rim lighting from crimson magical vortex in background.",
    effects: "Magenta energy wisps and golden particle sparks.",
    materials: "Obsidian dragon scales, polished gold armor, leather wings.",
    details: "Filigree on armor plates and glowing magenta gems on breastplate.",
    background: "Magical explosion vortex in deep magenta and void black.",
    hierarchy: "Primary focal point is the helmet visor, secondary is the spearhead.",
    positivePrompt: "Dark dragon warrior standing ready, explosive aura.",
    negativePrompt: "low resolution, muddy colors, flat lighting",
    visualMotifs: "Spiked dragon pauldrons, filigree armor, leathery draconic wings.",
    shapeLanguage: "Aggressive triangles, sharp thorns, sweeping sickle curves.",
    focalAnchors: "Visor slit, chest core gem, lance tip.",
    detailPlacement: "Dense filigree concentrated on chest and lance.",
    compositionRecipe: "Vertical power pose centered against circular backdrop aura.",
    paletteLogic: "80% shadow tones, 15% gold filigree, 5% high-energy magenta highlights.",
    materialBehavior: "Reflective gold trims contrast with matte dark scales.",
    energyDesign: "Sparks crackle outwards in chaotic spiral arcs.",
    styleAnchors: "variable-weight linework with finer contours in illuminated areas",
    avoidRules: "avoid airbrushed soft shadows; preserve crisp cel separation",
    stylePromptFragments: [
      "variable-weight contour lines with dark ink borders",
      "hard-edged metallic highlights with internal shadow gradients"
    ],
    contentMotifs: [
      "winged humanoid",
      "dragon lance",
      "segmented dragon tail"
    ],
    identitySpecificDetails: [
      "crested dragon helm with single red visor slit",
      "chest core with four-pronged gold filigree clasp"
    ],
    universalQualityAvoids: [
      "muddled colors",
      "blurry outlines",
      "anatomical distortion"
    ],
    styleSpecificAvoids: [
      "muddy airbrush shading",
      "watercolor bleeds"
    ],
    contentSpecificAvoids: [
      "do not transfer dragon lance to non-weapon characters"
    ],
    subjectProfile: {
      primarySubject: "Armored Dragon Knight",
      subjectCategory: "humanoid creature",
      visualRole: "primary"
    },
    scaleProfile: {
      physicalScale: "giant",
      perceivedPresence: "dominant presence",
      scaleForms: ["draconic wings", "towering armor"],
      scaleCues: ["lance comparison", "massive silhouette"],
      evidence: "Towering over background aura",
      confidence: 0.95
    },
    substanceProfile: {
      materials: ["metal", "leather"],
      surfaces: ["polished", "engraved"],
      elements: ["fire", "lightning"],
      elementApplications: ["weapon infusion", "aura"],
      evidence: "Crimson fiery aura and crackling electrical arcs",
      confidence: 0.9
    },
    subjects: [
      {
        id: "subject-dragoon",
        description: "Dark dragon knight",
        category: "humanoid creature",
        visualRole: "primary",
        physicalScale: "giant",
        perceivedPresence: "dominant presence",
        materials: ["metal", "leather"],
        surfaces: ["polished"],
        elements: ["fire"]
      }
    ],
    scaleRelationships: [
      {
        subjectA: "subject-dragoon",
        subjectB: "subject-dragoon",
        relationship: "self scale anchor",
        evidence: "Focal character"
      }
    ],
    tags: [
      "digital illustration",
      "high contrast",
      "metal",
      "leather",
      "polished",
      "fire",
      "lightning",
      "giant",
      "dominant presence",
      "custom-legacy-tag"
    ],
    scores: {
      rendering: 1.0,
      composition: 1.0,
      palette: 1.0,
      lighting: 1.0
    },
    scoreJustifications: {
      rendering: "Old legacy rating",
      composition: "Old legacy composition rating",
      palette: "Old legacy palette rating",
      lighting: "Old legacy lighting rating"
    },
    isCalibrated: false,
    analysisVersion: 3,
    createdAt: 1000000,
    updatedAt: 1000000,
    revision: 1
  });

  // ==================================================
  // TEST A: REANÁLISE PARCIAL PELO SERVIÇO REAL
  // ==================================================
  it("A. Real partial reanalysis: updates only evaluated fields and preserves omitted data through real service flow", async () => {
    const base = createFullBaseRef();

    // Partial response: re-evaluates summary, rendering, and scores.rendering
    const partialRawResponse = {
      summary: "Refined dark dragoon boss illustration with high fidelity.",
      rendering: "Crisp cel-shading with micro-reflections and precise ambient occlusion.",
      scores: {
        rendering: 0.88
      },
      scoreJustifications: {
        rendering: "High quality sharp cel-shading with specular highlights."
      }
    };

    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(partialRawResponse),
      usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 220, totalTokenCount: 370 }
    });

    const serviceResult = await analyzeReferenceImage(base.imageUrl, base.name, "gemini-3.5-flash");
    expect(serviceResult.data).toBeDefined();
    expect(serviceResult.patch).toBeDefined();

    // Safe merge
    const mergeResult = mergeVisualDNASafe(base, serviceResult.patch);
    const updated = mergeResult.data;

    // Evaluated fields updated
    expect(updated.summary).toBe(partialRawResponse.summary);
    expect(updated.rendering).toBe(partialRawResponse.rendering);
    expect(updated.scores.rendering).toBe(0.88);
    expect(updated.scoreJustifications?.rendering).toBe(partialRawResponse.scoreJustifications.rendering);

    // Omitted fields preserved
    expect(updated.linework).toBe(base.linework);
    expect(updated.palette).toBe(base.palette);
    expect(updated.lighting).toBe(base.lighting);
    expect(updated.scores.composition).toBe(1.0);
    expect(updated.scores.palette).toBe(1.0);
    expect(updated.stylePromptFragments).toEqual(base.stylePromptFragments);
    expect(updated.subjectProfile).toEqual(base.subjectProfile);
    expect(updated.scaleProfile).toEqual(base.scaleProfile);
    expect(updated.substanceProfile).toEqual(base.substanceProfile);

    // Diagnostic reflects partial update
    expect(mergeResult.updatedFields).toContain("summary");
    expect(mergeResult.updatedFields).toContain("rendering");
    expect(mergeResult.updatedFields).toContain("scores.rendering");
    expect(mergeResult.preservedFields).toContain("linework");
    expect(mergeResult.preservedFields).toContain("palette");
    expect(mergeResult.preservedFields).toContain("scores.composition");
  });

  // ==================================================
  // TEST B: OMISSÃO VERSUS DEFAULT
  // ==================================================
  it("B. Omission vs Default: an omitted field in raw JSON is NOT erased even when normalizer produces empty string or array", () => {
    const base = createFullBaseRef();

    // Raw JSON omits linework, stylePromptFragments, and visualMotifs
    const rawPartial = {
      summary: "Updated summary text",
      rendering: "New rendering description",
      scores: { rendering: 0.9 }
    };

    // Notice normalizeVisualDNAAnalysis produces linework: "", stylePromptFragments: []
    const normalized = normalizeVisualDNAAnalysis(rawPartial);
    expect(normalized.linework).toBe("");
    expect(normalized.stylePromptFragments).toEqual([]);

    // Patch must preserve raw presence so safe merge does not erase base data with defaults
    const patch = createVisualDNAPatch(rawPartial, normalized);
    expect(patch.presentFields).toContain("rendering");
    expect(patch.presentFields).not.toContain("linework");
    expect(patch.presentFields).not.toContain("stylePromptFragments");

    const mergeResult = mergeVisualDNASafe(base, patch);
    expect(mergeResult.data.linework).toBe(base.linework);
    expect(mergeResult.data.stylePromptFragments).toEqual(base.stylePromptFragments);
    expect(mergeResult.preservedFields).toContain("linework");
    expect(mergeResult.preservedFields).toContain("stylePromptFragments");
  });

  // ==================================================
  // TEST C: REMOÇÕES EXPLÍCITAS E REGRAS DE LIMPEZA
  // ==================================================
  it("C. Removals Contract: explicit [] clears, invalid items do not clear, empty strings preserve, clearFields works, protected fields rejected", () => {
    const base = createFullBaseRef();

    // 1. Omitted list preserves
    const patch1 = createVisualDNAPatch({
      summary: "Test 1",
      rendering: "Test 1",
      scores: { rendering: 0.8 }
    });
    const res1 = mergeVisualDNASafe(base, patch1);
    expect(res1.data.contentMotifs).toEqual(base.contentMotifs);

    // 2. Explicit [] in raw JSON clears allowed list
    const patch2 = createVisualDNAPatch({
      summary: "Test 2",
      rendering: "Test 2",
      contentMotifs: [], // explicit empty
      scores: { rendering: 0.8 }
    });
    const res2 = mergeVisualDNASafe(base, patch2);
    expect(res2.data.contentMotifs).toEqual([]);
    expect(res2.clearedFields).toContain("contentMotifs");

    // 3. Invalid items like ["", "   "] do NOT clear list (preserves base)
    const patch3 = createVisualDNAPatch({
      summary: "Test 3",
      rendering: "Test 3",
      contentMotifs: ["", "   "],
      scores: { rendering: 0.8 }
    });
    const res3 = mergeVisualDNASafe(base, patch3);
    expect(res3.data.contentMotifs).toEqual(base.contentMotifs);
    expect(res3.preservedFields).toContain("contentMotifs");

    // 4. Empty string in raw JSON preserves previous description
    const patch4 = createVisualDNAPatch({
      summary: "Test 4",
      rendering: "   ", // whitespace only
      scores: { rendering: 0.8 }
    });
    const res4 = mergeVisualDNASafe(base, patch4);
    expect(res4.data.rendering).toBe(base.rendering);
    expect(res4.preservedFields).toContain("rendering");

    // 5. Explicit clearFields mechanism cleans optional description
    const patch5 = createVisualDNAPatch({
      summary: "Test 5",
      rendering: "Valid rendering",
      scores: { rendering: 0.8 },
      clearFields: ["energyDesign", "avoidRules"]
    });
    const res5 = mergeVisualDNASafe(base, patch5);
    expect(res5.data.energyDesign).toBe("");
    expect(res5.data.avoidRules).toBe("");
    expect(res5.clearedFields).toContain("energyDesign");
    expect(res5.clearedFields).toContain("avoidRules");

    // 6. Protected field in clearFields must be rejected
    expect(() => {
      mergeVisualDNASafe(base, createVisualDNAPatch({
        summary: "Test 6",
        rendering: "Valid",
        scores: { rendering: 0.8 },
        clearFields: ["id"] // protected!
      }));
    }).toThrow(/Campo protegido/);

    expect(() => {
      mergeVisualDNASafe(base, createVisualDNAPatch({
        summary: "Test 6b",
        rendering: "Valid",
        scores: { rendering: 0.8 },
        clearFields: ["summary"] // protected required field!
      }));
    }).toThrow(/Campo protegido/);

    // 7. Unknown field in clearFields must be rejected
    expect(() => {
      mergeVisualDNASafe(base, createVisualDNAPatch({
        summary: "Test 7",
        rendering: "Valid",
        scores: { rendering: 0.8 },
        clearFields: ["nonExistentField123"]
      }));
    }).toThrow(/Campo desconhecido/);

    // 8. Contradictory operation: providing value AND listing in clearFields must be rejected
    expect(() => {
      mergeVisualDNASafe(base, createVisualDNAPatch({
        summary: "Test 8",
        rendering: "Valid",
        energyDesign: "Spiraling electrical waves",
        scores: { rendering: 0.8 },
        clearFields: ["energyDesign"]
      }));
    }).toThrow(/Operação conflitante/);
  });

  // ==================================================
  // TEST D: PERFIS E INTEGRIDADE RELACIONAL
  // ==================================================
  it("D. Profiles: incomplete profile proposal preserves previous profile, complete profile updates, scale relationships remain valid", () => {
    const base = createFullBaseRef();

    // Incomplete subjectProfile (missing primarySubject or category)
    const patchIncompleteSP = createVisualDNAPatch({
      summary: "Partial update",
      rendering: "Valid rendering",
      scores: { rendering: 0.8 },
      subjectProfile: {
        visualRole: "supporting" // missing primarySubject and subjectCategory
      }
    });

    const resIncomplete = mergeVisualDNASafe(base, patchIncompleteSP);
    expect(resIncomplete.data.subjectProfile).toEqual(base.subjectProfile);
    expect(resIncomplete.unappliedPartialBlocks.length).toBeGreaterThan(0);
    expect(resIncomplete.unappliedPartialBlocks[0]).toContain("subjectProfile");

    // Complete subjectProfile updates
    const patchCompleteSP = createVisualDNAPatch({
      summary: "Updated subject",
      rendering: "Valid rendering",
      scores: { rendering: 0.8 },
      subjectProfile: {
        primarySubject: "Ancient Celestial Dragon",
        subjectCategory: "mythical dragon",
        visualRole: "primary"
      }
    });

    const resComplete = mergeVisualDNASafe(base, patchCompleteSP);
    expect(resComplete.data.subjectProfile?.primarySubject).toBe("Ancient Celestial Dragon");
    expect(resComplete.data.subjectProfile?.subjectCategory).toBe("mythical dragon");

    // Subjects and scale relationships integrity: prune dangling relationships
    const patchSubjects = createVisualDNAPatch({
      summary: "Subject list update",
      rendering: "Valid rendering",
      scores: { rendering: 0.8 },
      subjects: [
        {
          id: "new-subject-1",
          description: "Celestial Core",
          category: "magical artifact",
          visualRole: "primary",
          physicalScale: "small creature"
        }
      ],
      // old scaleRelationships pointed to "subject-dragoon", which was replaced!
    });

    const resSubjects = mergeVisualDNASafe(base, patchSubjects);
    expect(resSubjects.data.subjects?.length).toBe(1);
    expect(resSubjects.data.subjects?.[0].id).toBe("new-subject-1");
    // Dangling scaleRelationships referencing subject-dragoon must be pruned
    expect(resSubjects.data.scaleRelationships).toBeUndefined();
  });

  // ==================================================
  // TEST E: SCORES, JUSTIFICATIVAS E CALIBRAÇÃO
  // ==================================================
  it("E. Scores and Calibration: zero updates, omitted remain, updated score drops old justification, uncalibrated base remains uncalibrated, integral replacement calibrates", () => {
    const base = createFullBaseRef(); // uncalibrated legacy record

    // 1. Score zero is valid and updates properly
    const patchZero = createVisualDNAPatch({
      summary: "Zero score test",
      rendering: "Minimal shading",
      scores: {
        rendering: 0
      },
      scoreJustifications: {
        rendering: "Flat art with zero shading volume."
      }
    });

    const resZero = mergeVisualDNASafe(base, patchZero);
    expect(resZero.data.scores.rendering).toBe(0);
    expect(resZero.data.scoreJustifications?.rendering).toBe("Flat art with zero shading volume.");
    // Omitted dimensions remain from base
    expect(resZero.data.scores.composition).toBe(1.0);
    expect(resZero.data.scores.palette).toBe(1.0);

    // 2. Updated score without new justification drops old justification
    const patchNoJust = createVisualDNAPatch({
      summary: "Updated score no justification",
      rendering: "New rendering",
      scores: {
        composition: 0.75
      }
      // scoreJustifications.composition omitted
    });

    const resNoJust = mergeVisualDNASafe(base, patchNoJust);
    expect(resNoJust.data.scores.composition).toBe(0.75);
    expect(resNoJust.data.scoreJustifications?.composition).toBeUndefined();
    // Omitted scores keep their justifications
    expect(resNoJust.data.scoreJustifications?.palette).toBe(base.scoreJustifications?.palette);

    // 3. Legacy base + partial new scores does NOT promote whole record to calibrated
    expect(resNoJust.data.isCalibrated).toBe(false);
    expect(Object.hasOwn(resNoJust.data, "calibrationVersion")).toBe(false);
    expect(resNoJust.inheritanceWarnings.some(w => w.includes("selo de calibração"))).toBe(true);

    // 4. Integral re-evaluation of ALL retained scores permits calibration
    const patchAll = createVisualDNAPatch({
      summary: "Comprehensive re-evaluation",
      rendering: "New rendering",
      scores: {
        rendering: 0.85,
        composition: 0.8,
        palette: 0.9,
        lighting: 0.75
      },
      scoreJustifications: {
        rendering: "High quality cel shading",
        composition: "Diagonal composition",
        palette: "Harmonious dark palette",
        lighting: "Strong backlight"
      }
    });

    const resAll = mergeVisualDNASafe(base, patchAll);
    expect(resAll.data.isCalibrated).toBe(true);
    expect(resAll.data.calibrationVersion).toBe(3);
    expect(isCalibratedRecord(resAll.data)).toBe(true);

    // 5. If base was ALREADY calibrated V3, partial update of scores retains calibration
    const calibratedBase: VisualDNA = {
      ...base,
      scores: { rendering: 0.85, composition: 0.8 },
      isCalibrated: true,
      calibrationVersion: 3
    };

    const patchCalibratedPartial = createVisualDNAPatch({
      summary: "Partial update to calibrated base",
      rendering: "Updated rendering",
      scores: { rendering: 0.9 }
    });

    const resCalibrated = mergeVisualDNASafe(calibratedBase, patchCalibratedPartial);
    expect(resCalibrated.data.isCalibrated).toBe(true);
    expect(resCalibrated.data.calibrationVersion).toBe(3);
    expect(resCalibrated.data.scores.rendering).toBe(0.9);
    expect(resCalibrated.data.scores.composition).toBe(0.8);
  });

  // ==================================================
  // TEST F: RECONCILIAÇÃO DE TAGS
  // ==================================================
  it("F. Tags Reconciliation: removed profile element does not resurrect its derived tag; custom tags are preserved", () => {
    const base = createFullBaseRef();
    expect(base.tags).toContain("custom-legacy-tag");
    expect(base.tags).toContain("fire");

    // Reanalysis changes substanceProfile elements from ["fire", "lightning"] to ["ice"]
    const patch = createVisualDNAPatch({
      summary: "Substance update to ice",
      rendering: "Glacial crystal rendering",
      substanceProfile: {
        materials: ["crystal"],
        surfaces: ["polished"],
        elements: ["ice"],
        elementApplications: ["aura"],
        confidence: 0.9
      },
      scores: { rendering: 0.85 }
    });

    const res = mergeVisualDNASafe(base, patch);
    // Custom tag is preserved
    expect(res.data.tags).toContain("custom-legacy-tag");
    // New derived tag is added
    expect(res.data.tags).toContain("ice");
    // Old derived tag "fire" was from previous substanceProfile and is no longer present
    expect(res.data.tags).not.toContain("fire");
  });

  // ==================================================
  // TEST G: METADADOS E NÃO MUTAÇÃO
  // ==================================================
  it("G. Metadata Protection & Immutability: identity metadata is protected, inputs are never mutated, and no undefined properties are introduced", () => {
    const base = createFullBaseRef();

    const snapshotBaseBefore = JSON.stringify(base);

    const rawUpdate = {
      id: "malicious-hacker-id",
      name: "Overwritten Name",
      imageUrl: "data:image/png;base64,newImage",
      createdAt: 99999999,
      revision: 999,
      summary: "New legitimate summary",
      rendering: "New legitimate rendering",
      scores: { rendering: 0.85 }
    };

    const snapshotRawBefore = JSON.stringify(rawUpdate);

    const patch = createVisualDNAPatch(rawUpdate);
    const res = mergeVisualDNASafe(base, patch);

    // Protected fields are strictly preserved from base
    expect(res.data.id).toBe(base.id);
    expect(res.data.name).toBe(base.name);
    expect(res.data.imageUrl).toBe(base.imageUrl);
    expect(res.data.createdAt).toBe(base.createdAt);
    expect(res.data.updatedAt).toBe(base.updatedAt);
    expect(res.data.revision).toBe(base.revision);

    // Inputs are never mutated
    expect(JSON.stringify(base)).toBe(snapshotBaseBefore);
    expect(JSON.stringify(rawUpdate)).toBe(snapshotRawBefore);

    // No undefined properties in the resulting object
    for (const key of Object.keys(res.data)) {
      expect((res.data as any)[key]).not.toBeUndefined();
    }
  });

  // ==================================================
  // TEST H: IDEMPOTÊNCIA DO MERGE
  // ==================================================
  it("H. Idempotence: reapplying the same update to the merged result produces identical content without duplicating arrays or warnings", () => {
    const base = createFullBaseRef();

    const patch = createVisualDNAPatch({
      summary: "Idempotent update test",
      rendering: "New crisp lines",
      stylePromptFragments: ["new reusable style fragment"],
      scores: { rendering: 0.88 }
    });

    const firstMerge = mergeVisualDNASafe(base, patch);
    const secondMerge = mergeVisualDNASafe(firstMerge.data, patch);

    expect(secondMerge.data.summary).toBe(firstMerge.data.summary);
    expect(secondMerge.data.rendering).toBe(firstMerge.data.rendering);
    expect(secondMerge.data.stylePromptFragments).toEqual(firstMerge.data.stylePromptFragments);
    expect(secondMerge.data.scores).toEqual(firstMerge.data.scores);

    // No persistent changes on second run
    expect(secondMerge.changed).toBe(false);
  });

  // ==================================================
  // TEST I & J: DETECÇÃO DE MUDANÇA E CONCORRÊNCIA
  // ==================================================
  it("I & J. Persistence & Concurrency: detects no-op updates, prevents redundant saves, and detects modifications", () => {
    const base = createFullBaseRef();

    // 1. Identical patch produces changed: false
    const identicalPatch = createVisualDNAPatch({
      summary: base.summary,
      rendering: base.rendering,
      scores: { rendering: base.scores.rendering },
      scoreJustifications: { rendering: base.scoreJustifications?.rendering }
    });
    const identicalRes = mergeVisualDNASafe(base, identicalPatch);
    expect(identicalRes.changed).toBe(false);

    // 2. hasPersistentChanges utility
    expect(hasPersistentChanges(base, base)).toBe(false);
    expect(hasPersistentChanges(base, { ...base, summary: "Changed summary" })).toBe(true);
    // Ignore volatile timestamps and revision
    expect(hasPersistentChanges(base, { ...base, updatedAt: base.updatedAt! + 1000, revision: (base.revision || 1) + 1 })).toBe(false);
  });
});
