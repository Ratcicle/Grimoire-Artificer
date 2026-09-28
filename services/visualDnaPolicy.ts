import { Archetype, Context, CardType, Complexity, VisualDNA, ContributionEvaluation } from "../types";
import { parsePromptIntent } from "./promptParser";

export interface SynthesisContext {
  subject: string;
  affirmativeText: string;
  excludedWords: Set<string>;
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

/**
 * Explicit local runtime rules derived from the archetype presets in constants.ts.
 */
export const ARCHETYPE_POLICY_RULES: Record<string, ArchetypePolicyRules> = {
  [Archetype.RoyalCarmine]: {
    forbiddenTerms: [
      "gothic", "vampire", "vampires", "vampiric", "undead", "demon", "demons", "demonic",
      "dark castle", "dark castles", "blood", "gore", "grimdark",
      "corrupted", "monstrous", "black dominant", "black clothing", "black clothes",
      "black armor", "dark armor", "black plate", "black iron", "obsidian",
      "purple fire", "purple flame", "purple flames",
      "cyberpunk", "neon"
    ],
    signatureTerms: [
      "white", "snow white", "ivory", "almond silk", "silk", "pearl",
      "silver", "gold", "crimson", "noble", "palace", "marble",
      "royal", "aristocrat", "ceremonial"
    ]
  },
  [Archetype.LuminarchKnights]: {
    forbiddenTerms: [
      "grimdark", "gothic", "blood", "mud", "rust", "battle damage",
      "dirty texture", "dark chrome", "chibi", "cartoon"
    ],
    signatureTerms: [
      "white marble", "matte silver", "gold", "petrol blue", "teal",
      "cyan", "divine", "celestial", "filigree", "plate armor"
    ]
  },
  [Archetype.ShadowHeart]: {
    forbiddenTerms: [
      "holy paladin", "clean heroic", "cheerful", "sci-fi",
      "white background", "blue sky", "cyan sky", "green magic dominance"
    ],
    signatureTerms: [
      "gothic", "cathedral", "black", "graphite", "maroon", "crimson",
      "rose red", "crystal heart", "demonic", "spikes", "thorns", "vortex"
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
    ]
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
      "robe", "runes", "glyphs", "academic", "geometric", "staff", "grimoire"
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
 * Character/humanoid subject markers to check when Context Focus is Object or Scenario.
 */
const CHARACTER_SUBJECT_PATTERNS = [
  /\b(?:warrior|knight|mage|wizard|hero|paladin|adventurer|fighter|soldier|king|queen|noble|person|man|woman|humanoid|character)\b/i,
  /\b(?:standing\s+pose|action\s+pose|heroic\s+stance|combat\s+ready|wielding\s+a\s+weapon|holding\s+a\s+sword|casting\s+a\s+spell)\b/i
];

/**
 * Checks if a text fragment is purely a transferable illustration technique.
 */
export const isTransferableTechnique = (text: string): boolean => {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < 3) return false;

  // If it mentions clothing/attire/armor/subjects/environments, it's not purely transferable
  if (/\b(?:armor|clothing|clothes|robes?|dress|sword|cathedral|castle|demon|dragon|warrior|knight|mage)\b/i.test(t)) {
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
 * Returns { cleanedText: string; blockedDetail?: string; safeToKeep: boolean }
 */
export const filterFragmentForIdentity = (
  text: string,
  knownIdentityDetails: string[]
): { cleanedText: string; blockedDetail?: string; safeToKeep: boolean } => {
  if (!text || typeof text !== "string") {
    return { cleanedText: "", safeToKeep: false };
  }

  const normalizedText = NORMALIZE(text);
  if (!normalizedText) {
    return { cleanedText: "", safeToKeep: false };
  }

  // Check each known identity detail
  for (const rawDetail of knownIdentityDetails) {
    if (!rawDetail || typeof rawDetail !== "string") continue;
    const normDetail = NORMALIZE(rawDetail);
    if (!normDetail || normDetail.length < 3) continue;

    // Check if the detail is present in the text
    const detailRegex = new RegExp("(^|\\s|[,;])" + escapeRegex(normDetail) + "($|\\s|[,;])", "i");
    if (detailRegex.test(normalizedText) || normalizedText.includes(normDetail)) {
      // Identity detail detected! Attempt safe decomposition:
      // If the fragment is a compound phrase separated by commas or semicolons:
      const subClauses = text.split(/[,;]+/).map(c => c.trim()).filter(Boolean);
      const safeSubClauses = subClauses.filter(clause => {
        const normClause = NORMALIZE(clause);
        return !normClause.includes(normDetail) && !detailRegex.test(normClause);
      });

      if (safeSubClauses.length > 0) {
        return {
          cleanedText: safeSubClauses.join(", "),
          blockedDetail: rawDetail,
          safeToKeep: true
        };
      }

      // Cannot be safely separated; discard this fragment entirely
      return {
        cleanedText: "",
        blockedDetail: rawDetail,
        safeToKeep: false
      };
    }
  }

  return {
    cleanedText: text.trim(),
    safeToKeep: true
  };
};

/**
 * Validates compatibility of a candidate fragment against user prompt, exclusions, Context Focus, and Archetype preset.
 */
export const checkCandidateCompatibility = (
  fragmentText: string,
  context: SynthesisContext
): { compatible: boolean; reason: string } => {
  const normFragment = NORMALIZE(fragmentText);
  if (!normFragment) {
    return { compatible: false, reason: "Empty or whitespace-only fragment." };
  }

  const words = normFragment.split(/\s+/);

  // 1. User Negative Exclusions (PromptParser)
  if (context.excludedWords && context.excludedWords.size > 0) {
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
  if (context.context === Context.Object) {
    // If Context is Object, do NOT import character protagonists or humanoid poses
    const imposesCharacter = CHARACTER_SUBJECT_PATTERNS.some(p => p.test(fragmentText));
    const userPromptAskedCharacter = Array.from(subjectWords).some(w =>
      ["warrior", "knight", "mage", "wizard", "hero", "person", "character", "noble", "demon", "dragon"].includes(w)
    );

    if (imposesCharacter && !userPromptAskedCharacter) {
      return {
        compatible: false,
        reason: `Imposes a character protagonist when Context Focus is Object.`
      };
    }
  }

  // 3. Archetype Preset Rules
  const archetypeRules = ARCHETYPE_POLICY_RULES[context.archetype] || ARCHETYPE_POLICY_RULES[Archetype.Generic];

  if (archetypeRules.forbiddenTerms && archetypeRules.forbiddenTerms.length > 0) {
    for (const term of archetypeRules.forbiddenTerms) {
      const normTerm = NORMALIZE(term);
      const termWords = normTerm.split(/\s+/).filter(Boolean);
      
      let matches = false;
      if (termWords.length === 1) {
        const boundaryRegex = new RegExp("(^|\\s)" + escapeRegex(normTerm) + "($|\\s)", "i");
        matches = boundaryRegex.test(normFragment);
      } else {
        // Multi-word term (e.g. "black armor", "dark castle") matches if all words appear in the fragment
        matches = termWords.every(tw => {
          const wRegex = new RegExp("(^|\\s)" + escapeRegex(tw) + "($|\\s)", "i");
          return wRegex.test(normFragment);
        });
      }

      if (matches) {
        // Exception: if the user EXPLICITLY requested this term in their affirmative description, the user prompt prevails!
        if (normSubject.includes(normTerm)) {
          continue;
        }
        return {
          compatible: false,
          reason: `Conflicts with ${context.archetype} preset rule forbidding '${term}'.`
        };
      }
    }
  }

  // 4. Archetype-specific simplicity (e.g. Zodiac Talismans)
  if (archetypeRules.avoidRealismOrMicrodetails) {
    if (/\b(?:realistic\s*anatomy|detailed\s*fur|hyperdetailed|microdetail|photorealistic|complex\s*background)\b/i.test(fragmentText)) {
      return {
        compatible: false,
        reason: `Contradicts ${context.archetype} requirement for simple calligraphic talisman art.`
      };
    }
  }

  // 5. Subject Contradictions (e.g. White Silk vs Black/Dark Armor or Materials)
  const isWhiteSilkRequest = /\b(?:white\s*silk|seda\s*branca|white\s*robe|white\s*garment|ivory\s*silk)\b/i.test(normSubject);
  if (isWhiteSilkRequest || context.archetype === Archetype.RoyalCarmine) {
    const isBlackDarkAttireOrMat = 
      /\b(?:black|dark)\b.*\b(?:armor|plate|clothing|clothes|garments?|robes?|attire|suit|spires?|iron|metal|steel)\b/i.test(normFragment) ||
      /\b(?:armor|plate|clothing|clothes|garments?|robes?|attire|metal|steel|iron)\b.*\b(?:black|dark)\b/i.test(normFragment) ||
      /\b(?:obsidian|black\s+iron|dark\s+steel|gothic\s+armor|dark\s+armor)\b/i.test(normFragment);

    if (isBlackDarkAttireOrMat) {
      if (!normSubject.includes("black armor") && !normSubject.includes("armadura preta")) {
        return {
          compatible: false,
          reason: `Imposes black/gothic armor or dark materials onto a subject requested in white silk or Royal Carmine.`
        };
      }
    }
  }

  // 6. Multiple Subjects imposition
  if (/\b(?:multiple\s+subjects?|two\s+warriors|army|group\s+of)\b/i.test(normFragment)) {
    const userAskedMultiple = /\b(?:multiple|two|pair|group|army|battle\s+between|clash)\b/i.test(normSubject);
    if (!userAskedMultiple) {
      return {
        compatible: false,
        reason: `Imposes multiple subjects onto a single-entity prompt.`
      };
    }
  }

  // 7. Colossal Scale imposition onto humans
  if (/\b(?:colossal|gargantuan|mountain[- ]sized|towering\s+over\s+cities)\b/i.test(normFragment)) {
    const isHumanEntity = /\b(?:human|noble|mage|wizard|knight|cleric|scholar|artificer|person)\b/i.test(normSubject);
    if (isHumanEntity && !normSubject.includes("colossal") && !normSubject.includes("gargantuan")) {
      return {
        compatible: false,
        reason: `Imposes colossal/gargantuan scale onto a human entity.`
      };
    }
  }

  return {
    compatible: true,
    reason: "Compatible with prompt and archetype constraints."
  };
};

/**
 * Fully evaluates a single candidate fragment from a reference field.
 */
export const evaluateCandidateFragment = (
  rawFragment: string,
  field: string,
  ref: VisualDNA,
  context: SynthesisContext
): { decision: "included" | "discarded"; text: string; reason: string; blockedIdentity?: string } => {
  if (!rawFragment || typeof rawFragment !== "string" || !rawFragment.trim()) {
    return {
      decision: "discarded",
      text: "",
      reason: `Field '${field}' is empty.`
    };
  }

  // 1. Identity Leakage Check
  const identityDetails = Array.isArray(ref.identitySpecificDetails)
    ? ref.identitySpecificDetails
    : [];

  const identityResult = filterFragmentForIdentity(rawFragment, identityDetails);
  if (!identityResult.safeToKeep || !identityResult.cleanedText) {
    return {
      decision: "discarded",
      text: rawFragment.trim(),
      reason: `Contains known identity detail ('${identityResult.blockedDetail}') that cannot be safely separated.`,
      blockedIdentity: identityResult.blockedDetail
    };
  }

  const targetText = identityResult.cleanedText;

  // 2. Compatibility Check
  const compatResult = checkCandidateCompatibility(targetText, context);
  if (!compatResult.compatible) {
    return {
      decision: "discarded",
      text: targetText,
      reason: compatResult.reason,
      blockedIdentity: identityResult.blockedDetail
    };
  }

  return {
    decision: "included",
    text: targetText,
    reason: identityResult.blockedDetail
      ? `Kept transferable portion after removing identity detail ('${identityResult.blockedDetail}').`
      : "Compatible visual guidance.",
    blockedIdentity: identityResult.blockedDetail
  };
};
