import { VisualDNA } from "../types";

export const VISUAL_TAG_CATEGORIES: Record<string, string[]> = {
  "Core": [
    "boss monster", "spell artwork", "trap artwork", "field spell", "humanoid",
    "creature", "dragon", "machine", "undead", "organic horror", "western",
    "dark fantasy", "divine", "forest", "mechanical", "magical burst",
    "dynamic pose", "high detail", "strong silhouette", "complex background",
    "abstract background", "particles", "armor", "weapon focus"
  ],
  "Physical Scale": [
    "tiny", "small creature", "human scale", "large creature", "giant",
    "colossal", "titanic", "cosmic scale"
  ],
  "Scale Form": [
    "towering", "massive wingspan", "serpentine length", "broad mass",
    "vertical scale", "horizon-spanning", "environmental body"
  ],
  "Scale Cues": [
    "low-angle scale", "tiny human comparison", "architecture comparison",
    "landscape comparison", "atmospheric depth", "distant horizon",
    "partially cropped body", "wide establishing shot", "ground impact",
    "environmental destruction"
  ],
  "Perceived Presence": [
    "intimate presence", "balanced presence", "dominant presence",
    "monumental presence", "overwhelming presence"
  ],
  "Materials": [
    "metal", "steel", "gold", "silver", "bronze", "stone", "marble",
    "obsidian", "ceramic", "glass", "crystal", "gemstone", "flesh", "bone",
    "chitin", "scales", "fur", "feathers", "leather", "wood", "bark",
    "roots", "vines", "fungal growth", "smoke body", "mist body", "liquid body",
    "slime body", "shadow body", "light body", "energy body", "plasma body",
    "flame body", "ice body", "sand body", "cosmic matter",
    "fabric", "silk", "satin", "velvet", "lace"
  ],
  "Surface / Finish": [
    "polished", "glossy", "matte", "reflective", "translucent", "transparent",
    "luminous", "iridescent", "pearlescent", "metallic", "weathered",
    "corroded", "rusted", "cracked", "chipped", "eroded", "charred", "scarred",
    "decayed", "dust-covered", "smooth", "rough", "jagged", "segmented",
    "layered", "plated", "engraved", "ornamented", "veined", "scaled texture",
    "faceted", "porous", "fibrous", "molten", "wet", "oozing", "smoking",
    "frosted", "electrified", "glowing from within", "light-absorbing",
    "energy-cracked", "embroidered"
  ],

  "Elements": [
    "fire", "water", "ice", "wind", "earth", "lightning", "light", "darkness",
    "shadow", "poison", "acid", "plant", "fungal", "sand", "magma", "plasma",
    "cosmic", "void", "arcane", "holy", "necrotic"
  ],
  "Element Application": [
    "aura", "body composition", "armor infusion", "weapon infusion",
    "energy core", "elemental veins", "halo", "elemental wings", "projectile",
    "explosion", "environmental effect", "background phenomenon"
  ]
};

export const ALLOWED_VISUAL_TAGS: string[] = Object.values(VISUAL_TAG_CATEGORIES).flat();

export const getTagCategory = (tag: string): string => {
  const generic = ['high detail', 'particles', 'strong silhouette', 'dynamic pose'];
  if (generic.includes(tag)) return "Generic";

  const coreSubjects = ['humanoid', 'creature', 'dragon', 'machine', 'undead', 'organic horror'];
  if (coreSubjects.includes(tag)) return "Core Subject";

  for (const [cat, tags] of Object.entries(VISUAL_TAG_CATEGORIES)) {
    if (tags.includes(tag)) {
       return cat === "Core" ? "Core" : cat;
    }
  }
  return "Core";
};

export const VISUAL_TAG_PRIORITY = [
  'Core Subject', 'Physical Scale', 'Perceived Presence', 'Materials', 'Elements',
  'Element Application', 'Surface / Finish', 'Scale Form', 'Scale Cues', 'Core', 'Generic'
] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ') : undefined;
const cleanList = (value: unknown, limit: number): string[] | undefined =>
  Array.isArray(value) ? [...new Set(value.map(cleanText).filter((item): item is string => !!item).map(item => item.toLowerCase()))].slice(0, limit) : undefined;

