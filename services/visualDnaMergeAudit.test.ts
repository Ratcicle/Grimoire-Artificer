import { describe, expect, it } from 'vitest';
import { VisualDNA } from '../types';
import * as merge from './visualDnaMerge';
import { isCalibratedRecord, normalizeVisualDNAAnalysis } from './visualTags';

const base = (fields: Partial<VisualDNA> = {}): VisualDNA => ({
  id: 'local-id', name: 'Local name', imageUrl: 'data:image/png;base64,local',
  summary: 'Existing reference', rendering: 'Crisp shading', palette: 'Cool palette',
  tags: ['dragon', 'custom-local'], scores: { rendering: 0.8, palette: 0.6 },
  isCalibrated: true, calibrationVersion: 3, ...fields
} as VisualDNA);

const roundtrip = (raw: unknown) => merge.createVisualDNAPatch(raw, normalizeVisualDNAAnalysis(raw));
const substance = (fields = {}) => ({
  materials: ['metal'], surfaces: ['polished'], elements: ['fire'],
  elementApplications: ['weapon infusion'], evidence: 'Visible surface', confidence: 0.8, ...fields
});

describe('Audit MERGE-01 canonical tag replacement', () => {
  it('replaces explicit canonical tags while preserving local custom tags', () => {
    expect(merge.mergeVisualDNASafe(base(), roundtrip({ tags: ['humanoid'] })).data.tags)
      .toEqual(['humanoid', 'custom-local']);
  });

  it('distinguishes omitted tags from an explicitly empty evaluated list', () => {
    expect(merge.mergeVisualDNASafe(base(), roundtrip({})).data.tags).toEqual(['dragon', 'custom-local']);
    expect(merge.mergeVisualDNASafe(base(), roundtrip({ tags: [] })).data.tags).toEqual(['custom-local']);
  });

  it('retains tags supported by final profiles and prioritizes specific tags within 14', () => {
    const record = base({ tags: ['high detail', 'particles', 'dynamic pose', 'strong silhouette', 'custom-local'],
      subjectProfile: { primarySubject: 'Dragon', subjectCategory: 'dragon', visualRole: 'primary' } });
    const result = merge.mergeVisualDNASafe(record, roundtrip({
      tags: ['boss monster', 'spell artwork', 'trap artwork', 'field spell', 'western', 'dark fantasy',
        'divine', 'forest', 'mechanical', 'magical burst', 'armor', 'weapon focus', 'humanoid']
    })).data;
    expect(result.tags).toHaveLength(14);
    expect(result.tags.slice(0, 2)).toEqual(['dragon', 'humanoid']);
    expect(result.tags).not.toContain('high detail');
  });

  it('does not let an explicit stale tag resurrect a removed profile element', () => {
    const result = merge.mergeVisualDNASafe(base({ substanceProfile: substance(), tags: ['fire', 'weapon infusion'] }), roundtrip({
      tags: ['fire', 'weapon infusion', 'humanoid'], substanceProfile: substance({ elements: [], elementApplications: [] })
    })).data;
    expect(result.tags).not.toContain('fire');
    expect(result.tags).not.toContain('weapon infusion');
    expect(result.tags).toContain('humanoid');
  });
});

describe('Audit MERGE-02 description-score association', () => {
  it.each(['palette', 'paletteLogic'])('withdraws calibration when %s changes without a new palette score', field => {
    const record = base({ paletteLogic: 'Cool palette' });
    const patch = roundtrip({ [field]: 'Warm palette', scores: { rendering: 0.9 } });
    const first = merge.mergeVisualDNASafe(record, patch);
    expect(first.data.scores.palette).toBe(0.6);
    expect(first.data.isCalibrated).toBe(false);
    expect(first.data.calibrationVersion).toBeUndefined();
    expect(first.inheritanceWarnings.some(warning => warning.includes('palette'))).toBe(true);
    expect(merge.mergeVisualDNASafe(first.data, patch).changed).toBe(false);
  });

  it('does not withdraw calibration for an equivalent description', () => {
    const result = merge.mergeVisualDNASafe(base(), roundtrip({ palette: ' Cool   palette ', scores: { rendering: 0 } }));
    expect(result.data.isCalibrated).toBe(true);
    expect(result.inheritanceWarnings).toEqual([]);
    expect(result.data.scores.rendering).toBe(0);
    expect(result.data.scores.lighting).toBeUndefined();
  });

  it('withdraws calibration after explicit clearing and restores it after full valid reevaluation', () => {
    const cleared = merge.mergeVisualDNASafe(base(), roundtrip({ clearFields: ['palette'] }));
    expect(cleared.data.isCalibrated).toBe(false);
    const updated = merge.mergeVisualDNASafe(cleared.data, roundtrip({ scores: { rendering: 0.81, palette: 0 } }));
    expect(isCalibratedRecord(updated.data)).toBe(true);
    expect(updated.data.scores.palette).toBe(0);
  });
});

