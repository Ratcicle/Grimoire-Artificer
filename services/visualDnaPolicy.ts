import { Archetype, Context, CardType, Complexity, VisualDNA, ContributionEvaluation } from "../types";
import { parsePromptIntent, matchesPromptExclusion } from "./promptParser";

export interface SynthesisContext {
  subject: string;
  affirmativeText: string;
  excludedWords: Set<string>;
  excludedPhrases?: string[];
  cardType: CardType | string;
  context: Context | string;
  complexity: Complexity | string;
  archetype: Archetype | string;
  archetypePreset: string;
  intensity: "low" | "medium" | "high";
}

export interface ArchetypePolicyRules {
  forbiddenTerms: string[];
  signatureTerms: string[];
  allowedClothingColors?: string[];
  allowedMaterials?: string[];
  allowedAccentColors?: string[];
  allowedPaletteColors?: string[];
  avoidRealismOrMicrodetails?: boolean;
}

const NORMALIZE = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_\/\\]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeRegex = (s: string) => s.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");

const containsTerm = (text: string, term: string): boolean =>
  new RegExp(`(^|\\s)${escapeRegex(NORMALIZE(term))}($|\\s)`, 'i').test(NORMALIZE(text));

/**
 * Explicit local runtime rules derived from the archetype presets in constants.ts.
 */
export const ARCHETYPE_POLICY_RULES: Record<string, ArchetypePolicyRules> = {
  [Archetype.RoyalCarmine]: {
    forbiddenTerms: [
      "gothic", "vampire", "vampires", "vampiric", "undead", "demon", "demons", "demonic",
      "dark castle", "dark castles", "excessive blood", "blood splatter", "pools of blood", "bloody", "gore", "grimdark",
      "corrupted", "monstrous", "black dominant", "black clothing", "black clothes",
      "black armor", "dark armor", "black plate", "black iron", "obsidian",
      "purple fire", "purple flame", "purple flames",
      "cyberpunk", "neon"
    ],
    signatureTerms: [
      "white", "snow white", "ivory", "almond silk", "silk", "pearl",
      "silver", "gold", "crimson", "noble", "palace", "marble",
      "royal", "aristocrat", "ceremonial", "blood pact", "blood contract",
      "blood pact seals", "blood seals", "royal seals", "ritual symbols", "crown", "roses"
    ],
    allowedClothingColors: [
      "white", "snow white", "ivory", "almond", "cream", "pearl", "silver", "gold", "crimson"
    ],
    allowedMaterials: [
      "silk", "satin", "pearl", "silver", "gold", "marble", "crystal", "gemstones", "porcelain"
    ]
  },
  [Archetype.LuminarchKnights]: {
    forbiddenTerms: [
      "grimdark", "gothic", "excessive blood", "mud", "rust", "battle damage",
      "dirty texture", "dark chrome", "chibi", "cartoon", "gore"
    ],
    signatureTerms: [
      "white marble", "matte silver", "gold", "petrol blue", "teal",
      "cyan", "divine", "celestial", "filigree", "plate armor"
    ],
    allowedClothingColors: [
      "white", "silver", "gold", "petrol blue", "teal", "cyan", "blue"
    ],
    allowedMaterials: [
      "white marble", "matte silver", "ceramic", "gold", "filigree", "plate armor", "steel"
    ]
  },
  [Archetype.ShadowHeart]: {
    forbiddenTerms: [
      "holy paladin", "clean heroic", "cheerful", "sci-fi",
      "white background", "blue sky", "cyan sky", "green magic dominance"
    ],
    signatureTerms: [
      "gothic", "cathedral", "black", "graphite", "maroon", "crimson",
      "rose red", "crystal heart", "demonic", "spikes", "thorns", "vortex", "pointed arches"
    ],
    allowedClothingColors: [
      "black", "graphite", "charcoal", "maroon", "crimson", "dark red", "rose red", "purple"
    ],
    allowedMaterials: [
      "black organic armor", "black metal", "obsidian", "dark steel", "crystal heart", "spikes", "thorns", "gothic stone"
    ]
  },
  [Archetype.ZodiacTalismans]: {
    forbiddenTerms: [
      "realistic anatomy", "detailed fur", "complex background",
      "photorealism", "3d render", "dense detail", "microdetail",
      "plastic cgi", "heavy realistic textures"
    ],
    signatureTerms: [
      "sigil", "brushstroke", "talisman", "calligraphic", "minimalist",
      "clean silhouette", "solid color", "parchment", "stone charm"
    ],
    allowedClothingColors: [
      "gold", "black", "red", "stone", "parchment", "earth"
    ],
    allowedMaterials: [
      "stone", "parchment", "paper", "ink", "jade", "bronze", "wood"
    ],
    avoidRealismOrMicrodetails: true
  },
  [Archetype.Miragebound]: {
    forbiddenTerms: [
      "gothic", "undead", "void", "holy paladin", "bulky armor",
      "heavy clockwork", "black smoke", "cyberpunk"
    ],
    signatureTerms: [
      "sand", "desert", "glass", "mirage", "oasis", "amber",
      "turquoise", "veil", "translucent", "refraction"
    ]
  },
  [Archetype.TechZero]: {
    forbiddenTerms: [
      "organic flesh", "crowded conveyor", "hologram clutter"
    ],
    signatureTerms: [
      "robotic", "modular", "angular", "plating", "reactor", "joint", "visor"
    ],
    allowedAccentColors: ['orange', 'red', 'yellow', 'lime', 'green', 'violet', 'magenta', 'cobalt blue', 'cyan']
  },
  [Archetype.Bloomrot]: {
    forbiddenTerms: [
      "clean polished armor", "sci-fi", "cheerful", "cute mascot"
    ],
    signatureTerms: [
      "fungal", "mycelium", "spore", "decay", "parasitic", "organic", "rot"
    ]
  },
  [Archetype.BurningWest]: {
    forbiddenTerms: [
      "fire elemental", "engulfed in flames", "sci-fi", "modern tactical",
      "cyberpunk", "cheerful cowboy"
    ],
    signatureTerms: [
      "ember", "ash", "western", "leather", "smoke", "soot", "duel", "revolver"
    ]
  },
  [Archetype.Arcanists]: {
    forbiddenTerms: [
      "void corruption", "tentacles", "blood", "cathedral"
    ],
    signatureTerms: [
      "robe", "runes", "glyphs", "academic", "geometric", "staff", "grimoire", "circuits"
    ]
  },
  [Archetype.Voidwalkers]: {
    forbiddenTerms: [
      "holy paladin", "clean heroic armor", "bright teal flood", "friendly"
    ],
    signatureTerms: [
      "void", "abyssal", "skeletal", "black smoke", "hollow", "darkness"
    ]
  },
  [Archetype.ExtremeDragons]: {
    forbiddenTerms: [
      "humanoid warrior", "mechanical"
    ],
    signatureTerms: [
      "dragon", "wings", "horned", "elemental", "boss"
    ]
  },
  [Archetype.Generic]: {
    forbiddenTerms: [],
    signatureTerms: []
  }
};

