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

describe("GRIMOIRE ARTIFICER — FECHAMENTO DA RODADA 2", () => {
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
  // GRUPO 1: AVALIAR CORES CONFORME SUA FUNÇÃO VISUAL
  // ==========================================
  describe("1. Avaliar cores conforme sua função visual", () => {
    it("A. Royal Carmine: 'white silk with black linework' em paletteLogic é preservado (black é linework, não roupa)", () => {
      const ref = makeBaseDna("rc-white-black-line", "Silk & Linework Ref", {
        paletteLogic: "white silk with black linework"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("white silk with black linework");
      const evalItem = res.debugInfo?.evaluations?.find(e => e.text.includes("white silk with black linework"));
      expect(evalItem?.decision).toBe("included");
    });

    it("B. Royal Carmine: 'blue, white' em paletteLogic rejeita blue por ser cor não permitida na paleta dominante", () => {
      const ref = makeBaseDna("rc-blue-white", "Blue White Ref", {
        paletteLogic: "blue, white"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      // blue não deve entrar
      expect(res.promptBlock).not.toContain("blue, white");
      expect(res.promptBlock).not.toContain("blue");
    });

    it("C. Generic: 'blue, white' em paletteLogic com pedido de paleta azul e branca é preservado", () => {
      const ref = makeBaseDna("gen-blue-white", "Generic Blue White Ref", {
        paletteLogic: "blue, white"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A sorceress with a blue and white palette",
        cardType: CardType.Monster,
        archetype: Archetype.Generic
      });

      expect(res.promptBlock).toContain("blue, white");
    });

    it("D. Royal Carmine: 'black clothing with white linework' é rejeitado (não permite roupa preta por linework branco)", () => {
      const ref = makeBaseDna("rc-black-clothing-white-line", "Black Clothing White Line Ref", {
        stylePromptFragments: ["black clothing with white linework"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("black clothing");
      const evalItem = res.debugInfo?.evaluations?.find(e => e.text.includes("black clothing"));
      expect(evalItem?.decision).toBe("discarded");
    });

    it("E. Royal Carmine: 'white silk with small crimson embroidered accents' continua permitido", () => {
      const ref = makeBaseDna("rc-crimson-embroidery", "Crimson Embroidery Ref", {
        stylePromptFragments: ["white silk with small crimson embroidered accents"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("white silk with small crimson embroidered accents");
    });

    it("F. Royal Carmine: 'golden rim lighting over white silk' não confunde iluminação dourada com roupa dourada", () => {
      const ref = makeBaseDna("rc-golden-light", "Golden Light Ref", {
        stylePromptFragments: ["golden rim lighting over white silk"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("golden rim lighting over white silk");
    });

    it("Royal Carmine: 'small blue gemstone accent' com pedido contendo blue gemstone é permitido como acento", () => {
      const ref = makeBaseDna("rc-gemstone-accent", "Gemstone Accent Ref", {
        stylePromptFragments: ["small blue gemstone accent"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble in white silk with a small blue gemstone",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("small blue gemstone accent");
    });
  });

  // ==========================================
  // GRUPO 2: DEDUPLICAÇÃO DE substanceProfile.materials E elements APÓS LIMPEZA
  // ==========================================
  describe("2. Deduplicação de substanceProfile.materials e elements após limpeza", () => {
    it("G. substanceProfile.materials: deduplica após limpeza de identidade, não consome slot e permite o 2º material", () => {
      const ref = makeBaseDna("mat-dedup-ref", "Material Dedup Ref", {
        identitySpecificDetails: ["Sigil Alpha"],
        substanceProfile: {
          materials: [
            "Sigil Alpha, white silk",
            "white silk",
            "polished silver"
          ],
          surfaces: [],
          elements: [],
          elementApplications: [],
          evidence: "",
          confidence: 0.9
        }
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      // Materials deve conter "white silk, polished silver"
      expect(res.promptBlock).toContain("Materials: white silk, polished silver");
      expect(res.promptBlock).not.toContain("white silk, white silk");
      expect(res.promptBlock).not.toContain("Sigil Alpha");

      // Diagnóstico registra a segunda ocorrência como duplicata pós-limpeza, não por limite excedido
      const evals = res.debugInfo?.evaluations || [];
      const dupEval = evals.find(
        e => e.field === "substanceMaterials" && e.reason && e.reason.toLowerCase().includes("duplicate")
      );
      expect(dupEval).toBeDefined();
      expect(dupEval?.decision).toBe("discarded");
    });

    it("H. Duas referências: prioridade preservada, duplicata em Ref B não a faz contribuir, e contribui pelo 2º item emitido", () => {
      const refA = makeBaseDna("ref-a-mat", "Ref A Mat", {
        identitySpecificDetails: ["Sigil Alpha"],
        substanceProfile: {
          materials: ["Sigil Alpha, white silk"],
          surfaces: [],
          elements: [],
          elementApplications: [],
          evidence: "",
          confidence: 0.9
        }
      });

      const refB = makeBaseDna("ref-b-mat", "Ref B Mat", {
        substanceProfile: {
          materials: ["white silk", "polished silver"],
          surfaces: [],
          elements: [],
          elementApplications: [],
          evidence: "",
          confidence: 0.9
        }
      });

      const res = synthesizeVisualDNA({
        references: [refA, refB],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("Materials: white silk, polished silver");
      expect(res.promptBlock).not.toContain("white silk, white silk");

      // Ref A contribui white silk
      expect(res.contributingReferences?.map(r => r.id)).toContain("ref-a-mat");
      // Ref B contribui polished silver
      expect(res.contributingReferences?.map(r => r.id)).toContain("ref-b-mat");
    });

    it("substanceProfile.elements: deduplica após limpeza de identidade e respeita limites", () => {
      const ref = makeBaseDna("elem-dedup-ref", "Element Dedup Ref", {
        identitySpecificDetails: ["Rune Beta"],
        substanceProfile: {
          materials: [],
          surfaces: [],
          elements: [
            "Rune Beta, sacred light",
            "sacred light",
            "crimson embers"
          ],
          elementApplications: [],
          evidence: "",
          confidence: 0.9
        }
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A noble priest",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("Elements: sacred light, crimson embers");
      expect(res.promptBlock).not.toContain("sacred light, sacred light");
      expect(res.promptBlock).not.toContain("Rune Beta");
    });

    it("I. Não mutação: após síntese, os objetos VisualDNA originais permanecem idênticos", () => {
      const originalRef = makeBaseDna("immutability-ref", "Immutable Ref", {
        identitySpecificDetails: ["Sigil Alpha"],
        substanceProfile: {
          materials: ["Sigil Alpha, white silk", "polished silver"],
          surfaces: [],
          elements: ["sacred light"],
          elementApplications: [],
          evidence: "",
          confidence: 0.9
        }
      });

      const cloneBefore = JSON.parse(JSON.stringify(originalRef));

      synthesizeVisualDNA({
        references: [originalRef],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(originalRef).toEqual(cloneBefore);
    });
  });

  // ==========================================
  // GRUPO 3: TESTE DO PAYLOAD FINAL COM GENERATECARDART
  // ==========================================
  describe("3. Teste do payload final com generateCardArt", () => {
    it("Verifica contents.parts enviado ao Gemini mockado em generateCardArt", async () => {
      const ref = makeBaseDna("payload-ref", "Payload Ref", {
        identitySpecificDetails: ["Sigil Alpha"],
        paletteLogic: "white silk with black linework",
        substanceProfile: {
          materials: ["Sigil Alpha, white silk", "white silk", "polished silver"],
          surfaces: [],
          elements: [],
          elementApplications: [],
          evidence: "",
          confidence: 0.9
        }
      });

      vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([ref]);

      const req: CardGenerationRequest = {
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine,
        subject: "A royal noble wearing white silk",
        complexity: Complexity.Medium,
        context: Context.Character,
        model: ImageModel.Flash,
        dbIntensity: "medium",
        useVisualDB: true,
        dbManualReferenceIds: ["payload-ref"]
      };

      const result = await generateCardArt(req);

      expect(result).toBeDefined();
      expect(generateContentMock).toHaveBeenCalledTimes(1);

      const callArgs = generateContentMock.mock.calls[0][0];
      const promptText = Array.isArray(callArgs.contents)
        ? callArgs.contents[0].parts[0].text
        : callArgs.contents.parts[0].text;

      // 1. Sujeito original intacto
      expect(promptText).toContain("A royal noble wearing white silk");

      // 2. Preset intacto
      expect(promptText).toMatch(/ROYAL CARMINE/i);

      // 3. Conteúdo aceito aparece no VISUAL DNA DIRECTION
      expect(promptText).toContain("white silk with black linework");
      expect(promptText).toContain("Materials: white silk, polished silver");

      // 4. Identidade removida NÃO reaparece
      expect(promptText).not.toContain("Sigil Alpha");

      // 5. Nenhum texto de diagnóstico de descarte é enviado
      expect(promptText).not.toContain("Exceeds intensity limit");
      expect(promptText).not.toContain("Duplicate substance material");
      expect(promptText).not.toContain("Filtered by archetype");
    });
  });
});
