import { GoogleGenAI, Type } from "@google/genai";
import { 
  CardGenerationRequest, 
  CardType, 
  Complexity, 
  Context, 
  Archetype, 
  ImageModel, 
  MatchingScoreLog, 
  GeneratedCard, 
  VisualDNA,
  SynthesisDebug
} from "../types";
import { getLocalDNA } from "./localDbService";
import { getAutomaticReferences, getMatchingLogs, resolveManualReferences, synthesizeVisualDNA } from "./visualDnaEngine";
import { parsePromptIntent } from "./promptParser";
import { normalizeVisualDNAAnalysis } from "./visualTags";
import { VISUAL_TAG_CATEGORIES, VISUAL_TAG_KEYWORDS } from "./visualTags";
import { ARCHETYPE_DEFINITIONS } from "../constants";
import { GRIMOIRE_SYSTEM_PROMPT } from "../constants";



export const VISUAL_DNA_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    linework: { type: Type.STRING },
    rendering: { type: Type.STRING },
    palette: { type: Type.STRING },
    silhouette: { type: Type.STRING },
    pose: { type: Type.STRING },
    framing: { type: Type.STRING },
    composition: { type: Type.STRING },
    lighting: { type: Type.STRING },
    effects: { type: Type.STRING },
    materials: { type: Type.STRING },
    details: { type: Type.STRING },
    background: { type: Type.STRING },
    hierarchy: { type: Type.STRING },
    positivePrompt: { type: Type.STRING },
    negativePrompt: { type: Type.STRING },
    visualMotifs: { type: Type.STRING },
    shapeLanguage: { type: Type.STRING },
    focalAnchors: { type: Type.STRING },
    detailPlacement: { type: Type.STRING },
    compositionRecipe: { type: Type.STRING },
    paletteLogic: { type: Type.STRING },
    materialBehavior: { type: Type.STRING },
    energyDesign: { type: Type.STRING },
    styleAnchors: { type: Type.STRING },
    avoidRules: { type: Type.STRING },
    stylePromptFragments: { type: Type.ARRAY, items: { type: Type.STRING } },
    contentMotifs: { type: Type.ARRAY, items: { type: Type.STRING } },
    identitySpecificDetails: { type: Type.ARRAY, items: { type: Type.STRING } },
    universalQualityAvoids: { type: Type.ARRAY, items: { type: Type.STRING } },
    styleSpecificAvoids: { type: Type.ARRAY, items: { type: Type.STRING } },
    contentSpecificAvoids: { type: Type.ARRAY, items: { type: Type.STRING } },
    analysisVersion: { type: Type.NUMBER },
    analysisStatus: { type: Type.STRING, enum: ["complete", "partial", "legacy"] },
    subjectProfile: {
      type: Type.OBJECT,
      properties: {
        primarySubject: { type: Type.STRING },
        subjectCategory: { type: Type.STRING },
        visualRole: { type: Type.STRING }
      },
      required: ["primarySubject", "subjectCategory", "visualRole"]
    },
    scaleProfile: {
      type: Type.OBJECT,
      properties: {
        physicalScale: { 
          type: Type.STRING, 
          enum: ["tiny", "small creature", "human scale", "large creature", "giant", "colossal", "titanic", "cosmic scale"] 
        },
        scaleForms: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: 2 },
        scaleCues: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: 3 },
        perceivedPresence: { 
          type: Type.STRING,
          enum: ["intimate presence", "balanced presence", "dominant presence", "monumental presence", "overwhelming presence"]
        },
        evidence: { type: Type.STRING },
        confidence: { type: Type.NUMBER }
      }
    },
    substanceProfile: {
      type: Type.OBJECT,
      properties: {
        materials: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: 4 },
        surfaces: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: 4 },
        elements: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: 2 },
        elementApplications: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: 3 },
        evidence: { type: Type.STRING },
        confidence: { type: Type.NUMBER }
      }
    },
    subjects: {
      type: Type.ARRAY,
      maxItems: 4,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          visualRole: { type: Type.STRING, enum: ["primary", "secondary", "supporting"] },
          physicalScale: { type: Type.STRING },
          perceivedPresence: { type: Type.STRING },
          materials: { type: Type.ARRAY, items: { type: Type.STRING } },
          surfaces: { type: Type.ARRAY, items: { type: Type.STRING } },
          elements: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["id", "description", "category", "visualRole", "physicalScale"]
      }
    },
    scaleRelationships: {
      type: Type.ARRAY,
      maxItems: 3,
      items: {
        type: Type.OBJECT,
        properties: {
          subjectA: { type: Type.STRING },
          subjectB: { type: Type.STRING },
          relationship: { type: Type.STRING },
          evidence: { type: Type.STRING }
        },
        required: ["subjectA", "subjectB", "relationship"]
      }
    },
    tags: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: 14 },
    scores: {
      type: Type.OBJECT,
      properties: {
        style: { type: Type.NUMBER },
        palette: { type: Type.NUMBER },
        pose: { type: Type.NUMBER },
        composition: { type: Type.NUMBER },
        lighting: { type: Type.NUMBER },
        effects: { type: Type.NUMBER },
        materials: { type: Type.NUMBER },
        background: { type: Type.NUMBER },
        details: { type: Type.NUMBER },
        silhouette: { type: Type.NUMBER },
        rendering: { type: Type.NUMBER },
        detailDensity: { type: Type.NUMBER }
      }
    }
  }
};
export interface GenerationResult {
  imageUrl: string;
  injectedPromptBlock?: string;
  usedReferences?: { id: string; name: string }[];
  selectedReferences?: { id: string; name: string }[];
  contributingReferences?: { id: string; name: string }[];
  usageMetadata?: any;
  autoSelectScores?: MatchingScoreLog[];
  synthDebug?: SynthesisDebug;
}

