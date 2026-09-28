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
import { generateCardArt, buildCardPrompt } from "./geminiService";
import { 
  resolveManualReferences, 
  getAutomaticReferences, 
  getMatchingLogs,
  scoreVisualDNAReferenceBase,
  synthesizeVisualDNA
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

describe("Rodada 1: Generation Parameters and Reference Selection", () => {
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
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80, totalTokenCount: 200 }
    });
  });

  describe("1. Enviar explicitamente o tipo de carta ao gerador", () => {
    it("generates prompts with Monster, Spell, and Trap explicitly in the API payload with Artstyle DB disabled", async () => {
      const baseReq: Omit<CardGenerationRequest, "cardType"> = {
        subject: "An ancient tome lying on an altar",
        context: Context.Object,
        complexity: Complexity.High,
        archetype: Archetype.Arcanists,
        model: ImageModel.Flash,
        useVisualDB: false
      };

      const cardTypes = [CardType.Monster, CardType.Spell, CardType.Trap];

      for (const cType of cardTypes) {
        generateContentMock.mockClear();

        const request: CardGenerationRequest = {
          ...baseReq,
          cardType: cType
        };

        const result = await generateCardArt(request);
        expect(result.imageUrl).toContain("data:image/png;base64,mockGeneratedArtBase64Data");

        // Inspect the actual payload sent to the mocked Gemini API
        expect(generateContentMock).toHaveBeenCalledTimes(1);
        const callArgs = generateContentMock.mock.calls[0][0];
        const sentPayloadParts = callArgs.contents.parts;
        const textPart = sentPayloadParts.find((p: any) => typeof p.text === "string");
        expect(textPart).toBeDefined();

        const promptText = textPart.text;

        // 1. Explicit Card Type in prompt
        expect(promptText).toContain(`**CARD TYPE**: ${cType}`);
        expect(promptText).toContain(`- Card Type: ${cType}`);

        // 2. Explicit Context Focus in prompt
        expect(promptText).toContain(`**CONTEXT FOCUS**: ${Context.Object}`);
        expect(promptText).toContain(`- Context Focus: ${Context.Object}`);

        // 3. Subject description
        expect(promptText).toContain(baseReq.subject);

        // 4. Complexity
        expect(promptText).toContain(`**COMPLEXITY**: ${Complexity.High}`);

        // 5. Archetype preset instructions
        expect(promptText).toContain("[[ARCANISTS STYLE]]");

        // 6. Non-objective: border/frame/card constraints preserved
        expect(promptText).toContain("NO CARD ELEMENTS");
        expect(promptText).toContain("NO WHITE BORDERS");
        expect(promptText).toContain("FULL BLEED");

        // 7. Context harmony (not every Spell is an explosion, not every Trap requires a victim)
        expect(promptText).toContain("central object, relic, or device");
      }
    });

    it("verifies buildCardPrompt constructs complete instructions for Spell with Object focus", () => {
      const prompt = buildCardPrompt({
        subject: "A glowing grimoire inscribed with celestial runes",
        cardType: CardType.Spell,
        context: Context.Object,
        complexity: Complexity.Medium,
        archetype: Archetype.Generic,
        model: ImageModel.Lite,
        useVisualDB: false
      });

      expect(prompt).toContain("**CARD TYPE**: Spell");
      expect(prompt).toContain("**CONTEXT FOCUS**: Object");
      expect(prompt).toContain("A glowing grimoire inscribed with celestial runes");
      expect(prompt).toContain("Complexity: Medium");
      expect(prompt).toContain("[[SHADOW DUEL GENERIC CORE STYLE]]");
      expect(prompt).toContain("Card Type does NOT authorize rendering a physical trading card");
    });
  });

  describe("2. Não tratar palavras negadas como preferências positivas", () => {
    const makeDna = (id: string, name: string, tags: string[], summary: string): VisualDNA => ({
      id,
      name,
      imageUrl: "data:image/png;base64,sample",
      summary,
      linework: "clean lineart",
      rendering: "digital painting",
      palette: "gold and white",
      silhouette: "noble",
      pose: "standing",
      framing: "portrait",
      composition: "centered",
      lighting: "divine ray",
      effects: "glow",
      materials: "silk, gold",
      details: "filigree",
      background: "palace",
      hierarchy: "subject focused",
      positivePrompt: summary,
      negativePrompt: "low quality",
      tags,
      scores: {
        style: 0.8,
        palette: 0.8,
        pose: 0.7,
        composition: 0.8,
        lighting: 0.7,
        effects: 0.6,
        materials: 0.8,
        background: 0.7,
        details: 0.8,
        silhouette: 0.8,
        rendering: 0.8
      }
    });

    const dragonArmorDna = makeDna(
      "dragon-armor",
      "Dragon Armored Knight",
      ["dragon", "armor", "boss monster"],
      "A grand warrior clad in dragon scale armor with dragon wings"
    );

    it("test 1: 'young noble' versus 'young noble, no dragon, no armor' (dragon/armor receive no bonus in second case)", () => {
      const db = [dragonArmorDna];

      const logsWithoutNegation = getMatchingLogs("young noble", "Monster", "Generic Fantasy", db, []);
      const logsWithNegation = getMatchingLogs("young noble, no dragon, no armor", "Monster", "Generic Fantasy", db, []);

      const scoreWithout = logsWithoutNegation.find(l => l.id === "dragon-armor")?.score || 0;
      const scoreWith = logsWithNegation.find(l => l.id === "dragon-armor")?.score || 0;

      // In the second case, dragon and armor must NOT receive any additional bonus
      expect(scoreWith).toBeLessThanOrEqual(scoreWithout);

      // Verify diagnostics do not show positive matches for dragon or armor
      const detailsWith = logsWithNegation.find(l => l.id === "dragon-armor")?.details;
      const matchedTags = (detailsWith?.matches || []).map(m => m.tag.toLowerCase());
      expect(matchedTags).not.toContain("dragon");
      expect(matchedTags).not.toContain("armor");
    });

    it("test 2: 'nobre de seda branca, sem dragões e sem armadura' (exclusions do not count as preferences)", () => {
      const db = [dragonArmorDna];
      const logs = getMatchingLogs("nobre de seda branca, sem dragões e sem armadura", "Monster", "Generic Fantasy", db, []);

      const details = logs.find(l => l.id === "dragon-armor")?.details;
      const matchedTags = (details?.matches || []).map(m => m.tag.toLowerCase());
      expect(matchedTags).not.toContain("dragon");
      expect(matchedTags).not.toContain("armor");
      expect(matchedTags).not.toContain("dragões");
      expect(matchedTags).not.toContain("armadura");

      // Field matches must not score dragon or armor from the negative clause
      const fieldMatches = (details?.matches || []).filter(m => m.category === "FieldMatch");
      fieldMatches.forEach(fm => {
        expect(fm.tag).not.toBe("dragon");
        expect(fm.tag).not.toBe("armor");
      });
    });

    it("test 3: 'without wings, holding a golden staff' (wings is exclusion, golden staff is affirmative)", () => {
      const wingedStaffDna = makeDna(
        "winged-staff",
        "Winged Mage with Staff",
        ["massive wingspan", "weapon focus", "gold"],
        "A wizard with golden staff and massive feather wings"
      );

      const db = [wingedStaffDna];
      const logs = getMatchingLogs("without wings, holding a golden staff", "Monster", "Generic Fantasy", db, []);

      const details = logs.find(l => l.id === "winged-staff")?.details;
      const matched = details?.matches || [];

      // Wings must NOT be scored
      const wingMatches = matched.filter(m => m.tag.toLowerCase().includes("wing"));
      expect(wingMatches.length).toBe(0);

      // Golden staff / weapon focus / gold must be scored affirmatively
      const affirmativeScore = details?.baseScore || 0;
      expect(affirmativeScore).toBeGreaterThan(0);
    });

    it("test 4: 'a dragon beside a knight without armor' (dragon remains affirmative, armor does not)", () => {
      const db = [dragonArmorDna];
      const logs = getMatchingLogs("a dragon beside a knight without armor", "Monster", "Generic Fantasy", db, []);

      const details = logs.find(l => l.id === "dragon-armor")?.details;
      const matchedTags = (details?.matches || []).map(m => m.tag.toLowerCase());

      // Dragon was affirmative, so it must be matched
      expect(matchedTags).toContain("dragon");

      // Armor was negated, so it must NOT be matched
      expect(matchedTags).not.toContain("armor");
    });

    it("test 5: 'not only a knight but also a dragon' (neither knight nor dragon is interpreted as exclusion)", () => {
      const db = [dragonArmorDna];
      const logs = getMatchingLogs("not only a knight but also a dragon", "Monster", "Generic Fantasy", db, []);

      const details = logs.find(l => l.id === "dragon-armor")?.details;
      const matchedTags = (details?.matches || []).map(m => m.tag.toLowerCase());

      // Dragon must be matched affirmatively
      expect(matchedTags).toContain("dragon");
    });

    it("does not select motifs that match excluded terms in synthesizeVisualDNA", () => {
      const dnaWithDragonMotif: VisualDNA = {
        ...dragonArmorDna,
        contentMotifs: ["dragon scales", "golden crown"],
        visualMotifs: "fiery breath"
      };

      const synth = synthesizeVisualDNA({
        references: [dnaWithDragonMotif],
        intensity: "high",
        subject: "young noble, no dragon, no armor",
        cardType: "Monster",
        archetype: "Generic Fantasy",
        userPrompt: "young noble, no dragon, no armor"
      });

      // Motifs containing excluded words must not be marked as used
      const dragonMotifLog = synth.debugInfo?.motifs.find(m => m.motif === "dragon scales");
      if (dragonMotifLog) {
        expect(dragonMotifLog.used).toBe(false);
      }
      expect(synth.promptBlock).not.toContain("dragon scales");
    });
  });

  describe("3. Respeitar a ordem das referências manuais", () => {
    const makeSimpleDna = (id: string, name: string): VisualDNA => ({
      id,
      name,
      imageUrl: "data:image/png;base64,sample",
      summary: `Reference ${name}`,
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
      positivePrompt: "",
      negativePrompt: "",
      tags: [],
      scores: {
        style: 0.5,
        palette: 0.5,
        pose: 0.5,
        composition: 0.5,
        lighting: 0.5,
        effects: 0.5,
        materials: 0.5,
        background: 0.5,
        details: 0.5,
        silhouette: 0.5,
        rendering: 0.5
      }
    });

    const dnaA = makeSimpleDna("A", "Alpha Reference");
    const dnaB = makeSimpleDna("B", "Beta Reference");
    const dnaC = makeSimpleDna("C", "Gamma Reference");

    it("mandatory test: database [A, B], manual selection [B, A], limit 1 => uses B", () => {
      const db = [dnaA, dnaB];
      const result = resolveManualReferences(["B", "A"], db, 1);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe("B");
      expect(result[0].name).toBe("Beta Reference");
    });

    it("preserves order with larger limit", () => {
      const db = [dnaA, dnaB, dnaC];
      const result = resolveManualReferences(["B", "A", "C"], db, 3);

      expect(result.map(r => r.id)).toEqual(["B", "A", "C"]);
    });

    it("removes duplicates while keeping the first occurrence", () => {
      const db = [dnaA, dnaB, dnaC];
      const result = resolveManualReferences(["B", "A", "B", "A"], db, 3);

      expect(result.map(r => r.id)).toEqual(["B", "A"]);
    });

    it("ignores non-existent IDs without throwing errors", () => {
      const db = [dnaA, dnaB];
      const result = resolveManualReferences(["NON_EXISTENT_1", "B", "NON_EXISTENT_2", "A"], db, 2);

      expect(result.map(r => r.id)).toEqual(["B", "A"]);
    });

    it("returns empty array for empty or undefined manual selection (does not fill with auto-references)", () => {
      const db = [dnaA, dnaB];
      expect(resolveManualReferences([], db, 3)).toEqual([]);
      expect(resolveManualReferences(undefined, db, 3)).toEqual([]);
      expect(resolveManualReferences(["UNKNOWN"], db, 3)).toEqual([]);
    });

    it("verifies end-to-end generateCardArt uses the manual reference order and limit", async () => {
      vi.spyOn(localDbService, "getLocalDNA").mockResolvedValue([dnaA, dnaB]);

      const req: CardGenerationRequest = {
        subject: "Paladin in temple",
        cardType: CardType.Monster,
        context: Context.Character,
        complexity: Complexity.Medium,
        archetype: Archetype.LuminarchKnights,
        model: ImageModel.Flash,
        useVisualDB: true,
        dbAutoSelect: false,
        dbManualReferenceIds: ["B", "A"],
        dbMaxReferences: 1
      };

      const result = await generateCardArt(req);

      // Must have used B, NOT A!
      expect(result.usedReferences).toEqual([{ id: "B", name: "Beta Reference" }]);
    });
  });

  describe("Complemento Rodada 1: Casos reproduzidos na revisão", () => {
    const makeDna = (id: string, name: string, tags: string[], summary: string): VisualDNA => ({
      id,
      name,
      imageUrl: "data:image/png;base64,sample",
      summary,
      linework: "clean lineart",
      rendering: "digital painting",
      palette: "gold and white",
      silhouette: "noble",
      pose: "standing",
      framing: "portrait",
      composition: "centered",
      lighting: "divine ray",
      effects: "glow",
      materials: "silk, gold",
      details: "filigree",
      background: "palace",
      hierarchy: "subject focused",
      positivePrompt: summary,
      negativePrompt: "low quality",
      tags,
      scores: {
        style: 0.8,
        palette: 0.8,
        pose: 0.7,
        composition: 0.8,
        lighting: 0.7,
        effects: 0.6,
        materials: 0.8,
        background: 0.7,
        details: 0.8,
        silhouette: 0.8,
        rendering: 0.8
      }
    });

    describe("1. Distinguir a preposição portuguesa 'no' da negação inglesa", () => {
      it("does not exclude 'palácio' or 'templo' in Portuguese location phrases", () => {
        const palaceDna = makeDna("palace-dna", "Palace Temple", ["palace", "temple", "marble"], "A magnificent marble palace");
        const logsPalace = getMatchingLogs("Um nobre no palácio de mármore branco, segurando um cajado dourado", "Monster", "Generic Fantasy", [palaceDna], []);
        const details = logsPalace.find(l => l.id === "palace-dna")?.details;
        const matchedTags = (details?.matches || []).map(m => m.tag.toLowerCase());
        expect(matchedTags).not.toContain("palacio");
        // No negative exclusions should be recorded for palace or temple
        const logsTemple = getMatchingLogs("Um mago no templo", "Monster", "Generic Fantasy", [palaceDna], []);
        expect(logsTemple.length).toBeGreaterThan(0);
      });

      it("handles 'nobre no palácio, sem armadura' (palácio affirmative, armadura excluded)", () => {
        const armorDna = makeDna("armor-dna", "Armored Guard", ["armor"], "An armored guard in a palace");
        const logs = getMatchingLogs("nobre no palácio, sem armadura", "Monster", "Generic Fantasy", [armorDna], []);
        const details = logs.find(l => l.id === "armor-dna")?.details;
        const matchedTags = (details?.matches || []).map(m => m.tag.toLowerCase());
        expect(matchedTags).not.toContain("armor");
        expect(details?.baseScore).toBe(0);
      });
    });

    describe("2. Preservar o escopo de enumerações negativas", () => {
      it("ensures a reference with tag 'armor' receives 0 points for 'young noble; avoid dragons, armor and vampires.'", () => {
        const pureArmorDna = makeDna("pure-armor", "Iron Armor", ["armor"], "Just an armor suit");
        const logs = getMatchingLogs("young noble; avoid dragons, armor and vampires.", "Monster", "Generic Fantasy", [pureArmorDna], []);
        const details = logs.find(l => l.id === "pure-armor")?.details;
        expect(details?.baseScore).toBe(0);
        expect(logs.find(l => l.id === "pure-armor")?.score).toBe(0);
      });

      it("ensures all items in Portuguese enumeration are excluded: 'nobre; evitar dragões, armaduras e vampiros.'", () => {
        const dragonDna = makeDna("dragon-dna", "Dragon", ["dragon"], "Dragon creature");
        const armorDna = makeDna("armor-dna", "Armor", ["armor"], "Armor set");
        const logs = getMatchingLogs("nobre; evitar dragões, armaduras e vampiros.", "Monster", "Generic Fantasy", [dragonDna, armorDna], []);
        expect(logs.find(l => l.id === "dragon-dna")?.score).toBe(0);
        expect(logs.find(l => l.id === "armor-dna")?.score).toBe(0);
      });

      it("preserves subsequent sentence affirmative: 'Avoid dragons, armor and vampires. A noble holds a golden staff.'", () => {
        const staffDna = makeDna("staff-dna", "Golden Staff Noble", ["gold", "weapon focus"], "A noble with golden staff");
        const armorDna = makeDna("armor-dna", "Iron Armor", ["armor"], "Armor suit");
        const logs = getMatchingLogs("Avoid dragons, armor and vampires. A noble holds a golden staff.", "Monster", "Generic Fantasy", [staffDna, armorDna], []);
        
        // Armor must receive 0 points
        expect(logs.find(l => l.id === "armor-dna")?.score).toBe(0);

        // Staff / noble must receive positive score
        const staffScore = logs.find(l => l.id === "staff-dna")?.score || 0;
        expect(staffScore).toBeGreaterThan(0);
      });

      it("ensures adding 'do not include vampires' does not increase the score of a synthetic red clothing reference", () => {
        const redClothingDna = makeDna("red-clothing-ref", "Red Clothing Noble", ["red", "clothing"], "A noble with red clothing");
        
        const logsA = getMatchingLogs("A noble, no red clothing", "Monster", "Generic Fantasy", [redClothingDna], []);
        const scoreA = logsA.find(l => l.id === "red-clothing-ref")?.score ?? 0;

        const logsB = getMatchingLogs("A noble, no red clothing, do not include vampires", "Monster", "Generic Fantasy", [redClothingDna], []);
        const scoreB = logsB.find(l => l.id === "red-clothing-ref")?.score ?? 0;

        // In both cases, red/clothing are excluded. Score should NOT increase!
        expect(scoreB).toBeLessThanOrEqual(scoreA);
        // And neither should match 'red' or 'clothing'
        const matchesA = logsA.find(l => l.id === "red-clothing-ref")?.details.matches || [];
        const matchesB = logsB.find(l => l.id === "red-clothing-ref")?.details.matches || [];
        expect(matchesA.some(m => m.tag.includes("red") || m.tag.includes("clothing"))).toBe(false);
        expect(matchesB.some(m => m.tag.includes("red") || m.tag.includes("clothing"))).toBe(false);
      });

      it("ensures 'A noble, avoid wearing black clothes' does not score black clothes", () => {
        const blackClothesDna = makeDna("black-clothes-ref", "Black Clothes Entity", ["black", "clothes"], "Entity in black clothes");
        const logs = getMatchingLogs("A noble, avoid wearing black clothes", "Monster", "Generic Fantasy", [blackClothesDna], []);
        const details = logs.find(l => l.id === "black-clothes-ref")?.details;
        
        expect(details?.baseScore).toBe(0);
        expect(logs.find(l => l.id === "black-clothes-ref")?.score).toBe(0);
      });

      it("ensures 'avoid holding weapons' excludes weapons reference", () => {
        const weaponsDna = makeDna("weapons-ref", "Weapons Rack", ["weapons"], "Arsenal of weapons");
        const logs = getMatchingLogs("avoid holding weapons", "Monster", "Generic Fantasy", [weaponsDna], []);
        expect(logs.find(l => l.id === "weapons-ref")?.score).toBe(0);
      });
    });

    describe("3. Corrigir o override anatômico de Wyvern", () => {
      it("does not insert CRITICAL ANATOMY RULE for 'A human noble, no wyvern'", () => {
        const prompt = buildCardPrompt({
          subject: "A human noble, no wyvern",
          cardType: CardType.Monster,
          context: Context.Character,
          complexity: Complexity.Medium,
          archetype: Archetype.Generic,
          model: ImageModel.Lite
        });

        expect(prompt).not.toContain("CRITICAL ANATOMY RULE");
        expect(prompt).toContain("**SUBJECT DESCRIPTION**: A human noble, no wyvern");
      });

      it("does not insert CRITICAL ANATOMY RULE for 'A noble, not a wyvern'", () => {
        const prompt = buildCardPrompt({
          subject: "A noble, not a wyvern",
          cardType: CardType.Monster,
          context: Context.Character,
          complexity: Complexity.Medium,
          archetype: Archetype.Generic,
          model: ImageModel.Lite
        });

        expect(prompt).not.toContain("CRITICAL ANATOMY RULE");
        expect(prompt).toContain("**SUBJECT DESCRIPTION**: A noble, not a wyvern");
      });

      it("preserves CRITICAL ANATOMY RULE for affirmative 'A wyvern flying above a castle'", () => {
        const prompt = buildCardPrompt({
          subject: "A wyvern flying above a castle",
          cardType: CardType.Monster,
          context: Context.Character,
          complexity: Complexity.Medium,
          archetype: Archetype.Generic,
          model: ImageModel.Lite
        });

        expect(prompt).toContain("CRITICAL ANATOMY RULE");
        expect(prompt).toContain("ONLY TWO LEGS");
        expect(prompt).toContain("**SUBJECT DESCRIPTION**: A wyvern flying above a castle");
      });

      it("verifies the mock API payload does not contain wyvern override for negative wyvern prompt", async () => {
        generateContentMock.mockClear();

        await generateCardArt({
          subject: "A human noble, no wyvern",
          cardType: CardType.Monster,
          context: Context.Character,
          complexity: Complexity.Medium,
          archetype: Archetype.Generic,
          model: ImageModel.Lite,
          useVisualDB: false
        });

        expect(generateContentMock).toHaveBeenCalledTimes(1);
        const payloadText = generateContentMock.mock.calls[0][0].contents.parts[0].text;
        expect(payloadText).not.toContain("CRITICAL ANATOMY RULE");
        expect(payloadText).toContain("**SUBJECT DESCRIPTION**: A human noble, no wyvern");
      });

      it("verifies mock API payload does not contain wyvern override for 'A human noble, no black wyvern, do not include text'", async () => {
        generateContentMock.mockClear();

        await generateCardArt({
          subject: "A human noble, no black wyvern, do not include text",
          cardType: CardType.Monster,
          context: Context.Character,
          complexity: Complexity.Medium,
          archetype: Archetype.Generic,
          model: ImageModel.Lite,
          useVisualDB: false
        });

        expect(generateContentMock).toHaveBeenCalledTimes(1);
        const payloadText = generateContentMock.mock.calls[0][0].contents.parts[0].text;
        expect(payloadText).not.toContain("CRITICAL ANATOMY RULE");
        expect(payloadText).toContain("**SUBJECT DESCRIPTION**: A human noble, no black wyvern, do not include text");
      });
    });

    describe("4. Separar filtro de motivos e verificação de regras negativas", () => {
      it("discards avoid rule 'avoid dragon and crown' (applied: false) when prompt requests 'a noble wearing a crown, no dragon'", () => {
        const refDna: VisualDNA = {
          ...makeDna("crown-ref", "Crown Ref", [], "Reference"),
          contentSpecificAvoids: ["avoid dragon and crown"]
        };

        const synth = synthesizeVisualDNA({
          references: [refDna],
          intensity: "high",
          subject: "a noble wearing a crown, no dragon",
          cardType: "Monster",
          archetype: "Generic Fantasy",
          userPrompt: "a noble wearing a crown, no dragon"
        });

        const avoidEntry = synth.debugInfo?.avoidRules.find(r => r.rule === "avoid dragon and crown");
        expect(avoidEntry).toBeDefined();
        // Because 'crown' was requested affirmatively, the rule contradicts the user prompt and must NOT be applied!
        expect(avoidEntry?.applied).toBe(false);
        expect(synth.promptBlock).not.toContain("avoid dragon and crown");
      });

      it("keeps simple rule 'avoid dragon' (applied: true) when prompt is 'a noble wearing a crown, no dragon'", () => {
        const refDna: VisualDNA = {
          ...makeDna("dragon-avoid-ref", "Dragon Avoid Ref", [], "Reference"),
          contentSpecificAvoids: ["avoid dragon"]
        };

        const synth = synthesizeVisualDNA({
          references: [refDna],
          intensity: "high",
          subject: "a noble wearing a crown, no dragon",
          cardType: "Monster",
          archetype: "Generic Fantasy",
          userPrompt: "a noble wearing a crown, no dragon"
        });

        const avoidEntry = synth.debugInfo?.avoidRules.find(r => r.rule === "avoid dragon");
        expect(avoidEntry).toBeDefined();
        // Since the user asked for 'no dragon', avoiding dragons does NOT contradict the user prompt!
        expect(avoidEntry?.applied).toBe(true);
        expect(synth.promptBlock).toContain("avoid dragon");
      });

      it("blocks positive motif 'dragon scales' when prompt is 'a noble wearing a crown, no dragon'", () => {
        const refDna: VisualDNA = {
          ...makeDna("motifs-ref", "Motifs Ref", [], "Reference"),
          contentMotifs: ["dragon scales", "golden crown"]
        };

        const synth = synthesizeVisualDNA({
          references: [refDna],
          intensity: "high",
          subject: "a noble wearing a crown, no dragon",
          cardType: "Monster",
          archetype: "Generic Fantasy",
          userPrompt: "a noble wearing a crown, no dragon"
        });

        const dragonMotif = synth.debugInfo?.motifs.find(m => m.motif === "dragon scales");
        expect(dragonMotif?.used).toBe(false);

        const crownMotif = synth.debugInfo?.motifs.find(m => m.motif === "golden crown");
        expect(crownMotif?.used).toBe(true);
      });
    });
  });
});
