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
import { generateCardArt } from "./geminiService";
import { synthesizeVisualDNA } from "./visualDnaEngine";
import { filterFragmentForIdentity } from "./visualDnaPolicy";
import * as localDbService from "./localDbService";

// Mock @google/genai with vi.hoisted
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
      NUMBER: "NUMBER"
    },
    GoogleGenAI: MockGoogleGenAI
  };
});

describe("GRIMOIRE ARTIFICER - COMPLEMENTO DA RODADA 2 TESTS", () => {
  const makeBaseDna = (id: string, name: string, overrides: Partial<VisualDNA> = {}): VisualDNA => ({
    id,
    name,
    imageUrl: "data:image/png;base64,sample",
    summary: "Base summary",
    linework: "",
    rendering: "",
    palette: "",
    silhouette: "",
    pose: "",
    framing: "",
    composition: "",
    lighting: "",
    effects: "",
    materials: "",
    details: "",
    background: "",
    hierarchy: "",
    positivePrompt: "noble illustration",
    negativePrompt: "",
    tags: ["noble"],
    scores: {
      style: 0.8,
      palette: 0.8,
      pose: 0.8,
      composition: 0.8,
      lighting: 0.8,
      effects: 0.8,
      materials: 0.8,
      background: 0.8,
      details: 0.8,
      silhouette: 0.8,
      rendering: 0.8
    },
    ...overrides
  });

  beforeEach(() => {
    vi.clearAllMocks();
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: "mockGeneratedArtBase64Data",
                  mimeType: "image/png"
                }
              }
            ]
          }
        }
      ],
      usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 90, totalTokenCount: 240 }
    });
  });

  // ==========================================
  // GRUPO 1: COMPATIBILIDADE NÃO É APENAS AUSÊNCIA DE PROIBIÇÃO
  // ==========================================
  describe("Grupo 1: Distinção efetiva entre técnica transferível e conteúdo condicional", () => {
    it("1A. Royal Carmine: Dominant violet and emerald green clothing must NOT enter DNA", () => {
      const ref = makeBaseDna("rc-palette-ref", "Ref with Clashing Palette", {
        paletteLogic: "Dominant violet and emerald green clothing"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("violet and emerald green");
      expect(res.promptBlock).not.toContain("violet");
      expect(res.promptBlock).not.toContain("emerald");
      const evalItem = res.debugInfo?.evaluations?.find(e => e.text.includes("violet and emerald green"));
      expect(evalItem?.decision).toBe("discarded");
    });

    it("1B. Royal Carmine: Low intensity - purple velvet robes discarded, clean tapered outlines kept", () => {
      const ref = makeBaseDna("rc-frag-ref", "Ref with Mixed Fragments", {
        stylePromptFragments: ["purple velvet robes", "clean tapered outlines"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "low",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("purple velvet robes");
      expect(res.promptBlock).not.toContain("purple");
      expect(res.promptBlock).not.toContain("velvet");
      expect(res.promptBlock).toContain("clean tapered outlines");
      
      const purpleEval = res.debugInfo?.evaluations?.find(e => e.text.includes("purple velvet robes"));
      expect(purpleEval?.decision).toBe("discarded");
      const outlineEval = res.debugInfo?.evaluations?.find(e => e.text.includes("clean tapered outlines"));
      expect(outlineEval?.decision).toBe("included");
    });

    it("1C. Context Focus: Scenario - Close-up warrior portrait must NOT enter DNA for a palace scenario", () => {
      const ref = makeBaseDna("scen-ref", "Ref with Warrior Composition", {
        compositionRecipe: "A warrior filling the frame in a close-up portrait"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A vast white marble palace and its gardens",
        cardType: CardType.Spell,
        context: Context.Scenario,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("A warrior filling the frame in a close-up portrait");
      expect(res.promptBlock).not.toContain("close-up portrait");
      const compEval = res.debugInfo?.evaluations?.find(e => e.text.includes("warrior filling the frame"));
      expect(compEval?.decision).toBe("discarded");
    });

    it("1. Contraprovas: Silk treatment, clean tapered outlines, Shadow-Heart dark traits, Generic black armor", () => {
      // 1. Silk treatment preserved
      const silkRef = makeBaseDna("silk-ref", "Silk Ref", {
        materials: "luxurious white silk drapery with almond luster"
      });
      const resSilk = synthesizeVisualDNA({
        references: [silkRef],
        intensity: "high",
        subject: "A noble in white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });
      expect(resSilk.promptBlock).toContain("white silk drapery");

      // 2. Shadow-Heart dark traits preserved
      const shadowRef = makeBaseDna("shadow-ref", "Shadow Ref", {
        stylePromptFragments: ["black organic armor", "pointed gothic arches"]
      });
      const resShadow = synthesizeVisualDNA({
        references: [shadowRef],
        intensity: "medium",
        subject: "A cursed demon knight in gothic armor",
        cardType: CardType.Monster,
        archetype: Archetype.ShadowHeart
      });
      expect(resShadow.promptBlock).toContain("black organic armor");
      expect(resShadow.promptBlock).toContain("pointed gothic arches");

      // 3. Generic black armor when requested
      const genRef = makeBaseDna("gen-ref", "Generic Black Armor Ref", {
        stylePromptFragments: ["black iron plate armor"]
      });
      const resGen = synthesizeVisualDNA({
        references: [genRef],
        intensity: "medium",
        subject: "A warrior wearing black armor",
        cardType: CardType.Monster,
        archetype: Archetype.Generic
      });
      expect(resGen.promptBlock).toContain("black iron plate armor");
    });
  });

  // ==========================================
  // GRUPO 2: AS REGRAS AUXILIARES DEVEM RESPEITAR OS PRESETS
  // ==========================================
  describe("Grupo 2: Regras auxiliares respeitam presets (sangue ritual e contornos pretos)", () => {
    it("2A. Royal Carmine: 'subtle blood pact seals in crimson' is ALLOWED as ceremonial ritual detail", () => {
      const ref = makeBaseDna("blood-pact-ref", "Blood Pact Reference", {
        stylePromptFragments: ["subtle blood pact seals in crimson"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "An aristocratic ceremony in a white palace",
        cardType: CardType.Spell,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("subtle blood pact seals in crimson");
      const pactEval = res.debugInfo?.evaluations?.find(e => e.text.includes("blood pact"));
      expect(pactEval?.decision).toBe("included");
    });

    it("2B. Royal Carmine: 'black linework on white ceremonial armor' is ALLOWED (black is contour, armor is white)", () => {
      const ref = makeBaseDna("linework-ref", "Linework Armor Ref", {
        stylePromptFragments: ["black linework on white ceremonial armor"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A knight in white ceremonial armor",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("black linework on white ceremonial armor");
      const lineEval = res.debugInfo?.evaluations?.find(e => e.text.includes("black linework"));
      expect(lineEval?.decision).toBe("included");
    });

    it("2. Contraprovas: Black dominant clothing remains rejected on white silk, excessive gore remains rejected", () => {
      const darkArmorRef = makeBaseDna("black-armor-ref", "Black Armor Ref", {
        stylePromptFragments: ["heavy black plate armor"]
      });
      const resDark = synthesizeVisualDNA({
        references: [darkArmorRef],
        intensity: "medium",
        subject: "A noble in white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });
      expect(resDark.promptBlock).not.toContain("heavy black plate armor");

      const goreRef = makeBaseDna("gore-ref", "Gore Ref", {
        stylePromptFragments: ["pools of blood and gore"]
      });
      const resGore = synthesizeVisualDNA({
        references: [goreRef],
        intensity: "medium",
        subject: "An aristocratic ceremony in a white palace",
        cardType: CardType.Spell,
        archetype: Archetype.RoyalCarmine
      });
      expect(resGore.promptBlock).not.toContain("blood and gore");
    });
  });

  // ==========================================
  // GRUPO 3: A LIMPEZA DE IDENTIDADE DEVE CHEGAR AO PROMPT FINAL
  // ==========================================
  describe("Grupo 3: Limpeza de identidade completa e eliminação de re-inserção de texto bruto", () => {
    it("3A. filterFragmentForIdentity processes ALL known identity details without early return", () => {
      const details = ["Sigil Alpha", "Sigil Beta"];
      const fragment = "Sigil Alpha, Sigil Beta, clean tapered outlines";

      const res = filterFragmentForIdentity(fragment, details);
      expect(res.safeToKeep).toBe(true);
      expect(res.cleanedText).toBe("clean tapered outlines");
      expect(res.cleanedText).not.toContain("Sigil Alpha");
      expect(res.cleanedText).not.toContain("Sigil Beta");
    });

    it("3A-2. filterFragmentForIdentity handles multiple occurrences of same detail", () => {
      const details = ["Sigil Alpha"];
      const fragment = "Sigil Alpha, clean tapered outlines, Sigil Alpha";

      const res = filterFragmentForIdentity(fragment, details);
      expect(res.safeToKeep).toBe(true);
      expect(res.cleanedText).toBe("clean tapered outlines");
      expect(res.cleanedText).not.toContain("Sigil Alpha");
    });

    it("3B. scaleForms and scaleCues use CLEANED text, preventing raw identity re-insertion", async () => {
      const ref = makeBaseDna("identity-scale-ref", "Scale Identity Ref", {
        identitySpecificDetails: ["Sigil Alpha"],
        scaleProfile: {
          physicalScale: "human scale",
          scaleForms: ["Sigil Alpha, clean tapered outlines"],
          scaleCues: ["Sigil Alpha, proportional hands"],
          perceivedPresence: "balanced presence",
          evidence: "scale evidence",
          confidence: 0.9
        }
      });

      vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([ref]);

      const req: CardGenerationRequest = {
        subject: "A noble in white silk",
        cardType: CardType.Monster,
        context: Context.Character,
        complexity: Complexity.Medium,
        archetype: Archetype.RoyalCarmine,
        model: ImageModel.Flash,
        useVisualDB: true,
        dbManualReferenceIds: ["identity-scale-ref"],
        dbMaxReferences: 1
      };

      const result = await generateCardArt(req);
      const payload = generateContentMock.mock.calls[0][0].contents.parts[0].text;

      // In payload and promptBlock, Sigil Alpha must NEVER appear!
      expect(payload).not.toContain("Sigil Alpha");
      expect(result.injectedPromptBlock).not.toContain("Sigil Alpha");
      
      // Cleaned technical cues MUST appear in Profiles
      expect(result.injectedPromptBlock).toContain("clean tapered outlines");
      expect(result.injectedPromptBlock).toContain("proportional hands");

      // Sigil Alpha should be in identityBlocked diagnostics
      expect(result.synthDebug?.identityBlocked).toContain("Sigil Alpha");
    });
  });

  // ==========================================
  // GRUPO 4: REGRAS NEGATIVAS E DIAGNÓSTICOS DEVEM SER FIÉIS
  // ==========================================
  describe("Grupo 4: negativePrompt string, cortes de limite e consistência de diagnósticos", () => {
    it("4A. negativePrompt as string is parsed and applied defensively", () => {
      const ref = makeBaseDna("neg-string-ref", "Negative String Ref", {
        negativePrompt: "avoid muddy colors, blurry textures"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A noble in white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("avoid muddy colors");
      expect(res.promptBlock).toContain("blurry textures");
      const appliedAvoids = res.debugInfo?.avoidRules?.filter(r => r.applied).map(r => r.rule) || [];
      expect(appliedAvoids.some(r => r.includes("avoid muddy colors"))).toBe(true);
    });

    it("4B. Items cut off by limits are NOT marked as included/applied", () => {
      // Substance materials limit in medium is 2
      const ref = makeBaseDna("mat-limit-ref", "Material Limit Ref", {
        substanceProfile: {
          materials: ["white silk", "polished silver", "white velvet"],
          surfaces: [],
          elements: [],
          elementApplications: [],
          evidence: "noble fabrics",
          confidence: 0.9
        }
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble in white silk and velvet",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      // The prompt should have 2 materials
      expect(res.promptBlock).toContain("white silk");
      expect(res.promptBlock).toContain("polished silver");
      expect(res.promptBlock).not.toContain("white velvet");

      // Evaluations: only 2 included, the 3rd must be discarded with limit reason
      const matEvals = res.debugInfo?.evaluations?.filter(e => e.field === "substanceMaterials") || [];
      const includedMats = matEvals.filter(e => e.decision === "included");
      const discardedMats = matEvals.filter(e => e.decision === "discarded");

      expect(includedMats.length).toBe(2);
      expect(discardedMats.length).toBe(1);
      expect(discardedMats[0].reason).toMatch(/limit/i);
    });

    it("4C. Reference contributing ONLY a negative rule counts as contributing and allContributionsDiscarded is false", () => {
      const ref = makeBaseDna("neg-only-ref", "Negative Only Ref", {
        // All positive fields blank or incompatible
        stylePromptFragments: ["heavy black plate armor"],
        universalQualityAvoids: ["avoid muddy colors"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A noble in white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.debugInfo?.allContributionsDiscarded).toBe(false);
      expect(res.contributingReferences?.map(r => r.id)).toContain("neg-only-ref");
      expect(res.promptBlock).toContain("avoid muddy colors");
      expect(res.promptBlock).not.toContain("All evaluated database fragments were safely discarded");
    });

    it("4D. generateCardArt returns distinct selectedReferences and contributingReferences and tracks cleanedText", async () => {
      const contribRef = makeBaseDna("contrib-ref", "Contributing Reference", {
        identitySpecificDetails: ["Sigil Alpha"],
        stylePromptFragments: ["Sigil Alpha, clean tapered outlines"]
      });

      const discardedRef = makeBaseDna("discarded-ref", "Discarded Reference", {
        stylePromptFragments: ["heavy black plate armor", "purple fire"]
      });

      vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([contribRef, discardedRef]);

      const req: CardGenerationRequest = {
        subject: "A noble in white silk",
        cardType: CardType.Monster,
        context: Context.Character,
        complexity: Complexity.Medium,
        archetype: Archetype.RoyalCarmine,
        model: ImageModel.Flash,
        useVisualDB: true,
        dbManualReferenceIds: ["contrib-ref", "discarded-ref"],
        dbMaxReferences: 2
      };

      const result = await generateCardArt(req);

      // Selected references has both references
      expect(result.selectedReferences?.map(r => r.id)).toEqual(["contrib-ref", "discarded-ref"]);

      // Contributing references ONLY has the one that actually contributed
      expect(result.contributingReferences?.map(r => r.id)).toEqual(["contrib-ref"]);
      expect(result.contributingReferences?.map(r => r.id)).not.toContain("discarded-ref");

      // Verify evaluation records cleanedText when identity detail was safely removed
      const cleanedEval = result.synthDebug?.evaluations?.find(e => e.referenceId === "contrib-ref" && e.decision === "included");
      expect(cleanedEval?.text).toBe("Sigil Alpha, clean tapered outlines");
      expect(cleanedEval?.cleanedText).toBe("clean tapered outlines");
    });
  });
});