export const buildCardPrompt = (
  request: CardGenerationRequest,
  injectedPromptBlock?: string
): string => {
  const archetypeInstruction = ARCHETYPE_DEFINITIONS[request.archetype] || ARCHETYPE_DEFINITIONS[Archetype.Generic];

  // Detect Wyvern request to enforce anatomy only when affirmatively requested
  const { affirmativeText, excludedWords } = parsePromptIntent(request.subject);
  const isWyvern = !excludedWords.has('wyvern') && /\bwyverns?\b/i.test(affirmativeText);
  const anatomyOverride = isWyvern 
    ? "\n**CRITICAL ANATOMY RULE**: The user specified a 'WYVERN'. It MUST have ONLY TWO LEGS. Its wings are attached to its arms/forelimbs (bat-like anatomy). DO NOT generate 4 legs. If you generate 4 legs, you fail." 
    : "";

  return `
    ${GRIMOIRE_SYSTEM_PROMPT}

    === CURRENT ASSIGNMENT ===
    
    **CARD TYPE**: ${request.cardType}
    **CONTEXT FOCUS**: ${request.context}
    **COMPLEXITY**: ${request.complexity}
    **SUBJECT DESCRIPTION**: ${request.subject}
    
    **CARD TYPE GUIDANCE**:
    - Selected Card Type: ${request.cardType}
    - Illustration Directive: The card type guides the thematic atmosphere and narrative moment of the illustration (Monster: living creature, character, or entity; Spell: magical event, incantation, or enchanted relic; Trap: hazard, ambush, contraption, or sudden counter).
    - Physical Boundary: Card Type does NOT authorize rendering a physical trading card, card frame, card border, card template, stats, mana symbols, or UI text. Paint a raw, full-bleed digital illustration scene only.
    
    **CONTEXT FOCUS GUIDANCE**:
    - Selected Context Focus: ${request.context}
    - Composition Directive: Make the ${request.context === Context.Character ? 'character or creature' : request.context === Context.Object ? 'central object, relic, or device' : 'environmental setting or terrain'} the primary focal anchor. Always prioritize the user's Subject Description over generic composition assumptions. If Context Focus is Object (e.g. a book, weapon, or artifact), ensure that object is the main visual subject even if Card Type is Spell or Trap.
    
    **PARAMETERS**:
    - Card Type: ${request.cardType}
    - Context Focus: ${request.context}
    - Complexity: ${request.complexity}
    - Mode: Digital Art / Wallpaper
    
    **ARCHETYPE INSTRUCTION**:
    ${archetypeInstruction}

    ${anatomyOverride}

    ${injectedPromptBlock ? `
    === VISUAL DNA DIRECTION (INJECTED STYLE FROM DATABASE REFERENCE) ===
    ${injectedPromptBlock}
    ` : ""}

    ${request.referenceImage ? "**IMAGE REFERENCE**: An image has been provided as an abstract visual reference. You MUST use this image as a conceptual guide for composition, pose, palette, lighting, and materials. Do NOT copy the specific characters, exact costumes, logos, symbols, text, watermark, layout, or identifiable branding. Strictly adapt the general artistic principles of the reference image to create a brand-new illustration that matches the selected ARCHETYPE." : ""}

    **FINAL RENDERING CHECK**:
    - **ZOOM IN**: Ensure the subject occupies the majority of the frame. 
    - **FULL BLEED**: Paint to the absolute edge of the canvas. 
    - **NO WHITE BORDERS**: The image must NOT have a white or black border.
    - **NO CARD ELEMENTS**: Do not draw the card itself. Draw the scene.
  `;
};

