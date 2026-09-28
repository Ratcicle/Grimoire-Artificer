import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  CardType,
  Complexity,
  Context,
  Archetype,
  ImageModel,
  CardGenerationRequest,
  VisualDNA,
  DNAMatchingResult
} from "../types";
import { generateCardArt, buildCardPrompt } from "./geminiService";
import {
  synthesizeVisualDNA,
  calculateComplementaryScores,
  getMatchingLogs
} from "./visualDnaEngine";
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

describe("Rodada 2: Síntese do Visual DNA - Acceptance Tests (A through K)", () => {
  const makeBaseDna = (id: string, name: string, overrides: Partial<VisualDNA> = {}): VisualDNA => ({
    id,
    name,
    imageUrl: "data:image/png;base64,sample",
    summary: "Base summary",
    linework: "clean lineart",
    rendering: "digital painting",
    palette: "gold and white",
    silhouette: "readable silhouette",
    pose: "standing stance",
    framing: "portrait framing",
    composition: "rule of thirds",
    lighting: "rim lighting",
    effects: "subtle glow",
    materials: "silk, silver",
    details: "filigree",
    background: "palace hall",
    hierarchy: "subject focused",
    positivePrompt: "noble illustration",
    negativePrompt: "low quality",
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

  // A. Royal Carmine + nobre em seda branca + referência de armadura preta, fogo roxo e cenário gótico
  it("A. Royal Carmine + nobre em seda branca + dark gothic reference: keeps transferable techniques, filters conflicting content", async () => {
    const darkRef = makeBaseDna("dark-ref", "Dark Gothic Knight", {
      stylePromptFragments: [
        "clean tapered outlines",
        "heavy black plate armor",
        "high contrast rim lighting"
      ],
      rendering: "polished digital finish with black gothic armor plates",
      linework: "clean crisp lineart with deep shadow contours",
      materials: "black iron, obsidian",
      effects: "purple flames engulfing the background",
      background: "gothic cathedral spires under midnight sky",
      substanceProfile: {
        materials: ["black iron", "obsidian"],
        elements: ["purple fire"],
        elementApplications: ["armor trim"],
        surfaces: ["dark metal"],
        evidence: "dark armor",
        confidence: 0.9
      }
    });

    vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([darkRef]);

    const req: CardGenerationRequest = {
      subject: "A noble in white silk",
      cardType: CardType.Monster,
      context: Context.Character,
      complexity: Complexity.Medium,
      archetype: Archetype.RoyalCarmine,
      model: ImageModel.Flash,
      useVisualDB: true,
      dbManualReferenceIds: ["dark-ref"],
      dbMaxReferences: 1
    };

    const result = await generateCardArt(req);
    expect(generateContentMock).toHaveBeenCalledTimes(1);

    const payload = generateContentMock.mock.calls[0][0].contents.parts[0].text;

    // Transferable techniques can stay
    expect(payload).toContain("clean tapered outlines");
    expect(payload).toContain("high contrast rim lighting");

    // Conflicting conditional features must NOT enter as positive instructions
    expect(payload).not.toContain("heavy black plate armor");
    expect(payload).not.toContain("black iron");
    expect(payload).not.toContain("obsidian");
    expect(payload).not.toContain("purple fire");
    expect(payload).not.toContain("purple flames");
    expect(payload).not.toContain("gothic cathedral");

    // Verify diagnostic logs record the discarded items
    const evals = result.synthDebug?.evaluations || [];
    const blackArmorEval = evals.find(e => e.text.includes("heavy black plate armor"));
    expect(blackArmorEval?.decision).toBe("discarded");
  });

  // B. Uma referência compatível de seda deve continuar contribuindo com informações específicas úteis
  it("B. Compatible silk reference continues contributing specific useful instructions without disabling DNA", async () => {
    const silkRef = makeBaseDna("silk-ref", "Silk Noble Masterpiece", {
      stylePromptFragments: [
        "flowing silk drapery",
        "mother of pearl luster",
        "soft specular fabric sheen"
      ],
      rendering: "delicate fabric rendering with smooth gradient folds",
      materialBehavior: "luxurious silk drape with soft highlights and almond sheen"
    });

    vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([silkRef]);

    const req: CardGenerationRequest = {
      subject: "A royal noble in white silk",
      cardType: CardType.Monster,
      context: Context.Character,
      complexity: Complexity.Medium,
      archetype: Archetype.RoyalCarmine,
      model: ImageModel.Flash,
      useVisualDB: true,
      dbManualReferenceIds: ["silk-ref"],
      dbMaxReferences: 1
    };

    const result = await generateCardArt(req);
    const payload = generateContentMock.mock.calls[0][0].contents.parts[0].text;

    // Must contribute useful specific silk instructions
    expect(payload).toContain("flowing silk drapery");
    expect(payload).toContain("mother of pearl luster");
    expect(result.contributingReferences?.map(r => r.id)).toContain("silk-ref");
    expect(result.injectedPromptBlock).toBeTruthy();
  });

  // C. Shadow-Heart com características escuras compatíveis (não virar proibição global de preto/gótico/demônios)
  it("C. Shadow-Heart allows compatible dark, gothic, and black armor characteristics", async () => {
    const shadowRef = makeBaseDna("shadow-ref", "Shadow Fiend", {
      stylePromptFragments: [
        "pointed gothic arches",
        "black organic armor",
        "crimson crystal rim light"
      ],
      rendering: "dark comic high contrast rendering",
      materials: "black organic armor plates"
    });

    vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([shadowRef]);

    const req: CardGenerationRequest = {
      subject: "A cursed demon knight in gothic armor",
      cardType: CardType.Monster,
      context: Context.Character,
      complexity: Complexity.Medium,
      archetype: Archetype.ShadowHeart,
      model: ImageModel.Flash,
      useVisualDB: true,
      dbManualReferenceIds: ["shadow-ref"],
      dbMaxReferences: 1
    };

    await generateCardArt(req);
    const payload = generateContentMock.mock.calls[0][0].contents.parts[0].text;

    // Dark and gothic features are compatible with Shadow-Heart and requested prompt
    expect(payload).toContain("pointed gothic arches");
    expect(payload).toContain("black organic armor");
    expect(payload).toContain("crimson crystal rim light");
  });

  // D. Generic com pedido explícito de armadura preta
  it("D. Generic Fantasy allows black armor when user explicitly requested it in the prompt", async () => {
    const blackArmorRef = makeBaseDna("black-armor-ref", "Iron Knight", {
      stylePromptFragments: [
        "black iron plate armor",
        "chiaroscuro directional lighting"
      ],
      rendering: "heavy metallic texture and burnished dark steel"
    });

    vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([blackArmorRef]);

    const req: CardGenerationRequest = {
      subject: "A dark warrior in black armor",
      cardType: CardType.Monster,
      context: Context.Character,
      complexity: Complexity.Medium,
      archetype: Archetype.Generic,
      model: ImageModel.Flash,
      useVisualDB: true,
      dbManualReferenceIds: ["black-armor-ref"],
      dbMaxReferences: 1
    };

    await generateCardArt(req);
    const payload = generateContentMock.mock.calls[0][0].contents.parts[0].text;

    // Because the user requested black armor, it remains permitted in Generic
    expect(payload).toContain("black iron plate armor");
    expect(payload).toContain("chiaroscuro directional lighting");
  });

  // E. Spell + Context Object + grimório (referência humana não impõe um mago como protagonista)
  it("E. Spell + Context Object does not allow a reference to impose a character protagonist", async () => {
    const humanMageRef = makeBaseDna("human-mage-ref", "High Mage", {
      pose: "An imposing academic mage standing centered, conjuring magical runes with arms outstretched",
      framing: "full body character portrait with wide action stance",
      stylePromptFragments: ["geometric rune circuits", "clean tapered outlines"]
    });

    vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([humanMageRef]);

    const req: CardGenerationRequest = {
      subject: "An ancient leather-bound grimoire resting on an altar",
      cardType: CardType.Spell,
      context: Context.Object,
      complexity: Complexity.Medium,
      archetype: Archetype.Arcanists,
      model: ImageModel.Flash,
      useVisualDB: true,
      dbIntensity: "high",
      dbManualReferenceIds: ["human-mage-ref"],
      dbMaxReferences: 1
    };

    const result = await generateCardArt(req);
    const payload = generateContentMock.mock.calls[0][0].contents.parts[0].text;

    // Technical runes and outlines can stay
    expect(payload).toContain("geometric rune circuits");

    // The character protagonist pose must NOT be imposed on an Object focus
    expect(payload).not.toContain("An imposing academic mage standing centered");

    // Diagnostic must show the pose was discarded due to context focus
    const poseEval = result.synthDebug?.evaluations?.find(e => e.field === "pose");
    expect(poseEval?.decision).toBe("discarded");
  });

  // F. Identidade repetida em múltiplos campos (o detalhe conhecido não vaza e fragmento técnico é aproveitado)
  it("F. Blocks known identity detail across multiple fields while preserving independent technical fragments", () => {
    const ref = makeBaseDna("identity-ref", "Obsidian King", {
      identitySpecificDetails: ["the seven-pointed Obsidian Crown", "Lord Malakor"],
      stylePromptFragments: [
        "clean tapered outlines",
        "the seven-pointed Obsidian Crown"
      ],
      styleAnchors: "the seven-pointed Obsidian Crown, high contrast rim lighting",
      rendering: "the seven-pointed Obsidian Crown over dark steel",
      linework: "clean crisp contours"
    });

    const synth = synthesizeVisualDNA({
      references: [ref],
      intensity: "high",
      subject: "A noble in royal regalia",
      cardType: "Monster",
      archetype: "Generic Fantasy",
      userPrompt: "A noble in royal regalia"
    });

    // Technical parts must be present
    expect(synth.promptBlock).toContain("clean tapered outlines");
    expect(synth.promptBlock).toContain("high contrast rim lighting");

    // Identity details must NEVER enter the prompt block!
    expect(synth.promptBlock).not.toContain("the seven-pointed Obsidian Crown");
    expect(synth.promptBlock).not.toContain("Lord Malakor");

    // Diagnostic must record the blocked identity detail
    expect(synth.debugInfo?.identityBlocked).toContain("the seven-pointed Obsidian Crown");
  });

  // G. Referência de maior score com campo vazio ou incompatível: utiliza alternativa compatível sem cair em summary
  it("G. When highest-score reference has empty or incompatible field, uses compatible alternative from other ref without summary fallback", () => {
    const ref1High = makeBaseDna("ref1", "High Score Incompatible", {
      scores: {
        ...makeBaseDna("", "").scores,
        rendering: 0.95
      },
      summary: "A grotesque demon lord covered in blood and skulls",
      rendering: "", // empty
      linework: "black gothic corrupted spikes" // incompatible with Royal Carmine
    });

    const ref2Low = makeBaseDna("ref2", "Lower Score Compatible", {
      scores: {
        ...makeBaseDna("", "").scores,
        rendering: 0.70
      },
      summary: "A pure noble",
      rendering: "smooth digital gradient painting with soft specular transitions"
    });

    const synth = synthesizeVisualDNA({
      references: [ref1High, ref2Low],
      intensity: "medium",
      subject: "A noble in white silk",
      cardType: "Monster",
      archetype: Archetype.RoyalCarmine,
      userPrompt: "A noble in white silk"
    });

    // Rendering must pick Ref2's compatible digital gradient painting
    expect(synth.promptBlock).toContain("smooth digital gradient painting with soft specular transitions");

    // Must NEVER use Ref1's summary or Ref1's corrupted spikes
    expect(synth.promptBlock).not.toContain("A grotesque demon lord");
    expect(synth.promptBlock).not.toContain("black gothic corrupted spikes");
  });

  // H. Bônus de complementaridade: conteúdo não solicitado não ganha prioridade apenas por ser diferente
  it("H. Complementary scoring does not reward unrequested materials or elements", () => {
    const baseMatch: DNAMatchingResult = {
      baseScore: 10,
      diversityBonus: 0,
      redundancyPenalty: 0,
      finalScore: 10,
      matches: [{ category: "SubjectCategory", tag: "noble", score: 3 }],
      ignoredLowConfidence: [],
      penalties: [],
      matchedCategories: ["SubjectCategory"]
    };

    const ref1 = makeBaseDna("ref1", "Noble One");
    const ref2Unrequested = makeBaseDna("ref2", "Unrequested Elements", {
      substanceProfile: {
        materials: ["unrequested_dark_matter", "unrequested_void_crystal"],
        elements: ["unrequested_fel_fire", "unrequested_poison"],
        elementApplications: ["unrequested_aura"],
        surfaces: ["toxic"],
        evidence: "none",
        confidence: 0.9
      }
    });

    const scored = [
      { dna: ref1, result: { ...baseMatch, matches: [...baseMatch.matches] } },
      { dna: ref2Unrequested, result: { ...baseMatch, matches: [...baseMatch.matches] } }
    ];

    const complementary = calculateComplementaryScores(scored, 2);
    const item2 = complementary.find(i => i.dna.id === "ref2");

    // Ref2 must NOT receive diversity bonus simply because it has unrequested materials/elements!
    expect(item2?.result.diversityBonus).toBe(0);
    expect(item2?.result.finalScore).toBe(10);
  });

  // I. Low, Medium e High: proteções consistentes e diagnóstico correspondente ao texto final
  it("I. Consistent protections across Low, Medium, and High intensities with matching diagnostics", () => {
    const conflictingRef = makeBaseDna("conflict-ref", "Conflicting Ref", {
      stylePromptFragments: [
        "clean tapered outlines",
        "heavy black plate armor",
        "specular highlights"
      ],
      rendering: "digital cel shading"
    });

    const intensities: ("low" | "medium" | "high")[] = ["low", "medium", "high"];

    for (const intensity of intensities) {
      const synth = synthesizeVisualDNA({
        references: [conflictingRef],
        intensity,
        subject: "A noble in white silk",
        cardType: "Monster",
        archetype: Archetype.RoyalCarmine,
        userPrompt: "A noble in white silk"
      });

      // At ALL intensities, black plate armor is filtered out!
      expect(synth.promptBlock).not.toContain("heavy black plate armor");

      // Diagnostic accurately reflects prompt
      const includedEvals = (synth.debugInfo?.evaluations || []).filter(e => e.decision === "included");
      for (const inc of includedEvals) {
        expect(synth.promptBlock).toContain(inc.text);
      }
    }
  });

  // J. Registros legados/parciais, campos vazios, nenhuma contribuição elegível, banco vazio e banco desligado
  it("J. Handles legacy records, empty fields, no eligible contributions, empty DB and DB disabled gracefully", async () => {
    // 1. With DB disabled
    const reqDisabled: CardGenerationRequest = {
      subject: "A noble",
      cardType: CardType.Monster,
      context: Context.Character,
      complexity: Complexity.Low,
      archetype: Archetype.Generic,
      model: ImageModel.Lite,
      useVisualDB: false
    };
    const resDisabled = await generateCardArt(reqDisabled);
    expect(resDisabled.imageUrl).toBeTruthy();
    expect(resDisabled.injectedPromptBlock).toBeFalsy();

    // 2. With empty DB
    vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([]);
    const reqEmptyDb: CardGenerationRequest = {
      ...reqDisabled,
      useVisualDB: true,
      dbAutoSelect: true
    };
    const resEmptyDb = await generateCardArt(reqEmptyDb);
    expect(resEmptyDb.imageUrl).toBeTruthy();

    // 3. With all contributions discarded
    const incompatibleRef: VisualDNA = {
      ...makeBaseDna("incompat", "Incompatible"),
      palette: "gothic black blood",
      paletteLogic: "dark gothic tones",
      silhouette: "demonic monster silhouette",
      shapeLanguage: "corrupted demonic spikes",
      composition: "gothic cathedral crypt",
      compositionRecipe: "gothic ruins background",
      materials: "black iron, dark obsidian",
      materialBehavior: "blood dripping over dark iron",
      focalAnchors: "gothic demon horn",
      hierarchy: "corrupted monster",
      details: "demonic skulls and gothic spikes",
      detailPlacement: "scattered blood on dark floor",
      background: "vampire castle crypt",
      effects: "purple flames",
      energyDesign: "chaotic dark magic",
      pose: "demonic attacking pose",
      framing: "gothic vampire framing",
      lighting: "gothic blood moon",
      stylePromptFragments: ["heavy black plate armor", "vampire gothic fangs"],
      styleAnchors: "gothic vampire crypt",
      rendering: "gothic blood spatter",
      linework: "dark corrupted spikes"
    };
    vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([incompatibleRef]);

    const reqFiltered: CardGenerationRequest = {
      subject: "A noble in white silk",
      cardType: CardType.Monster,
      context: Context.Character,
      complexity: Complexity.Medium,
      archetype: Archetype.RoyalCarmine,
      model: ImageModel.Flash,
      useVisualDB: true,
      dbManualReferenceIds: ["incompat"],
      dbMaxReferences: 1
    };
    const resFiltered = await generateCardArt(reqFiltered);
    expect(resFiltered.synthDebug?.allContributionsDiscarded).toBe(true);
    expect(resFiltered.contributingReferences?.length).toBe(0);
  });

  // K. Preservar seleção manual, descrição original, Card Type, Context Focus, preset e envio da Reference Image no payload da API mockada
  it("K. Preserves manual selection, original description, Card Type, Context Focus, preset and reference image in API payload", async () => {
    const refA = makeBaseDna("ref-a", "Reference Alpha", {
      stylePromptFragments: ["clean tapered outlines"]
    });
    const refB = makeBaseDna("ref-b", "Reference Beta", {
      stylePromptFragments: ["smooth digital gradients"]
    });

    vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([refA, refB]);

    const req: CardGenerationRequest = {
      subject: "A mystical grimoire floating in an enchanted chamber",
      cardType: CardType.Spell,
      context: Context.Object,
      complexity: Complexity.High,
      archetype: Archetype.Arcanists,
      model: ImageModel.Flash,
      referenceImage: "data:image/png;base64,mockReferenceImageData",
      useVisualDB: true,
      dbAutoSelect: false,
      dbManualReferenceIds: ["ref-b", "ref-a"],
      dbMaxReferences: 2
    };

    const result = await generateCardArt(req);

    // Verify mock API call payload
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const callArgs = generateContentMock.mock.calls[0][0];

    // Reference image part exists
    const imagePart = callArgs.contents.parts.find((p: any) => p.inlineData && p.inlineData.data === "mockReferenceImageData");
    expect(imagePart).toBeDefined();

    // Text prompt part exists and has all parameters
    const textPart = callArgs.contents.parts.find((p: any) => typeof p.text === "string");
    const promptText = textPart.text;

    expect(promptText).toContain("**CARD TYPE**: Spell");
    expect(promptText).toContain("**CONTEXT FOCUS**: Object");
    expect(promptText).toContain("**COMPLEXITY**: High");
    expect(promptText).toContain("**SUBJECT DESCRIPTION**: A mystical grimoire floating in an enchanted chamber");
    expect(promptText).toContain("[[ARCANISTS STYLE]]");
    expect(promptText).toContain("**IMAGE REFERENCE**");

    // Injected DNA direction must be present
    expect(promptText).toContain("VISUAL DNA DIRECTION");
    expect(promptText).toContain("clean tapered outlines");
    expect(promptText).toContain("smooth digital gradients");

    // Order of manual selection preserved
    expect(result.selectedReferences?.map(r => r.id)).toEqual(["ref-b", "ref-a"]);
  });
});