/** Normalize only supplied profile members. Sparse input must never acquire clearing defaults. */
export function normalizeProfileBlocks(input: any, warnings: string[] = []): Partial<VisualDNA> {
  const result: any = {};
  for (const key of ['subjectProfile', 'scaleProfile', 'substanceProfile']) {
    const raw = input?.[key];
    if (!isObject(raw)) continue;
    const profile: Record<string, unknown> = {};
    const stringFields = key === 'subjectProfile' ? ['primarySubject', 'subjectCategory', 'visualRole']
      : key === 'scaleProfile' ? ['physicalScale', 'perceivedPresence', 'evidence'] : ['evidence'];
    for (const field of stringFields) {
      const value = cleanText(raw[field]);
      if (value) profile[field] = ['primarySubject', 'evidence'].includes(field) ? value : value.toLowerCase();
    }
    if (key === 'scaleProfile') {
      if (!VISUAL_TAG_CATEGORIES['Physical Scale'].includes(profile.physicalScale as string)) delete profile.physicalScale;
      if (!VISUAL_TAG_CATEGORIES['Perceived Presence'].includes(profile.perceivedPresence as string)) delete profile.perceivedPresence;
    }
    const limits = key === 'scaleProfile' ? { scaleForms: 2, scaleCues: 3 }
      : key === 'substanceProfile' ? { materials: 4, surfaces: 4, elements: 2, elementApplications: 3 } : {};
    for (const [field, limit] of Object.entries(limits)) {
      const list = cleanList(raw[field], limit);
      if (list) profile[field] = list;
    }
    if (typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) && raw.confidence >= 0 && raw.confidence <= 1) {
      profile.confidence = raw.confidence;
    }
    if (key === 'substanceProfile' && Array.isArray(profile.elements) && profile.elements.length === 0 && Array.isArray(profile.elementApplications)) {
      profile.elementApplications = profile.elementApplications.filter(application => {
        if (!['weapon infusion', 'armor infusion', 'elemental veins'].includes(application)) return true;
        warnings.push(`Removed ${application} application due to missing elements.`);
        return false;
      });
    }
    result[key] = profile;
  }
  return result;
}

export function normalizeSubjects(value: unknown): VisualDNA['subjects'] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.flatMap(raw => {
    if (!isObject(raw)) return [];
    const id = cleanText(raw.id), description = cleanText(raw.description), category = cleanText(raw.category);
    const visualRole = cleanText(raw.visualRole)?.toLowerCase();
    const physicalScale = cleanText(raw.physicalScale);
    if (!id || seenIds.has(id) || !description || !category || !physicalScale || !['primary', 'secondary', 'supporting'].includes(visualRole || '')) return [];
    seenIds.add(id);
    const subject: NonNullable<VisualDNA['subjects']>[number] = {
      id, description, category: category.toLowerCase(), physicalScale: physicalScale.toLowerCase(),
      visualRole: visualRole as 'primary' | 'secondary' | 'supporting'
    };
    const presence = cleanText(raw.perceivedPresence);
    if (presence) subject.perceivedPresence = presence.toLowerCase();
    for (const [field, limit] of [['materials', 4], ['surfaces', 4], ['elements', 2]] as const) {
      const list = cleanList(raw[field], limit);
      if (list) subject[field] = list;
    }
    return [subject];
  }).slice(0, 4);
}

export function normalizeScaleRelationships(value: unknown): VisualDNA['scaleRelationships'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    if (!isObject(raw)) return [];
    const subjectA = cleanText(raw.subjectA), subjectB = cleanText(raw.subjectB), relationship = cleanText(raw.relationship);
    if (!subjectA || !subjectB || !relationship) return [];
    const evidence = cleanText(raw.evidence);
    return [{ subjectA, subjectB, relationship, ...(evidence ? { evidence } : {}) }];
  }).slice(0, 3);
}


export const DEFAULT_VISUAL_DNA_SCORES = {
  style: 0.5, palette: 0.5, pose: 0.5, composition: 0.5, lighting: 0.5, effects: 0.5, materials: 0.5, background: 0.5, details: 0.5, silhouette: 0.5, rendering: 0.5
};

export const SUPPORTED_CALIBRATION_VERSIONS = [3] as const;

export const UTILITY_DIMENSIONS = [
  'rendering', 'composition', 'palette', 'lighting', 'materials',
  'background', 'details', 'effects', 'pose', 'silhouette', 'style'
] as const;

export const DESCRIPTOR_DIMENSIONS = ['detailDensity'] as const;

export const ALL_CANONICAL_DIMENSIONS = [
  'rendering', 'composition', 'palette', 'lighting', 'materials',
  'background', 'details', 'effects', 'pose', 'silhouette', 'style',
  'detailDensity'
] as const;

export const VALID_UTILITY_DIMENSIONS = ALL_CANONICAL_DIMENSIONS;

export const TECHNICAL_ANALYSIS_FIELDS = [
  'linework', 'rendering', 'palette', 'silhouette', 'pose', 'framing',
  'composition', 'lighting', 'effects', 'materials', 'details', 'background',
  'hierarchy', 'visualMotifs', 'shapeLanguage', 'focalAnchors', 'detailPlacement',
  'compositionRecipe', 'paletteLogic', 'materialBehavior', 'energyDesign',
  'styleAnchors', 'avoidRules'
] as const;

export interface AnalysisCompletenessResult {
  isUsable: boolean;
  errors: string[];
}