// Palette permissions follow the existing presets. Accent permission does not
// promote a color into a dominant palette or require it in every generated card.
const PRESET_COLOR_ROLES: Partial<Record<Archetype, { palette: string[]; accent: string[] }>> = {
  [Archetype.RoyalCarmine]: { palette: ['white', 'ivory', 'almond', 'pearl', 'silver', 'gold'], accent: ['crimson', 'red', 'gold', 'golden', 'silver', 'white', 'ivory'] },
  [Archetype.ShadowHeart]: { palette: ['black', 'graphite', 'gray', 'maroon', 'crimson', 'rose red', 'magenta', 'pink'], accent: ['crimson', 'red', 'magenta', 'pink'] },
  [Archetype.Voidwalkers]: { palette: ['black', 'charcoal gray', 'blue gray', 'bone white', 'purple'], accent: ['cyan', 'teal'] },
  [Archetype.LuminarchKnights]: { palette: ['white', 'silver', 'petrol blue', 'teal'], accent: ['gold', 'golden', 'cyan', 'aqua green'] },
  [Archetype.ZodiacTalismans]: { palette: ['gold', 'black', 'red', 'stone', 'parchment', 'earth'], accent: ['gold', 'black', 'red'] },
  [Archetype.Miragebound]: { palette: ['sand', 'ivory', 'beige', 'bronze', 'gold', 'amber', 'teal', 'turquoise'], accent: ['cyan', 'gold', 'amber', 'turquoise'] },
  [Archetype.Bloomrot]: { palette: ['ivory', 'beige', 'white', 'yellow', 'amber', 'orange', 'red', 'crimson', 'purple', 'lilac', 'violet', 'magenta', 'pink', 'cyan', 'blue', 'green', 'teal', 'lime', 'brown', 'gray', 'black'], accent: ['cyan', 'blue', 'yellow', 'green', 'amber', 'violet', 'magenta', 'orange'] },
  [Archetype.BurningWest]: { palette: ['brown', 'charcoal black', 'gray', 'beige', 'dark iron', 'muted orange', 'crimson', 'red', 'maroon'], accent: ['orange', 'yellow'] }
};
for (const [archetype, roles] of Object.entries(PRESET_COLOR_ROLES)) {
  ARCHETYPE_POLICY_RULES[archetype].allowedPaletteColors = roles.palette;
  ARCHETYPE_POLICY_RULES[archetype].allowedAccentColors = roles.accent;
}

// Basic illustration terms and grammar. Descriptive words are also admitted by
// their technical role below; this is not a list of every word an analyzer may use.
const TECHNIQUE_WORDS = new Set(`a an the and or of with in on over under to by for from at as but only
  clean tapered crisp fine sharp bold delicate flowing calligraphic line lineart linework outline outlines contour contours ink strokes cross hatching
  soft cel cell smooth gradient gradients digital matte specular volumetric shading painting rendering finish highlight highlights glow
  rim light lighting backlight backlighting point bounce key directional ambient occlusion chiaroscuro high contrast shadows shadow dark black
  falloff tonal balance value hierarchy depth layering subject background separation atmospheric perspective field rule thirds golden ratio
  dynamic angle angles low cinematic foreshortening foreground framing focal leading lines reflection reflections treatment subsurface scattering
  readable silhouette iconic triadic balancing complementary detail details distribution selective detailing restraint composition texture textures
  polished precise elegant thin well defined deep strong subtle small accents accent dominant embroidered embroidery trim sheen luster drape drapery
  folds smoothness luxurious mother internal softer hard edged metallic sketchy watercolor wash multi layered anisotropic
  static symmetrical central diagonal visual flow balanced secondary opposing mass proportional natural proportions form scale standard
  vertical horizontal asymmetrical geometric shapes graphic comic anime stylized saturated colors color luminous transitions broad bright
  expressive curved curves rounded angular shapes surface surfaces material behavior painterly vibrant palette
  dense sparse placement motion pose movement wide close up full shot centered balanced central negative space volume lightness`.split(/\s+/));

const evidenceWords = (text: string): Set<string> => {
  const words = new Set(NORMALIZE(text).split(/\s+/));
  for (const word of [...words]) {
    if (word.endsWith('s') && word.length > 3) words.add(word.slice(0, -1));
    else if (word.length > 3) words.add(word + 's');
    if (word === 'gold') words.add('golden');
  }
  if ([...words].some(word => ['human', 'noble', 'knight', 'mage', 'person', 'nobre', 'humano'].includes(word))) {
    ['human', 'hands', 'hand'].forEach(word => words.add(word));
  }
  if (words.has('colossal') || words.has('gargantuan')) ['towering', 'mountain', 'sized', 'beast', 'monster'].forEach(word => words.add(word));
  if ([...words].some(word => ['silk', 'satin', 'cotton', 'linen', 'wool', 'fabric', 'cloth'].includes(word))) ['fabric', 'cloth'].forEach(word => words.add(word));
  return words;
};

const TECHNICAL_HEADS = new Set(`linework lineart line lines outline outlines contour contours ink stroke strokes hatching shading lighting light highlights shadows painting rendering gradients gradient brushwork edge edges detail details areas shapes silhouette framing composition contrast hierarchy depth layers textures`.split(' '));
const TECHNICAL_RELATIONS = new Set(['use', 'uses', 'create', 'creates', 'emphasize', 'emphasizes', 'produce', 'produces', 'keep', 'keeps']);
const TECHNICAL_MEDIA = new Set(['pencil', 'charcoal', 'pastel', 'gouache', 'acrylic', 'watercolor']);
const GRAMMATICAL_BOUNDARIES = new Set(['with', 'and', 'in', 'on', 'over', 'under', 'of', 'to', 'for', 'from']);
const TECHNICAL_MODIFIERS = [
  { pattern: /^(?:stippled|feathered|hatched|crosshatched|tapered|smudged|brushed)$/, heads: new Set('linework lineart lines outlines contours ink strokes hatching shading painting rendering gradients gradient brushwork edge edges'.split(' ')) },
  { pattern: /^(?:illuminated|diffused|diffuse|backlit|lit)$/, heads: new Set('lighting light highlights shadows areas edges contours shapes'.split(' ')) },
  { pattern: /^(?:blended|layered|contrasted|graduated|stylized|stylised|desaturated|saturated|focused|detailed|polished|softly|sharply|subtly|boldly|finely|smoothly|cleanly|lightly|darkly)$/, heads: TECHNICAL_HEADS }
];