describe('Audit MERGE-03 creation from service-owned analysis', () => {
  it('preserves analyzer metadata and local identity without persisting patch internals or raw flags', () => {
    const raw = { summary: 'New analysis', rendering: 'Flat shading', scores: { rendering: 0 },
      analysisVersion: 999, analysisStatus: 'complete', isCalibrated: false, calibrationVersion: 999,
      clearFields: [], id: 'untrusted-id', name: 'Remote name', imageUrl: 'remote-image',
      substanceProfile: substance({ elements: [], elementApplications: ['weapon infusion'] }) };
    const data = normalizeVisualDNAAnalysis(raw);
    data.isCalibrated = true;
    data.calibrationVersion = 3;
    const patch = merge.createVisualDNAPatch(raw, data);
    const created = merge.createVisualDNAFromAnalysis({ id: 'local-id', name: 'Local name', imageUrl: 'local-image', createdAt: 42 }, data, patch);
    expect(created).toMatchObject({ id: 'local-id', name: 'Local name', imageUrl: 'local-image', createdAt: 42,
      analysisVersion: 3, analysisStatus: data.analysisStatus, isCalibrated: true, calibrationVersion: 3,
      scores: { rendering: 0 }, warnings: ['Removed weapon infusion application due to missing elements.'] });
    for (const key of ['raw', 'patch', 'presentFields', 'normalized', 'clearFields', 'usageMetadata']) {
      expect(Object.hasOwn(created, key)).toBe(false);
    }
  });

  it('does not manufacture calibration when the supplied analysis has no local calibration', () => {
    const data = normalizeVisualDNAAnalysis({ summary: 'Reference', rendering: 'Flat', scores: { rendering: 0.7 } });
    const created = merge.createVisualDNAFromAnalysis({ id: 'id', name: 'Name', imageUrl: 'image' }, data);
    expect(created.isCalibrated).toBe(false);
    expect(created.calibrationVersion).toBeUndefined();
  });

  it('derives analysis completeness locally instead of accepting a raw complete flag', () => {
    const data = normalizeVisualDNAAnalysis({ summary: 'Reference', rendering: 'Flat', scores: { rendering: 0.7 }, analysisStatus: 'complete' });
    const created = merge.createVisualDNAFromAnalysis({ id: 'id', name: 'Name', imageUrl: 'image' }, data);
    expect(created.analysisStatus).toBe('legacy');
  });
});

describe('Audit MERGE-04 normalized profile invariants', () => {
  it('never restores infusions removed by normalization when no element exists', () => {
    const raw = { substanceProfile: substance({ elements: [], elementApplications: ['weapon infusion', 'armor infusion', 'elemental veins'] }) };
    const result = merge.mergeVisualDNASafe(base({ substanceProfile: substance() }), roundtrip(raw)).data;
    expect(result.substanceProfile?.elements).toEqual([]);
    expect(result.substanceProfile?.elementApplications).toEqual([]);
    expect(result.tags).not.toContain('weapon infusion');
    expect(result.tags).not.toContain('fire');
  });

  it('uses equivalent validation without a separately normalized patch', () => {
    const result = merge.mergeVisualDNASafe(base(), merge.createVisualDNAPatch({
      substanceProfile: substance({ elements: [], elementApplications: ['weapon infusion'] })
    })).data;
    expect(result.substanceProfile?.elementApplications).toEqual([]);
  });

  it('preserves partial siblings and accepts a complete empty profile with zero confidence', () => {
    const record = base({ substanceProfile: substance() });
    expect(merge.mergeVisualDNASafe(record, roundtrip({ substanceProfile: { materials: ['silk'] } })).data.substanceProfile)
      .toEqual(record.substanceProfile);
    expect(merge.mergeVisualDNASafe(record, roundtrip({ substanceProfile: substance({
      materials: [], surfaces: [], elements: [], elementApplications: [], confidence: 0
    }) })).data.substanceProfile).toEqual({ materials: [], surfaces: [], elements: [], elementApplications: [], evidence: 'Visible surface', confidence: 0 });
  });

  it('rejects invalid scale enums instead of replacing a valid profile', () => {
    const original = { physicalScale: 'human scale', perceivedPresence: 'balanced presence', scaleForms: [], scaleCues: [], evidence: 'Human comparison', confidence: 0.8 };
    const result = merge.mergeVisualDNASafe(base({ scaleProfile: original }), roundtrip({
      scaleProfile: { ...original, physicalScale: 'banana', perceivedPresence: 'invented presence' }
    }));
    expect(result.data.scaleProfile).toEqual(original);
    expect(result.unappliedPartialBlocks.some(value => value.includes('scaleProfile'))).toBe(true);
  });

  it('filters invalid nested subjects and relationships without restoring raw entries', () => {
    const result = merge.mergeVisualDNASafe(base(), roundtrip({
      subjects: [
        { id: 'good', description: 'Human', category: 'humanoid', visualRole: 'primary', physicalScale: 'human scale' },
        { id: 'bad', description: 'Bad', category: 'humanoid', visualRole: 'invented', physicalScale: 'human scale' },
        { id: 'number', description: 12, category: 'humanoid', visualRole: 'primary', physicalScale: 'human scale' }
      ],
      scaleRelationships: [
        { subjectA: 'good', subjectB: 'bad', relationship: 'taller' },
        { subjectA: 'good', subjectB: 'good', relationship: 42 }
      ]
    })).data;
    expect(result.subjects?.map(subject => subject.id)).toEqual(['good']);
    expect(result.scaleRelationships).toBeUndefined();
  });

  it('preserves existing subjects when every proposed nonempty item is invalid', () => {
    const record = base({ subjects: [{ id: 'good', description: 'Human', category: 'humanoid', visualRole: 'primary', physicalScale: 'human scale' }] });
    const result = merge.mergeVisualDNASafe(record, roundtrip({ subjects: [{ id: 'invalid', visualRole: 'invented' }] }));
    expect(result.data.subjects).toEqual(record.subjects);
    expect(result.unappliedPartialBlocks.some(value => value.includes('subjects'))).toBe(true);
    expect(merge.mergeVisualDNASafe(record, roundtrip({ subjects: [] })).data.subjects).toEqual([]);
  });
});
