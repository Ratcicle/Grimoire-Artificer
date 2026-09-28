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

describe("GRIMOIRE ARTIFICER - AJUSTE DE COMPATIBILIDADE E DEDUPLICAÇÃO", () => {
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
  // GRUPO 1: USAR O CAMPO DE ORIGEM E O PAPEL DAS CORES
  // ==========================================
  describe("Grupo 1: Campo de origem e papel das cores", () => {
    it("1.1. Royal Carmine + nobre em seda branca: paletteLogic 'violet, emerald green' não deve entrar", () => {
      const ref = makeBaseDna("rc-palette-colors", "Color List Ref", {
        paletteLogic: "violet, emerald green"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("violet");
      expect(res.promptBlock).not.toContain("emerald green");
    });

    it("1.2. Royal Carmine + nobre em seda branca: palette como fallback para paletteLogic vazio não reintroduz paleta rejeitada", () => {
      const ref = makeBaseDna("rc-fallback-palette", "Fallback Palette Ref", {
        paletteLogic: "",
        palette: "violet, emerald green"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("violet");
      expect(res.promptBlock).not.toContain("emerald green");
    });

    it("1.3. Royal Carmine + nobre em seda branca: 'Dominant crimson clothing covering the entire figure' é descartado", () => {
      const ref = makeBaseDna("rc-crimson-dom", "Crimson Dominant Ref", {
        stylePromptFragments: ["Dominant crimson clothing covering the entire figure"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("Dominant crimson clothing");
      expect(res.promptBlock).not.toContain("covering the entire figure");
      const evalItem = res.debugInfo?.evaluations?.find(e => e.text.includes("Dominant crimson clothing"));
      expect(evalItem?.decision).toBe("discarded");
    });

    it("1.4. Royal Carmine + nobre em seda branca: 'white silk with small crimson embroidered accents' é preservado", () => {
      const ref = makeBaseDna("rc-crimson-acc", "Crimson Accent Ref", {
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
      const evalItem = res.debugInfo?.evaluations?.find(e => e.text.includes("crimson embroidered accents"));
      expect(evalItem?.decision).toBe("included");
    });

    it("1.5. Cavaleiro com armadura cerimonial branca: 'black linework on white ceremonial armor' continua permitido", () => {
      const ref = makeBaseDna("linework-armor-ref", "Linework Armor Ref", {
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
    });

    it("1.6. Generic + pedido explícito de paleta violeta e verde-esmeralda continua permitida", () => {
      const ref = makeBaseDna("gen-violet-green", "Generic Violet Green Ref", {
        paletteLogic: "vibrant violet and emerald green palette"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A sorceress with violet and emerald green magic aura",
        cardType: CardType.Monster,
        archetype: Archetype.Generic
      });

      expect(res.promptBlock).toContain("violet and emerald green");
    });
  });

  // ==========================================
  // GRUPO 2: UMA PERMISSÃO LOCAL NÃO LIBERA A FRASE INTEIRA
  // ==========================================
  describe("Grupo 2: Uma permissão local não libera a frase inteira", () => {
    it("2.1. Escala colossal sem técnica continua bloqueada para nobre humano", () => {
      const ref = makeBaseDna("colossal-ref", "Colossal Ref", {
        shapeLanguage: "A colossal human towering over cities"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("colossal human towering over cities");
      expect(res.promptBlock).not.toContain("towering over cities");
    });

    it("2.2. Escala colossal COM clean tapered outlines continua bloqueando a escala incompatível", () => {
      const ref = makeBaseDna("colossal-tech-ref", "Colossal Mixed Ref", {
        shapeLanguage: "A colossal human towering over cities with clean tapered outlines"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      // A escala colossal NÃO pode entrar no bloco de Silhouette & Shape
      expect(res.promptBlock).not.toContain("colossal human towering over cities");
      expect(res.promptBlock).not.toContain("towering over cities");
    });

    it("2.3. clean tapered outlines sozinho continua aproveitável", () => {
      const ref = makeBaseDna("clean-outline-ref", "Clean Outline Ref", {
        stylePromptFragments: ["clean tapered outlines"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A royal noble wearing white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).toContain("clean tapered outlines");
    });

    it("2.4. Generic + pedido explicitamente colossal permite a escala", () => {
      const ref = makeBaseDna("colossal-monster-ref", "Colossal Monster Ref", {
        shapeLanguage: "A colossal towering mountain-sized beast"
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "A colossal mountain-sized ancient titan",
        cardType: CardType.Monster,
        archetype: Archetype.Generic
      });

      expect(res.promptBlock).toContain("colossal");
    });

    it("2.5. 'subtle blood pact seals in crimson' continua compatível", () => {
      const ref = makeBaseDna("pact-ref", "Pact Ref", {
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
    });

    it("2.6. 'blood splatter covering the floor around blood pact seals' NÃO entra inteiro no DNA", () => {
      const ref = makeBaseDna("splatter-pact-ref", "Splatter Pact Ref", {
        stylePromptFragments: ["blood splatter covering the floor around blood pact seals"]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "An aristocratic ceremony in a white palace",
        cardType: CardType.Spell,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("blood splatter");
      expect(res.promptBlock).not.toContain("covering the floor");
    });

    it("2.7. Referência com fragmento proibido e fragmento técnico separado descarta o primeiro e preserva o segundo", () => {
      const ref = makeBaseDna("two-frags-ref", "Two Frags Ref", {
        stylePromptFragments: [
          "blood splatter covering the floor",
          "clean tapered outlines"
        ]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "medium",
        subject: "An aristocratic ceremony in a white palace",
        cardType: CardType.Spell,
        archetype: Archetype.RoyalCarmine
      });

      expect(res.promptBlock).not.toContain("blood splatter");
      expect(res.promptBlock).toContain("clean tapered outlines");
    });
  });

  // ==========================================
  // GRUPO 3: DEDUPLICAR DEPOIS DA LIMPEZA, ANTES DOS LIMITES
  // ==========================================
  describe("Grupo 3: Deduplicação após limpeza e antes dos limites", () => {
    it("3.1. Low intensity (limite 2 âncoras): deduplica texto limpo e permite que a 2ª âncora distinta entre", () => {
      const ref = makeBaseDna("dedup-ref", "Dedup Reference", {
        identitySpecificDetails: ["Sigil Alpha"],
        stylePromptFragments: [
          "Sigil Alpha, clean tapered outlines",
          "clean tapered outlines",
          "soft cel shading"
        ]
      });

      const res = synthesizeVisualDNA({
        references: [ref],
        intensity: "low",
        subject: "A noble in white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      // Style Anchors no prompt deve ser exatamente: "clean tapered outlines, soft cel shading"
      expect(res.promptBlock).toContain("- Style Anchors: clean tapered outlines, soft cel shading");
      expect(res.promptBlock).not.toContain("clean tapered outlines, clean tapered outlines");
      expect(res.promptBlock).not.toContain("Sigil Alpha");

      // Diagnóstico registra a duplicata com motivo adequado
      const evals = res.debugInfo?.evaluations || [];
      const dupEval = evals.find(e => e.reason && e.reason.toLowerCase().includes("duplicate"));
      expect(dupEval).toBeDefined();
      expect(dupEval?.decision).toBe("discarded");
    });

    it("3.2. Deduplicação após limpeza entre duas referências diferentes respeita a prioridade manual", () => {
      const refA = makeBaseDna("ref-a", "Ref A", {
        identitySpecificDetails: ["Sigil Alpha"],
        stylePromptFragments: ["Sigil Alpha, clean tapered outlines"]
      });

      const refB = makeBaseDna("ref-b", "Ref B", {
        stylePromptFragments: ["clean tapered outlines", "volumetric rim lighting"]
      });

      const res = synthesizeVisualDNA({
        references: [refA, refB],
        intensity: "low",
        subject: "A noble in white silk",
        cardType: CardType.Monster,
        archetype: Archetype.RoyalCarmine
      });

      // Ref A contribui "clean tapered outlines". Ref B tem duplicata de "clean tapered outlines", então contribui "volumetric rim lighting"
      expect(res.promptBlock).toContain("- Style Anchors: clean tapered outlines, volumetric rim lighting");
      expect(res.promptBlock).not.toContain("clean tapered outlines, clean tapered outlines");

      // Ref B não é descartada: ela contribui volumetric rim lighting
      expect(res.contributingReferences?.map(r => r.id)).toContain("ref-a");
      expect(res.contributingReferences?.map(r => r.id)).toContain("ref-b");
    });
  });
});