export const validateAnalysisCompleteness = (
  rawJson: any
): AnalysisCompletenessResult => {
  const errors: string[] = [];

  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
    return { isUsable: false, errors: ["Analysis response must be a valid JSON object."] };
  }

  // 1. summary non-empty string after trim
  if (typeof rawJson.summary !== 'string' || rawJson.summary.trim().length === 0) {
    errors.push("Analysis must include a non-empty summary after trimming.");
  }

  // 2. At least one technical field or at least one stylePromptFragments item
  const hasTechnicalField = TECHNICAL_ANALYSIS_FIELDS.some(field => {
    const val = rawJson[field];
    return typeof val === 'string' && val.trim().length > 0;
  });

  const hasStyleFragment = Array.isArray(rawJson.stylePromptFragments) &&
    rawJson.stylePromptFragments.some((frag: any) => typeof frag === 'string' && frag.trim().length > 0);

  if (!hasTechnicalField && !hasStyleFragment) {
    errors.push("Analysis must include at least one non-empty technical description field or style prompt fragment.");
  }

  // 3. At least one utility dimension evaluated with a valid number in [0, 1]
  const scoresObj = rawJson.scores;
  if (!scoresObj || typeof scoresObj !== 'object' || Array.isArray(scoresObj)) {
    errors.push("Analysis must include a scores object with at least one evaluated utility dimension.");
  } else {
    for (const [key, val] of Object.entries(scoresObj)) {
      if (val === null) {
        errors.push(`Score for "${key}" cannot be null; omit the field if not evaluated.`);
      }
    }

    const hasUtilityScore = UTILITY_DIMENSIONS.some(dim => {
      const val = scoresObj[dim];
      return typeof val === 'number' && Number.isFinite(val) && val >= 0.0 && val <= 1.0;
    });

    if (!hasUtilityScore) {
      errors.push("Analysis must evaluate at least one utility dimension (detailDensity alone does not count).");
    }
  }

  return {
    isUsable: errors.length === 0,
    errors
  };
};

export interface ScoreValidationResult {
  isValid: boolean;
  errors: string[];
  validatedScores: Record<string, number | undefined>;
  justifications: Record<string, string>;
  isCalibrated: boolean;
}

export const validateVisualDNAScores = (
  rawScores: any,
  rawJustifications?: any
): ScoreValidationResult => {
  const errors: string[] = [];
  const validatedScores: Record<string, number | undefined> = {};
  const justifications: Record<string, string> = {};

  if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores)) {
    return {
      isValid: false,
      errors: ["Scores must be an object with numeric utility ratings between 0.0 and 1.0."],
      validatedScores: {},
      justifications: {},
      isCalibrated: false
    };
  }

  for (const dim of VALID_UTILITY_DIMENSIONS) {
    if (!(dim in rawScores)) {
      continue;
    }

    const val = rawScores[dim];

    if (val === null) {
      errors.push(`Score for "${dim}" cannot be null; omit the field if not evaluated.`);
      continue;
    }

    if (val === undefined) {
      continue;
    }

    if (typeof val === 'boolean' || typeof val === 'string' || typeof val !== 'number') {
      errors.push(`Score for "${dim}" must be a number, received ${typeof val} (${JSON.stringify(val)}).`);
      continue;
    }

    if (isNaN(val) || !Number.isFinite(val)) {
      errors.push(`Score for "${dim}" must be a finite number, received ${val}.`);
      continue;
    }

    if (val < 0.0 || val > 1.0) {
      errors.push(`Score for "${dim}" must be between 0.0 and 1.0, received ${val}. Values outside contract must not be clamped or guessed.`);
      continue;
    }

    // Only assign valid finite numbers (never assign undefined properties)
    validatedScores[dim] = val;
  }

  if (rawJustifications && typeof rawJustifications === 'object' && !Array.isArray(rawJustifications)) {
    for (const [k, v] of Object.entries(rawJustifications)) {
      if (typeof v === 'string' && v.trim()) {
        justifications[k] = v.trim().replace(/\s+/g, ' ');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    validatedScores,
    justifications,
    isCalibrated: errors.length === 0
  };
};

export const isCalibratedRecord = (
  ref: Partial<VisualDNA> | null | undefined
): boolean => {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return false;
  if (ref.isCalibrated !== true) return false;
  if (typeof ref.calibrationVersion !== 'number' || !SUPPORTED_CALIBRATION_VERSIONS.includes(ref.calibrationVersion as any)) {
    return false;
  }
  if (!ref.scores || typeof ref.scores !== 'object' || Array.isArray(ref.scores)) {
    return false;
  }

  // Validação numérica existente: nenhum score canônico fornecido pode ser inválido
  const scoreVal = validateVisualDNAScores(ref.scores);
  if (!scoreVal.isValid) {
    return false;
  }

  // Ao menos uma dimensão de utilidade validamente avaliada (detailDensity sozinho não conta)
  return UTILITY_DIMENSIONS.some(dim => {
    const val = (ref.scores as any)[dim];
    return typeof val === 'number' && Number.isFinite(val) && val >= 0.0 && val <= 1.0;
  });
};
