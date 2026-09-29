import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  CardType,
  Complexity,
  Context,
  Archetype,
  ImageModel,
  CardGenerationRequest,
  VisualDNA
} from "../types";
import {
  analyzeReferenceImage,
  generateCardArt,
  buildCardPrompt,
  GeminiOperationError
} from "./geminiService";
import {
  validateVisualDNAScores,
  normalizeVisualDNAAnalysis,
  ALLOWED_VISUAL_TAGS,
  VISUAL_TAG_CATEGORIES
} from "./visualTags";
import {
  synthesizeVisualDNA,
  getAutomaticReferences,
  getEffectiveUtilityScore
} from "./visualDnaEngine";

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

describe("GRIMOIRE ARTIFICER — RODADA 3A: Contrato e Calibração da Utility Matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createBaseRef = (id: string, name: string, overrides: Partial<VisualDNA> = {}): VisualDNA => ({
    id,
    name,
    imageUrl: "data:image/png;base64,sampleBase64",
    summary: "A high-tier anime illustration",
    linework: "clean crisp contours",
    rendering: "cel-shading with soft gradients",
    palette: "metallic gold and cyan",
    silhouette: "dynamic mechanical silhouette",
    pose: "grounded action stance",
    framing: "mid-shot framing",
    composition: "rule of thirds focal weighting",
    lighting: "overhead key light with cyan rim",
    effects: "cyan electric sparks",
    materials: "brushed steel and cloth",
    details: "dense focal point on torso",
    background: "abstract energy haze",
    hierarchy: "weapon and chest primary focal points",
    positivePrompt: "digital anime illustration of mechanical warrior",
    negativePrompt: "low quality, blurry, distorted anatomy",
    tags: ["humanoid", "armor", "metal"],
    scores: {
      style: 0.75,
      palette: 0.80,
      pose: 0.70,
      composition: 0.75,
      lighting: 0.80,
      effects: 0.65,
      materials: 0.85,
      background: 0.50,
      details: 0.80,
      silhouette: 0.75,
      rendering: 0.85,
      detailDensity: 0.80
    },
    isCalibrated: true,
    calibrationVersion: 3,
    ...overrides
  });

  // TEST 1: Scores fracionários diferentes sobrevivem ao fluxo sem virar 1.
  it("1. Fractional distinct scores survive validation and normalization without turning into 1.0", () => {
    const rawScores = {
      rendering: 0.85,
      composition: 0.75,
      background: 0.60,
      lighting: 0.40,
      detailDensity: 0.90
    };

    const valResult = validateVisualDNAScores(rawScores);
    expect(valResult.isValid).toBe(true);
    expect(valResult.validatedScores.rendering).toBe(0.85);
    expect(valResult.validatedScores.composition).toBe(0.75);
    expect(valResult.validatedScores.background).toBe(0.60);
    expect(valResult.validatedScores.lighting).toBe(0.40);
    expect(valResult.validatedScores.detailDensity).toBe(0.90);

    const normalized = normalizeVisualDNAAnalysis({
      summary: "Test art",
      scores: rawScores
    });

    expect(normalized.scores?.rendering).toBe(0.85);
    expect(normalized.scores?.composition).toBe(0.75);
    expect(normalized.scores?.background).toBe(0.60);
    expect(normalized.scores?.lighting).toBe(0.40);
    expect(normalized.scores?.detailDensity).toBe(0.90);
    // None should be clamped to 1.0
    expect(normalized.scores?.rendering).not.toBe(1.0);
    expect(normalized.scores?.composition).not.toBe(1.0);
  });

  // TEST 2: Valores como 85 e 8.5 não viram 100% silenciosamente.
  it("2. Values like 85 and 8.5 do NOT turn into 100% silently; they fail validation", () => {
    const invalidScoresA = { rendering: 85, composition: 0.8 };
    const valA = validateVisualDNAScores(invalidScoresA);
    expect(valA.isValid).toBe(false);
    expect(valA.errors.some(e => e.includes("rendering") && e.includes("85"))).toBe(true);
    // Must NOT clamp 85 to 1.0
    expect(valA.validatedScores.rendering).toBeUndefined();

    const invalidScoresB = { rendering: 8.5, composition: 0.75 };
    const valB = validateVisualDNAScores(invalidScoresB);
    expect(valB.isValid).toBe(false);
    expect(valB.errors.some(e => e.includes("rendering") && e.includes("8.5"))).toBe(true);
    expect(valB.validatedScores.rendering).toBeUndefined();

    // In normalization, invalid values are rejected, not converted to 1.0
    const normalized = normalizeVisualDNAAnalysis({
      summary: "Test",
      scores: invalidScoresA
    });
    expect(normalized.scores?.rendering).toBeUndefined();
    expect(normalized.scores?.rendering).not.toBe(1.0);
    expect(normalized.isCalibrated).toBe(false);
  });

  // TEST 3: Zero válido permanece zero; campos ausentes e tipos inválidos recebem tratamento distinto, sem sucesso fictício.
  it("3. Valid zero stays zero; unassessed fields stay undefined; invalid types fail validation without fake success", () => {
    const rawScores = {
      rendering: 0.0,
      composition: 0,
      lighting: "0.85", // invalid string
      effects: true,    // invalid boolean
      palette: NaN,     // invalid NaN
      materials: Infinity, // invalid Infinity
      // background is omitted / unassessed
    };

    const valResult = validateVisualDNAScores(rawScores);
    expect(valResult.isValid).toBe(false);
    // Valid zero is preserved as 0
    expect(valResult.validatedScores.rendering).toBe(0.0);
    expect(valResult.validatedScores.composition).toBe(0.0);
    // Missing is undefined
    expect(valResult.validatedScores.background).toBeUndefined();
    // Invalid types are rejected with explicit errors
    expect(valResult.errors.some(e => e.includes("lighting") && e.includes("string"))).toBe(true);
    expect(valResult.errors.some(e => e.includes("effects") && e.includes("boolean"))).toBe(true);
    expect(valResult.errors.some(e => e.includes("palette") && e.includes("finite number"))).toBe(true);
    expect(valResult.errors.some(e => e.includes("materials") && e.includes("finite number"))).toBe(true);

    // Normalizing a record with a valid zero preserves the zero distinctly from undefined
    const norm = normalizeVisualDNAAnalysis({
      summary: "Test",
      scores: { rendering: 0, composition: 0.8 }
    });
    expect(norm.scores?.rendering).toBe(0);
    expect(norm.scores?.background).toBeUndefined();
  });

  // TEST 4: Uma resposta com todos os valores 1 não é artificialmente redistribuída.
  it("4. A response where all values are genuinely 1.0 is not artificially randomized or redistributed", () => {
    const allOnes = {
      style: 1.0,
      palette: 1.0,
      pose: 1.0,
      composition: 1.0,
      lighting: 1.0,
      effects: 1.0,
      materials: 1.0,
      background: 1.0,
      details: 1.0,
      silhouette: 1.0,
      rendering: 1.0
    };

    const valResult = validateVisualDNAScores(allOnes);
    expect(valResult.isValid).toBe(true);
    // Numerical validation accepts valid 1.0 without forcing artificial lower values
    Object.values(valResult.validatedScores).forEach(val => {
      expect(val).toBe(1.0);
    });

    const norm = normalizeVisualDNAAnalysis({
      summary: "Masterpiece",
      scores: allOnes
    });
    expect(norm.scores?.rendering).toBe(1.0);
    expect(norm.scores?.composition).toBe(1.0);
    expect(norm.scores?.background).toBe(1.0);
  });

  // TEST 5: Confianças dos perfis e utilidades não são trocadas nem misturadas.
  it("5. ScaleProfile and substanceProfile confidences and utility matrix scores are never swapped or mixed", () => {
    const parsed = {
      summary: "Giant metal titan",
      scaleProfile: {
        physicalScale: "giant",
        perceivedPresence: "dominant presence",
        evidence: "Towering above mountains",
        confidence: 0.95
      },
      substanceProfile: {
        materials: ["metal", "gold"],
        surfaces: ["polished"],
        elements: ["lightning"],
        elementApplications: ["armor infusion"],
        evidence: "Gleaming golden armor plates",
        confidence: 0.40
      },
      scores: {
        materials: 0.85,
        rendering: 0.90,
        composition: 0.70
      }
    };

    const normalized = normalizeVisualDNAAnalysis(parsed);
    // Profile confidences must stay in their profiles
    expect(normalized.scaleProfile?.confidence).toBe(0.95);
    expect(normalized.substanceProfile?.confidence).toBe(0.40);

    // Utility matrix scores must stay in scores
    expect(normalized.scores?.materials).toBe(0.85);
    expect(normalized.scores?.rendering).toBe(0.90);
    expect(normalized.scores?.composition).toBe(0.70);

    // Confidences are NOT injected into utility scores
    expect((normalized.scores as any).confidence).toBeUndefined();
  });

  // TEST 6: Novos campos/justificativas sobrevivem à normalização. Registros legados continuam legíveis sem serem regravados.
  it("6. Score justifications survive normalization; legacy records remain legible without being rewritten as calibrated", () => {
    const calibratedAnalysis = {
      summary: "Calibrated art",
      scores: {
        rendering: 0.88,
        composition: 0.72
      },
      scoreJustifications: {
        rendering: "Crisp cel lines with smooth ambient occlusion on cloth",
        composition: "Diagonal visual flow balanced by heavy weapon on right"
      },
      isCalibrated: true,
      calibrationVersion: 3
    };

    const normCalibrated = normalizeVisualDNAAnalysis(calibratedAnalysis);
    expect(normCalibrated.isCalibrated).toBe(true);
    expect(normCalibrated.calibrationVersion).toBe(3);
    expect(normCalibrated.scoreJustifications?.rendering).toContain("Crisp cel lines");
    expect(normCalibrated.scoreJustifications?.composition).toContain("Diagonal visual flow");

    // Legacy record (without calibration contract)
    const legacyRecord = {
      summary: "Old legacy record",
      scores: {
        rendering: 1.0,
        composition: 1.0,
        style: 1.0
      },
      isCalibrated: false
    };

    const normLegacy = normalizeVisualDNAAnalysis(legacyRecord);
    expect(normLegacy.isCalibrated).toBe(false);
    expect(normLegacy.calibrationVersion).toBeUndefined();
    // Legacy scores remain readable as legacy
    expect(normLegacy.scores?.rendering).toBe(1.0);
  });

  // TEST 7: Fragmentos técnicos, motivos e detalhes específicos permanecem nos campos corretos numa resposta sintética.
  it("7. Technical fragments, motifs, and specific identity details remain in their respective distinct fields", () => {
    const rawAnalysis = {
      summary: "Armored avian commander",
      stylePromptFragments: [
        "variable-weight linework with finer contours in illuminated areas",
        "hard-edged metallic highlights with softer internal shadow gradients"
      ],
      contentMotifs: [
        "winged humanoid",
        "heavy rotary cannon",
        "cyan lightning arcs"
      ],
      identitySpecificDetails: [
        "specific bird crest contour on helm",
        "cluster of four cylindrical glowing vials on cannon receiver"
      ],
      universalQualityAvoids: ["blurry outlines", "muddled colors"],
      styleSpecificAvoids: ["muddy airbrush shading"],
      contentSpecificAvoids: ["specific avian crest symbol"]
    };

    const norm = normalizeVisualDNAAnalysis(rawAnalysis);
    expect(norm.stylePromptFragments).toEqual([
      "variable-weight linework with finer contours in illuminated areas",
      "hard-edged metallic highlights with softer internal shadow gradients"
    ]);
    expect(norm.contentMotifs).toEqual([
      "winged humanoid",
      "heavy rotary cannon",
      "cyan lightning arcs"
    ]);
    expect(norm.identitySpecificDetails).toEqual([
      "specific bird crest contour on helm",
      "cluster of four cylindrical glowing vials on cannon receiver"
    ]);
    expect(norm.universalQualityAvoids).toEqual(["blurry outlines", "muddled colors"]);
    expect(norm.styleSpecificAvoids).toEqual(["muddy airbrush shading"]);
    expect(norm.contentSpecificAvoids).toEqual(["specific avian crest symbol"]);
  });

  // TEST 8: Tags novas de tecido/acabamento sobrevivem à validação. Categorias ausentes podem continuar vazias.
  it("8. Newly added fabric/finishing tags survive normalization; absent categories remain empty without artificial padding", () => {
    expect(ALLOWED_VISUAL_TAGS).toContain("fabric");
    expect(ALLOWED_VISUAL_TAGS).toContain("silk");
    expect(ALLOWED_VISUAL_TAGS).toContain("satin");
    expect(ALLOWED_VISUAL_TAGS).toContain("velvet");
    expect(ALLOWED_VISUAL_TAGS).toContain("lace");
    expect(ALLOWED_VISUAL_TAGS).toContain("embroidered");

    const analysisWithFabrics = {
      summary: "Aristocrat in silk robes",
      tags: ["humanoid", "fabric", "silk", "velvet", "embroidered"],
      substanceProfile: {
        materials: ["silk", "velvet"],
        surfaces: ["embroidered", "smooth"],
        elements: [], // intentionally empty
        elementApplications: [], // intentionally empty
        evidence: "Intricate embroidered gold stitching on silk robe",
        confidence: 0.90
      }
    };

    const norm = normalizeVisualDNAAnalysis(analysisWithFabrics);
    expect(norm.tags).toContain("silk");
    expect(norm.tags).toContain("velvet");
    expect(norm.tags).toContain("embroidered");
    // Elements should remain empty without artificial tags
    expect(norm.substanceProfile?.elements).toEqual([]);
    expect(norm.substanceProfile?.elementApplications).toEqual([]);
  });

  // TEST 9: Entre referências sintéticas igualmente compatíveis, uma nota maior de rendering pode fornecer rendering, enquanto outra fornece composição.
  it("9. Between equally compatible references, the one with higher rendering utility provides rendering while the other provides composition", () => {
    const refA = createBaseRef("ref-a", "Ref A - Rendering Specialist", {
      rendering: "hard-edged metallic highlights with softer internal shadow gradients",
      compositionRecipe: "static symmetrical central framing",
      scores: {
        rendering: 0.95,
        composition: 0.50
      },
      isCalibrated: true
    });

    const refB = createBaseRef("ref-b", "Ref B - Composition Specialist", {
      rendering: "soft sketchy watercolor wash",
      compositionRecipe: "strong diagonal visual flow balanced by a secondary opposing mass",
      scores: {
        rendering: 0.50,
        composition: 0.95
      },
      isCalibrated: true
    });

    const synth = synthesizeVisualDNA({
      references: [refA, refB],
      intensity: "medium",
      subject: "A mech warrior",
      cardType: CardType.Monster,
      archetype: Archetype.TechZero,
      userPrompt: "A mech warrior"
    });

    // Rendering must come from Ref A (0.95 vs 0.50)
    expect(synth.promptBlock).toContain("hard-edged metallic highlights with softer internal shadow gradients");
    expect(synth.promptBlock).not.toContain("soft sketchy watercolor wash");

    // Composition must come from Ref B (0.95 vs 0.50)
    expect(synth.promptBlock).toContain("strong diagonal visual flow balanced by a secondary opposing mass");
    expect(synth.promptBlock).not.toContain("static symmetrical central framing");

    // Both references contributed
    expect(synth.contributingReferences?.some(r => r.id === "ref-a")).toBe(true);
    expect(synth.contributingReferences?.some(r => r.id === "ref-b")).toBe(true);
  });

  // TEST 9b: Convívio com registros legados: um score calibrado de 0.85 vence um legado não calibrado com valor 1.0
  it("9b. Deterministic legacy compatibility: calibrated score of 0.85 takes precedence over uncalibrated legacy score of 1.0", () => {
    const legacyRef = createBaseRef("legacy-ref", "Legacy High Uncalibrated", {
      rendering: "legacy generic render instruction",
      scores: { rendering: 1.0 },
      isCalibrated: false,
      calibrationVersion: undefined
    });

    const calibratedRef = createBaseRef("calibrated-ref", "Calibrated V3", {
      rendering: "precise multi-layered anisotropic metallic shading",
      scores: { rendering: 0.85 },
      isCalibrated: true,
      calibrationVersion: 3
    });

    // Effective utility check
    expect(getEffectiveUtilityScore(legacyRef, "rendering")).toBe(0.50);
    expect(getEffectiveUtilityScore(calibratedRef, "rendering")).toBe(0.85);

    const synth = synthesizeVisualDNA({
      references: [legacyRef, calibratedRef],
      intensity: "medium",
      subject: "A metallic knight",
      cardType: CardType.Monster,
      archetype: Archetype.TechZero,
      userPrompt: "A metallic knight"
    });

    // Calibrated 0.85 must win over legacy uncalibrated 1.0 (mapped to 0.50)
    expect(synth.promptBlock).toContain("precise multi-layered anisotropic metallic shading");
    expect(synth.promptBlock).not.toContain("legacy generic render instruction");
  });

  // TEST 10: Alterar apenas scores não deve transformar notas artísticas em relevância temática da seleção automática.
  it("10. Changing utility matrix scores does NOT alter thematic auto-selection relevance", () => {
    const dragonRefLowScores = createBaseRef("dragon-low", "Dragon Low Scores", {
      tags: ["dragon", "boss monster", "fire"],
      subjectProfile: {
        primarySubject: "fire dragon",
        subjectCategory: "dragon",
        visualRole: "primary"
      },
      scores: {
        rendering: 0.10,
        composition: 0.10,
        palette: 0.10,
        style: 0.10
      }
    });

    const humanoidRefHighScores = createBaseRef("humanoid-high", "Humanoid High Scores", {
      tags: ["humanoid", "armor", "western"],
      subjectProfile: {
        primarySubject: "sheriff gunslinger",
        subjectCategory: "humanoid",
        visualRole: "primary"
      },
      scores: {
        rendering: 1.0,
        composition: 1.0,
        palette: 1.0,
        style: 1.0
      }
    });

    const database = [dragonRefLowScores, humanoidRefHighScores];

    // Search query specifically matches Dragon
    const autoSelected = getAutomaticReferences("colossal fire dragon boss", "Monster", Archetype.ExtremeDragons, database, 1);
    
    // Dragon with low scores MUST be selected because of thematic relevance, NOT the high-score humanoid
    expect(autoSelected.length).toBe(1);
    expect(autoSelected[0].id).toBe("dragon-low");

    // Even if we invert the scores, thematic selection must remain identical
    const dragonRefHighScores = { ...dragonRefLowScores, scores: { ...humanoidRefHighScores.scores } };
    const humanoidRefLowScores = { ...humanoidRefHighScores, scores: { ...dragonRefLowScores.scores } };

    const autoSelectedInverted = getAutomaticReferences("colossal fire dragon boss", "Monster", Archetype.ExtremeDragons, [dragonRefHighScores, humanoidRefLowScores], 1);
    expect(autoSelectedInverted.length).toBe(1);
    expect(autoSelectedInverted[0].id).toBe("dragon-low");
  });

  // TEST 11: Resposta inválida ou sem análise utilizável não pode sobrescrever um registro válido nem ser marcada como concluída.
  it("11. Invalid API analysis response rejects before saving and throws GeminiOperationError without overwriting", async () => {
    // Mock API returning out-of-contract scores (e.g. 85 and 90)
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        summary: "Invalid response with 0-100 scores",
        scores: {
          rendering: 85, // invalid (> 1.0)
          composition: 90
        }
      }),
      usageMetadata: { promptTokenCount: 10, totalTokenCount: 20 }
    });

    await expect(analyzeReferenceImage("data:image/png;base64,sample", "test.png")).rejects.toThrow(GeminiOperationError);
    await expect(analyzeReferenceImage("data:image/png;base64,sample", "test.png")).rejects.toThrow(/score validation failed/i);
  });

  // TEST 12: Normalização não deve modificar o objeto bruto recebido.
  it("12. normalizeVisualDNAAnalysis does NOT mutate the raw input object", () => {
    const rawInput = {
      summary: "Untouched raw object",
      tags: ["humanoid", "armor", "invalid-tag-123"],
      scaleProfile: {
        physicalScale: "human scale",
        scaleForms: ["broad mass"],
        scaleCues: ["low-angle scale"],
        perceivedPresence: "dominant presence",
        evidence: "Clear view",
        confidence: 0.95
      },
      substanceProfile: {
        materials: ["metal"],
        surfaces: ["polished"],
        elements: ["lightning"],
        elementApplications: ["aura"],
        evidence: "Sparks",
        confidence: 0.8
      },
      scores: {
        rendering: 0.85,
        composition: 0.75
      }
    };

    const snapshotBefore = JSON.stringify(rawInput);
    const normalized = normalizeVisualDNAAnalysis(rawInput);

    const snapshotAfter = JSON.stringify(rawInput);
    // Raw input must be identical before and after
    expect(snapshotBefore).toBe(snapshotAfter);
    // Normalized object is different (e.g. invalid tag filtered, calibrated version added)
    expect(normalized.tags).not.toContain("invalid-tag-123");
    expect(rawInput.tags).toContain("invalid-tag-123");
  });

  // REFERENCE CASE: ANÁLISE DO SHURAIG (Tri-Brigade Shuraig the Ominous Omen synthetic reference)
  it("13. Reference Case (Shuraig): Separation of content vs technique, realistic non-100% scores, and absence of contradictory negative rules", () => {
    const shuraigSyntheticAnalysis = {
      summary: "A heavily armored winged humanoid wielding an enormous mechanical rotary cannon with glowing cyan energy conduits",
      subjectProfile: {
        primarySubject: "armored winged humanoid commander",
        subjectCategory: "humanoid",
        visualRole: "primary"
      },
      contentMotifs: [
        "winged humanoid",
        "massive rotary cannon",
        "mechanical wings",
        "cyan lightning arcs",
        "flying mechanical bird drones"
      ],
      identitySpecificDetails: [
        "stylized avian visor and helm contour",
        "four cylindrical luminous cartridges arranged in a radial arc on cannon breach",
        "segmented mechanical feather plates"
      ],
      stylePromptFragments: [
        "variable-weight linework with finer contours in illuminated areas",
        "hard-edged metallic highlights with softer internal shadow gradients",
        "dense focal detail concentrated on upper torso and weapon mechanism contrasted with quieter background shapes",
        "a strong diagonal visual flow balanced by a secondary opposing wing mass"
      ],
      universalQualityAvoids: [
        "blurry outlines",
        "muddled color transitions",
        "anatomical distortion"
      ],
      styleSpecificAvoids: [
        "muddy airbrush shading"
      ],
      contentSpecificAvoids: [
        "specific avian crest cresting",
        "exact radial vial cluster"
      ],
      scores: {
        rendering: 0.90,
        composition: 0.88,
        palette: 0.82,
        lighting: 0.85,
        materials: 0.88,
        background: 0.65,
        details: 0.92,
        pose: 0.80,
        silhouette: 0.85,
        style: 0.90,
        detailDensity: 0.88
      },
      scoreJustifications: {
        rendering: "Clear distinction between specular metallic surfaces and soft occlusion gradients on mechanical joints",
        composition: "Strong low-angle diagonal composition with excellent weight balance",
        background: "Subdued atmospheric battlefield smoke with subtle depth separation",
        materials: "Convincing differentiation between brushed dark iron, burnished steel, and luminous glass vials"
      },
      isCalibrated: true,
      calibrationVersion: 3
    };

    const norm = normalizeVisualDNAAnalysis(shuraigSyntheticAnalysis);

    // 1. Scores are not all 100%
    expect(norm.scores?.background).toBe(0.65);
    expect(norm.scores?.rendering).toBe(0.90);
    expect(norm.scores?.detailDensity).toBe(0.88);
    expect(norm.isCalibrated).toBe(true);

    // 2. Content motifs are separated from reusable style prompt fragments
    expect(norm.stylePromptFragments?.every(frag => 
      !frag.includes("rotary cannon") && !frag.includes("avian") && !frag.includes("bird drones")
    )).toBe(true);
    expect(norm.contentMotifs).toContain("massive rotary cannon");
    expect(norm.contentMotifs).toContain("flying mechanical bird drones");

    // 3. No negative rule prohibits soft gradients when the style specifically utilizes "softer internal shadow gradients"
    const avoids = [
      ...(norm.universalQualityAvoids || []),
      ...(norm.styleSpecificAvoids || []),
      ...(norm.contentSpecificAvoids || [])
    ];
    expect(avoids.some(a => /soft edges?|soft gradients?/i.test(a))).toBe(false);
  });
});
