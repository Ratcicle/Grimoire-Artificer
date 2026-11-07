import { describe, expect, it, vi } from 'vitest';
import { Archetype, CardType, Context, VisualDNA } from '../types';
import { getAutomaticReferences, getMatchingLogs, synthesizeVisualDNA } from './visualDnaEngine';
import { analyzeReferenceImage, VISUAL_DNA_RESPONSE_SCHEMA } from './geminiService';
import { normalizeVisualDNAAnalysis } from './visualTags';
import { mergeVisualDNASafe } from './visualDnaMerge';

const generateContent = vi.hoisted(() => vi.fn());
vi.mock('./geminiTransport', () => ({
  createGeminiClient: () => ({ models: { generateContent } }),
  hasHostRuntimeCredential: () => false,
}));

const dna = (id: string, patch: Partial<VisualDNA> = {}): VisualDNA => ({
  id, name: id, imageUrl: '', summary: '', linework: '', rendering: '', palette: '',
  silhouette: '', pose: '', framing: '', composition: '', lighting: '', effects: '',
  materials: '', details: '', background: '', hierarchy: '', positivePrompt: '',
  negativePrompt: '', tags: [], scores: {}, ...patch,
});
const v4 = (id: string, patch: Partial<VisualDNA> = {}) => dna(id, { analysisVersion: 4, ...patch });
const synth = (references: VisualDNA[], subject = 'A fire dragon', archetype: Archetype = Archetype.Generic, context: Context = Context.Character, intensity: 'low' | 'medium' | 'high' = 'high') =>
  synthesizeVisualDNA({ references, subject, userPrompt: subject, archetype, cardType: CardType.Monster, context, intensity });

// Real wording rejected by the old vocabulary list, with no subject named.
const RENDERING = 'Mottled wet-looking surfaces with glossy pinpoint highlights and thick, chunky shadow shapes';
const LIGHTING = 'Dramatic warm rim light from below, with cool fill sculpting the outer contour';

describe('analysis v4 reaches the generator', () => {
  it('an open vocabulary passes for v4 and stays blocked for older analyses', () => {
    const fields = { rendering: RENDERING, lighting: LIGHTING };
    const current = synth([v4('new', fields)]).promptBlock;
    expect(current).toContain(`Rendering: ${RENDERING}`);
    expect(current).toContain(`Lighting: ${LIGHTING}`);
    const legacy = synth([dna('old', { ...fields, analysisVersion: 3 })]).promptBlock;
    expect(legacy).not.toContain('Mottled');
    expect(legacy).not.toContain('Dramatic warm');
  });

  it('keeps commas inside one technique instead of cutting it into pieces', () => {
    const { promptBlock, debugInfo } = synth([v4('a', { rendering: RENDERING })]);
    expect(promptBlock).toContain('thick, chunky shadow shapes');
    expect(debugInfo?.evaluations?.some(e => e.text === 'chunky shadow shapes')).toBe(false);
  });

  it('line quality gets its own line at every intensity', () => {
    const linework = 'Heavy brush-inked outer contour tapering sharply into fine interior lines';
    for (const intensity of ['low', 'medium', 'high'] as const) {
      const block = synth([v4('a', { rendering: RENDERING, linework })], undefined, undefined, undefined, intensity).promptBlock;
      expect(block).toContain(`Rendering: ${RENDERING}`);
      expect(block).toContain(`Linework: ${linework}`);
    }
    expect(synth([dna('old', { rendering: 'cel shading', linework: 'clean contours' })]).promptBlock).not.toContain('Linework:');
  });

  it('uses v4 fragments as anchors and ignores the same ideas in prose form', () => {
    const fragment = 'Loose textured contours that break apart near glowing accents';
    const { promptBlock } = synth([v4('a', { stylePromptFragments: [fragment], styleAnchors: 'dense murky haze; loose scribbled rims' })]);
    expect(promptBlock).toContain(fragment);
    expect(promptBlock).not.toContain('loose scribbled rims');
  });

  it('gives high intensity a real line for each technique slot', () => {
    const block = synth([v4('a', {
      rendering: RENDERING, lighting: LIGHTING,
      compositionRecipe: 'Strong diagonal thrust balanced by a heavy opposing mass in the lower third',
      shapeLanguage: 'Bulbous rounded masses punctuated by thin spindly accents',
      paletteLogic: 'Earthy muted base with cold saturated accents kept sparse',
      materialBehavior: 'Wet surfaces catch small sharp highlights while rough ones absorb light',
      focalAnchors: 'Saturation and fine detail converge on the focal point',
      detailPlacement: 'Heavy surface texture near the focal point, broad simple shapes elsewhere',
      background: 'Desaturated depth layers dissolving quickly into atmospheric haze',
      energyDesign: 'Slow sparse motes with soft halos, denser near the source',
      pose: 'Compressed low stance with a strong diagonal line of action',
      scores: { rendering: .8, lighting: .8, composition: .7, silhouette: .7, palette: .7, materials: .7, details: .7, background: .7, effects: .7, pose: .7 },
    })]).promptBlock;
    for (const label of ['Rendering', 'Lighting', 'Composition & Framing', 'Silhouette & Shape', 'Palette Logic', 'Material Behavior', 'Focal Hierarchy', 'Detail Placement', 'Background', 'Effects & Energy', 'Pose & Motion']) {
      expect(block).toContain(`- ${label}:`);
    }
  });
});

