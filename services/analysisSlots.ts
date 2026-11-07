import { AnalysisProvider, StoredAnalysis, VisualDNA } from '../types';
import { hasTransferableAnalysis } from './visualDnaContracts';

// A record keeps at most one analysis per provider. The active one lives in the record's
// regular fields, which is what the generator and the search read; the other waits here.

export const ANALYSIS_MODELS = [
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
] as const;

const PROVIDER_LABELS: Record<AnalysisProvider, string> = { gemini: 'Gemini', claude: 'Claude' };

const IDENTITY_FIELDS = [
  'id', 'name', 'imageUrl', 'ownerId', 'createdAt', 'updatedAt', 'revision',
  'imageFingerprint', 'cloudDocumentId', 'usageMetadata', 'storedAnalyses',
] as const;

export const isClaudeModel = (model: string | undefined): boolean => !!model?.startsWith('claude-');

export const analysisProviderOf = (model: string | undefined): AnalysisProvider => isClaudeModel(model) ? 'claude' : 'gemini';

/** Everything analyzed before providers existed came from Gemini. */
export const activeProvider = (record: Pick<VisualDNA, 'analysisProvider'>): AnalysisProvider => record.analysisProvider ?? 'gemini';

export const hasCurrentAnalysisFrom = (record: VisualDNA, provider: AnalysisProvider): boolean =>
  activeProvider(record) === provider ? hasTransferableAnalysis(record) : hasTransferableAnalysis(record.storedAnalyses?.[provider]);

export const storedProvider = (record: VisualDNA): AnalysisProvider | undefined =>
  (Object.keys(record.storedAnalyses ?? {}) as AnalysisProvider[]).find(provider => record.storedAnalyses?.[provider]);

export const analysisLabel = (source: Pick<VisualDNA, 'analysisProvider' | 'analysisModel'>): string =>
  ANALYSIS_MODELS.find(model => model.id === source.analysisModel)?.label ?? source.analysisModel ?? PROVIDER_LABELS[activeProvider(source)];

export function snapshotAnalysis(record: VisualDNA): StoredAnalysis {
  const snapshot = structuredClone(record);
  for (const field of IDENTITY_FIELDS) delete snapshot[field];
  return { ...snapshot, analysisProvider: activeProvider(record) };
}

/** What stays set aside once `provider` writes a new active analysis over `current`. */
export function storedAnalysesAfter(current: VisualDNA, provider: AnalysisProvider): VisualDNA['storedAnalyses'] {
  const stored = { ...current.storedAnalyses };
  const active = activeProvider(current);
  if (active !== provider) stored[active] = snapshotAnalysis(current);
  delete stored[provider];
  return Object.keys(stored).length ? stored : undefined;
}

/** Makes the stored analysis active and sets the active one aside. Identity is untouched. */
export function switchAnalysis(record: VisualDNA, provider: AnalysisProvider): VisualDNA {
  const target = record.storedAnalyses?.[provider];
  if (!target) return record;
  const identity: Record<string, unknown> = {};
  for (const field of IDENTITY_FIELDS) if (record[field] !== undefined) identity[field] = record[field];
  const storedAnalyses = storedAnalysesAfter(record, provider);
  const switched = { ...identity, ...structuredClone(target), analysisProvider: provider } as VisualDNA;
  if (storedAnalyses) switched.storedAnalyses = storedAnalyses;
  else delete switched.storedAnalyses;
  return switched;
}