const isTechnicalComparative = (word: string) => ['er', 'est', 'r', 'st'].some(ending => word.endsWith(ending) &&
  (TECHNIQUE_WORDS.has(word.slice(0, -ending.length)) || word.slice(0, -ending.length) === 'quiet'));

/** A descriptive modifier needs an illustration head, not a body/material noun. */
const hasTechnicalRole = (tokens: string[], index: number): boolean => {
  const word = tokens[index];
  if (TECHNICAL_HEADS.has(word)) return true;
  const comparative = isTechnicalComparative(word);
  const modifier = TECHNICAL_MODIFIERS.find(family => family.pattern.test(word));
  const descriptive = Boolean(modifier) || comparative;
  const relation = TECHNICAL_RELATIONS.has(word);
  if (!descriptive && !relation && !TECHNICAL_MEDIA.has(word)) return false;
  const acceptsHead = (head: string) => TECHNICAL_HEADS.has(head) && (!modifier || modifier.heads.has(head));

  // Follow a short adjective/verb phrase to its technique head. Prepositions and
  // unknown noun phrases end the role, so "feathered brushwork" is transferable
  // while "feathered wings with linework" still requires support for wings.
  for (let next = index + 1; next < Math.min(tokens.length, index + 5); next++) {
    const token = tokens[next];
    if (GRAMMATICAL_BOUNDARIES.has(token)) break;
    if (TECHNICAL_HEADS.has(token)) return acceptsHead(token);
    if (!TECHNIQUE_WORDS.has(token) && !isTechnicalComparative(token) && !TECHNICAL_MODIFIERS.some(family => family.pattern.test(token))) break;
  }
  // Participles also describe the relationship between two technique phrases:
  // "focal detail contrasted with quieter background shapes".
  return descriptive && index > 0 && acceptsHead(tokens[index - 1]);
};

const hasPositiveAdmission = (text: string, context: SynthesisContext, rules: ArchetypePolicyRules, field?: string): boolean => {
  const support = evidenceWords([context.affirmativeText, ...rules.signatureTerms, ...(rules.allowedMaterials || []), ...(rules.allowedClothingColors || []), ...(rules.allowedAccentColors || []), ...(rules.allowedPaletteColors || [])].join(' '));
  if (rules.allowedClothingColors?.length) ['clothing', 'clothes', 'garments', 'attire'].forEach(word => support.add(word));
  const content = NORMALIZE(text)
    .replace(/\b(?:three|3) point lighting\b/g, 'lighting')
    .replace(/\b(?:variable|uniform|varying|consistent) weight (?=linework|lines|contours)/g, '')
    .replace(/\bfull body (?:shot|framing|composition)\b/g, 'framing');
  const tokens = content.split(/\s+/);
  if (!NORMALIZE(text).includes(' ') && !support.has(content) && !isTransferableTechnique(content) &&
      !['shading', 'lighting', 'rendering', 'brushwork', 'hatching', 'foreshortening'].includes(content)) {
    return false;
  }
  if (field === 'substanceMaterials' || field === 'substanceElements') {
    // These fields declare what a subject is made of or which element it uses.
    // "Light" and "shadow" here cannot borrow their lighting/shading meanings.
    const nounPhrase = content.split(/\b(?:with|in|on|over)\b/)[0].trim().split(/\s+/);
    if (!support.has(nounPhrase[nounPhrase.length - 1])) return false;
  }
  // Words such as light, shadow and metallic describe techniques only in a
  // rendering role. When they modify anatomy, the modifier needs content
  // evidence too. A technique vocabulary must not certify a new body substance.
  const anatomyPhrases = content.matchAll(/\b((?:[a-z]+\s+){0,3})(body|arms?|hands?|legs?|heads?|skin|wings?|eyes?|flesh|bones?)\b/g);
  for (const phrase of anatomyPhrases) {
    const modifiers = phrase[1].trim().split(/\s+/);
    let boundary = -1;
    modifiers.forEach((word, index) => {
      if (['on', 'over', 'with', 'and', 'of', 'in', 'the', 'a', 'an'].includes(word)) boundary = index;
    });
    const attached = modifiers.slice(boundary + 1).filter(Boolean);
    if (!attached.every(word => support.has(word) || ['proportional', 'natural'].includes(word))) return false;
  }
  return tokens.every((word, index) => TECHNIQUE_WORDS.has(word) || support.has(word) || hasTechnicalRole(tokens, index));
};

/**
 * Pure transferable illustration, lighting, shading, lineart, and composition techniques.
 */
const TRANSFERABLE_TECHNIQUE_PATTERNS = [
  /\b(?:clean|tapered|crisp|fine|sharp|bold|delicate|flowing|calligraphic)\s+(?:outlines?|lines?|lineart|linework|contours?)\b/i,
  /\b(?:line\s*art|linework|outlines?|contours?|ink\s*strokes?|cross\s*hatching|hatching)\b/i,
  /\b(?:black\s+linework|black\s+line\s*art|dark\s+contour|dark\s+outlines?|black\s+ink)\b/i,
  /\b(?:soft|cell|cel|smooth|gradient|digital|matte|specular|volumetric)\s+(?:shading|painting|rendering|finish|highlights?|glow)\b/i,
  /\b(?:rim\s*light(?:ing)?|backlight(?:ing)?|three\s*point\s*lighting|bounce\s*light|key\s*light|directional\s*light|ambient\s*occlusion)\b/i,
  /\b(?:chiaroscuro|high\s*contrast\s*shadows?|soft\s*falloff|tonal\s*balance|value\s*hierarchy|depth\s*layering)\b/i,
  /\b(?:subject[- ]background\s*separation|atmospheric\s*perspective|depth\s*of\s*field|rule\s*of\s*thirds|golden\s*ratio)\b/i,
  /\b(?:dynamic\s*angles?|low\s*angle|high\s*angle|cinematic\s*angle|foreshortening|foreground\s*framing|focal\s*hierarchy|leading\s*lines)\b/i,
  /\b(?:specular\s*highlight\s*treatment|reflection\s*treatment|specular\s*reflections?|subsurface\s*scattering)\b/i,
  /\b(?:readable\s*silhouette|clean\s*silhouette|iconic\s*silhouette|triadic\s*balancing|complementary\s*contrast)\b/i,
  /\b(?:detail\s*distribution|selective\s*detailing|focal\s*restraint|contrast\s*hierarchy)\b/i
];