export const generateCardArt = async (request: CardGenerationRequest): Promise<GenerationResult> => {
  // Always create a new instance to pick up the latest selected key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  let injectedPromptBlock = "";
  let usedReferences: { id: string; name: string }[] = [];
  let selectedReferences: { id: string; name: string }[] = [];
  let contributingReferences: { id: string; name: string }[] = [];
  let autoSelectScores: MatchingScoreLog[] = [];
  let synthDebug: SynthesisDebug | undefined;

  if (request.useVisualDB) {
    try {
      const allDna = await getLocalDNA();
      let matchedRefs: VisualDNA[] = [];
      
      if (request.dbAutoSelect) {
        matchedRefs = getAutomaticReferences(request.subject, request.cardType, request.archetype, allDna, request.dbMaxReferences || 3);
      } else if (request.dbManualReferenceIds && request.dbManualReferenceIds.length > 0) {
        matchedRefs = resolveManualReferences(request.dbManualReferenceIds, allDna, request.dbMaxReferences || 3);
      }
      
      const maxRefs = request.dbMaxReferences || 3;
      const limitedRefs = matchedRefs.slice(0, maxRefs);
      
      if (request.dbAutoSelect && allDna.length > 0) {
        const selectedIds = limitedRefs.map(r => r.id);
        autoSelectScores = getMatchingLogs(request.subject, request.cardType, request.archetype, allDna, selectedIds, maxRefs);
      }
      
      if (limitedRefs.length > 0) {
        const archetypeInstruction = ARCHETYPE_DEFINITIONS[request.archetype] || ARCHETYPE_DEFINITIONS[Archetype.Generic];
        const synth = synthesizeVisualDNA({
          references: limitedRefs,
          intensity: request.dbIntensity || 'medium',
          subject: request.subject,
          cardType: request.cardType,
          archetype: request.archetype,
          userPrompt: request.subject,
          context: request.context,
          complexity: request.complexity,
          archetypePreset: archetypeInstruction
        });
        injectedPromptBlock = synth.promptBlock;
        usedReferences = synth.usedReferences;
        selectedReferences = synth.selectedReferences;
        contributingReferences = synth.contributingReferences;
        synthDebug = synth.debugInfo || undefined;
      }
    } catch (dbErr) {
      console.error("Error fetching or synthesizing visual DNA:", dbErr);
    }
  }

  const fullPrompt = buildCardPrompt(request, injectedPromptBlock);

  // Define image configuration based on the model
  const imageConfig: any = {
    aspectRatio: "3:4", // Typical card ratio
  };

  // Gemini 3.1 flash image configuration handle
  if (request.model === ImageModel.Pro) {
    // Other config if necessary
  }

  try {
    const parts: any[] = [];
    
    // Add reference image if provided
    if (request.referenceImage) {
        // Handle data URL by extracting base64 data and mime type
        let base64Data = request.referenceImage;
        let mimeType = 'image/png';
        
        if (request.referenceImage.startsWith('data:')) {
            const matches = request.referenceImage.match(/^data:(.+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mimeType = matches[1];
                base64Data = matches[2];
            }
        }
        
        parts.push({
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        });
    }
    
    // Add text prompt
    parts.push({ text: fullPrompt });

    
const response = await ai.models.generateContent({
      model: request.model,
      contents: {
        parts: parts,
      },
      config: {
        imageConfig: imageConfig,
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new GeminiOperationError("No candidates returned from Gemini.", response.usageMetadata, "Generate Card Art");
    }

    const content = response.candidates[0].content;
    const usageMetadata = response.usageMetadata;
    
    // Find image part
    if (content.parts) {
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          return {
            imageUrl: `data:${mimeType};base64,${base64Data}`,
            injectedPromptBlock,
            usedReferences,
            selectedReferences,
            contributingReferences,
            usageMetadata,
            autoSelectScores,
            synthDebug
          };
        }
      }
    }
    
    throw new GeminiOperationError("No image data found in response.", usageMetadata, "Generate Card Art");

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};


export class GeminiOperationError extends Error {
  public usageMetadata?: any;
  public operationType?: string;
  public model?: string;
  public rawResponseText?: string;
  public causeType?: string;
  constructor(message: string, usageMetadata?: any, operationType?: string, model?: string, rawResponseText?: string, causeType?: string) {
    super(message);
    this.name = "GeminiOperationError";
    this.usageMetadata = usageMetadata;
    this.operationType = operationType;
    this.model = model;
    this.rawResponseText = rawResponseText;
    this.causeType = causeType;
  }
}
export const analyzeReferenceImage = async (
  base64Image: string,
  fileName: string,
  modelName: string = "gemini-3.5-flash"
): Promise<{ data: Partial<VisualDNA>, usageMetadata?: any }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let base64Data = base64Image;
  let mimeType = 'image/png';
  
  if (base64Image.startsWith('data:')) {
    const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Data = matches[2];
    }
  }

  const tagsListBySection = Object.entries(VISUAL_TAG_CATEGORIES).map(([category, tags]) => {
    return `### Category: ${category}\n` + (tags as string[]).map(t => `- "${t}"`).join("\n");
  }).join("\n\n");

  const analysisPrompt = `
You are an expert digital art analyzer specializing in modern high-end anime-style trading card games (TCGs) with a dense, highly polished visual style akin to modern Japanese OCG (Yu-Gi-Oh-like) card illustrations.
Analyze the provided reference image and extract its stylistic "Visual DNA".
Do NOT focus on the specific character's identity, logos, card layout, borders, text, or exact trademarks. Focus purely on abstract artistic design principles so that we can replicate this visual quality, style, and finish in future generations of different subjects.

**CRITICAL RULE FOR SPECIFICITY**:
Mantenha termos gerais de direção artística quando eles forem importantes para preservar o estilo desejado, como 'modern anime-style TCG illustration', 'high-detail card art', 'polished digital anime rendering' e 'non-realistic fantasy illustration'. Porém, esses termos nunca devem aparecer sozinhos. Sempre complemente com detalhes concretos observáveis da imagem: formas, silhueta, materiais, paleta, iluminação, composição, partículas, pontos focais e distribuição de detalhes.

***MANDATORY 10-STEP INTERNAL INSPECTION ENGINE***
Before generating any final JSON values, perform this strict, 10-step analysis inside your neural layers:
1. IDENTIFICATION OF SUBJECT: Analyze the entity. Identify its exact role strictly.
2. MULTIPLE SUBJECTS (if applicable): If there are multiple prominent subjects (e.g., a knight and a dragon), describe each one's materials, scales, and role.
3. SHAPE, ANATOMY, AND SILHOUETTE: Deconstruct the outlines, wings, horns, armor.
4. PHYSICAL SCALE & PERCEIVED PRESENCE: Map physical scale, scale forms, scale cues, and perceived presence.
5. PHYSICAL MATERIAL: Identify what the entity/equipment is made of.
6. SURFACE, FINISH, & TEXTURE: Note polished, glossy, luminous, weathered, etc.
7. ELEMENT & APPLICATION: Identify natural element forces AND their application.
8. COMPOSITION & CAMERA: Deconstruct camera angles, framing, visual flow.
9. LIGHTING & PALETTE: Trace light sources, color temperature.
10. RENDERING & ART STYLE: Evaluate lineart, cell shading, digital painting.

ALLOWED TAGS LIST (Choose ONLY from this taxonomy list for the 'tags' array. Pick between 6 to 14 tags in total):

${tagsListBySection}

CRITICAL RULES FOR TAGGING:
1. Return ONLY tags that are present in the ALLOWED TAGS LIST taxonomy above. DO NOT invent or use other tags.
2. Select between 6 and 14 tags in total.
3. Omit entire categories if they do not apply to the image (e.g., if there are no elemental features, do not select any element tags).
4. Prioritize SPECIFICITY and precision rather than just filling up the maximum limit.
5. DO NOT infer materials, elements, or scale based on lore or assumed character identities; tag ONLY observable visual features present in the image.
6. Distinguish clearly between:
   - "Material" (what the objects are made of, e.g. "crystal", "metal").
   - "Surface / Finish" (how the material is rendered, e.g. "polished", "cracked").
   - "Element" (the natural element force present, e.g. "fire", "lightning").
   - "Element Application" (how that element is applied, e.g. "weapon infusion", "aura").
7. Distinguish physical scale (how large the creature or object is in physical dimensions, e.g. "giant") from perceived presence (how imposing, close-up, or intimate the subject feels in the composition, e.g. "dominant presence"). A human scale warrior can have a "dominant presence", while a gigantic mountain monster can be framed far away with a "landscape comparison".
8. Do not use contradictory tags without clear visual justification.

RECOMMENDED LIMITS PER CATEGORY (Do not exceed these):
- Core / Existing Tags: up to 5 tags
- Physical Scale: max 1 tag
- Scale Form: up to 2 tags
- Scale Cues: up to 3 tags
- Perceived Presence: max 1 tag
- Materials: up to 4 tags
- Surface / Finish: up to 4 tags
- Elements: up to 2 tags
- Element Application: up to 3 tags
- Overall Total Max: 14 tags

CRITICAL: Return ONLY valid JSON. Do NOT wrap in markdown code blocks like \`\`\`json \`\`\`. Start directly with { and end with }. Make sure everything is escaped properly.
  `;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        { text: analysisPrompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: VISUAL_DNA_RESPONSE_SCHEMA
    }
  });

  if (!response.text) {
    throw new GeminiOperationError("Failed to receive analysis from Gemini.", response.usageMetadata, "Analyze Reference Image");
  }

  try {
    const rawText = response.text.trim();
    const cleanJson = rawText.startsWith("```") 
      ? rawText.replace(/^```json\s*/, "").replace(/```$/, "").trim()
      : rawText;
    const parsed = normalizeVisualDNAAnalysis(JSON.parse(cleanJson));
    return { data: parsed, usageMetadata: response.usageMetadata };
  } catch (err) {
    console.error("JSON Parsing Error from Gemini analysis output:", response.text, err);
    throw new GeminiOperationError("Failed to parse visual DNA analysis JSON.", response.usageMetadata, "Analyze Reference Image");
  }
};
export const extractUsageFromError = (error: any) => {
  if (error && error.usageMetadata) return error.usageMetadata;
  if (error && error.cause && error.cause.usageMetadata) return error.cause.usageMetadata;
  return undefined;
};

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export const checkApiKey = async (): Promise<boolean> => {
  if (localStorage.getItem("apiKeyDisconnected") === "true") {
    return false;
  }
  if (typeof window !== 'undefined' && window.aistudio) {
    return await window.aistudio.hasSelectedApiKey();
  }
  return localStorage.getItem("apiKeyConnected") === "true";
};

