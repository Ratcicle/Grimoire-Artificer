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


export const DEFAULT_VISUAL_DNA_SCORES = {
  style: 0.5, palette: 0.5, pose: 0.5, composition: 0.5, lighting: 0.5, effects: 0.5, materials: 0.5, background: 0.5, details: 0.5, silhouette: 0.5, rendering: 0.5
};

export const VALID_UTILITY_DIMENSIONS = [
  'style', 'palette', 'pose', 'composition', 'lighting', 'effects',
  'materials', 'background', 'details', 'silhouette', 'rendering', 'detailDensity'
] as const;

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

    if (val === null || val === undefined) {
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

export const normalizeVisualDNAAnalysis = (parsed: any, originalWarnings: string[] = []): Partial<VisualDNA> => {
  // Deep clone to ensure input object is never mutated
  const normalized: any = JSON.parse(JSON.stringify(parsed || {}));
  
  const remoteWarnings = Array.isArray(parsed?.warnings)
    ? parsed.warnings.filter((value: any): value is string => typeof value === "string")
    : [];
    
  const warnings: string[] = [...remoteWarnings, ...originalWarnings];

  // Normalize string fields
  const stringFields = [
    'summary', 'linework', 'rendering', 'palette', 'silhouette', 'pose',
    'framing', 'composition', 'lighting', 'effects', 'materials', 'details',
    'background', 'hierarchy', 'positivePrompt', 'negativePrompt',
    'visualMotifs', 'shapeLanguage', 'focalAnchors', 'detailPlacement',
    'compositionRecipe', 'paletteLogic', 'materialBehavior', 'energyDesign',
    'styleAnchors', 'avoidRules', 'analysisStatus'
  ];

  stringFields.forEach(field => {
    if (typeof normalized[field] === 'string') {
      normalized[field] = normalized[field].replace(/\s+/g, ' ').trim();
    } else if (Array.isArray(normalized[field])) {
      normalized[field] = normalized[field].join(', ').replace(/\s+/g, ' ').trim();
    } else {
      normalized[field] = '';
    }
  });

  const arrayStringFields = [
    'stylePromptFragments', 'contentMotifs', 'identitySpecificDetails',
    'universalQualityAvoids', 'styleSpecificAvoids', 'contentSpecificAvoids'
  ];

  arrayStringFields.forEach(field => {
    if (Array.isArray(normalized[field])) {
      normalized[field] = normalized[field].filter((item: any) => typeof item === 'string').map((item: string) => item.replace(/\s+/g, ' ').trim());
    } else {
      normalized[field] = [];
    }
  });

  // Normalize arrays
  if (!Array.isArray(normalized.tags)) {
    normalized.tags = [];
  }
  
  const coreTags = normalized.tags
    .filter((t: any) => typeof t === 'string' && t.trim() !== '')
    .map((t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim())
    .filter((t: string) => ALLOWED_VISUAL_TAGS.includes(t));

  const derivedTags: string[] = [];

  if (normalized.subjectProfile?.subjectCategory) {
     derivedTags.push(normalized.subjectProfile.subjectCategory.toLowerCase());
  }
  
  if (normalized.scaleProfile) {
    normalized.scaleProfile.confidence = Math.max(0, Math.min(1, Number(normalized.scaleProfile.confidence) || 0));
    normalized.scaleProfile.scaleForms = Array.isArray(normalized.scaleProfile.scaleForms) ? normalized.scaleProfile.scaleForms : [];
    normalized.scaleProfile.scaleCues = Array.isArray(normalized.scaleProfile.scaleCues) ? normalized.scaleProfile.scaleCues : [];

    if (normalized.scaleProfile.confidence >= 0.5) {
      if (normalized.scaleProfile.physicalScale) derivedTags.push(normalized.scaleProfile.physicalScale.toLowerCase());
      if (normalized.scaleProfile.perceivedPresence) derivedTags.push(normalized.scaleProfile.perceivedPresence.toLowerCase());
      if (normalized.scaleProfile.scaleForms.length > 0) derivedTags.push(...normalized.scaleProfile.scaleForms.map((t: string) => t.toLowerCase()));
      if (normalized.scaleProfile.scaleCues.length > 0) derivedTags.push(...normalized.scaleProfile.scaleCues.map((t: string) => t.toLowerCase()));
    } else {
      warnings.push("Scale profile ignored for tags due to low confidence.");
    }
  }

  if (normalized.substanceProfile) {
    normalized.substanceProfile.confidence = Math.max(0, Math.min(1, Number(normalized.substanceProfile.confidence) || 0));
    normalized.substanceProfile.materials = Array.isArray(normalized.substanceProfile.materials) ? normalized.substanceProfile.materials.slice(0, 4) : [];
    normalized.substanceProfile.surfaces = Array.isArray(normalized.substanceProfile.surfaces) ? normalized.substanceProfile.surfaces.slice(0, 4) : [];
    normalized.substanceProfile.elements = Array.isArray(normalized.substanceProfile.elements) ? normalized.substanceProfile.elements.slice(0, 2) : [];
    normalized.substanceProfile.elementApplications = Array.isArray(normalized.substanceProfile.elementApplications) ? normalized.substanceProfile.elementApplications.slice(0, 3) : [];

    // Element Applications Validation
    const elements = normalized.substanceProfile.elements;
    let apps = normalized.substanceProfile.elementApplications;
    
    if (apps.includes("weapon infusion") && elements.length === 0) {
      apps = apps.filter((a: string) => a !== "weapon infusion");
      warnings.push("Removed weapon infusion application due to missing elements.");
    }
    if (apps.includes("armor infusion") && elements.length === 0) {
      apps = apps.filter((a: string) => a !== "armor infusion");
      warnings.push("Removed armor infusion application due to missing elements.");
    }
    if (apps.includes("elemental veins") && elements.length === 0) {
      apps = apps.filter((a: string) => a !== "elemental veins");
      warnings.push("Removed elemental veins application due to missing elements.");
    }
    normalized.substanceProfile.elementApplications = apps;

    if (normalized.substanceProfile.confidence >= 0.5) {
      derivedTags.push(...normalized.substanceProfile.materials.map((t: string) => t.toLowerCase()));
      derivedTags.push(...normalized.substanceProfile.surfaces.map((t: string) => t.toLowerCase()));
      derivedTags.push(...normalized.substanceProfile.elements.map((t: string) => t.toLowerCase()));
      derivedTags.push(...normalized.substanceProfile.elementApplications.map((t: string) => t.toLowerCase()));
    } else {
      warnings.push("Substance profile ignored for tags due to low confidence.");
    }
  }

  if (Array.isArray(normalized.subjects)) {
    normalized.subjects = normalized.subjects.slice(0, 4).map((sub: any) => ({
      ...sub,
      materials: Array.isArray(sub.materials) ? sub.materials : [],
      surfaces: Array.isArray(sub.surfaces) ? sub.surfaces : [],
      elements: Array.isArray(sub.elements) ? sub.elements : [],
    }));
  }

  if (Array.isArray(normalized.scaleRelationships)) {
    normalized.scaleRelationships = normalized.scaleRelationships.filter((rel: any) => rel.subjectA && rel.subjectB).slice(0, 3);
  }

  // Combine, deduplicate, filter allowed
  let combinedTags = [...new Set([...coreTags, ...derivedTags])]
    .filter(t => ALLOWED_VISUAL_TAGS.includes(t));

  // Resolve Scale Contradictions
  const scaleTags = ["tiny", "small creature", "human scale", "large creature", "giant", "colossal", "titanic", "cosmic scale"];
  const presentScaleTags = combinedTags.filter(t => scaleTags.includes(t));
  if (presentScaleTags.length > 1) {
    let chosenScale = "";
    if (normalized.scaleProfile?.physicalScale && scaleTags.includes(normalized.scaleProfile.physicalScale.toLowerCase())) {
      chosenScale = normalized.scaleProfile.physicalScale.toLowerCase();
    } else {
      chosenScale = presentScaleTags.includes("human scale") ? "human scale" : presentScaleTags[0];
    }
    combinedTags = combinedTags.filter(t => !scaleTags.includes(t) || t === chosenScale);
    if (normalized.scaleProfile) normalized.scaleProfile.physicalScale = chosenScale;
    warnings.push(`Resolved scale contradiction to ${chosenScale}`);
  } else if (presentScaleTags.length === 1 && normalized.scaleProfile) {
    normalized.scaleProfile.physicalScale = presentScaleTags[0];
  }

  // Resolve Presence Contradictions
  const presenceTags = ["intimate presence", "balanced presence", "dominant presence", "monumental presence", "overwhelming presence"];
  const presentPresenceTags = combinedTags.filter(t => presenceTags.includes(t));
  if (presentPresenceTags.length > 1) {
    let chosenPresence = "";
    if (normalized.scaleProfile?.perceivedPresence && presenceTags.includes(normalized.scaleProfile.perceivedPresence.toLowerCase())) {
      chosenPresence = normalized.scaleProfile.perceivedPresence.toLowerCase();
    } else {
      chosenPresence = presentPresenceTags.includes("dominant presence") ? "dominant presence" : presentPresenceTags[0];
    }
    combinedTags = combinedTags.filter(t => !presenceTags.includes(t) || t === chosenPresence);
    if (normalized.scaleProfile) normalized.scaleProfile.perceivedPresence = chosenPresence;
    warnings.push(`Resolved presence contradiction to ${chosenPresence}`);
  } else if (presentPresenceTags.length === 1 && normalized.scaleProfile) {
    normalized.scaleProfile.perceivedPresence = presentPresenceTags[0];
  }

  // Priorities for limiting (specificity)
  const priorityOrder = [
    "Core Subject", "Physical Scale", "Perceived Presence", "Materials", "Elements", "Element Application", "Surface / Finish", "Scale Form", "Scale Cues", "Core", "Generic"
  ];

  const getTagCategory = (tag: string) => {
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

  combinedTags.sort((a, b) => {
    const catA = getTagCategory(a);
    const catB = getTagCategory(b);
    return priorityOrder.indexOf(catA) - priorityOrder.indexOf(catB);
  });

  normalized.tags = combinedTags.slice(0, 14);

  if (parsed.scores && typeof parsed.scores === 'object') {
    const scoreVal = validateVisualDNAScores(parsed.scores, parsed.scoreJustifications);
    normalized.scores = scoreVal.validatedScores;
    if (Object.keys(scoreVal.justifications).length > 0) {
      normalized.scoreJustifications = scoreVal.justifications;
    }
    if (scoreVal.isValid) {
      if (parsed.isCalibrated !== false) {
        normalized.isCalibrated = true;
        normalized.calibrationVersion = parsed.calibrationVersion || 3;
      } else {
        normalized.isCalibrated = false;
      }
    } else {
      warnings.push(...scoreVal.errors);
      normalized.isCalibrated = false;
      normalized.calibrationVersion = undefined;
    }
  } else {
    normalized.scores = {};
    normalized.isCalibrated = false;
  }

  if (parsed.scoreJustifications && typeof parsed.scoreJustifications === 'object') {
    normalized.scoreJustifications = normalized.scoreJustifications || {};
    for (const [k, v] of Object.entries(parsed.scoreJustifications)) {
      if (typeof v === 'string' && v.trim()) {
        normalized.scoreJustifications[k] = v.trim().replace(/\s+/g, ' ');
      }
    }
  }

  normalized.analysisVersion = 3;
  if (!normalized.analysisStatus || !['complete', 'partial', 'legacy'].includes(normalized.analysisStatus)) {
    if (normalized.subjectProfile?.subjectCategory && normalized.scaleProfile?.physicalScale && normalized.substanceProfile?.materials) {
       normalized.analysisStatus = 'complete';
    } else if (normalized.subjectProfile || normalized.scaleProfile || normalized.substanceProfile) {
       normalized.analysisStatus = 'partial';
    } else {
       normalized.analysisStatus = 'legacy';
    }
  }

  const cleanWarnings = warnings
    .filter(w => typeof w === 'string' && w.trim() !== '')
    .map(w => w.trim().replace(/\s+/g, ' '));
  normalized.warnings = [...new Set(cleanWarnings)];

  return normalized;
};
export const VISUAL_TAG_KEYWORDS: Record<string, string[]> = {
  "boss monster": ["boss", "final boss", "ace monster", "overlord", "supreme entity", "ultimate form", "godlike ruler", "overwhelming boss presence", "titan"],
  "spell artwork": ["spell", "magic", "incantation", "conjure", "sorcery"],
  "trap artwork": ["trap", "ambush", "trigger", "counter", "bind"],
  "field spell": ["field spell", "environment artwork", "location-focused artwork", "wide environmental scene", "magical location", "battlefield environment"],
  "humanoid": ["warrior", "knight", "mage", "sorcerer", "outlaw", "gunslinger", "priest", "skeleton", "undead", "human", "elf", "dwarf", "preacher", "sheriff", "undertaker"],
  "creature": ["beast", "wolf", "dragon", "crawler", "spider", "monster", "creature", "golem"],
  "dragon": ["dragon", "wyvern", "drake", "serpent"],
  "machine": ["machine", "gear", "clockwork", "robot", "golem", "construct", "mecha"],
  "undead": ["undead", "skeleton", "lich", "ghoul", "zombie", "specter", "ghost", "vampire"],
  "organic horror": ["flesh", "bloody", "corrupt", "parasite", "fungal", "rot", "decay", "horror", "spores"],
  "western": ["western", "cowboy", "revolver", "gunslinger", "sheriff", "saloon", "desert", "cactus", "gallows"],
  "dark fantasy": ["gothic", "dark", "cursed", "demonic", "shadow", "nightmare", "abyssal", "abyss", "dread"],
  "divine": ["divine", "holy", "angel", "luminarch", "light", "celestial", "temple", "halo"],
  "forest": ["forest", "wood", "tree", "leaf", "nature", "moss", "jungle", "swamp"],
  "mechanical": ["mechanical", "gear", "engine", "turbine", "reactor", "servo"],
  "magical burst": ["burst", "explosion", "rune", "glyph", "beam", "ray", "blast", "magic"],
  "dynamic pose": ["running", "slashing", "jumping", "striking", "charging", "dynamic", "action", "pose"],
  "high detail": ["detail", "ornament", "intricate", "complex", "filigree", "texture"],
  "strong silhouette": ["silhouette", "readable", "sharp", "shadowy", "iconic"],
  "complex background": ["background", "complex", "factory", "cathedral", "scenery", "landscape", "ruins"],
  "abstract background": ["abstract", "smoke", "clouds", "energy", "portal", "simple background"],
  "particles": ["particles", "sparks", "embers", "shards", "dust", "mist", "glow"],
  "armor": ["armor", "shield", "helmet", "plate", "cuirass", "pauldrons"],
  "weapon focus": ["sword", "blade", "spear", "staff", "gun", "revolver", "bow", "weapon", "scythe"],

  // Physical Scale
  "tiny": ["tiny", "small", "miniature", "micro", "diminutive", "petite"],
  "small creature": ["small creature", "small beast", "critter", "pup", "hatchling", "rodent", "insect"],
  "human scale": ["human scale", "man-sized", "humanoid size", "standard size", "normal scale"],
  "large creature": ["large creature", "large beast", "steed", "horse-sized", "beast size", "brute"],
  "giant": ["giant", "huge", "enormous", "gargantuan", "mammoth", "giant size"],
  "colossal": ["colossal", "city-sized", "leviathan", "monolithic", "behemoth"],
  "titanic": ["titanic", "titan", "mountain-sized", "colossus", "gigantic"],
  "cosmic scale": ["cosmic scale", "planet-sized", "galaxy-sized", "cosmic size", "stellar-scale"],

  // Scale Form
  "towering": ["towering", "tall", "looming", "soaring", "high-reaching"],
  "massive wingspan": ["wingspan", "wide wings", "wings", "massive wings", "spanning wings"],
  "serpentine length": ["serpentine", "coiled", "slithering", "long body", "snake-like", "winding"],
  "broad mass": ["broad", "bulky", "wide", "massive build", "stocky", "thickset", "heavyweight"],
  "vertical scale": ["vertical", "tall layout", "verticality", "upward"],
  "horizon-spanning": ["horizon", "spanning", "stretching across", "infinite length"],
  "environmental body": ["environmental body", "living mountain", "living land", "body as landscape"],

  // Scale Cues
  "low-angle scale": ["low-angle", "looking up", "worm's-eye view", "looming over"],
  "tiny human comparison": ["human comparison", "small silhouette", "scale figure", "tiny traveler"],
  "architecture comparison": ["architecture comparison", "pillar comparison", "tower comparison", "castle-sized"],
  "landscape comparison": ["landscape comparison", "mountain comparison", "forest comparison", "cliff comparison"],
  "atmospheric depth": ["atmospheric depth", "foggy distance", "aerial perspective", "distant haze"],
  "distant horizon": ["distant horizon", "horizon view", "vanishing point", "far away"],
  "partially cropped body": ["partially cropped", "cropped", "extending out of frame", "too big for frame"],
  "wide establishing shot": ["establishing shot", "wide shot", "cinematic wide", "landscape view"],
  "ground impact": ["impact", "shattering ground", "crater", "seismic", "shockwave"],
  "environmental destruction": ["destruction", "ruins", "crushed structures", "devastated", "collapsing"],

  // Perceived Presence
  "intimate presence": ["intimate", "close-up", "personal", "direct gaze", "face-to-face"],
  "balanced presence": ["balanced", "centered", "harmonious", "standard composition"],
  "dominant presence": ["dominant", "commanding", "powerful gaze", "intimidating", "regal"],
  "monumental presence": ["monumental", "statue-like", "majestic", "epic presence", "grand"],
  "overwhelming presence": ["overwhelming", "godlike", "terrifying", "absolute power", "all-powerful"],

  // Materials
  "metal": ["metal", "metallic", "alloy", "iron", "armor", "plates"],
  "steel": ["steel", "plate armor", "hardened", "blade"],
  "gold": ["gold", "golden", "gilded", "aurum"],
  "silver": ["silver", "silvery", "argent"],
  "bronze": ["bronze", "coppery", "brass"],
  "stone": ["stone", "rock", "rocky", "golem", "boulder", "cliff"],
  "marble": ["marble", "sculpture", "white stone", "polished stone"],
  "obsidian": ["obsidian", "black glass", "volcanic glass", "dark crystal", "black volcanic glass"],
  "ceramic": ["ceramic", "porcelain", "pottery", "clay"],
  "glass": ["glass", "glassy", "crystalline", "pane"],
  "crystal": ["crystal", "quartz", "crystalline", "shard"],
  "gemstone": ["gemstone", "gem", "ruby", "emerald", "sapphire", "jewelry"],
  "flesh": ["flesh", "skin", "muscle", "organic"],
  "bone": ["bone", "skeletal", "ribs", "skull", "osseous"],
  "chitin": ["chitin", "insectoid", "exoskeleton", "shell", "carapace"],
  "scales": ["scales", "scaly", "reptilian", "serpent skin"],
  "fur": ["fur", "furry", "shaggy", "hairy", "mane"],
  "feathers": ["feathers", "feathered", "plumage", "wings"],
  "leather": ["leather", "hide", "straps", "boots"],
  "wood": ["wood", "wooden", "timber", "plank"],
  "bark": ["bark", "tree skin", "rough wood"],
  "roots": ["roots", "root", "tangled"],
  "vines": ["vines", "creepers", "ivy"],
  "fungal growth": ["fungal growth", "mushrooms", "fungi", "spores", "mycelium"],
  "smoke body": ["smoke body", "smoky", "living smoke", "gaseous"],
  "mist body": ["mist body", "misty", "foggy body", "vaporous"],
  "liquid body": ["liquid body", "watery body", "fluid"],
  "slime body": ["slime body", "ooze body", "gelatinous", "gooey"],
  "shadow body": ["shadow body", "made of shadow", "darkness form", "silhouette body"],
  "light body": ["light body", "made of light", "luminous form", "radiant body"],
  "energy body": ["energy body", "made of energy", "plasma form", "astral body"],
  "plasma body": ["plasma body", "glowing plasma", "superheated gas"],
  "flame body": ["flame body", "made of fire", "living flame", "fiery form"],
  "ice body": ["ice body", "made of ice", "frozen form", "glacial body"],
  "sand body": ["sand body", "made of sand", "shifting dust"],
  "cosmic matter": ["cosmic matter", "star stuff", "made of stars", "nebula body"],
  "fabric": ["fabric", "cloth", "textile", "tecido", "linen", "pano", "garment"],
  "silk": ["silk", "seda", "silken"],
  "satin": ["satin", "cetim"],
  "velvet": ["velvet", "veludo", "velveteen"],
  "lace": ["lace", "renda", "lacework"],

  // Surface / Finish
  "polished": ["polished", "shiny", "gleaming", "burnished"],
  "glossy": ["glossy", "slick", "varnished", "wet look"],
  "matte": ["matte", "flat color", "non-reflective", "dull"],
  "reflective": ["reflective", "mirror", "specular", "chrome"],
  "translucent": ["translucent", "semi-transparent", "cloudy glass", "diaphanous"],
  "transparent": ["transparent", "clear", "see-through"],
  "luminous": ["luminous", "glowing", "radiant", "light-emitting"],
  "iridescent": ["iridescent", "rainbow", "opalescent", "color-changing"],
  "pearlescent": ["pearlescent", "mother of pearl", "pearly"],
  "metallic": ["metallic", "metal finish", "lustrous"],
  "weathered": ["weathered", "worn", "aged", "beaten", "battered"],
  "corroded": ["corroded", "eaten", "decayed finish"],
  "rusted": ["rusted", "rusty", "rust", "oxidation"],
  "cracked": ["cracked", "fractured", "fissured", "broken surface"],
  "chipped": ["chipped", "dented", "nicked"],
  "eroded": ["eroded", "worn down", "swept"],
  "charred": ["charred", "burned", "burnt", "scorched", "soot"],
  "scarred": ["scarred", "battle-scarred", "gashed"],
  "decayed": ["decayed", "rotting", "putrid", "decomposed"],
  "dust-covered": ["dust-covered", "dusty", "ashy", "covered in dust"],
  "smooth": ["smooth", "sleek", "seamless"],
  "rough": ["rough", "coarse", "uneven", "bumpy"],
  "jagged": ["jagged", "sharp", "spiky", "pointed"],
  "segmented": ["segmented", "jointed", "modular", "sections"],
  "layered": ["layered", "overlapping", "tiered", "stacked"],
  "plated": ["plated", "scales", "overlapping plates"],
  "engraved": ["engraved", "carved", "etched", "inscribed"],
  "ornamented": ["ornamented", "decorated", "gilded", "embellished"],
  "veined": ["veined", "marble veins", "elemental veins"],
  "scaled texture": ["scaled texture", "scale pattern"],
  "faceted": ["faceted", "geometric", "crystalline", "cut glass"],
  "porous": ["porous", "spongy", "pitted", "holey"],
  "fibrous": ["fibrous", "stringy", "threaded", "woody"],
  "molten": ["molten", "liquid metal", "lava-like", "flowing rock"],
  "wet": ["wet", "damp", "moist", "dripping"],
  "oozing": ["oozing", "dripping", "seeping", "bleeding"],
  "smoking": ["smoking", "fuming", "vapor", "emitting smoke"],
  "frosted": ["frosted", "icy", "frozen finish"],
  "electrified": ["electrified", "crackling", "surging"],
  "glowing from within": ["glowing from within", "internal light", "bioluminescent", "glowing core"],
  "light-absorbing": ["light-absorbing", "pitch black", "void-like"],
  "energy-cracked": ["energy-cracked", "cracked with energy", "glowing cracks", "fissured energy"],
  "embroidered": ["embroidered", "embroidery", "bordado", "bordada", "needlework"],

  // Elements
  "fire": ["fire", "flame", "ember", "burning", "lava", "ash", "blaze", "scorch", "flaming"],
  "water": ["water", "aqueous", "torrent", "liquid", "splash", "cascade", "hydro"],
  "ice": ["ice", "frost", "snow", "glacier", "frozen", "blizzard", "cryo"],
  "wind": ["wind", "gale", "tempest", "zephyr", "air", "tornado", "breeze"],
  "earth": ["earth", "rock", "stone", "soil", "dirt", "terrene", "geo"],
  "lightning": ["lightning", "thunder", "storm", "electric", "shock", "volt", "spark"],
  "light": ["light", "lumen", "radiant", "sunlight", "beam", "glow", "halo"],
  "darkness": ["darkness", "pitch", "gloomy", "abyssal", "blackness"],
  "shadow": ["shadow", "shadowy", "silhouette", "murky"],
  "poison": ["poison", "venom", "toxic", "noxious", "bane"],
  "acid": ["acid", "corrosive", "vitriol", "caustic"],
  "plant": ["plant", "herb", "leaf", "foliage", "flora"],
  "fungal": ["fungal", "mushroom", "fungus", "spore"],
  "sand": ["sand", "desert", "dune", "dust storm"],
  "magma": ["magma", "molten lava", "volcanic"],
  "plasma": ["plasma", "ionized", "superheated"],
  "cosmic": ["cosmic", "star", "space", "galaxy", "nebula", "void", "eclipse"],
  "void": ["void", "emptiness", "abyss", "nothingness"],
  "arcane": ["arcane", "magic", "rune", "eldritch", "mana"],
  "holy": ["holy", "sacred", "blessed", "divine", "sanctified"],
  "necrotic": ["necrotic", "undead", "decay", "deathly", "blight"],

  // Element Application
  "aura": ["aura", "shroud", "halo", "surrounding glow", "energy field"],
  "body composition": ["body composition", "made of", "physical form", "elemental body"],
  "armor infusion": ["armor infusion", "infused armor", "glowing armor", "energy armor"],
  "weapon infusion": ["weapon infusion", "infused weapon", "flaming sword", "glowing blade", "fire sword", "lightning blade"],
  "energy core": ["energy core", "glowing core", "reactor core", "chest core", "orb core"],
  "elemental veins": ["elemental veins", "glowing veins", "mana veins", "crackling lines"],
  "halo": ["halo", "nimbus", "crown", "ring of light"],
  "elemental wings": ["elemental wings", "wings of fire", "wings of light", "fiery wings", "shadow wings"],
  "projectile": ["projectile", "blast", "missile", "orb", "shot"],
  "explosion": ["explosion", "detonation", "burst", "blast wave"],
  "environmental effect": ["environmental effect", "weather", "atmosphere effect", "surroundings"],
  "background phenomenon": ["background phenomenon", "sky effect", "distant phenomenon", "eclipse"]
};

export const mergeVisualDNA = (base: Partial<VisualDNA>, newAnalysis: Partial<VisualDNA>): VisualDNA => {
  const merged: any = { ...base };

  const protectedFields = ['id', 'name', 'imageUrl', 'createdAt', 'updatedAt', 'revision'];

  for (const key of Object.keys(newAnalysis)) {
    if (protectedFields.includes(key)) continue;
    const val = (newAnalysis as any)[key];
    if (val !== undefined) {
      merged[key] = val;
    }
  }

  // Ensure core properties are present
  merged.id = base.id || Date.now().toString();
  merged.name = base.name || "Unnamed";
  merged.imageUrl = base.imageUrl || "";

  // Ensure arrays and objects
  if (!merged.tags) merged.tags = [];
  if (!merged.scores) merged.scores = { ...DEFAULT_VISUAL_DNA_SCORES };

  return merged as VisualDNA;
};