/**
 * Conditional features that carry content: materials, colors, garments, weapons, anatomy, environments.
 */
const CONDITIONAL_FEATURE_PATTERNS = [
  /\b(?:armor|plate\s*armor|chainmail|gauntlets?|pauldrons?|helmets?|cuirass)\b/i,
  /\b(?:clothing|clothes|garments?|robes?|attire|suit|outfit|fabric|dress|cloak|tunic)\b/i,
  /\b(?:black\s+(?:clothing|clothes|garments?|robes?|attire|armor|spires?|cathedral|wings?))\b/i,
  /\b(?:white\s+(?:clothing|clothes|garments?|robes?|silk|armor))\b/i,
  /\b(?:purple\s+(?:fire|flames?|magic|lightning|energy)|green\s+magic|cyan\s+glow)\b/i,
  /\b(?:gothic\s+(?:cathedrals?|ruins?|arches?|spires?|architecture|setting)|castles?|graveyards?|saloon)\b/i,
  /\b(?:swords?|shields?|axes?|bows?|guns?|revolvers?|halberds?|daggers?|staffs?|staves?|spears?)\b/i,
  /\b(?:warriors?|knights?|mages?|wizards?|demons?|dragons?|wyverns?|beasts?|vampires?|skeletons?)\b/i,
  /\b(?:silk|leather|velvet|obsidian|gold|silver|bronze|iron|steel|marble|stone|crystal|wood|bone|flesh)\b/i,
  /\b(?:multiple\s+subjects?|two\s+warriors|pair\s+of|trio|group\s+of|army|clashing\s+warriors)\b/i,
  /\b(?:colossal|gargantuan|mountain[- ]sized|towering\s+over\s+cities|gigantic\s+presence)\b/i
];

/**
 * Character/humanoid subject and portrait markers to check when Context Focus is Object or Scenario.
 */
const CHARACTER_SUBJECT_PATTERNS = [
  /\b(?:warrior|knight|mage|wizard|hero|paladin|adventurer|fighter|soldier|king|queen|noble|person|man|woman|humanoid|character)\b/i,
  /\b(?:standing\s+pose|action\s+pose|heroic\s+stance|combat\s+ready|wielding\s+a\s+weapon|holding\s+a\s+sword|casting\s+a\s+spell)\b/i,
  /\b(?:filling\s+the\s+frame|close[- ]up\s+portrait|portrait|bust\s+shot|character\s+protagonist)\b/i
];

/**
 * Checks if a text fragment is purely a transferable illustration technique.
 */
export const isTransferableTechnique = (text: string): boolean => {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < 3) return false;

  // If it mentions clothing/attire/armor/subjects/environments/materials/scale, it's not purely transferable
  if (/\b(?:armor|clothing|clothes|robes?|attire|dress|suit|fabric|velvet|leather|obsidian|sword|cathedral|castle|crypt|demon|dragon|warrior|knight|mage|noble|human|person|creature|beast|monster|colossal|gargantuan|towering|cities|violet|emerald|purple|portrait|bust\s*shot|blood|splatter|gore)\b/i.test(t)) {
    return false;
  }

  return TRANSFERABLE_TECHNIQUE_PATTERNS.some(p => p.test(t));
};

/**
 * Checks if a text fragment contains conditional features (subject, color, material, attire, environment).
 */
export const isConditionalFeature = (text: string): boolean => {
  if (!text || typeof text !== "string") return false;
  return CONDITIONAL_FEATURE_PATTERNS.some(p => p.test(text));
};

/**
 * Strips or isolates known identity details from a fragment.
 * Processes ALL known identity details without early return and handles multiple occurrences.
 */
export const filterFragmentForIdentity = (
  text: string,
  knownIdentityDetails: string[]
): { cleanedText: string; blockedDetail?: string; blockedDetails: string[]; safeToKeep: boolean } => {
  if (!text || typeof text !== "string") {
    return { cleanedText: "", blockedDetails: [], safeToKeep: false };
  }

  const normalizedText = NORMALIZE(text);
  if (!normalizedText) {
    return { cleanedText: "", blockedDetails: [], safeToKeep: false };
  }

  const validDetails = (knownIdentityDetails || [])
    .filter(d => typeof d === "string" && d.trim().length >= 3);

  if (validDetails.length === 0) {
    return { cleanedText: text.trim(), blockedDetails: [], safeToKeep: true };
  }

  // Split into clauses to allow preserving transferable parts
  const subClauses = text.split(/[,;]+/).map(c => c.trim()).filter(Boolean);
  const foundBlocked = new Set<string>();

  const isClauseContaminated = (clause: string): boolean => {
    const normClause = NORMALIZE(clause);
    if (!normClause) return true;
    for (const rawDetail of validDetails) {
      const normDetail = NORMALIZE(rawDetail);
      if (!normDetail) continue;
      const detailRegex = new RegExp("(^|\\s)" + escapeRegex(normDetail) + "($|\\s)", "i");
      if (detailRegex.test(normClause) || normClause.includes(normDetail)) {
        foundBlocked.add(rawDetail);
        return true;
      }
    }
    return false;
  };

  const safeSubClauses = subClauses.filter(clause => !isClauseContaminated(clause));
  const blockedDetailsList = Array.from(foundBlocked);

  if (safeSubClauses.length > 0) {
    const candidateCleaned = safeSubClauses.join(", ");
    // Verify candidateCleaned does not retain any known detail
    const stillContaminated = validDetails.some(rawDetail => {
      const normDetail = NORMALIZE(rawDetail);
      const detailRegex = new RegExp("(^|\\s)" + escapeRegex(normDetail) + "($|\\s)", "i");
      return detailRegex.test(NORMALIZE(candidateCleaned));
    });

    if (!stillContaminated) {
      return {
        cleanedText: candidateCleaned,
        blockedDetail: blockedDetailsList[0],
        blockedDetails: blockedDetailsList,
        safeToKeep: true
      };
    }
  }

  if (blockedDetailsList.length > 0) {
    return {
      cleanedText: "",
      blockedDetail: blockedDetailsList[0],
      blockedDetails: blockedDetailsList,
      safeToKeep: false
    };
  }

  return {
    cleanedText: text.trim(),
    blockedDetails: [],
    safeToKeep: true
  };
};

/**
 * Validates a single clause for compatibility against user prompt, exclusions, Context Focus, and Archetype preset.
 */
