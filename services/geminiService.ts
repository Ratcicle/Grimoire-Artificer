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
import { normalizeVisualDNAAnalysis, validateVisualDNAScores } from "./visualTags";
import { VISUAL_TAG_CATEGORIES, VISUAL_TAG_KEYWORDS } from "./visualTags";
import { ARCHETYPE_DEFINITIONS } from "../constants";
import { GRIMOIRE_SYSTEM_PROMPT } from "../constants";



export const VISUAL_DNA_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "Dense visual summary of overall aesthetic and presentation." },
    linework: { type: Type.STRING, description: "Concrete description of line quality: line weight variation, hard vs soft contours, contour color." },
    rendering: { type: Type.STRING, description: "Concrete description of shading and volume: cell-shading vs gradient transitions, ambient occlusion, specular highlights." },
    palette: { type: Type.STRING, description: "Concrete color logic: dominant hues, accents, light/shadow balance, color temperature." },
    silhouette: { type: Type.STRING, description: "Overall shape readability, external contours, visual mass." },
    pose: { type: Type.STRING, description: "Subject pose dynamics, gesture, motion lines, weight distribution." },
    framing: { type: Type.STRING, description: "Camera distance, focal length, angle (e.g. low-angle worm's-eye, dutch angle)." },
    composition: { type: Type.STRING, description: "Visual flow, balance of masses, overlapping, leading lines, negative space." },
    lighting: { type: Type.STRING, description: "Light direction, key light, fill light, rim lighting, specular glare." },
    effects: { type: Type.STRING, description: "Energy, particles, magical bursts, elemental phenomena, speed lines." },
    materials: { type: Type.STRING, description: "Visual cues used to convey materials with proper uncertainty (e.g. gold-like metallic sheen, translucent surface)." },
    details: { type: Type.STRING, description: "Where detail is concentrated (focal points) vs where it is simplified or quiet." },
    background: { type: Type.STRING, description: "Environmental staging, atmospheric depth, horizon, or abstract background treatment." },
    hierarchy: { type: Type.STRING, description: "Focal hierarchy: what catches the eye first, second, third." },
    positivePrompt: { type: Type.STRING, description: "Descriptive scene summary capturing keywords for search indexing (not a universal style directive)." },
    negativePrompt: { type: Type.STRING, description: "Artifacts and flaws to avoid, without contradicting observed techniques." },
    visualMotifs: { type: Type.STRING, description: "General visual motifs and symbolic shapes (e.g. winged warrior, rotary weapon)." },
    shapeLanguage: { type: Type.STRING, description: "Dominant geometric shape language (e.g. aggressive sharp angular chevrons, flowing organic curves)." },
    focalAnchors: { type: Type.STRING, description: "Specific visual anchors guiding the viewer's gaze." },
    detailPlacement: { type: Type.STRING, description: "Distribution of high-density micro-details vs quiet negative zones." },
    compositionRecipe: { type: Type.STRING, description: "Reusable structural recipe (e.g. strong diagonal visual flow balanced by opposing mass)." },
    paletteLogic: { type: Type.STRING, description: "Harmony rules (e.g. warm golden illumination contrasted with cool teal ambient shadows)." },
    materialBehavior: { type: Type.STRING, description: "How materials react to light (e.g. hard-edged specular glints on polished metal, matte light dispersion on cloth)." },
    energyDesign: { type: Type.STRING, description: "Shape and rhythm of energy particles or elemental manifestations." },
    styleAnchors: { type: Type.STRING, description: "Reusable concrete artistic techniques (separated from subject identity)." },
    avoidRules: { type: Type.STRING, description: "Avoidance guidelines that do not forbid observed techniques or universal absence." },
    stylePromptFragments: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Reusable, concrete, self-contained artistic techniques without subject identity (e.g. 'variable-weight linework with finer contours in illuminated areas')."
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
    analysisVersion: { type: Type.NUMBER },
    analysisStatus: { type: Type.STRING, enum: ["complete", "partial", "legacy"] },
    calibrationVersion: { type: Type.NUMBER },
    isCalibrated: { type: Type.BOOLEAN },
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
      description: "Utility matrix scores strictly between 0.0 and 1.0 (decimals like 0.85, never > 1). Represents reusable visual guidance for that dimension. NOT beauty score.",
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
      }
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
You are an expert digital art analyzer specializing in trading card game (TCG) illustrations with deep stylistic nuance across both dense Japanese OCG (Yu-Gi-Oh-like) digital styles and diverse illustrative aesthetics.
Analyze the provided reference image and extract its stylistic "Visual DNA".
Do NOT focus on character identity, logos, card frames, borders, text, or trademarks. Focus on abstract artistic design principles and concrete observable techniques so that we can replicate the visual finish in future generations of completely different subjects.

======================================================================
1. UTILITY MATRIX CONTRACT & CALIBRATION RUBRIC (0.0 to 1.0)
======================================================================
Utility scores define:
"Quanto esta referência oferece evidência visual clara e orientação reutilizável para esta dimensão artística."

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

