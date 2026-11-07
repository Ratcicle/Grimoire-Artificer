import { describe, expect, it } from 'vitest';
import { VisualDNA } from '../types';
import { activeProvider, analysisLabel, analysisProviderOf, hasCurrentAnalysisFrom, snapshotAnalysis, storedAnalysesAfter, storedProvider, switchAnalysis } from './analysisSlots';

const record = (patch: Partial<VisualDNA> = {}): VisualDNA => ({
  id: 'art', name: 'Art', imageUrl: 'data:image/jpeg;base64,FULL', ownerId: 'A', createdAt: 5, updatedAt: 9, revision: 3,
  imageFingerprint: 'fp', cloudDocumentId: 'doc', summary: 'gemini summary', rendering: 'gemini rendering',
  tags: ['dragon'], scores: { rendering: .8 }, analysisVersion: 4, analysisProvider: 'gemini', analysisModel: 'gemini-4-argon',
  ...patch,
} as VisualDNA);

const withBoth = () => record({
  summary: 'claude summary', rendering: 'claude rendering', energyDesign: 'only claude has this', tags: ['creature'], scores: { rendering: .5 },
  analysisProvider: 'claude', analysisModel: 'claude-sonnet-5-5',
  storedAnalyses: { gemini: { summary: 'gemini summary', rendering: 'gemini rendering', tags: ['dragon'], scores: { rendering: .8 }, analysisVersion: 4, analysisProvider: 'gemini', analysisModel: 'gemini-4-argon' } },
});

describe('providers', () => {
  it('reads the provider from the model id', () => {
    expect(analysisProviderOf('claude-opus-5-5')).toBe('claude');
    expect(analysisProviderOf('gemini-4-argon')).toBe('gemini');
    expect(analysisProviderOf(undefined)).toBe('gemini');
  });

  it('treats records from before this feature as Gemini', () => {
    const legacy = record({ analysisProvider: undefined, analysisModel: undefined });
    expect(activeProvider(legacy)).toBe('gemini');
    expect(analysisLabel(legacy)).toBe('Gemini');
    expect(hasCurrentAnalysisFrom(legacy, 'gemini')).toBe(true);
    expect(hasCurrentAnalysisFrom(legacy, 'claude')).toBe(false);
  });

  it('names known and unknown models', () => {
    expect(analysisLabel(withBoth())).toBe('Claude Sonnet 5.5');
    expect(analysisLabel({ analysisModel: 'gemini-3.1-pro-preview' })).toBe('gemini-3.1-pro-preview');
  });

  it('only a current analysis counts', () => {
    expect(hasCurrentAnalysisFrom(record({ analysisVersion: 3 }), 'gemini')).toBe(false);
    expect(hasCurrentAnalysisFrom(withBoth(), 'gemini')).toBe(true);
    expect(hasCurrentAnalysisFrom(record({ storedAnalyses: { claude: { analysisVersion: 3 } } }), 'claude')).toBe(false);
  });
});

describe('snapshotAnalysis', () => {
  it('keeps the analysis and leaves out identity and sync data', () => {
    const snapshot = snapshotAnalysis(withBoth());
    expect(snapshot).toMatchObject({ summary: 'claude summary', analysisProvider: 'claude', analysisModel: 'claude-sonnet-5-5', tags: ['creature'] });
    for (const field of ['id', 'name', 'imageUrl', 'ownerId', 'createdAt', 'updatedAt', 'revision', 'imageFingerprint', 'cloudDocumentId', 'storedAnalyses']) {
      expect(snapshot).not.toHaveProperty(field);
    }
  });

  it('records the provider of an analysis from before this feature', () => {
    expect(snapshotAnalysis(record({ analysisProvider: undefined })).analysisProvider).toBe('gemini');
  });
});

describe('storedAnalysesAfter', () => {
  it('sets the active analysis aside when the other provider analyzes', () => {
    const stored = storedAnalysesAfter(record(), 'claude');
    expect(Object.keys(stored!)).toEqual(['gemini']);
    expect(stored!.gemini!.summary).toBe('gemini summary');
  });

  it('keeps the other provider when the active one analyzes again', () => {
    expect(storedAnalysesAfter(withBoth(), 'claude')!.gemini!.summary).toBe('gemini summary');
  });

  it('a new analysis replaces its own stored slot', () => {
    const stored = storedAnalysesAfter(withBoth(), 'gemini');
    expect(Object.keys(stored!)).toEqual(['claude']);
    expect(stored!.claude!.summary).toBe('claude summary');
  });

  it('leaves nothing when only one provider ever analyzed', () => {
    expect(storedAnalysesAfter(record(), 'gemini')).toBeUndefined();
  });
});

describe('switchAnalysis', () => {
  it('swaps the analyses and keeps identity and sync data', () => {
    const switched = switchAnalysis(withBoth(), 'gemini');
    expect(switched).toMatchObject({ id: 'art', name: 'Art', imageUrl: 'data:image/jpeg;base64,FULL', ownerId: 'A', createdAt: 5, updatedAt: 9, revision: 3, imageFingerprint: 'fp', cloudDocumentId: 'doc' });
    expect(switched).toMatchObject({ summary: 'gemini summary', rendering: 'gemini rendering', tags: ['dragon'], scores: { rendering: .8 }, analysisProvider: 'gemini', analysisModel: 'gemini-4-argon' });
    expect(switched.storedAnalyses!.claude).toMatchObject({ summary: 'claude summary', analysisModel: 'claude-sonnet-5-5' });
    expect(switched.storedAnalyses).not.toHaveProperty('gemini');
    expect(storedProvider(switched)).toBe('claude');
  });

  it('a field only one analysis has does not leak into the other', () => {
    const switched = switchAnalysis(withBoth(), 'gemini');
    expect(switched).not.toHaveProperty('energyDesign');
    expect(switched.storedAnalyses!.claude!.energyDesign).toBe('only claude has this');
  });

  it('switching twice returns to the same record', () => {
    const original = withBoth();
    const back = switchAnalysis(switchAnalysis(original, 'gemini'), 'claude');
    expect(back).toEqual(original);
  });

  it('does nothing when there is no such analysis, and never mutates its input', () => {
    const single = record();
    expect(switchAnalysis(single, 'claude')).toBe(single);
    const original = withBoth();
    const before = structuredClone(original);
    switchAnalysis(original, 'gemini');
    expect(original).toEqual(before);
  });
});
