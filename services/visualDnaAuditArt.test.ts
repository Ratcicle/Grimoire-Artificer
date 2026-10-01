import { describe, expect, it } from 'vitest';
import { Archetype, CardType, Context, VisualDNA } from '../types';
import { getAutomaticReferences, getMatchingLogs, synthesizeVisualDNA } from './visualDnaEngine';
import { parsePromptIntent } from './promptParser';

const dna = (id: string, patch: Partial<VisualDNA> = {}): VisualDNA => ({
  id, name: id, imageUrl: '', summary: '', linework: '', rendering: '', palette: '',
  silhouette: '', pose: '', framing: '', composition: '', lighting: '', effects: '',
  materials: '', details: '', background: '', hierarchy: '', positivePrompt: '',
  negativePrompt: '', tags: [], scores: {}, ...patch
});
const synth = (references: VisualDNA[], subject = 'A human noble wearing white silk', archetype = Archetype.Generic) =>
  synthesizeVisualDNA({ references, subject, archetype, cardType: CardType.Monster, intensity: 'high' });

describe('consolidated artistic audit: real selection and synthesis', () => {
  it('ART-01 consumes lighting and selects by its utility without letting rendering utility rank it', () => {
    const result = synth([
      dna('a', { lighting: 'soft bounce light', scores: { lighting: .2, rendering: 1 } }),
      dna('b', { lighting: 'volumetric rim lighting', scores: { lighting: .9, rendering: 0 } })
    ]);
    expect(result.promptBlock).toContain('Lighting: volumetric rim lighting');
    expect(result.contributingReferences?.map(r => r.id)).toEqual(['b']);
    expect(result.debugInfo?.evaluations?.find(e => e.referenceId === 'a' && e.field === 'lighting')?.reason).toMatch(/slot|higher|selected/i);
  });

  it('ART-01 filters incompatible color and energy in lighting while retaining technical clauses', () => {
    const result = synth([dna('a', { lighting: 'purple fire, volumetric rim lighting' })], undefined, Archetype.RoyalCarmine);
    expect(result.promptBlock).toContain('Lighting: volumetric rim lighting');
    expect(result.promptBlock).not.toContain('purple fire');
    expect(result.debugInfo?.evaluations?.some(e => e.text === 'purple fire' && e.decision === 'discarded')).toBe(true);
  });

  it.each([
    { contentMotifs: ['lunar observatory'] },
    { subjectProfile: { primarySubject: 'lunar observatory', subjectCategory: '', visualRole: '' } },
    { subjects: [{ id: 's', description: 'lunar observatory', category: '', visualRole: 'primary', physicalScale: '' }] }
  ] as Partial<VisualDNA>[] )('ART-02 uses newly analyzed thematic fields: %j', patch => {
    const records = [dna('irrelevant'), dna('observatory', patch)];
    expect(getAutomaticReferences('lunar observatory', CardType.Spell, Archetype.Generic, records, 1).map(r => r.id)).toEqual(['observatory']);
    expect(getAutomaticReferences('noble; no lunar observatory', CardType.Spell, Archetype.Generic, records, 1)).toEqual([]);
  });

  it.each(['horned silhouette', 'winged silhouette', 'feathered silhouette', 'armored silhouette', 'bloodied rendering', 'ghostly silhouette'])('ART-03 descriptive suffixes do not authorize new content: %s', fragment => {
    const result = synth([dna('a', { rendering: fragment, stylePromptFragments: ['feathered brushwork', 'stippled ink shading'] })]);
    expect(result.promptBlock).not.toContain(fragment);
    expect(result.promptBlock).toContain('feathered brushwork');
    expect(result.promptBlock).toContain('stippled ink shading');
    expect(synth([dna('a', { rendering: fragment })], `A creature with ${fragment}`).promptBlock).toContain(fragment);
  });

  it.each(['light', 'shadow', 'metallic'])('ART-03 structured content fields cannot borrow a technique meaning: %s', value => {
    const reference = dna('a', { rendering: 'soft shadow gradients', substanceProfile: { materials: value === 'metallic' ? [value] : [], elements: value === 'metallic' ? [] : [value], surfaces: [], elementApplications: [], evidence: '', confidence: .9 } });
    const result = synth([reference]);
    expect(result.promptBlock).not.toContain(`Elements: ${value}`);
    expect(result.promptBlock).not.toContain(`Materials: ${value}`);
    expect(result.promptBlock).toContain('soft shadow gradients');
    expect(synth([reference], `A creature made of ${value}`).promptBlock).toContain(value === 'metallic' ? `Materials: ${value}` : `Elements: ${value}`);
  });

  it.each(['light', 'shadow', 'metallic'])('ART-03 bare ambiguous words also need content support outside profiles: %s', value => {
    const result = synth([dna('a', { materials: value, stylePromptFragments: [value, 'soft shadow gradients'] })]);
    expect(result.promptBlock).not.toContain(`Material Behavior: ${value}`);
    expect(result.promptBlock).not.toContain(`Style Anchors: ${value},`);
    expect(result.promptBlock).toContain('soft shadow gradients');
  });

  it('ART-02 applies Context Focus to relevance and identical matching logs', () => {
    const records = [
      dna('character', { subjectProfile: { primarySubject: 'lunar guardian', subjectCategory: 'humanoid', visualRole: 'primary' } }),
      dna('scenario', { subjectProfile: { primarySubject: 'lunar observatory', subjectCategory: 'environment', visualRole: 'primary' } })
    ];
    const selected = getAutomaticReferences('lunar', CardType.Spell, Archetype.Generic, records, 1, Context.Scenario);
    expect(selected.map(r => r.id)).toEqual(['scenario']);
    expect(getMatchingLogs('lunar', CardType.Spell, Archetype.Generic, records, ['scenario'], 1, Context.Scenario)[0].id).toBe('scenario');
    expect(getAutomaticReferences('lunar', CardType.Spell, Archetype.Generic, records, 1, Context.Character)[0].id).toBe('character');
  });

  it.each(['fire', 'iron', 'six insect legs and a scorpion tail', 'titanium scales', 'eleven antennae', 'three hands', 'pearl', 'almond silk', 'fabric'])('ART-03 requires positive support for conditional content: %s', fragment => {
    const ref = dna('a', { stylePromptFragments: [fragment, 'clean tapered outlines', 'smooth shading'], substanceProfile: { materials: [], elements: ['fire'], surfaces: [], elementApplications: [], evidence: '', confidence: .9 } });
    const result = synth([ref], 'A human noble');
    expect(result.promptBlock).not.toContain(fragment);
    expect(result.promptBlock).not.toContain('Elements: fire');
    expect(result.promptBlock).toContain('clean tapered outlines');
    expect(result.promptBlock).toContain('smooth shading');
    expect(synth([dna('explicit', { stylePromptFragments: [fragment] })], `A creature with ${fragment}`).promptBlock).toContain(fragment);
  });

  it('ART-03 does not admit unsupported anatomy attached to a recognized technique', () => {
    expect(synth([dna('a', { rendering: 'clean linework over six insect legs' })]).promptBlock).not.toContain('six insect legs');
    expect(synth([dna('a', { lighting: 'three point lighting' })]).promptBlock).toContain('Lighting: three point lighting');
  });

  it.each(['light body', 'shadow body', 'metallic body', 'arms made of light', 'mechanical arm', 'metallic hands', 'shadow hands'])('ART-03 technique words do not authorize body content: %s', fragment => {
    const ref = dna('a', { materials: fragment, stylePromptFragments: [fragment, 'crisp linework'], lighting: 'three point lighting' });
    const result = synth([ref]);
    expect(result.promptBlock).not.toContain(fragment);
    expect(result.promptBlock).toContain('crisp linework');
    expect(result.promptBlock).toContain('three point lighting');
    expect(synth([ref], `A creature with ${fragment}`).promptBlock).toContain(fragment);
  });

  it('ART-03 keeps material rendering and full-body framing techniques without introducing a material body', () => {
    const result = synth([dna('a', { rendering: 'precise metallic shading', framing: 'full body shot', scaleProfile: { physicalScale: 'human', scaleForms: ['human scale'], scaleCues: ['proportional hands'], perceivedPresence: '', evidence: '', confidence: .9 } })]);
    expect(result.promptBlock).toContain('precise metallic shading');
    expect(result.promptBlock).toContain('full body shot');
    expect(result.promptBlock).toContain('proportional hands');
  });

  it.each([
    ['rendering', 'variable-weight linework with finer contours in illuminated areas'],
    ['detailPlacement', 'dense focal detail contrasted with quieter background shapes'],
    ['lighting', 'soft diffuse lighting'],
    ['rendering', 'stippled ink shading'],
    ['rendering', 'pencil cross-hatching'],
    ['rendering', 'expressive brushwork'],
    ['rendering', 'soft edges'],
    ['rendering', 'uses feathered brushwork to emphasize softer edges']
  ])('ART-03 consumes analyzer-style technical language in %s: %s', (field, technique) => {
    const reference = dna('technique', { [field]: technique });
    expect(synth([reference]).promptBlock).toContain(technique);
    const mixed = dna('mixed', { [field]: `${technique}, six insect legs, titanium scales` });
    const result = synth([mixed]);
    expect(result.promptBlock).toContain(technique);
    expect(result.promptBlock).not.toContain('six insect legs');
    expect(result.promptBlock).not.toContain('titanium scales');
  });

  it('ART-04 admits Tech-Zero cyan accents without interpreting sacred as red', () => {
    expect(synth([dna('a', { paletteLogic: 'small cyan accents' })], 'A modular robot', Archetype.TechZero).promptBlock).toContain('small cyan accents');
    expect(synth([dna('a', { paletteLogic: 'red clothing' })], 'A sacred noble').promptBlock).not.toContain('red clothing');
  });

  it.each([
    [Archetype.TechZero, 'small magenta accents'],
    [Archetype.ShadowHeart, 'magenta palette'],
    [Archetype.Miragebound, 'small cyan accents'],
    [Archetype.Bloomrot, 'ivory palette'],
    [Archetype.BurningWest, 'small yellow accents'],
    [Archetype.Voidwalkers, 'small teal accents'],
    [Archetype.LuminarchKnights, 'small cyan accents'],
    [Archetype.RoyalCarmine, 'small crimson accents']
  ])('ART-04 preserves declared preset color roles for %s', (archetype, paletteLogic) => {
    expect(synth([dna('a', { paletteLogic })], 'A creature', archetype as Archetype).promptBlock).toContain(paletteLogic);
  });

  it('ART-05 retains Portuguese locations with prenominal adjectives', () => {
    const parsed = parsePromptIntent('Um nobre no grande palácio de mármore branco, sem armadura');
    expect(parsed.affirmativeText).toContain('no grande palácio');
    expect(parsed.excludedWords.has('palacio')).toBe(false);
    expect(parsed.excludedWords.has('armadura')).toBe(true);
  });

  it('ART-05 keeps coordinated negated actions inside the exclusion', () => {
    const parsed = parsePromptIntent('A noble; avoid wearing black clothes and holding weapons');
    expect(parsed.affirmativeText).not.toContain('weapons');
    expect(parsed.excludedWords.has('weapons')).toBe(true);
    expect(parsePromptIntent('no dragon, wearing white silk').affirmativeText).toContain('wearing white silk');
    expect(parsePromptIntent('without wings, holding a staff').affirmativeText).toContain('holding a staff');
  });

  it('ART-05 preserves contextual exclusions: clothing black does not exclude black linework', () => {
    const result = synth([dna('a', { rendering: 'black linework', materials: 'black clothing' })], 'A noble, no black clothing');
    expect(result.promptBlock).toContain('Rendering: black linework');
    expect(result.promptBlock).not.toContain('Material Behavior: black clothing');
    expect(synth([dna('a', { rendering: 'black linework' })], 'A noble, no black').promptBlock).not.toContain('Rendering: black linework');
    expect(synth([dna('a', { rendering: 'black linework on white clothing' })], 'A noble in white clothing, no black clothing').promptBlock).toContain('black linework on white clothing');
    expect(synth([dna('a', { rendering: 'white clothing with black linework' })], 'A noble in white clothing, no black clothing').promptBlock).toContain('white clothing with black linework');
  });

  it('ART-06 records rejected scale, duplicates, limits and unused fields without false contributions', () => {
    const result = synth([dna('a', {
      scaleProfile: { physicalScale: 'human', scaleForms: ['colossal', 'human scale', 'human scale', 'proportional form', 'natural proportions'], scaleCues: [], perceivedPresence: '', evidence: '', confidence: .9 },
      summary: 'lunar observatory'
    })]);
    const evals = result.debugInfo?.evaluations || [];
    expect(evals.find(e => e.text === 'colossal')?.decision).toBe('discarded');
    expect(evals.find(e => /duplicate/i.test(e.reason) && e.field === 'scaleForms')).toBeDefined();
    expect(evals.find(e => /limit/i.test(e.reason) && e.field === 'scaleForms')).toBeDefined();
    expect(evals.find(e => e.field === 'summary')?.reason).toMatch(/not used|not consumed|search/i);
    const unused = synth([dna('unused', { summary: 'lunar observatory' })]);
    expect(unused.contributingReferences).toEqual([]);
    expect(unused.promptBlock).not.toContain('discarded as incompatible');
  });

  it('ART-06 never emits blocked identity through a negative-rule path', () => {
    const result = synth([dna('a', { identitySpecificDetails: ['Sigil Omega'], contentSpecificAvoids: ['Sigil Omega'], stylePromptFragments: ['clean outlines'] })]);
    expect(result.promptBlock).not.toContain('Sigil Omega');
    expect(result.debugInfo?.identityBlocked).toContain('Sigil Omega');
    expect(result.debugInfo?.evaluations?.some(e => e.field === 'avoidRules' && e.decision === 'discarded')).toBe(true);
  });
});