export const checkSingleClauseCompatibility = (
  clauseText: string,
  context: SynthesisContext,
  field?: string
): { compatible: boolean; reason: string } => {
  const normClause = NORMALIZE(clauseText);
  if (!normClause) {
    return { compatible: false, reason: "Empty or whitespace-only clause." };
  }

  const words = normClause.split(/\s+/);

  // 1. User Negative Exclusions (PromptParser)
  const exclusions = context.excludedPhrases ?? parsePromptIntent(context.subject).excludedPhrases;
  if (matchesPromptExclusion(clauseText, exclusions)) {
    return { compatible: false, reason: 'Matches a contextual user exclusion.' };
  }
  if (exclusions.length === 0 && context.excludedWords && context.excludedWords.size > 0) {
    for (const w of words) {
      if (context.excludedWords.has(w)) {
        return {
          compatible: false,
          reason: `Contains user-excluded word '${w}'.`
        };
      }
    }
  }

  const normSubject = NORMALIZE(context.affirmativeText || context.subject);
  const subjectWords = new Set(normSubject.split(/\s+/).filter(w => w.length > 2));

  // 2. Context Focus Check (Object or Scenario)
  if (context.context === Context.Scenario) {
    const imposesCharacterOrPortrait =
      CHARACTER_SUBJECT_PATTERNS.some(p => p.test(clauseText)) ||
      /\b(?:warrior|knight|mage|wizard|hero|person|character)\s+(?:filling\s+the\s+frame|in\s+a\s+close[- ]up|portrait)\b/i.test(clauseText) ||
      /\b(?:arms?|hands?|legs?|feet|head|torso|wings?|face)\s+(?:outstretched|raised|crossed|holding|reaching|spread)\b/i.test(clauseText) ||
      /\b(?:conjuring|casting|wielding|holding|gripping|drawing|aiming|standing|kneeling|sitting|walking|running|combat\s*ready)\b/i.test(clauseText);

    const userPromptAskedCharacter = Array.from(subjectWords).some(w =>
      ["warrior", "knight", "mage", "wizard", "hero", "person", "character", "noble", "demon", "dragon"].includes(w)
    );

    if (imposesCharacterOrPortrait && !userPromptAskedCharacter) {
      return {
        compatible: false,
        reason: "Imposes a warrior or character protagonist when Context Focus is Scenario."
      };
    }
  }

  if (context.context === Context.Object) {
    const imposesCharacter =
      CHARACTER_SUBJECT_PATTERNS.some(p => p.test(clauseText)) ||
      /\b(?:arms?|hands?|legs?|feet|head|torso|wings?|face)\s+(?:outstretched|raised|crossed|holding|reaching|spread)\b/i.test(clauseText) ||
      /\b(?:conjuring|casting|wielding|holding|gripping|drawing|aiming|standing|kneeling|sitting|walking|running|combat\s*ready)\b/i.test(clauseText);

    const userPromptAskedCharacter = Array.from(subjectWords).some(w =>
      ["warrior", "knight", "mage", "wizard", "hero", "person", "character", "noble", "demon", "dragon"].includes(w)
    );

    if (imposesCharacter && !userPromptAskedCharacter) {
      return {
        compatible: false,
        reason: "Imposes a character protagonist when Context Focus is Object."
      };
    }
  }

  // 3. Archetype Preset Rules & Forbidden Terms
  const archetypeRules = ARCHETYPE_POLICY_RULES[context.archetype] || ARCHETYPE_POLICY_RULES[Archetype.Generic];

  if (archetypeRules.forbiddenTerms && archetypeRules.forbiddenTerms.length > 0) {
    for (const term of archetypeRules.forbiddenTerms) {
      const normTerm = NORMALIZE(term);
      const termWords = normTerm.split(/\s+/).filter(Boolean);

      // Check if term matches contiguously/tightly
      let matches = false;
      if (termWords.length === 1) {
        const boundaryRegex = new RegExp("(^|\\s)" + escapeRegex(normTerm) + "($|\\s)", "i");
        matches = boundaryRegex.test(normClause);
      } else {
        // Tight contiguous phrase match (e.g. "black armor", "dark castle")
        const phraseRegex = new RegExp("(^|\\s)" + termWords.map(escapeRegex).join("\\s+(?:[a-z]+\\s+)?") + "($|\\s)", "i");
        matches = phraseRegex.test(normClause);
      }

      if (matches) {
        // Check linework/contour exception: "black linework" or "dark contour" does NOT mean black armor/clothing!
        if (normTerm === "black armor" || normTerm === "dark armor" || normTerm === "black clothing") {
          const isLineworkOnly = /\b(?:black|dark)\s+(?:linework|line\s*art|outlines?|contours?|ink|shading)\b/i.test(clauseText);
          const isWhiteCeremonial = /\bwhite\s+(?:ceremonial\s+)?(?:armor|clothes|clothing|robes?)\b/i.test(clauseText);
          if (isLineworkOnly || isWhiteCeremonial) {
            continue;
          }
        }

        // Royal Carmine ceremonial blood exception: only applies to generic term "blood",
        // NEVER to explicit "blood splatter", "pools of blood", "excessive blood", or "gore"!
        if (context.archetype === Archetype.RoyalCarmine && normTerm === "blood") {
          const hasGoreOrSplatter = /\b(?:splatter|pools?|excessive|gore|dripping|bloody)\b/i.test(clauseText);
          const isCeremonialBlood = /\bblood\s+(?:pact|contract|seals?|symbols?|ritual|oath)\b/i.test(clauseText);
          if (isCeremonialBlood && !hasGoreOrSplatter) {
            continue;
          }
        }

        // Exception: if the user EXPLICITLY requested this term in their affirmative description, prompt prevails
        if (containsTerm(normSubject, normTerm)) {
          continue;
        }

        return {
          compatible: false,
          reason: `Conflicts with ${context.archetype} preset rule forbidding '${term}'.`
        };
      }
    }
  }

  // Explicit check for Royal Carmine: blood splatter / pools of blood / gore is strictly forbidden even if "blood pact" is nearby
  if (context.archetype === Archetype.RoyalCarmine) {
    if (/\b(?:blood\s*splatter|pools?\s+of\s+blood|excessive\s+blood|gore|bloody\s+floor|blood\s+dripping)\b/i.test(clauseText)) {
      if (!containsTerm(normSubject, "blood splatter") && !containsTerm(normSubject, "gore")) {
        return {
          compatible: false,
          reason: "Conflicts with Royal Carmine preset forbidding blood splatter, pools of blood, and gore."
        };
      }
    }
  }

  // 4. Archetype Simplicity (e.g. Zodiac Talismans)
  if (archetypeRules.avoidRealismOrMicrodetails) {
    if (/\b(?:realistic\s*anatomy|detailed\s*fur|hyperdetailed|microdetail|photorealistic|complex\s*background)\b/i.test(clauseText)) {
      return {
        compatible: false,
        reason: `Contradicts ${context.archetype} requirement for simple calligraphic talisman art.`
      };
    }
  }

  // 5. Subject Contradictions & Black/Dark Attire vs White Silk or Royal Carmine
  const isWhiteSilkRequest = /\b(?:white\s*silk|seda\s*branca|white\s*robe|white\s*garment|ivory\s*silk)\b/i.test(normSubject);
  if (isWhiteSilkRequest || context.archetype === Archetype.RoyalCarmine) {
    const isLineworkOnly = /\b(?:black|dark)\s+(?:linework|line\s*art|outlines?|contours?|ink|shading)\b/i.test(clauseText);
    const hasWhiteAttire = /\b(?:white|ivory|almond|silver)\s+(?:ceremonial\s+)?(?:armor|clothes|clothing|robes?|silk)\b/i.test(clauseText);

    const isBlackDarkAttire = /\b(?:black|dark)\s+(?:heavy\s+|plate\s+|iron\s+|organic\s+|gothic\s+|dominant\s+)?(?:armor|plate|clothing|clothes|garments?|robes?|attire|suit)\b/i.test(clauseText);
    const isDarkMaterial = /\b(?:obsidian|black\s+iron|dark\s+steel|gothic\s+armor|dark\s+armor)\b/i.test(clauseText);

    if ((isBlackDarkAttire || isDarkMaterial) && !isLineworkOnly && !hasWhiteAttire) {
      if (!containsTerm(normSubject, "black armor") && !containsTerm(normSubject, "armadura preta")) {
        return {
          compatible: false,
          reason: `Imposes black/gothic armor or dark materials onto a subject requested in white silk or Royal Carmine.`
        };
      }
    }
  }

  // 6. Colossal Scale imposition onto humans (MUST check before transferable fast-track)
  if (/\b(?:colossal|gargantuan|mountain[- ]sized|towering\s+over\s+cities)\b/i.test(normClause)) {
    const isHumanEntity = /\b(?:human|noble|mage|wizard|knight|cleric|scholar|artificer|person)\b/i.test(normSubject);
    if (isHumanEntity && !containsTerm(normSubject, "colossal") && !containsTerm(normSubject, "gargantuan")) {
      return {
        compatible: false,
        reason: "Imposes colossal/gargantuan scale onto a human entity."
      };
    }
  }

  // 7. Multiple Subjects imposition
  if (/\b(?:multiple\s+subjects?|two\s+warriors|army|group\s+of)\b/i.test(normClause)) {
    const userAskedMultiple = /\b(?:multiple|two|pair|group|army|battle\s+between|clash)\b/i.test(normSubject);
    if (!userAskedMultiple) {
      return {
        compatible: false,
        reason: "Imposes multiple subjects onto a single-entity prompt."
      };
    }
  }

  // 8. Dominant vs Accent Colors (e.g. Crimson in Royal Carmine vs White silk)
  if (context.archetype === Archetype.RoyalCarmine || isWhiteSilkRequest) {
    const isDominantCrimson =
      /\b(?:dominant\s+crimson|crimson\s+dominant)\b/i.test(clauseText) ||
      /\bcrimson\s+(?:clothing|clothes|garments?|robes?|attire|suit)\s+covering\s+the\s+(?:entire\s+)?figure\b/i.test(clauseText) ||
      /\bcovering\s+the\s+entire\s+figure\s+in\s+crimson\b/i.test(clauseText) ||
      /\bdominant\s+crimson\s+clothing\b/i.test(clauseText);

    if (isDominantCrimson) {
      return {
        compatible: false,
        reason: `Crimson is allowed only as an accent in ${context.archetype} and contradicts the requested white clothing.`
      };
    }
  }

  // 9. Color Role & Compatibility Evaluation (Palette fields, Garment colors, materials)
  const isPaletteField = field === "paletteLogic" || field === "palette";
  const specifiesClothing = /\b(?:clothing|clothes|garments?|robes?|attire|suit|outfit|fabric|dresses?|cloaks?|tunics?|armor|plate)\b/i.test(clauseText);
  const specifiesDominantPalette = /\b(?:dominant\s+[a-z]+|palette\s+logic|tones?|hues?)\b/i.test(clauseText);

  // Complete chromatic vocabulary recognition
  const COLOR_REGEX = /\b(?:emerald\s+green|golden|gold|emerald|green|cyan|teal|navy|turquoise|blue|violet|purple|magenta|pink|brown|bronze|silver|ivory|cream|beige|amber|black|white|gray|grey|red|crimson|orange|yellow)\b/gi;

  interface ColorOccurrence {
    color: string;
    index: number;
    length: number;
  }

  const occurrences: ColorOccurrence[] = [];
  let m: RegExpExecArray | null;
  while ((m = COLOR_REGEX.exec(clauseText)) !== null) {
    occurrences.push({
      color: NORMALIZE(m[0]),
      index: m.index,
      length: m[0].length
    });
  }

  type VisualColorRole =
    | 'linework'
    | 'lighting'
    | 'shadow'
    | 'accent'
    | 'dominant_clothing'
    | 'clothing'
    | 'palette';

  const determineRoleForOccurrence = (
    color: string,
    textBefore: string,
    textAfter: string
  ): VisualColorRole => {
    // 1. Linework / line art / contour / ink
    if (
      /^\s*(?:linework|line\s*art|outlines?|contours?|ink(?:\s*strokes?)?)\b/i.test(textAfter) ||
      /\b(?:linework|line\s*art|outlines?|contours?|ink)\s+(?:in|of|with)\s*$/i.test(textBefore)
    ) {
      return 'linework';
    }

    // 2. Lighting / glow / light / energy
    if (
      /^\s*(?:rim\s*light(?:ing)?|lighting|light(?:s)?|glow(?:ing)?|illumination|highlights?|specular(?:\s*highlights?)?|reflections?|aura|energy|rays?)\b/i.test(textAfter) ||
      /\b(?:rim\s*light(?:ing)?|lighting|light|glow|highlights?)\s+(?:in|of|with)\s*$/i.test(textBefore)
    ) {
      return 'lighting';
    }

    // 3. Shadow / shading
    if (
      /^\s*(?:shadows?|shading|falloff|depth)\b/i.test(textAfter) ||
      /\b(?:shadows?|shading)\s+(?:in|of|with)\s*$/i.test(textBefore)
    ) {
      return 'shadow';
    }

    // 4. Accent / trim / embroidery / gemstone / detail / seals
    if (
      /^\s*(?:(?:embroidered\s+)?accents?|trim(?:s|mings?)?|embroidery|embroidered|gemstones?|gems?|jewels?|jewelry|filigree|seals?|symbols?|runes?|markings?|details?)\b/i.test(textAfter) ||
      /\b(?:accents?|trim(?:s)?|embroidery|gemstones?|gems?|jewels?|seals?|symbols?|runes?)\s+(?:in|of|with)\s*$/i.test(textBefore) ||
      (/\b(?:small|subtle|delicate|minor)\s*$/i.test(textBefore) && /^\s*(?:gemstones?|gems?|jewels?|accents?|details?|seals?)\b/i.test(textAfter))
    ) {
      return 'accent';
    }

    // 5. Dominant clothing: "dominant" must modify clothing / attire / armor / figure
    const isPrecededByDominant = /\bdominant\s*$/i.test(textBefore);
    const isFollowedByClothing =
      /^\s*(?:clothing|clothes|garments?|robes?|attire|suit|outfit|fabric|silk|velvet|leather|armor|plate|cuirass|gauntlets?|pauldrons?|helmets?|dresses?|cloaks?|tunics?)\b/i.test(textAfter) ||
      /^\s+[a-z]+\s+(?:clothing|clothes|garments?|robes?|attire|suit|outfit|fabric|silk|velvet|leather|armor|plate)\b/i.test(textAfter);

    const isCoveringFigure =
      /covering\s+the\s+(?:entire\s+)?figure\b/i.test(textAfter) ||
      /\bcovering\s+the\s+(?:entire\s+)?figure\s+in\s*$/i.test(textBefore);

    if (
      (isPrecededByDominant && isFollowedByClothing) ||
      isCoveringFigure ||
      /^\s+(?:clothing|clothes|garments?|robes?|attire|suit)\s+dominant\b/i.test(textAfter)
    ) {
      return 'dominant_clothing';
    }

    // 6. Clothing / attire / armor / material
    if (
      isFollowedByClothing ||
      /\b(?:silk|clothing|clothes|garments?|robes?|attire|suit|armor)\s+(?:in|of)\s*$/i.test(textBefore)
    ) {
      return 'clothing';
    }

    // 7. Palette field or dominant palette specification
    if (isPaletteField || specifiesDominantPalette || isPrecededByDominant) {
      return 'palette';
    }

    return 'clothing';
  };

  if (occurrences.length > 0) {
    for (const occ of occurrences) {
      const col = occ.color;
      const textBefore = clauseText.slice(0, occ.index);
      const textAfter = clauseText.slice(occ.index + occ.length);
      const role = determineRoleForOccurrence(col, textBefore, textAfter);

      // Linework / outlines: transferable illustration technique
      if (role === 'linework') {
        if (matchesPromptExclusion(`${col} linework`, exclusions)) {
          return {
            compatible: false,
            reason: `Linework color '${col}' is excluded by user.`
          };
        }
        continue;
      }

      // Lighting / rim light: transferable lighting technique
      if (role === 'lighting') {
        if (matchesPromptExclusion(`${col} lighting`, exclusions)) {
          return {
            compatible: false,
            reason: `Lighting color '${col}' is excluded by user.`
          };
        }
        const supported = ['white', 'gold', 'golden', 'black', 'gray', 'grey'].includes(col) || containsTerm(normSubject, col) ||
          [...archetypeRules.signatureTerms, ...(archetypeRules.allowedAccentColors || [])].some(term => containsTerm(term, col));
        if (!supported) return { compatible: false, reason: `Lighting color '${col}' has no affirmative support.` };
        continue;
      }

      // Shadow / shading: transferable technique
      if (role === 'shadow') {
        if (matchesPromptExclusion(`${col} shading`, exclusions)) {
          return {
            compatible: false,
            reason: `Shadow color '${col}' is excluded by user.`
          };
        }
        continue;
      }

      // Dominant clothing:
      if (role === 'dominant_clothing') {
        if (isWhiteSilkRequest || context.archetype === Archetype.RoyalCarmine) {
          if (!["white", "snow white", "ivory", "almond", "cream", "pearl", "silver"].includes(col)) {
            return {
              compatible: false,
              reason: `Dominant ${col} clothing contradicts requested white attire and ${context.archetype} palette.`
            };
          }
        } else {
          const inPrompt = containsTerm(normSubject, col);
          const inArchetype = archetypeRules.allowedClothingColors?.some(ac => containsTerm(ac, col)) ||
                              archetypeRules.signatureTerms?.some(st => containsTerm(st, col));
          if (!inPrompt && !inArchetype) {
            return {
              compatible: false,
              reason: `Dominant ${col} clothing contradicts user prompt and ${context.archetype} preset.`
            };
          }
        }
        continue;
      }

      // Clothing / attire / armor:
      if (role === 'clothing') {
        if (isWhiteSilkRequest || context.archetype === Archetype.RoyalCarmine) {
          const isWhiteAttireColor = ["white", "snow white", "ivory", "almond", "cream", "pearl", "silver"].includes(col);
          if (!isWhiteAttireColor && !containsTerm(normSubject, col)) {
            return {
              compatible: false,
              reason: `Clothing color ('${col}') contradicts requested white attire and ${context.archetype} palette.`
            };
          }
        } else {
          const inPrompt = containsTerm(normSubject, col);
          const inArchetype = archetypeRules.allowedClothingColors?.some(ac => containsTerm(ac, col)) ||
                              archetypeRules.signatureTerms?.some(st => containsTerm(st, col));
          if (!inPrompt && !inArchetype) {
            return {
              compatible: false,
              reason: `Clothing color ('${col}') contradicts prompt and ${context.archetype} palette.`
            };
          }
        }
        continue;
      }

      // Accent / gemstone / trim:
      if (role === 'accent') {
        const inPrompt = containsTerm(normSubject, col);
        const inArchetype =
          (context.archetype === Archetype.RoyalCarmine && ["crimson", "ruby", "red", "gold", "golden", "silver", "ivory", "white"].includes(col)) ||
          archetypeRules.allowedAccentColors?.some(color => containsTerm(color, col)) ||
          archetypeRules.signatureTerms?.some(st => containsTerm(st, col)) ||
          archetypeRules.allowedClothingColors?.some(ac => containsTerm(ac, col));

        if (!inPrompt && !inArchetype) {
          return {
            compatible: false,
            reason: `Accent color ('${col}') has no evidence in user prompt or ${context.archetype} preset.`
          };
        }
        continue;
      }

      // Palette (primary/dominant palette in paletteLogic or palette field):
      if (role === 'palette') {
        const inPrompt = containsTerm(normSubject, col);
        const inArchetype =
          (context.archetype === Archetype.RoyalCarmine && ["white", "snow white", "ivory", "almond", "cream", "pearl", "silver"].includes(col)) ||
          (archetypeRules.allowedPaletteColors
            ? archetypeRules.allowedPaletteColors.some(color => containsTerm(color, col))
            : archetypeRules.allowedClothingColors?.some(ac => containsTerm(ac, col)) || archetypeRules.signatureTerms?.some(st => containsTerm(st, col)));

        if (!inPrompt && !inArchetype) {
          return {
            compatible: false,
            reason: `Palette color ('${col}') contradicts prompt and ${context.archetype} palette.`
          };
        }
        continue;
      }
    }

    // Check if materials attached to clothing have evidence (e.g. velvet in Royal Carmine)
    if (context.archetype !== Archetype.Generic && archetypeRules.allowedMaterials && archetypeRules.allowedMaterials.length > 0) {
      if (/\b(?:velvet|leather|obsidian|iron)\b/i.test(clauseText)) {
        const matMatches = clauseText.match(/\b(?:velvet|leather|obsidian|iron)\b/gi) || [];
        for (const mat of matMatches) {
          const normMat = NORMALIZE(mat);
          const inPrompt = containsTerm(normSubject, normMat);
          const inArchetype = archetypeRules.allowedMaterials.some(am => containsTerm(am, normMat));
          if (!inPrompt && !inArchetype) {
            return {
              compatible: false,
              reason: `Conditional garment material ('${mat}') has no evidence of compatibility with prompt or ${context.archetype}.`
            };
          }
        }
      }
    }
  }

  if (!hasPositiveAdmission(clauseText, context, archetypeRules, field)) {
    return { compatible: false, reason: 'Conditional content has no affirmative support in the subject or preset.' };
  }

  // 10. Transferable technique check (only if all conditional checks have passed and no conflicting content exists)
  if (isTransferableTechnique(clauseText)) {
    return {
      compatible: true,
      reason: "Pure transferable visual technique."
    };
  }

  return {
    compatible: true,
    reason: "Compatible visual guidance."
  };
};

