import { describe, expect, it } from 'vitest';
import { Archetype, CardType, VisualDNA } from '../types';
import { englishTermsFor, withEnglishTerms } from './portugueseTerms';
import { parsePromptIntent } from './promptParser';
import { getAutomaticReferences, synthesizeVisualDNA } from './visualDnaEngine';

const dna = (id: string, patch: Partial<VisualDNA> = {}): VisualDNA => ({
  id, name: id, imageUrl: '', summary: '', linework: '', rendering: '', palette: '',
  silhouette: '', pose: '', framing: '', composition: '', lighting: '', effects: '',
  materials: '', details: '', background: '', hierarchy: '', positivePrompt: '',
  negativePrompt: '', tags: [], scores: {}, ...patch,
});

describe('englishTermsFor', () => {
  it.each([
    ['Dragões', ['dragon']],
    ['armadura branca', ['armor', 'white']],
    ['espada dourada', ['sword', 'golden', 'gold']],
    ['luzes e asas', ['light', 'wings']],
    ['Coração de cristal', ['heart', 'crystal']],
    ['coisa sem tradução', []],
    ['A knight in a castle', []],
  ])('%s', (text, terms) => {
    expect(englishTermsFor(text)).toEqual(terms);
  });

  it('keeps the original text and adds the English words', () => {
    expect(withEnglishTerms('cavaleiro de armadura')).toBe('cavaleiro de armadura, knight, armor');
    expect(withEnglishTerms('a white knight')).toBe('a white knight');
  });
});

describe('the Portuguese preposition "no"', () => {
  it.each(['Um mago no cemitério', 'Dragão no vulcão', 'Uma fera no pântano', 'Bruxa no penhasco', 'Um pistoleiro no saloon em chamas', 'Cavaleiro no campo de batalha'])('%s excludes nothing', prompt => {
    const result = parsePromptIntent(prompt);
    expect(result.excludedPhrases).toEqual([]);
    expect(result.affirmativeText).toBe(prompt);
  });

  it.each([
    ['Um mago, no dragons', 'dragons'],
    ['Um dragão no armor', 'armor'],
    ['A knight with no helmet', 'helmet'],
    ['A forest spirit no wings', 'wings'],
  ])('%s still excludes %s', (prompt, word) => {
    expect(parsePromptIntent(prompt).excludedWords.has(word)).toBe(true);
  });
});

describe('Portuguese requests against a library analyzed in English', () => {
  const library = [
    dna('knight', { tags: ['armor', 'humanoid'], subjectProfile: { primarySubject: 'armored knight', subjectCategory: 'humanoid', visualRole: '' } }),
    dna('beast', { tags: ['creature', 'forest', 'fungal'], subjectProfile: { primarySubject: 'fungal beast', subjectCategory: 'creature', visualRole: '' } }),
  ];
  const pick = (subject: string) => getAutomaticReferences(subject, CardType.Spell, Archetype.Generic, library, 1).map(r => r.id);

  it('finds the same reference as the English request', () => {
    expect(pick('Um cavaleiro de armadura')).toEqual(pick('A knight in armor'));
    expect(pick('Uma fera fúngica na floresta')).toEqual(pick('A fungal beast in the forest'));
    expect(pick('Um cavaleiro de armadura')).toEqual(['knight']);
    expect(pick('Uma fera fúngica na floresta')).toEqual(['beast']);
  });

  it('an exclusion in Portuguese keeps the English tag out', () => {
    expect(pick('Uma figura sem armadura, sem cavaleiro')).toEqual([]);
  });

  it('a request in Portuguese supports the content it asks for and blocks what it excludes', () => {
    const synth = (subject: string) => synthesizeVisualDNA({ references: [dna('a', { analysisVersion: 4, rendering: 'Hard-edged glints on the gold armor' })], subject, userPrompt: subject, archetype: Archetype.Generic, cardType: CardType.Monster, intensity: 'high' }).promptBlock;
    expect(synth('Um cavaleiro de armadura de ouro')).toContain('gold armor');
    expect(synth('Um espírito da floresta')).not.toContain('gold armor');
    expect(synth('Um cavaleiro de ouro, sem armadura')).not.toContain('gold armor');
  });
});