describe('analysis v4 keeps the content protections', () => {
  it.each([
    'Hard-edged glints on the gold armor',
    'Soft shading across the wings and chest',
    'Crisp highlights along the jagged sword edge',
    'Warm light falling on the knight from above',
  ])('rejects named content the request does not support: %s', text => {
    const { promptBlock, debugInfo } = synth([v4('a', { rendering: text })], 'A forest spirit');
    expect(promptBlock).not.toContain(text);
    expect(debugInfo?.evaluations?.find(e => e.field === 'rendering')?.decision).toBe('discarded');
  });

  it('accepts the same words when the request asks for them', () => {
    expect(synth([v4('a', { rendering: 'Hard-edged glints on the gold armor' })], 'A knight in gold armor').promptBlock).toContain('gold armor');
    expect(synth([v4('a', { rendering: 'Soft shading across the wings and chest' })], 'An angel with wings and a bare chest').promptBlock).toContain('wings and chest');
  });

  it('accepts terms the selected archetype already establishes', () => {
    expect(synth([v4('a', { rendering: 'Graded shadow on the wings with crisp edges' })], 'A boss', Archetype.ExtremeDragons).promptBlock).toContain('on the wings');
  });

  it('still applies archetype prohibitions, user exclusions and context focus', () => {
    const gothic = 'Gothic angular shadow shapes with hard contrast';
    expect(synth([v4('a', { rendering: gothic })], 'A noble', Archetype.RoyalCarmine).promptBlock).not.toContain('Gothic');
    const excluded = 'Sharp neon highlights with hard contrast';
    expect(synth([v4('a', { rendering: excluded })], 'A dragon, no neon').promptBlock).not.toContain('neon');
    const posed = 'Figure standing in a compressed low stance';
    expect(synth([v4('a', { pose: posed })], 'An ancient relic', Archetype.Generic, Context.Object).promptBlock).not.toContain(posed);
  });

  it.each(['Metal panels have distinct specular highlights', 'Sharp glints on the weapon with soft falloff', 'Inner glow and soft light bleed on the gems', 'Crisp edges along the spikes and the spine'])('catches named content found in real analyses: %s', text => {
    expect(synth([v4('a', { rendering: text })], 'A forest spirit').promptBlock).not.toContain(text);
  });

  it('does not read a technical sense of scale as creature scales', () => {
    const text = 'Sense of scale comes from a tiny focal point against broad shapes';
    expect(synth([v4('a', { compositionRecipe: text })], 'A forest spirit').promptBlock).toContain(text);
  });

  it('does not mistake a color in a technique for clothing, and archetype palettes still apply', () => {
    const text = 'Strong crimson backlighting with crisp graded shadows';
    expect(synth([v4('a', { lighting: text })]).promptBlock).toContain(text);
    expect(synth([v4('a', { lighting: text })], 'A boss', Archetype.ShadowHeart).promptBlock).toContain(text);
    expect(synth([v4('a', { lighting: text })], 'A boss', Archetype.Voidwalkers).promptBlock).not.toContain(text);
    expect(synth([dna('old', { lighting: text })]).promptBlock).not.toContain(text);
  });

  it('a color the request excludes stays out, even under Generic', () => {
    expect(synth([v4('a', { lighting: 'Strong crimson backlighting with crisp graded shadows' })], 'A dragon, no crimson').promptBlock).not.toContain('crimson');
  });

  it('drops stray fragments too short to stand alone', () => {
    expect(synth([v4('a', { rendering: 'Imposing' })]).promptBlock).not.toContain('Imposing');
  });

  it('still blocks identity details the analysis itself flagged', () => {
    const text = 'Sharp glow around the skull-shaped buckle with soft falloff';
    expect(synth([v4('a', { lighting: text, identitySpecificDetails: ['skull-shaped buckle'] })]).promptBlock).not.toContain('buckle');
  });
});

