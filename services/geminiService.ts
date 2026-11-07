import { createGeminiClient, hasHostRuntimeCredential } from "./geminiTransport";
import { isClaudeModel } from "./analysisSlots";
import { requestClaudeAnalysis } from "./claudeAnalysis";
import { AccessMode, AccessPolicyState, resolveAccessPolicy, validateModelAccess } from "./accessPolicy";
export type { AccessMode, AccessPolicyState };
export { resolveAccessPolicy, validateModelAccess };
import { Type } from "@google/genai";
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
  SynthesisDebug,
  VisualDNAPatch
} from "../types";
import { getLocalDNA } from "./localDbService";
import { captureDnaOperationContext, assertDnaOperationContext } from './dnaAccountContext';
import { getAutomaticReferences, getMatchingLogs, resolveManualReferences, synthesizeVisualDNA } from "./visualDnaEngine";
import { parsePromptIntent } from "./promptParser";
import { 
  normalizeVisualDNAAnalysis, 
  validateVisualDNAScores, 
  validateAnalysisCompleteness,
  createVisualDNAPatch 
} from "./visualTags";
import { AFFINITY_ARCHETYPES, VISUAL_TAG_CATEGORIES } from "./visualTags";
import { ARCHETYPE_DEFINITIONS, ARCHETYPE_STYLE_SUMMARIES, GRIMOIRE_SYSTEM_PROMPT } from "../constants";

// A slow reasoning model can take minutes, but a hung request must not hold a queue slot forever.
const ANALYSIS_TIMEOUT_MS = 5 * 60_000;

const TRANSFERABLE = "Transferable technique for a different subject: never name the depicted subject, anatomy, garments, weapons, concrete materials, places or lore. Empty string if absent.";
const SUBJECT_CATEGORIES = ["humanoid", "creature", "dragon", "undead", "machine", "object", "weapon", "environment", "architecture", "phenomenon"];