CRITICAL CONTRACT RULES FOR SCORES:
1. Every score MUST be a finite decimal number strictly between 0.0 and 1.0 (e.g. 0.85, 0.70, 0.40).
2. NEVER output percentages or integers like 85, 90, or 100.
3. Do NOT artificially randomize scores, and do not forbid equal scores.
4. Do NOT output 1.0 for every dimension. Evaluate each dimension independently based on visible evidence.
5. Simplicity is not low utility: a simple or minimalist background can be an excellent 0.80+ reference for visual separation, clean hierarchy, and graphic negative space.
6. 'detailDensity' is a DESCRIPTOR of visual detail concentration from 0.0 (minimal/flat/spartan) to 1.0 (hyper-dense micro-details). It is NOT a score of utility or beauty!
7. In 'scoreJustifications', provide a concise 1-sentence explanation citing visible evidence for each evaluated dimension. Do NOT repeat generic praise like "high quality" or "highly detailed".

======================================================================
2. SEPARATING TECHNIQUE FROM SUBJECT CONTENT
======================================================================
Never confuse the subject depicted with the technique used to depict it!
- 'subjectProfile' & 'subjects': Describe observed subjects and entities faithfully. Do NOT erase content to avoid transferring it.
- 'contentMotifs': General conceptual motifs (e.g. 'winged humanoid', 'heavy rotary cannon', 'electrical discharge arcs'). These are conditional motifs, NOT universal style rules.
- 'identitySpecificDetails': Specific unique configurations that must NOT be replicated on other subjects (e.g. 'specific avian crest on helm', 'cluster of cylindrical glowing vials', 'unique heraldic crest'). Do NOT classify generic words like 'metal', 'wings', 'blue', or 'armor' as forbidden identities.
- 'stylePromptFragments' & 'styleAnchors': Reusable, concrete, self-contained artistic TECHNIQUES without subject identity.
  Formulate reusable techniques such as:
  - "variable-weight linework with finer contours in illuminated areas"
  - "hard-edged metallic highlights with softer internal shadow gradients"
  - "dense focal detail contrasted with quieter background shapes"
  - "a strong diagonal visual flow balanced by a secondary opposing mass"
  (Observe what is actually in the image; do not copy these exact examples unless visually present).
- 'positivePrompt': A descriptive scene summary to aid semantic search indexing, NOT a universal style mandate.

======================================================================
3. CONCRETE OBSERVATIONS & PRESERVING UNCERTAINTY
======================================================================
Provide concrete observations rather than generic fluff:
- Linework: thickness variation, hard vs soft edge transitions, contour coloring.
- Rendering: volume handling, shadow transitions, ambient occlusion, specular highlights.
- Lighting: apparent light direction, key light, rim lights, reflections, backlight.
- Composition: visual flow, overlapping planes, focal masses, negative space.
- Detail: where detail is concentrated (focal points) vs where it is subdued or quiet.
- Materials: visual cues used to convey materials. Preserve uncertainty: use "metal de aparência dourada" instead of assuming "ouro", "superfície translúcida" instead of assuming "vidro", "placas com formato de penas" instead of assuming "penas orgânicas", "estrutura aparentemente mecânica" instead of lore-based mechanisms.
- Effects: shape, rhythm, distribution, and contrast of particles or magical auras.
- Palette: dominant colors, secondary accents, light/shadow temperatures.
- Art style neutrality: Honor minimalist, flat, soft, or watercolor styles faithfully without forcing them to appear dense or hyper-rendered.

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
ALLOWED TAGS LIST (Choose ONLY from this taxonomy list for the 'tags' array. Pick between 6 to 14 tags in total):

${tagsListBySection}

CRITICAL RULES FOR TAGGING:
1. Return ONLY tags that are present in the ALLOWED TAGS LIST taxonomy above. DO NOT invent or use other tags.
2. Select between 6 and 14 tags in total.
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
    const parsedRaw = JSON.parse(cleanJson);

    // Strict local validation before normalization and saving
    const scoreVal = validateVisualDNAScores(parsedRaw.scores, parsedRaw.scoreJustifications);
    if (!scoreVal.isValid) {
      throw new GeminiOperationError(
        `Visual DNA score validation failed: ${scoreVal.errors.join("; ")}`,
        response.usageMetadata,
        "Analyze Reference Image"
      );
    }

    if (!parsedRaw.summary || typeof parsedRaw.summary !== 'string') {
      throw new GeminiOperationError(
        "Visual DNA analysis validation failed: Missing required summary field.",
        response.usageMetadata,
        "Analyze Reference Image"
      );
    }

    const parsed = normalizeVisualDNAAnalysis(parsedRaw);
    parsed.isCalibrated = true;
    parsed.calibrationVersion = 3;
    return { data: parsed, usageMetadata: response.usageMetadata };
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