/**
 * Validates compatibility of a candidate fragment against user prompt, exclusions, Context Focus, and Archetype preset.
 */
export const checkCandidateCompatibility = (
  fragmentText: string,
  context: SynthesisContext,
  field?: string
): { compatible: boolean; reason: string } => {
  return checkSingleClauseCompatibility(fragmentText, context, field);
};

/**
 * Fully evaluates a single candidate fragment from a reference field.
 */
export const evaluateCandidateFragment = (
  rawFragment: string,
  field: string,
  ref: VisualDNA,
  context: SynthesisContext
): { decision: "included" | "discarded"; text: string; originalText: string; reason: string; blockedIdentity?: string; blockedIdentities?: string[]; rejectedClauses?: { text: string; reason: string }[] } => {
  if (!rawFragment || typeof rawFragment !== "string" || !rawFragment.trim()) {
    return {
      decision: "discarded",
      text: "",
      originalText: "",
      reason: `Field '${field}' is empty.`
    };
  }

  const rawTrimmed = rawFragment.trim();

  // 1. Identity Leakage Check
  const identityDetails = Array.isArray(ref.identitySpecificDetails)
    ? ref.identitySpecificDetails
    : [];

  const identityResult = filterFragmentForIdentity(rawTrimmed, identityDetails);
  const blockedDetailsList = identityResult.blockedDetails || (identityResult.blockedDetail ? [identityResult.blockedDetail] : []);

  if (!identityResult.safeToKeep || !identityResult.cleanedText) {
    return {
      decision: "discarded",
      text: rawTrimmed,
      originalText: rawTrimmed,
      reason: `Contains known identity detail ('${blockedDetailsList.join(", ")}') that cannot be safely separated.`,
      blockedIdentity: blockedDetailsList[0],
      blockedIdentities: blockedDetailsList
    };
  }

  const targetText = identityResult.cleanedText;

  // 2. Clause decomposition if compound phrase separated by commas/semicolons
  const subClauses = targetText.split(/[,;]+/).map(c => c.trim()).filter(Boolean);

  if (subClauses.length > 1) {
    const acceptedClauses: string[] = [];
    const rejectedClauses: { text: string; reason: string }[] = [];
    let lastDiscardReason = "";

    for (const clause of subClauses) {
      const clauseRes = checkSingleClauseCompatibility(clause, context, field);
      if (clauseRes.compatible) {
        acceptedClauses.push(clause);
      } else {
        lastDiscardReason = clauseRes.reason;
        rejectedClauses.push({ text: clause, reason: clauseRes.reason });
      }
    }

    if (acceptedClauses.length > 0) {
      const finalKept = acceptedClauses.join(", ");
      return {
        decision: "included",
        text: finalKept,
        originalText: rawTrimmed,
        reason: blockedDetailsList.length > 0
          ? `Kept transferable portion after removing identity detail ('${blockedDetailsList.join(", ")}').`
          : acceptedClauses.length < subClauses.length
            ? `Kept compatible portion (${finalKept}) after filtering conflicting content.`
            : "Compatible visual guidance.",
        blockedIdentity: blockedDetailsList[0],
        blockedIdentities: blockedDetailsList,
        rejectedClauses
      };
    }

    return {
      decision: "discarded",
      text: targetText,
      originalText: rawTrimmed,
      reason: lastDiscardReason || "Compound fragment contains incompatible conditional content.",
      blockedIdentity: blockedDetailsList[0],
      blockedIdentities: blockedDetailsList,
      rejectedClauses
    };
  }

  // Single clause evaluation
  const compatResult = checkSingleClauseCompatibility(targetText, context, field);
  if (!compatResult.compatible) {
    return {
      decision: "discarded",
      text: targetText,
      originalText: rawTrimmed,
      reason: compatResult.reason,
      blockedIdentity: blockedDetailsList[0],
      blockedIdentities: blockedDetailsList
    };
  }

  return {
    decision: "included",
    text: targetText,
    originalText: rawTrimmed,
    reason: blockedDetailsList.length > 0
      ? `Kept transferable portion after removing identity detail ('${blockedDetailsList.join(", ")}').`
      : compatResult.reason,
    blockedIdentity: blockedDetailsList[0],
    blockedIdentities: blockedDetailsList
  };
};

