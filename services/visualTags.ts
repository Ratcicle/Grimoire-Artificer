import { VisualDNA } from "../types";

import {
  ALLOWED_VISUAL_TAGS, ALL_CANONICAL_DIMENSIONS, getTagCategory, isCalibratedRecord,
  validateVisualDNAScores, VISUAL_TAG_PRIORITY,
  normalizeProfileBlocks, normalizeSubjects, normalizeScaleRelationships
} from './visualDnaContracts';
export * from './visualDnaContracts';

export const CANONICAL_DIMENSION_LABELS: Record<typeof ALL_CANONICAL_DIMENSIONS[number], string> = {
  rendering: 'renderização',
  composition: 'composição',
  palette: 'paleta',
  lighting: 'iluminação',
  materials: 'materiais',
  background: 'cenário / fundo',
  details: 'detalhes',
  effects: 'efeitos',
  pose: 'pose & movimento',
  silhouette: 'silhueta',
  style: 'estilo geral',
  detailDensity: 'densidade de detalhes'
};

export type DimensionPresentationStatus =
  | 'valid'
  | 'unassessed'
  | 'invalid'
  | 'zero_utility'
  | 'zero_density';

export interface DimensionPresentation {
  key: typeof ALL_CANONICAL_DIMENSIONS[number];
  label: string;
  isDescriptor: boolean;
  status: DimensionPresentationStatus;
  displayText: string;
  barPercent: number | null;
  barState: 'normal' | 'zero' | 'unassessed' | 'invalid';
  justification?: string;
  rawScore: any;
}

export const getDimensionPresentation = (
  dim: typeof ALL_CANONICAL_DIMENSIONS[number],
  rawScores: any,
  rawJustifications?: any
): DimensionPresentation => {
  const isDescriptor = dim === 'detailDensity';
  const label = CANONICAL_DIMENSION_LABELS[dim] || dim;
  const justification = rawJustifications && typeof rawJustifications === 'object' && !Array.isArray(rawJustifications)
    ? (typeof rawJustifications[dim] === 'string' && rawJustifications[dim].trim() ? rawJustifications[dim].trim() : undefined)
    : undefined;

  if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores) || !(dim in rawScores)) {
    return {
      key: dim,
      label,
      isDescriptor,
      status: 'unassessed',
      displayText: 'N/A — Não avaliado',
      barPercent: null,
      barState: 'unassessed',
      justification,
      rawScore: undefined
    };
  }

  const val = rawScores[dim];

  if (val === undefined) {
    return {
      key: dim,
      label,
      isDescriptor,
      status: 'unassessed',
      displayText: 'N/A — Não avaliado',
      barPercent: null,
      barState: 'unassessed',
      justification,
      rawScore: undefined
    };
  }

  // Valores presentes, mas inválidos: null, booleanos, strings, objetos, etc.
  if (val === null || typeof val === 'boolean' || typeof val === 'string' || typeof val !== 'number') {
    return {
      key: dim,
      label,
      isDescriptor,
      status: 'invalid',
      displayText: 'N/A — Valor inválido',
      barPercent: null,
      barState: 'invalid',
      justification,
      rawScore: val
    };
  }

  // Números presentes inválidos: NaN, Infinity, negativos, maiores que 1.0
  if (isNaN(val) || !Number.isFinite(val) || val < 0.0 || val > 1.0) {
    return {
      key: dim,
      label,
      isDescriptor,
      status: 'invalid',
      displayText: 'N/A — Valor inválido',
      barPercent: null,
      barState: 'invalid',
      justification,
      rawScore: val
    };
  }

  // Zero válido
  if (val === 0) {
    if (isDescriptor) {
      return {
        key: dim,
        label,
        isDescriptor,
        status: 'zero_density',
        displayText: '0% — Densidade mínima',
        barPercent: 0,
        barState: 'zero',
        justification,
        rawScore: val
      };
    } else {
      return {
        key: dim,
        label,
        isDescriptor,
        status: 'zero_utility',
        displayText: '0% — Sem contribuição utilizável',
        barPercent: 0,
        barState: 'zero',
        justification,
        rawScore: val
      };
    }
  }

  // Número finito válido em (0, 1]
  const pct = Math.round(val * 100);
  return {
    key: dim,
    label,
    isDescriptor,
    status: 'valid',
    displayText: `${pct}%`,
    barPercent: pct,
    barState: 'normal',
    justification,
    rawScore: val
  };
};