export const VISUAL_DNA_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "Dense visual summary of overall aesthetic and presentation." },
    linework: { type: Type.STRING, description: `${TRANSFERABLE} Line quality: weight variation, taper, hard vs soft contours, contour color logic.` },
    rendering: { type: Type.STRING, description: `${TRANSFERABLE} Shading and volume: cell-shading vs gradient transitions, edge control, occlusion, highlight treatment.` },
    palette: { type: Type.STRING, description: "Concrete color description: dominant hues, accents, light/shadow balance, color temperature." },
    silhouette: { type: Type.STRING, description: "Overall shape readability, external contours, visual mass." },
    pose: { type: Type.STRING, description: `${TRANSFERABLE} Gesture: line of action, weight distribution, tension and rhythm of the focal subject.` },
    framing: { type: Type.STRING, description: "Camera distance, focal length, angle (e.g. low-angle worm's-eye, dutch angle)." },
    composition: { type: Type.STRING, description: "Visual flow, balance of masses, overlapping, leading lines, negative space." },
    lighting: { type: Type.STRING, description: `${TRANSFERABLE} Light direction, key and fill relationship, rim light, contrast and falloff.` },
    effects: { type: Type.STRING, description: "Energy, particles, magical bursts, elemental phenomena, speed lines." },
    materials: { type: Type.STRING, description: "Visual cues used to convey materials with proper uncertainty (e.g. gold-like metallic sheen, translucent surface)." },
    details: { type: Type.STRING, description: "Where detail is concentrated (focal points) vs where it is simplified or quiet." },
    background: { type: Type.STRING, description: `${TRANSFERABLE} Background treatment: depth layers, value range, level of detail, degree of abstraction.` },
    hierarchy: { type: Type.STRING, description: "Focal hierarchy: what catches the eye first, second, third." },
    positivePrompt: { type: Type.STRING, description: "Descriptive scene summary capturing keywords for search indexing (not a universal style directive)." },
    negativePrompt: { type: Type.STRING, description: "Artifacts and flaws to avoid, without contradicting observed techniques." },
    visualMotifs: { type: Type.STRING, description: "General visual motifs and symbolic shapes (e.g. winged warrior, rotary weapon)." },
    shapeLanguage: { type: Type.STRING, description: `${TRANSFERABLE} Dominant geometric language (e.g. aggressive angular chevrons, flowing organic curves).` },
    focalAnchors: { type: Type.STRING, description: `${TRANSFERABLE} How the gaze is guided to the focal point (contrast, saturation, detail, converging shapes).` },
    detailPlacement: { type: Type.STRING, description: `${TRANSFERABLE} Distribution of high-density micro-details vs quiet zones.` },
    compositionRecipe: { type: Type.STRING, description: `${TRANSFERABLE} Reusable structural recipe (e.g. strong diagonal flow balanced by an opposing mass).` },
    paletteLogic: { type: Type.STRING, description: `${TRANSFERABLE} Color relationships without hue names: warm vs cool, saturation and value structure, accent discipline.` },
    materialBehavior: { type: Type.STRING, description: `${TRANSFERABLE} How surface types react to light (e.g. hard-edged glints on reflective surfaces, soft dispersion on matte ones).` },
    energyDesign: { type: Type.STRING, description: `${TRANSFERABLE} Shape, rhythm and density of glow or particle effects.` },
    styleAnchors: { type: Type.STRING, description: `${TRANSFERABLE} The signature techniques of this art, separated by semicolons.` },
    avoidRules: { type: Type.STRING, description: "Avoidance guidelines that do not forbid observed techniques or universal absence." },
    stylePromptFragments: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: `${TRANSFERABLE} 5 to 8 self-contained techniques of 4 to 14 words each (e.g. 'variable-weight linework with finer contours in illuminated areas').`
    },
    contentMotifs: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "General conceptual motifs observed (e.g. 'winged humanoid', 'heavy rotary cannon', 'lightning arcs'). Conditional, not universal."
    },
    identitySpecificDetails: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Specific observable configurations that must NOT be replicated on different subjects (e.g. 'specific avian crest on helm', 'cluster of cylindrical glowing vials'). Do not list generic words like 'metal' or 'wings'."
    },
    universalQualityAvoids: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Universal quality defects to avoid (e.g. 'muddled colors', 'blurry contours', 'anatomical distortion')."
    },
    styleSpecificAvoids: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Style contradictions to avoid (e.g. if art has sharp cel shading, avoid 'muddy airbrush shading')."
    },
    contentSpecificAvoids: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Content-specific identity traits to avoid when adapting to new subjects."
    },
    archetypeAffinity: {
      type: Type.ARRAY,
      maxItems: 3,
      items: { type: Type.STRING, enum: AFFINITY_ARCHETYPES },
      description: "Up to 3 archetypes whose visual style this art fits. Judge the style, not the subject. Empty when none fits well."
    },
    subjectProfile: {
      type: Type.OBJECT,
      properties: {
        primarySubject: { type: Type.STRING },
        subjectCategory: { type: Type.STRING, enum: SUBJECT_CATEGORIES },
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
          category: { type: Type.STRING, enum: SUBJECT_CATEGORIES },
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
      description: "Utility matrix scores in inclusive range [0.0, 1.0] (decimals like 0.0, 0.40, 0.75, 1.0). Represents reusable visual guidance for that dimension. NOT beauty score.",
      properties: {
        style: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for overall stylistic cohesion." },
        palette: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for color harmony and lighting/shadow palette balance." },
        pose: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for gesture, motion, and pose dynamics." },
        composition: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for staging, visual flow, mass balance, negative space." },
        lighting: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for light direction, rim lights, reflections, ambient occlusion." },
        effects: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for energy, particles, magic burst rhythm." },
        materials: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for surface textures and material rendering." },
        background: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for background staging, depth, or clean staging." },
        details: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for focal detail execution and hierarchy." },
        silhouette: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for silhouette readability and contour design." },
        rendering: { type: Type.NUMBER, description: "Utility 0.0-1.0: clear guidance for volume rendering, shading transitions, and edge control." },
        detailDensity: { type: Type.NUMBER, description: "Descriptor of visual detail density from 0.0 (minimal/flat) to 1.0 (hyper-dense micro-details). NOT utility or quality." }
      },
      required: ["style", "palette", "pose", "composition", "lighting", "effects", "materials", "background", "details", "silhouette", "rendering", "detailDensity"]
    },
    scoreJustifications: {
      type: Type.OBJECT,
      description: "Short 1-sentence visible evidence justifying the score for each dimension. Do not use generic buzzwords.",
      properties: {
        rendering: { type: Type.STRING },
        composition: { type: Type.STRING },
        palette: { type: Type.STRING },
        lighting: { type: Type.STRING },
        materials: { type: Type.STRING },
        background: { type: Type.STRING },
        effects: { type: Type.STRING },
        details: { type: Type.STRING },
        pose: { type: Type.STRING },
        silhouette: { type: Type.STRING },
        style: { type: Type.STRING }
      }
    }
  },
  required: [
    "summary", "linework", "rendering", "palette", "pose", "lighting", "background", "shapeLanguage",
    "focalAnchors", "detailPlacement", "compositionRecipe", "paletteLogic", "materialBehavior", "energyDesign",
    "stylePromptFragments", "contentMotifs", "identitySpecificDetails", "universalQualityAvoids",
    "styleSpecificAvoids", "archetypeAffinity", "subjectProfile", "tags", "scores"
  ]
};

