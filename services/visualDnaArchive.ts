import type { VisualDNA } from '../types';

// Historical text representations accepted by normalizeVisualDNAAnalysis in
// visualTags.ts (present since 2828c9c), and by the analytical merge except for
// summary's separate handling. Archive values verbatim instead of normalizing.
// analysisStatus is excluded: the normalizer derives its enum value afterward.
export const ARCHIVED_TEXT_FIELDS = [
  'summary', 'linework', 'rendering', 'palette', 'silhouette', 'pose',
  'framing', 'composition', 'lighting', 'effects', 'materials', 'details',
  'background', 'hierarchy', 'positivePrompt', 'negativePrompt',
  'visualMotifs', 'shapeLanguage', 'focalAnchors', 'detailPlacement',
  'compositionRecipe', 'paletteLogic', 'materialBehavior', 'energyDesign',
  'styleAnchors', 'avoidRules',
] as const satisfies readonly (keyof VisualDNA)[];

export type ArchivedTextField = typeof ARCHIVED_TEXT_FIELDS[number];

// This is the archival/storage boundary, not the canonical result of a new
// analysis. Omitted legacy fields stay omitted; other field types stay strict.
export type ArchivedVisualDNA =
  Partial<Omit<VisualDNA, ArchivedTextField | 'usageMetadata'>> &
  Pick<VisualDNA, 'id' | 'name' | 'imageUrl'> &
  { [K in ArchivedTextField]?: string | string[] };
