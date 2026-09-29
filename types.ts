
export enum CardType {
  Monster = 'Monster',
  Spell = 'Spell',
  Trap = 'Trap',
}

export enum Complexity {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
}

export enum Context {
  Character = 'Character',
  Object = 'Object',
  Scenario = 'Scenario',
}

export enum Archetype {
  Generic = 'Generic Fantasy',
  Voidwalkers = 'Voidwalkers',
  LuminarchKnights = 'Luminarch Knights',
  Arcanists = 'Arcanists',
  ShadowHeart = 'Shadow-Heart',
  ExtremeDragons = 'Extreme Dragons',
  ZodiacTalismans = 'Zodiac Talismans',
  Miragebound = 'Miragebound',
  Bloomrot = 'Bloomrot',
  BurningWest = 'Burning West',
  TechZero = 'Tech-Zero',
  RoyalCarmine = 'Royal Carmine',
}

export enum ImageModel {
  Pro = 'gemini-3-pro-image',
  Flash = 'gemini-3.1-flash-image',
  Lite = 'gemini-3.1-flash-lite-image',
}

export interface CardGenerationRequest {
  subject: string;
  cardType: CardType;
  complexity: Complexity;
  context: Context;
  archetype: Archetype;
  model: ImageModel;
  referenceImage?: string; // Base64 encoded reference image
  
  // Artstyle Database settings
  useVisualDB?: boolean;
  dbIntensity?: 'low' | 'medium' | 'high';
  dbMaxReferences?: number;
  dbAutoSelect?: boolean;
  dbManualReferenceIds?: string[];
}

export interface MatchDetail {
  category: string;
  tag: string;
  score: number;
}

export interface DNAMatchingResult {
  baseScore: number;
  diversityBonus: number;
  redundancyPenalty: number;
  finalScore: number;
  matches: MatchDetail[];
  ignoredLowConfidence: MatchDetail[];
  penalties: MatchDetail[];
  matchedCategories: string[];
}

export interface MatchingScoreLog {
  id: string;
  name: string;
  score: number;
  weight: number;
  selected: boolean;
  details?: DNAMatchingResult;
}

export interface ContributionEvaluation {
  referenceId: string;
  referenceName: string;
  field: string;
  text: string;
  cleanedText?: string;
  decision: 'included' | 'discarded';
  reason: string;
}

export interface SynthesisDebug {
  motifs: { motif: string; used: boolean; reason: string }[];
  avoidRules: { rule: string; source: string; applied: boolean; reason: string }[];
  identityBlocked: string[];
  evaluations?: ContributionEvaluation[];
  contributingReferenceIds?: string[];
  allContributionsDiscarded?: boolean;
}

export interface GeneratedCard {
  id: string;
  imageUrl: string;
  request: CardGenerationRequest;
  timestamp: number;
  injectedPromptBlock?: string;
  usedReferences?: { id: string; name: string }[];
  selectedReferences?: { id: string; name: string }[];
  contributingReferences?: { id: string; name: string }[];
  autoSelectScores?: MatchingScoreLog[];
  synthDebug?: SynthesisDebug;
}

export interface TokenUsageLog {
  id: string;
  timestamp: number;
  operationType: "analyze_image" | "reanalyze_image" | "analyze_all" | "generate_image";
  model: string;
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
  rawUsageMetadata?: any;
  success: boolean;
  errorMessage?: string;
  sessionId?: string;
  itemCount?: number;
  durationMs?: number;
}

export interface VisualDNA {
  id: string;
  name: string;
  imageUrl: string;
  summary: string;
  linework: string;
  rendering: string;
  palette: string;
  silhouette: string;
  pose: string;
  framing: string;
  composition: string;
  lighting: string;
  effects: string;
  materials: string;
  details: string;
  background: string;
  hierarchy: string;
  positivePrompt: string;
  negativePrompt: string;

  // Sync Metadata
  createdAt?: number;
  updatedAt?: number;
  revision?: number;
  
  // Advanced DNA Fields (Added for refinement)
  visualMotifs?: string;
  shapeLanguage?: string;
  focalAnchors?: string;
  detailPlacement?: string;
  compositionRecipe?: string;
  paletteLogic?: string;
  materialBehavior?: string;
  energyDesign?: string;
  styleAnchors?: string;
  avoidRules?: string;

  // V3.1 Expanded Fields
  stylePromptFragments?: string[];
  contentMotifs?: string[];
  identitySpecificDetails?: string[];
  universalQualityAvoids?: string[];
  styleSpecificAvoids?: string[];
  contentSpecificAvoids?: string[];
  analysisStatus?: "complete" | "partial" | "legacy";
  warnings?: string[];
  usageMetadata?: any;


  // Deep Upgraded Profiles (V3 Analysis Engine)
  analysisVersion?: number;
  subjectProfile?: {
    primarySubject: string;
    subjectCategory: string;
    visualRole: string;
  };
  scaleProfile?: {
    physicalScale: string;
    scaleForms: string[];
    scaleCues: string[];
    perceivedPresence: string;
    evidence: string;
    confidence: number;
  };
  substanceProfile?: {
    materials: string[];
    surfaces: string[];
    elements: string[];
    elementApplications: string[];
    evidence: string;
    confidence: number;
  };

  subjects?: Array<{
    id: string;
    description: string;
    category: string;
    visualRole: "primary" | "secondary" | "supporting";
    physicalScale: string;
    perceivedPresence?: string;
    materials?: string[];
    surfaces?: string[];
    elements?: string[];
  }>;

  scaleRelationships?: Array<{
    subjectA: string;
    subjectB: string;
    relationship: string;
    evidence?: string;
  }>;

  tags: string[];
  scores: {
    style?: number;
    palette?: number;
    pose?: number;
    composition?: number;
    lighting?: number;
    effects?: number;
    materials?: number;
    background?: number;
    details?: number;
    silhouette?: number;
    rendering?: number;
    detailDensity?: number;
  };
  scoreJustifications?: Partial<Record<string, string>>;
  calibrationVersion?: number;
  isCalibrated?: boolean;
}

export type VisualDNAScores = VisualDNA['scores'];