export interface GenerationResult {
  imageUrl: string;
  visualDbStatus?: GeneratedCard['visualDbStatus'];
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

export const generateCardArt = async (
  request: CardGenerationRequest,
  onRequest?: (attempted?: boolean) => void,
  lockedMode?: AccessMode
): Promise<GenerationResult> => {
  // Always create a new instance to pick up the latest selected key and access policy
  const ai = createGeminiClient(onRequest, lockedMode);

  let injectedPromptBlock = "";
  let usedReferences: { id: string; name: string }[] = [];
  let selectedReferences: { id: string; name: string }[] = [];
  let contributingReferences: { id: string; name: string }[] = [];
  let autoSelectScores: MatchingScoreLog[] = [];
  let synthDebug: SynthesisDebug | undefined;
  let visualDbStatus: GeneratedCard['visualDbStatus'] = request.useVisualDB ? 'no-selection' : 'disabled';
  const context = captureDnaOperationContext();

  if (request.useVisualDB) {
    try {
      const allDna = await getLocalDNA(context.ownerId);
      assertDnaOperationContext(context);
      if (allDna.length === 0) visualDbStatus = 'empty';
      let matchedRefs: VisualDNA[] = [];
      
      if (request.dbAutoSelect) {
        matchedRefs = getAutomaticReferences(request.subject, request.cardType, request.archetype, allDna, request.dbMaxReferences || 3, request.context);
      } else if (request.dbManualReferenceIds && request.dbManualReferenceIds.length > 0) {
        matchedRefs = resolveManualReferences(request.dbManualReferenceIds, allDna, request.dbMaxReferences || 3);
      }
      
      const maxRefs = request.dbMaxReferences || 3;
      const limitedRefs = matchedRefs.slice(0, maxRefs);
      
      if (request.dbAutoSelect && allDna.length > 0) {
        const selectedIds = limitedRefs.map(r => r.id);
        autoSelectScores = getMatchingLogs(request.subject, request.cardType, request.archetype, allDna, selectedIds, maxRefs, request.context);
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
        visualDbStatus = contributingReferences.length ? 'contributing' : 'filtered';
        synthDebug = synth.debugInfo || undefined;
      }
    } catch (dbErr) {
      throw new Error("Artstyle Database indisponível. Corrija a leitura local ou desative seu uso explicitamente antes de gerar.", { cause: dbErr });
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
    if (content?.parts) {
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          return {
            imageUrl: `data:${mimeType};base64,${base64Data}`,
            visualDbStatus,
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
  modelName: string = "gemini-4-argon",
  onRequest?: (attempted?: boolean) => void,
  lockedMode?: AccessMode
): Promise<{ data: Partial<VisualDNA>; patch?: VisualDNAPatch; usageMetadata?: any; servedModel?: string }> => {
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

  const archetypeList = Object.entries(ARCHETYPE_STYLE_SUMMARIES).map(([name, style]) => `- "${name}": ${style}`).join("\n");

  const analysisPrompt = `
You are an expert digital art analyzer specializing in trading card game (TCG) illustrations with deep stylistic nuance across both dense Japanese OCG (Yu-Gi-Oh-like) digital styles and diverse illustrative aesthetics.
Analyze the provided reference image and extract its stylistic "Visual DNA".
Do NOT focus on character identity, logos, card frames, borders, text, or trademarks. Focus on abstract artistic design principles and concrete observable techniques so that we can replicate the visual finish in future generations of completely different subjects.
Write every text value in English.

======================================================================
1. UTILITY MATRIX CONTRACT & CALIBRATION RUBRIC (0.0 to 1.0)
======================================================================
A utility score answers: how much clear visual evidence and reusable guidance does this reference offer for this artistic dimension?

They are NOT:
- A score of beauty or overall quality of the image.
- A probability that future generations will turn out well.
- Relevance to an unknown future prompt.
- Statistical model confidence.

RUBRIC FOR UTILITY SCORES:
- 0.0: Dimension is absent or provides no usable artistic guidance.
- 0.25: Limited or ambiguous visual evidence.
- 0.50: Usable example, but standard or uninformative.
- 0.75: Clear, instructive, and highly reusable example.
- 0.90: Especially clear, well-supported, and exemplary contribution.
- 1.0: Masterclass benchmark exemplar with explicit evidence.

EXPECTED DISTRIBUTION: these scores decide which reference supplies each technique, so they only help if they differ. Across a large library most scores belong between 0.35 and 0.75, and an image is usually strong in a few dimensions and ordinary in the others. Reserve 0.9 and above for the rare dimension that truly stands out.

CRITICAL CONTRACT RULES FOR SCORES:
1. Every score MUST be a finite decimal number in the inclusive range [0.0, 1.0] (e.g. 0.0, 0.40, 0.75, 1.0). Both 0.0 and 1.0 are valid boundary values.
2. NEVER output percentages or integers like 85, 90, or 100.
3. Do NOT artificially randomize scores, and do not force artificial equality or inequality.
4. Evaluate each dimension independently based on clear visual evidence. Provide specific visible evidence in 'scoreJustifications' for each evaluated dimension. Do NOT arbitrarily lower or raise scores.
5. Simplicity is not low utility: a simple or minimalist background can be an excellent 0.80+ reference for visual separation, clean hierarchy, and graphic negative space.
6. 'detailDensity' is a DESCRIPTOR of visual detail concentration from 0.0 (minimal/flat/spartan) to 1.0 (hyper-dense micro-details). It is NOT a score of utility or beauty!
7. In 'scoreJustifications', provide a concise 1-sentence explanation citing visible evidence for each evaluated dimension. Do NOT repeat generic praise like "high quality" or "highly detailed".

======================================================================
2. TWO KINDS OF FIELDS: DESCRIPTION AND TRANSFERABLE TECHNIQUE
======================================================================
Never confuse the subject depicted with the technique used to depict it!

DESCRIPTION fields say what is in this image, faithfully. Do NOT erase content from them:
summary, positivePrompt, palette, silhouette, framing, composition, effects, materials, details, hierarchy, visualMotifs, subjectProfile, subjects, contentMotifs, identitySpecificDetails.
- 'contentMotifs': General conceptual motifs (e.g. 'winged humanoid', 'heavy rotary cannon', 'electrical discharge arcs'). These are conditional motifs, NOT universal style rules.
- 'identitySpecificDetails': Specific unique configurations that must NOT be replicated on other subjects (e.g. 'specific avian crest on helm', 'cluster of cylindrical glowing vials', 'unique heraldic crest'). Do NOT classify generic words like 'metal', 'wings', 'blue', or 'armor' as forbidden identities.
- 'positivePrompt': A descriptive scene summary to aid semantic search indexing, NOT a universal style mandate.

TRANSFERABLE TECHNIQUE fields will be pasted into the prompt of a NEW illustration of a completely different subject:
linework, rendering, lighting, pose, background, shapeLanguage, focalAnchors, detailPlacement, compositionRecipe, paletteLogic, materialBehavior, energyDesign, styleAnchors, stylePromptFragments.
Rules for every transferable field:
- Never name the depicted subject, creature type, anatomy or body parts, garments, armor, weapons, concrete materials, places, or lore. Say "the focal subject", "reflective surfaces", "translucent forms", "the outer contour", "large sweeping curves".
- Do not name hues. Describe color through relationships: warm vs cool, saturated vs muted, value contrast.
- Write as guidance an illustrator could apply to anything: one sentence of at most 25 words, specific enough to tell this art apart from a generic anime illustration.
- Use an empty string when the technique is absent from the image (for example, energyDesign in an art without glow or particles).

Wrong -> Right:
- "Hard-edged glints on the gold armor" -> "Hard-edged specular glints on reflective surfaces with soft falloff into matte areas"
- "Wings sweep around the chest emblem" -> "Large sweeping curves frame and converge on the focal point"
- "Blue fins glow against the golden sky" -> "Cool saturated accents set against a dominant warm high-key field"
- "The dragon crouches on the left" -> "Compressed low stance with a strong diagonal line of action"
- "Temple ruins fade into mist" -> "Background detail drops sharply with depth into pale atmospheric haze"

Observe what is actually in the image; do not copy these examples unless visually present. Honor minimalist, flat, soft, or watercolor styles faithfully without forcing them to appear dense or hyper-rendered.

======================================================================
3. CONCRETE OBSERVATIONS & PRESERVING UNCERTAINTY
======================================================================
Provide concrete observations rather than generic fluff such as "dynamic", "highly detailed" or "polished anime rendering":
- Linework: thickness variation, hard vs soft edge transitions, contour coloring.
- Rendering: volume handling, shadow transitions, ambient occlusion, specular highlights.
- Lighting: apparent light direction, key light, rim lights, reflections, backlight.
- Composition: visual flow, overlapping planes, focal masses, negative space.
- Detail: where detail is concentrated (focal points) vs where it is subdued or quiet.
- Materials: visual cues used to convey materials. Preserve uncertainty: use "gold-colored metal" instead of assuming "gold", "translucent surface" instead of assuming "glass", "feather-shaped plates" instead of assuming "organic feathers", "apparently mechanical structure" instead of lore-based mechanisms.
- Effects: shape, rhythm, distribution, and contrast of particles or magical auras.
- Palette: dominant colors, secondary accents, light/shadow temperatures.

======================================================================
4. NEGATIVE RULES (AVOIDS)
======================================================================
- 'universalQualityAvoids': Universal flaws (e.g. 'muddled colors', 'blurry outlines', 'anatomical distortion').
- 'styleSpecificAvoids': Techniques that contradict the observed style (e.g. if sharp cel shading, avoid 'muddy airbrush shading').
- 'contentSpecificAvoids': Identity traits to avoid transferring to new subjects.
- NEVER turn absence into universal prohibition:
  - A battle background does NOT prohibit peaceful scenery in future generations.
  - Metal armor does NOT prohibit organic materials on other subjects.
  - Sharp contours do NOT prohibit soft gradient shadow transitions.
- Empty avoid lists are completely valid if there are no specific contradictions.

======================================================================
5. TAXONOMY TAGS
======================================================================
ALLOWED TAGS LIST (Choose ONLY from this taxonomy list for the 'tags' array. Pick up to 14 tags in total):

${tagsListBySection}

CRITICAL RULES FOR TAGGING:
1. Return ONLY tags that are present in the ALLOWED TAGS LIST taxonomy above. DO NOT invent or use other tags.
2. Select up to 14 tags in total. There is NO minimum number of tags; tag ONLY observable visual features supported by the image. Categories with no visual evidence must remain empty.
3. Omit entire categories if they do not apply to the image (e.g., if there are no elemental features, do not select any element tags).
4. Prioritize SPECIFICITY and precision rather than just filling up the maximum limit.
5. DO NOT infer materials, elements, or scale based on lore or assumed character identities; tag ONLY observable visual features present in the image.
6. Distinguish clearly between:
   - "Material" (what the objects are made of, e.g. "crystal", "metal", "fabric", "silk").
   - "Surface / Finish" (how the material is rendered, e.g. "polished", "cracked", "embroidered").
   - "Element" (the natural element force present, e.g. "fire", "lightning").
   - "Element Application" (how that element is applied, e.g. "weapon infusion", "aura").
7. Distinguish physical scale (how large the creature or object is in physical dimensions, e.g. "giant") from perceived presence (how imposing, close-up, or intimate the subject feels in the composition, e.g. "dominant presence"). A human scale warrior can have a "dominant presence", while a gigantic mountain monster can be framed far away with a "landscape comparison".
8. Do not use contradictory tags without clear visual justification.

RECOMMENDED LIMITS PER CATEGORY:
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

======================================================================
6. ARCHETYPE AFFINITY
======================================================================
'archetypeAffinity' lists up to 3 of these game archetypes whose VISUAL STYLE this art could teach. Judge rendering, light, palette structure and finish, never the subject: a knight drawn in gritty soot and ember light fits "Burning West" even without any western theme. Return [] when none fits well.

${archetypeList}

======================================================================
7. COMPLETENESS
======================================================================
This is a full analysis: evaluate every field. Use "" for a technique absent from the image and [] for a list with no items.

CRITICAL: Return ONLY valid JSON. Do NOT wrap in markdown code blocks like \`\`\`json \`\`\`. Start directly with { and end with }. Make sure everything is escaped properly.
  `;

  const abortSignal = AbortSignal.timeout(ANALYSIS_TIMEOUT_MS);
  const response: { text?: string; usageMetadata?: any; servedModel?: string } = isClaudeModel(modelName)
    ? await requestClaudeAnalysis({ model: modelName, prompt: analysisPrompt, schema: VISUAL_DNA_RESPONSE_SCHEMA, imageBase64: base64Data, mimeType, signal: abortSignal, onRequest })
    : await createGeminiClient(onRequest, lockedMode).models.generateContent({
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
          responseSchema: VISUAL_DNA_RESPONSE_SCHEMA,
          abortSignal
        }
      });

  if (!response.text) {
    throw new GeminiOperationError("Failed to receive the analysis from the model.", response.usageMetadata, "Analyze Reference Image");
  }

  try {
    const rawText = response.text.trim();
    const cleanJson = rawText.startsWith("```") 
      ? rawText.replace(/^```json\s*/, "").replace(/```$/, "").trim()
      : rawText;
    const parsedRaw = JSON.parse(cleanJson);

    // 1. Score validation: strict numeric validity [0.0, 1.0]
    const scoreVal = validateVisualDNAScores(parsedRaw.scores, parsedRaw.scoreJustifications);
    if (!scoreVal.isValid) {
      throw new GeminiOperationError(
        `Visual DNA score validation failed: ${scoreVal.errors.join("; ")}`,
        response.usageMetadata,
        "Analyze Reference Image"
      );
    }

    // 2. Completeness validation: non-empty trimmed summary, at least one technical field or fragment, at least one utility dimension
    const completeness = validateAnalysisCompleteness(parsedRaw);
    if (!completeness.isUsable) {
      throw new GeminiOperationError(
        `Visual DNA analysis incomplete: ${completeness.errors.join("; ")}`,
        response.usageMetadata,
        "Analyze Reference Image"
      );
    }

    // 3. Normalization (raw input is deep-cloned and never mutated)
    const parsed = normalizeVisualDNAAnalysis(parsedRaw);

    // 4. Assign local calibration markers ONLY after all validations pass
    parsed.isCalibrated = true;
    parsed.calibrationVersion = 3;

    // 5. Construct patch preserving raw presence alongside normalized representation
    const patch = createVisualDNAPatch(parsedRaw, parsed);

    return { data: parsed, patch, usageMetadata: response.usageMetadata, servedModel: response.servedModel };
  } catch (err) {
    if (err instanceof GeminiOperationError) {
      throw err;
    }
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
      clearSelectedApiKey?: () => Promise<void>;
    };
  }
}

export const checkApiKey = async (): Promise<boolean> => {
  if (localStorage.getItem("apiKeyDisconnected") === "true") {
    return false;
  }
  if (typeof window !== 'undefined' && window.aistudio) {
    if (!await window.aistudio.hasSelectedApiKey()) return false;
    if (hasHostRuntimeCredential()) return true;
  }
  try { const response = await fetch("/api/gemini/status"); return response.ok && (await response.json()).configured === true; } catch { return false; }
};

export const promptApiKeySelection = async (): Promise<void> => {
  localStorage.removeItem("apiKeyDisconnected");
  if (typeof window !== 'undefined' && window.aistudio) {
    await window.aistudio.openSelectKey();
    if (await checkApiKey()) return;
    throw new Error('A chave foi selecionada no AI Studio, mas o transporte do host não está disponível. Configure o endpoint no servidor do host.');
  }
  if (!await checkApiKey()) throw new Error("Sem configuração local. Configure GEMINI_API_KEY somente no servidor ou use o AI Studio.");
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
  promptTokenCount: usageMetadata?.promptTokenCount,
  candidatesTokenCount: usageMetadata?.candidatesTokenCount,
  thoughtsTokenCount: usageMetadata?.thoughtsTokenCount,
  totalTokenCount: usageMetadata?.totalTokenCount,
  cachedContentTokenCount: usageMetadata?.cachedContentTokenCount,
  toolUsePromptTokenCount: usageMetadata?.toolUsePromptTokenCount,
  rawUsageMetadata: usageMetadata || null
});