export const getUtilityMatrixPresentationRows = (
  rawScores: any,
  rawJustifications?: any
): DimensionPresentation[] => {
  return ALL_CANONICAL_DIMENSIONS.map(dim =>
    getDimensionPresentation(dim, rawScores, rawJustifications)
  );
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

  const profiles = normalizeProfileBlocks(parsed, warnings);
  for (const key of ['subjectProfile', 'scaleProfile', 'substanceProfile']) {
    if (profiles[key]) normalized[key] = profiles[key];
    else delete normalized[key];
  }
  // Keep the display representation compatible. Sparse merge decisions use raw presence,
  // and normalizeProfileBlocks itself never fills these absent members.
  if (normalized.scaleProfile) {
    normalized.scaleProfile.scaleForms ??= [];
    normalized.scaleProfile.scaleCues ??= [];
    normalized.scaleProfile.confidence ??= 0;
  }
  if (normalized.substanceProfile) {
    for (const field of ['materials', 'surfaces', 'elements', 'elementApplications']) normalized.substanceProfile[field] ??= [];
    normalized.substanceProfile.confidence ??= 0;
  }
  const derivedTags: string[] = [];
  if (normalized.subjectProfile?.subjectCategory) derivedTags.push(normalized.subjectProfile.subjectCategory);
  if (normalized.scaleProfile) {
    if (normalized.scaleProfile.confidence >= 0.5) {
      const profile = normalized.scaleProfile;
      derivedTags.push(...[profile.physicalScale, profile.perceivedPresence].filter(Boolean),
        ...(profile.scaleForms || []), ...(profile.scaleCues || []));
    } else {
      warnings.push("Scale profile ignored for tags due to low confidence.");
    }
  }
  if (normalized.substanceProfile) {
    if (normalized.substanceProfile.confidence >= 0.5) {
      for (const field of ['materials', 'surfaces', 'elements', 'elementApplications']) {
        derivedTags.push(...(normalized.substanceProfile[field] || []));
      }
    } else {
      warnings.push("Substance profile ignored for tags due to low confidence.");
    }
  }
  if (Array.isArray(parsed.subjects)) normalized.subjects = normalizeSubjects(parsed.subjects);
  else delete normalized.subjects;
  if (Array.isArray(parsed.scaleRelationships)) normalized.scaleRelationships = normalizeScaleRelationships(parsed.scaleRelationships);
  else delete normalized.scaleRelationships;

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

  combinedTags.sort((a, b) => {
    const catA = getTagCategory(a);
    const catB = getTagCategory(b);
    return VISUAL_TAG_PRIORITY.indexOf(catA as any) - VISUAL_TAG_PRIORITY.indexOf(catB as any);
  });

  normalized.tags = combinedTags.slice(0, 14);

  if (parsed.scores && typeof parsed.scores === 'object' && !Array.isArray(parsed.scores)) {
    const scoreVal = validateVisualDNAScores(parsed.scores, parsed.scoreJustifications);
    normalized.scores = scoreVal.validatedScores;
    if (Object.keys(scoreVal.justifications).length > 0) {
      normalized.scoreJustifications = scoreVal.justifications;
    }
    if (scoreVal.isValid && isCalibratedRecord(parsed)) {
      normalized.isCalibrated = true;
      normalized.calibrationVersion = parsed.calibrationVersion;
    } else {
      normalized.isCalibrated = false;
      delete normalized.calibrationVersion;
    }
    if (!scoreVal.isValid) {
      warnings.push(...scoreVal.errors);
    }
  } else {
    normalized.scores = {};
    normalized.isCalibrated = false;
    delete normalized.calibrationVersion;
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
  if (normalized.subjectProfile?.subjectCategory && normalized.scaleProfile?.physicalScale && normalized.substanceProfile?.materials) {
     normalized.analysisStatus = 'complete';
  } else if (normalized.subjectProfile || normalized.scaleProfile || normalized.substanceProfile) {
     normalized.analysisStatus = 'partial';
  } else {
     normalized.analysisStatus = 'legacy';
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

export {
  CLEARABLE_ANALYTICAL_FIELDS,
  PROTECTED_MERGE_FIELDS,
  createVisualDNAPatch,
  mergeVisualDNASafe,
  hasPersistentChanges,
  extractDerivedTagsFromProfiles
} from './visualDnaMerge';

import { mergeVisualDNASafe } from './visualDnaMerge';

export const mergeVisualDNA = (base: Partial<VisualDNA>, newAnalysis: Partial<VisualDNA>): VisualDNA => {
  return mergeVisualDNASafe(base as VisualDNA, newAnalysis).data;
};