export const promptApiKeySelection = async (): Promise<void> => {
  localStorage.removeItem("apiKeyDisconnected");
  if (typeof window !== 'undefined' && window.aistudio) {
    await window.aistudio.openSelectKey();
    return;
  }
  localStorage.setItem("apiKeyConnected", "true");
  return;
};

export const disconnectApiKey = async (): Promise<void> => {
  localStorage.setItem("apiKeyDisconnected", "true");
  // Try to call clearSelectedApiKey if it exists, otherwise just clear local storage
  if (typeof window !== 'undefined' && window.aistudio && 'clearSelectedApiKey' in window.aistudio) {
    try {
      await (window.aistudio as any).clearSelectedApiKey();
    } catch(e) {}
  }
  localStorage.removeItem("apiKeyConnected");
  return;
};

export const mapUsageMetadata = (usageMetadata: any) => ({
  promptTokenCount: usageMetadata?.promptTokenCount || 0,
  candidatesTokenCount: usageMetadata?.candidatesTokenCount || 0,
  thoughtsTokenCount: usageMetadata?.thoughtsTokenCount || 0,
  totalTokenCount: usageMetadata?.totalTokenCount || 0,
  cachedContentTokenCount: usageMetadata?.cachedContentTokenCount || 0,
  toolUsePromptTokenCount: usageMetadata?.toolUsePromptTokenCount || 0,
  rawUsageMetadata: usageMetadata || null
});