describe('selection with analysis v4', () => {
  it('a style that fits the archetype can win without sharing a theme', () => {
    const records = [dna('other'), v4('fit', { archetypeAffinity: [Archetype.BurningWest] })];
    expect(getAutomaticReferences('A lonely lighthouse', CardType.Spell, Archetype.BurningWest, records, 1).map(r => r.id)).toEqual(['fit']);
    expect(getAutomaticReferences('A lonely lighthouse', CardType.Spell, Archetype.Bloomrot, records, 1)).toEqual([]);
    const fit = getMatchingLogs('A lonely lighthouse', CardType.Spell, Archetype.BurningWest, records, ['fit'], 1).find(log => log.id === 'fit');
    expect(fit?.details?.matches.some(match => match.category === 'ArchetypeAffinity')).toBe(true);
  });

  it('two records of one art do not take two slots, and the newest analysis competes', () => {
    const tags = ['dragon'];
    const records = [dna('old', { name: 'Same Art', tags, subjectProfile: { primarySubject: 'dragon', subjectCategory: 'dragon', visualRole: '' } }), v4('new', { name: 'same art', tags })];
    expect(getAutomaticReferences('A dragon', CardType.Spell, Archetype.Generic, records, 3).map(r => r.id)).toEqual(['new']);
  });
});

describe('analysis v4 contract', () => {
  const answer = {
    summary: 'A dragon', rendering: RENDERING, stylePromptFragments: ['Mottled wet-looking surfaces'],
    archetypeAffinity: [Archetype.BurningWest, 'Not An Archetype', Archetype.BurningWest],
    scores: { rendering: .7 }, subjectProfile: { primarySubject: 'dragon', subjectCategory: 'dragon', visualRole: 'protagonist' },
  };

  it('asks the model only for what it can judge, and requires the technique fields', () => {
    const properties = Object.keys(VISUAL_DNA_RESPONSE_SCHEMA.properties);
    for (const local of ['analysisVersion', 'analysisStatus', 'calibrationVersion', 'isCalibrated', 'clearFields']) expect(properties).not.toContain(local);
    for (const field of ['linework', 'rendering', 'lighting', 'stylePromptFragments', 'archetypeAffinity', 'scores']) expect(VISUAL_DNA_RESPONSE_SCHEMA.required).toContain(field);
    expect(VISUAL_DNA_RESPONSE_SCHEMA.required.every(field => properties.includes(field))).toBe(true);
    const affinity = VISUAL_DNA_RESPONSE_SCHEMA.properties.archetypeAffinity;
    expect(affinity.items.enum).toContain(Archetype.RoyalCarmine);
    expect(affinity.items.enum).not.toContain(Archetype.Generic);
    expect(VISUAL_DNA_RESPONSE_SCHEMA.properties.subjectProfile.properties.subjectCategory.enum).toContain('dragon');
  });

  it('sends an English-only prompt with the transferable rules, an archetype list and a timeout', async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(answer), usageMetadata: {} });
    const { data } = await analyzeReferenceImage('data:image/jpeg;base64,x', 'Art', 'gemini-4-argon');
    const request = generateContent.mock.calls[0][0];
    const prompt: string = request.contents.parts[1].text;
    expect(prompt).toContain('Write every text value in English');
    expect(prompt).toContain('TRANSFERABLE TECHNIQUE');
    expect(prompt).toContain('"Royal Carmine"');
    expect(prompt).not.toMatch(/Quanto esta|aparência dourada|superfície translúcida/);
    expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(data).toMatchObject({ analysisVersion: 4, isCalibrated: true, calibrationVersion: 3, archetypeAffinity: [Archetype.BurningWest] });
  });

  it('normalizes affinity once, and merges replace it only when the analysis supplies it', () => {
    expect(normalizeVisualDNAAnalysis({ archetypeAffinity: ['Nope', Archetype.Bloomrot] }).archetypeAffinity).toEqual([Archetype.Bloomrot]);
    const base = dna('a', { archetypeAffinity: [Archetype.Bloomrot] });
    expect(mergeVisualDNASafe(base, { summary: 'x' }).data.archetypeAffinity).toEqual([Archetype.Bloomrot]);
    expect(mergeVisualDNASafe(base, { archetypeAffinity: [Archetype.TechZero, 'Nope'] }).data.archetypeAffinity).toEqual([Archetype.TechZero]);
  });
});
