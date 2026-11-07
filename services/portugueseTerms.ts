// The library is analyzed in English, so a request in Portuguese shares no words with it.
// This covers the vocabulary of the visual tags and archetypes without calling a model.
const GLOSSARY: Record<string, string> = {
  // Beings
  dragao: 'dragon', serpente: 'serpent snake', lobo: 'wolf', besta: 'beast', fera: 'beast creature', monstro: 'monster',
  criatura: 'creature', demonio: 'demon', anjo: 'angel', esqueleto: 'skeleton', zumbi: 'zombie', fantasma: 'ghost',
  espectro: 'specter', vampiro: 'vampire', cavaleiro: 'knight', guerreiro: 'warrior', paladino: 'paladin', mago: 'mage',
  feiticeiro: 'sorcerer', bruxa: 'witch', sacerdote: 'priest', pistoleiro: 'gunslinger', xerife: 'sheriff', caubói: 'cowboy',
  rei: 'king', rainha: 'queen', nobre: 'noble', principe: 'prince', princesa: 'princess', robo: 'robot', maquina: 'machine',
  tita: 'titan', gigante: 'giant', aranha: 'spider', inseto: 'insect', cervo: 'stag', urso: 'bear', corvo: 'raven',
  humano: 'human', elfo: 'elf', anao: 'dwarf', espirito: 'spirit', deus: 'god', deusa: 'goddess', heroi: 'hero', parasita: 'parasite',
  // Objects and gear
  espada: 'sword', lamina: 'blade', machado: 'axe', lanca: 'spear', arco: 'bow', escudo: 'shield', cajado: 'staff', foice: 'scythe',
  arma: 'weapon', canhao: 'cannon', armadura: 'armor', capacete: 'helmet', coroa: 'crown', grimorio: 'grimoire', livro: 'book',
  talisma: 'talisman', amuleto: 'amulet', reliquia: 'relic', gema: 'gem gemstone', joia: 'jewel gemstone', corrente: 'chain',
  mascara: 'mask', capa: 'cape cloak', manto: 'cloak', roupa: 'clothing', vestido: 'dress', engrenagem: 'gear', reator: 'reactor',
  armadilha: 'trap', emboscada: 'ambush', selo: 'seal',
  // Materials
  ouro: 'gold', dourado: 'golden gold', prata: 'silver', prateado: 'silver', ferro: 'iron', aco: 'steel', pedra: 'stone', marmore: 'marble',
  obsidiana: 'obsidian', vidro: 'glass', cristal: 'crystal', osso: 'bone', madeira: 'wood', couro: 'leather', seda: 'silk',
  veludo: 'velvet', tecido: 'fabric', areia: 'sand', escama: 'scales', pena: 'feather feathers', carne: 'flesh', raiz: 'roots',
  vinha: 'vines', cogumelo: 'mushroom', fungo: 'fungus fungal', fungico: 'fungal', esporo: 'spores spore', musgo: 'moss', casca: 'bark',
  // Elements and effects
  fogo: 'fire', chama: 'flame fire', brasa: 'ember', cinza: 'ash', gelo: 'ice', neve: 'snow', agua: 'water', vento: 'wind', terra: 'earth',
  raio: 'lightning', relampago: 'lightning', trovao: 'thunder', tempestade: 'storm', luz: 'light', sombra: 'shadow', escuridao: 'darkness',
  trevas: 'darkness', veneno: 'poison', acido: 'acid', magia: 'magic', feitico: 'spell', runa: 'rune', energia: 'energy', vazio: 'void',
  explosao: 'explosion burst', particula: 'particles', faisca: 'sparks', fumaca: 'smoke', neblina: 'mist', nevoa: 'mist fog', brilho: 'glow',
  aureola: 'halo', eclipse: 'eclipse', sigilo: 'sigil',
  // Places
  castelo: 'castle', catedral: 'cathedral', templo: 'temple', palacio: 'palace', floresta: 'forest', deserto: 'desert', montanha: 'mountain',
  vulcao: 'volcano', caverna: 'cave', ruina: 'ruins', cemiterio: 'graveyard', pantano: 'swamp', oceano: 'ocean', mar: 'sea', ceu: 'sky',
  batalha: 'battle battlefield', cidade: 'city', torre: 'tower', penhasco: 'cliff', masmorra: 'dungeon', fabrica: 'factory', trono: 'throne',
  chao: 'floor ground', cenario: 'scenery',
  // Body
  asa: 'wings', garra: 'claw', chifre: 'horn', cauda: 'tail', olho: 'eye', coracao: 'heart', peito: 'chest',
  // Colors and qualities
  branco: 'white', preto: 'black', negro: 'black', vermelho: 'red', carmesim: 'crimson', azul: 'blue', verde: 'green', roxo: 'purple',
  violeta: 'violet', amarelo: 'yellow', laranja: 'orange', cinzento: 'gray', antigo: 'ancient', amaldicoado: 'cursed', maldito: 'cursed',
  sombrio: 'dark shadowy', gotico: 'gothic', sagrado: 'holy sacred', divino: 'divine', cosmico: 'cosmic', mecanico: 'mechanical',
  radiante: 'radiant', brilhante: 'glowing luminous', enevoado: 'foggy misty', podre: 'rotten decayed', corrompido: 'corrupted',
  enorme: 'huge giant', gigantesco: 'giant', pequeno: 'small', rachado: 'cracked', flutuante: 'floating',
};

const normalize = (word: string) => word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

const ENTRIES = new Map(Object.entries(GLOSSARY).map(([word, english]) => [normalize(word), english]));

/** Singular masculine candidates: dragões, asas, luzes and branca all reach their entry. */
const lookup = (word: string): string | undefined => {
  const candidates = [word];
  if (word.endsWith('oes') || word.endsWith('aes')) candidates.push(`${word.slice(0, -3)}ao`);
  if (word.endsWith('es')) candidates.push(word.slice(0, -2));
  if (word.endsWith('s')) candidates.push(word.slice(0, -1));
  for (const candidate of [...candidates]) if (candidate.endsWith('a')) candidates.push(`${candidate.slice(0, -1)}o`);
  for (const candidate of candidates) {
    const english = ENTRIES.get(candidate);
    if (english) return english;
  }
  return undefined;
};

const wordsOf = (text: string) => text.split(/[^\p{L}]+/u).map(normalize).filter(Boolean);

export const isPortugueseTerm = (word: string): boolean => lookup(normalize(word)) !== undefined;

const ENGLISH_TERMS = new Set([...ENTRIES.values()].flatMap(english => english.split(' ')));

/** An English noun after "no" keeps it a negation, even in a mostly Portuguese request. */
export const isEnglishGlossaryTerm = (word: string): boolean => {
  const normalized = normalize(word);
  return ENGLISH_TERMS.has(normalized) || (normalized.endsWith('s') && ENGLISH_TERMS.has(normalized.slice(0, -1)));
};

export function englishTermsFor(text: string): string[] {
  return [...new Set(wordsOf(text).flatMap(word => lookup(word)?.split(' ') ?? []))];
}

export function withEnglishTerms(text: string): string {
  const terms = englishTermsFor(text);
  return terms.length ? `${text}, ${terms.join(', ')}` : text;
}
