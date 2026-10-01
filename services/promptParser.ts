/**
 * services/promptParser.ts
 *
 * Local rule-based extraction of affirmative terms and negative/exclusion constraints
 * from user prompt descriptions for trading card illustration styling and DNA matching.
 *
 * SCOPE & LIMITATIONS:
 * - This local parser relies on regex-based syntactic boundaries, negation triggers,
 *   and affirmative transition cues.
 * - It does NOT perform full natural language deep semantic parsing (e.g. dependency parse trees).
 * - Distinguishes between the Portuguese preposition "no" ("em + o" = in the/on the) and
 *   the English negative determiner "no" using local context, vocabulary cues, and prepositional patterns.
 * - Preserves multi-item negative enumerations (e.g., "avoid dragons, armor and vampires") across commas
 *   until a strong sentence delimiter or clear affirmative transition cue is encountered.
 * - Remaining ambiguities that local heuristics cannot resolve include:
 *   1. Mixed-language telegraphic prompts where English "no" is followed by unmapped Portuguese words without punctuation.
 *   2. Nested exception clauses ("avoid dragons except small whelps").
 *   3. Double negatives or sarcastic inversions ("not without armor").
 */

export interface ParsedPromptIntent {
  /** The filtered prompt containing only affirmative subject details (used for style matching) */
  affirmativeText: string;
  /** Individual phrases identified as exclusions (e.g. ["dragões", "armadura"]) */
  excludedPhrases: string[];
  /** Normalized words that appeared ONLY as exclusions and never affirmatively */
  excludedWords: Set<string>;
}

const normalizeWord = (w: string): string => {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
};

/**
 * Common singular/plural and Portuguese/English variants for high-frequency terms.
 */
const getStemVariants = (word: string): string[] => {
  const norm = normalizeWord(word);
  if (!norm || norm.length < 3) return norm ? [norm] : [];
  
  const variants = new Set<string>([norm]);

  // English plurals
  if (norm.endsWith("ies") && norm.length > 4) {
    variants.add(norm.slice(0, -3) + "y");
  } else if (norm.endsWith("es") && norm.length > 4) {
    variants.add(norm.slice(0, -2));
  } else if (norm.endsWith("s") && norm.length > 3) {
    variants.add(norm.slice(0, -1));
  } else {
    variants.add(norm + "s");
  }

  // Portuguese plurals (dragões -> dragao, asas -> asa, etc.)
  if (norm.endsWith("oes") && norm.length > 4) {
    variants.add(norm.slice(0, -3) + "ao");
  } else if (norm.endsWith("ao") && norm.length > 3) {
    variants.add(norm.slice(0, -2) + "oes");
  }

  return Array.from(variants);
};

// Strong sentence and thought delimiters (semicolon, period, exclamation, question, newline, brackets, dash)
const STRONG_SENTENCE_DELIMITERS = /([;.!?\n\r\(\)\[\]|—–]+)/;

// Portuguese location and setting nouns frequently following the preposition "no" (em + o)
const PT_LOCATION_NOUNS_PATTERN = /^(?:pal[aá]cio|templo|castelo|m[aá]rmore|c[eé]u|ch[aã]o|trono|fundo|centro|meio|topo|alto|ar|mar|rio|lago|bosque|campo|deserto|altar|reino|jardim|espa[cç]o|labirinto|cen[aá]rio|vale|monte|sal[aã]o|quarto|ambiente|interior|exterior|horizonte|lugar|pante[aã]o|santu[aá]rio)\b/i;

// Portuguese subject/article patterns preceding "no"
const PT_PRECEDING_PATTERNS = /\b(?:um|uma|o|mago|nobre|cavaleiro|guerreiro|homem|mulher|est[áa]|fica|situad[oa])\s*$/i;

/**
 * Checks whether an occurrence of the token "no" is the Portuguese preposition "em + o" (in the/on the)
 * rather than the English negative determiner "no".
 *
 * Rules:
 * - Never decides based on isolated shared words like "do" across the whole text (e.g. "do not include").
 * - Considers immediate grammatical structure and unambiguous linguistic markers.
 * - Handles shared words like "altar" by verifying whether the surrounding clause is Portuguese or English.
 */
export const isPortuguesePrepositionNo = (fullText: string, matchIndex: number): boolean => {
  const after = fullText.substring(matchIndex + 2).trim();
  const before = fullText.substring(0, matchIndex).trim();

  // If 'no' is not followed by a Portuguese location or setting noun, it cannot be the preposition "no"
  const nearbyWords = after.split(/\s+/).slice(0, 4);
  if (!nearbyWords.some((_, index) => PT_LOCATION_NOUNS_PATTERN.test(nearbyWords.slice(index).join(' ')))) {
    return false;
  }

  // Detect clear English grammatical markers in the prompt/clause
  const hasEnglishGrammar = /\b(?:do\s+not|don't|not\s+include|without|holding|wearing)\b/i.test(fullText) ||
    /\b(?:a|an)\s+[a-z]+/i.test(before) ||
    /\bnoble\b/i.test(before) || /\bnoble\b/i.test(fullText); // 'noble' with 'le' is English (PT is 'nobre')

  // Detect Portuguese linguistic markers
  const hasPortugueseMarkers = /[áàãâéêíóôõúç]/i.test(fullText) ||
    PT_PRECEDING_PATTERNS.test(before) ||
    /\b(?:nobre|mago|cajado|segurando|vestindo|sem)\b/i.test(fullText);

  // If there are English grammatical constructs:
  if (hasEnglishGrammar) {
    // Shared word like "altar" in English context (e.g. "A noble, no altar"): English exclusion
    if (/^altar\b/i.test(after)) {
      return false;
    }
    // Only treat as Portuguese preposition if preceded by an explicit Portuguese subject (e.g. "Um mago no palácio")
    return PT_PRECEDING_PATTERNS.test(before);
  }

  // In an ambiguous context for shared words like "altar" (e.g. "Um mago no altar" vs "A noble, no altar"):
  if (/^altar\b/i.test(after)) {
    return PT_PRECEDING_PATTERNS.test(before) || hasPortugueseMarkers;
  }

  // For other Portuguese location nouns (palácio, templo, mármore, castelo, etc.):
  return PT_PRECEDING_PATTERNS.test(before) || hasPortugueseMarkers;
};

// General negation trigger regex (supports English and Portuguese triggers)
const BASE_NEGATION_TRIGGER_REGEX = /\b(?:do\s+not\s+(?:include|want|use)|don't\s+(?:include|want|use)|n[ãa]o\s+(?:incluir|usar|quero)|sem\s+incluir|avoiding|avoid|evitando|evitar|evite|without|exclude|excluding|sem|never|no(?!\s+only\b)|not(?!\s+(?:only|just)\b)|n[ãa]o(?!\s+(?:apenas|s[oó])\b))\b/gi;

// Affirmative transition cues that terminate a negative span within a sentence
const AFFIRMATIVE_TRANSITION_REGEX = /\b(?:but\s+also|but\s+with|but|however|while|holding|wielding|carrying|wearing|with|featuring|displaying|having|mas\s+tamb[eé]m|mas\s+com|mas|por[eé]m|porem|com|segurando|portando|empunhando|carregando|vestindo|tendo|exibindo)\b/gi;

interface SegmentResult {
  affirmative: string[];
  excludedPhrases: string[];
}

/**
 * Finds the first valid negation trigger in a sentence, respecting the Portuguese preposition "no".
 */
const findValidNegationTrigger = (text: string, startIndex: number = 0): { index: number; length: number; triggerText: string } | null => {
  BASE_NEGATION_TRIGGER_REGEX.lastIndex = startIndex;
  let match: RegExpExecArray | null;

  while ((match = BASE_NEGATION_TRIGGER_REGEX.exec(text)) !== null) {
    const triggerText = match[0].toLowerCase();
    const matchIndex = match.index;

    // Check if the trigger is "no"
    if (triggerText === "no") {
      if (isPortuguesePrepositionNo(text, matchIndex)) {
        // Skip Portuguese preposition "no"
        continue;
      }
    }

    return {
      index: matchIndex,
      length: match[0].length,
      triggerText: match[0]
    };
  }

  return null;
};

/**
 * Finds a genuine affirmative transition cue in afterText.
 * Ensures direct verbal complements of negation triggers (e.g. "avoid wearing...", "avoid holding...")
 * are NOT treated as affirmative transitions.
 */
const findAffirmativeTransition = (afterText: string): RegExpExecArray | null => {
  AFFIRMATIVE_TRANSITION_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = AFFIRMATIVE_TRANSITION_REGEX.exec(afterText)) !== null) {
    const textBetween = afterText.substring(0, match.index);
    const wordsBetween = textBetween.replace(/[^a-zA-Z0-9\u00C0-\u00FF]+/g, " ").trim();
    
    // If there are no substantive words between the trigger and the matched transition cue,
    // it is a direct verbal complement of the trigger (e.g. "avoid wearing...", "avoid holding...", "without using...")
    // and CANNOT be an affirmative transition.
    if (!wordsBetween) {
      continue;
    }

    // Coordinated actions remain complements of the original negation.
    // A comma or contrast cue can start a new affirmative clause; "and holding"
    // after "avoid wearing" cannot.
    if (/\b(?:and|or|e|ou|nem|nor)\s*$/i.test(textBetween) &&
        !/\b(?:but|however|mas|por[eé]m)\b/i.test(match[0])) {
      continue;
    }

    return match;
  }

  return null;
};

/** Match an exclusion as a phrase/role, preserving modifiers such as clothing color. */
export const matchesPromptExclusion = (text: string, excludedPhrases: string[]): boolean => {
  const canonical = (word: string) => {
    const normalized = normalizeWord(word);
    if (/^(?:clothes|clothing|garment|garments|attire|outfit|roupa|roupas)$/.test(normalized)) return 'clothing';
    return normalized.endsWith('s') && normalized.length > 3 ? normalized.slice(0, -1) : normalized;
  };
  const ignored = new Set(['a', 'an', 'the', 'any', 'um', 'uma', 'wearing', 'holding', 'wielding', 'carrying', 'having', 'using', 'vestindo', 'segurando', 'usando']);
  const words = text.split(/[^a-zA-Z0-9\u00C0-\u00FF]+/).map(canonical).filter(Boolean);
  // Modifiers can occur inside an excluded noun phrase (black ceremonial
  // clothing). A different color, rendering role or relation ends that phrase.
  const boundaries = new Set(['with', 'on', 'over', 'under', 'in', 'of', 'and', 'but', 'com', 'sobre', 'linework', 'lineart', 'outline', 'contour', 'light', 'lighting', 'shadow', 'shading', 'black', 'white', 'red', 'blue', 'green', 'gold', 'silver', 'crimson']);
  return excludedPhrases.some(phrase => {
    const required = phrase.split(/\s+/).map(canonical).filter(word => word && !ignored.has(word));
    if (required.length === 0) return false;
    return words.some((word, index) => {
      if (word !== required[0]) return false;
      let position = index + 1;
      for (const target of required.slice(1)) {
        let skipped = 0;
        while (position < words.length && words[position] !== target && skipped < 2 && !boundaries.has(words[position])) {
          position++;
          skipped++;
        }
        if (words[position] !== target) return false;
        position++;
      }
      return true;
    });
  });
};

/**
 * Parses a sentence/thought (text bounded by strong delimiters like ; . ! ?)
 * into affirmative parts and negative exclusion spans, correctly preserving multi-item enumerations.
 */
const parseSentenceSegments = (sentence: string): SegmentResult => {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return { affirmative: [], excludedPhrases: [] };
  }

  const trigger = findValidNegationTrigger(sentence, 0);
  if (!trigger) {
    return { affirmative: [trimmed], excludedPhrases: [] };
  }

  const affirmativeParts: string[] = [];
  const excludedParts: string[] = [];

  // Text before negation trigger is affirmative
  const beforeText = sentence.substring(0, trigger.index).trim();
  if (beforeText) {
    // Strip trailing comma or conjunction from beforeText
    const cleanBefore = beforeText.replace(/[,;]\s*$/, "").trim();
    if (cleanBefore) {
      affirmativeParts.push(cleanBefore);
    }
  }

  // Text after the trigger
  const afterText = sentence.substring(trigger.index + trigger.length);

  // Check if a genuine affirmative transition cue occurs after the trigger (e.g. ", wearing white silk", ", holding a staff")
  const transMatch = findAffirmativeTransition(afterText);

  // Check if another negation trigger occurs in afterText (e.g. "no dragon, no armor")
  const nextTrigger = findValidNegationTrigger(afterText, 0);

  if (nextTrigger && (!transMatch || nextTrigger.index < transMatch.index)) {
    // There is another negation trigger before any affirmative transition
    const excludedSpan = afterText.substring(0, nextTrigger.index).trim();
    const cleanSpan = excludedSpan.replace(/[,;]\s*$/, "").replace(/\b(?:e|and|or|ou|nem|nor)\s*$/i, "").trim();
    if (cleanSpan) {
      excludedParts.push(cleanSpan);
    }

    const restSentence = afterText.substring(nextTrigger.index);
    const restResult = parseSentenceSegments(restSentence);
    affirmativeParts.push(...restResult.affirmative);
    excludedParts.push(...restResult.excludedPhrases);
  } else if (transMatch) {
    // An affirmative transition occurs after the negative span
    const excludedSpan = afterText.substring(0, transMatch.index).trim();
    const cleanSpan = excludedSpan.replace(/[,;]\s*$/, "").replace(/\b(?:e|and|or|ou|nem|nor)\s*$/i, "").trim();
    if (cleanSpan) {
      excludedParts.push(cleanSpan);
    }

    // Process from the affirmative transition onwards
    const restSentence = afterText.substring(transMatch.index);
    const restResult = parseSentenceSegments(restSentence);
    affirmativeParts.push(...restResult.affirmative);
    excludedParts.push(...restResult.excludedPhrases);
  } else {
    // No affirmative transition and no further triggers: the rest of the sentence is an exclusion enumeration!
    // e.g. "dragons, armor and vampires" or "dragões, armaduras e vampiros"
    const excludedSpan = afterText.trim().replace(/[,;]\s*$/, "");
    if (excludedSpan) {
      excludedParts.push(excludedSpan);
    }
  }

  return {
    affirmative: affirmativeParts,
    excludedPhrases: excludedParts
  };
};

/**
 * Extracts affirmative intent and exclusion rules from a user prompt description.
 */
export const parsePromptIntent = (subject: string): ParsedPromptIntent => {
  if (!subject || typeof subject !== "string") {
    return {
      affirmativeText: "",
      excludedPhrases: [],
      excludedWords: new Set<string>()
    };
  }

  // Split on strong sentence and thought delimiters (. ; ! ? \n etc.)
  const rawChunks = subject.split(STRONG_SENTENCE_DELIMITERS);
  const affirmativeSegments: string[] = [];
  const rawExcludedPhrases: string[] = [];

  for (const chunk of rawChunks) {
    if (!chunk) continue;
    if (STRONG_SENTENCE_DELIMITERS.test(chunk)) {
      continue;
    }

    const { affirmative, excludedPhrases } = parseSentenceSegments(chunk);
    affirmativeSegments.push(...affirmative);
    rawExcludedPhrases.push(...excludedPhrases);
  }

  // Construct combined affirmative text
  const affirmativeText = affirmativeSegments
    .filter(seg => seg.trim().length > 0)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();

  // Extract affirmative words
  const affirmativeWords = new Set<string>();
  affirmativeText.split(/[\s,;.!?\n\r\(\)\[\]|—–]+/).forEach(w => {
    const norm = normalizeWord(w);
    if (norm.length > 2) {
      getStemVariants(norm).forEach(variant => affirmativeWords.add(variant));
    }
  });

  // Extract excluded words and split list items (by and/or/comma)
  const excludedPhrases: string[] = [];
  const rawExcludedWords = new Set<string>();

  for (const phrase of rawExcludedPhrases) {
    // Split sub-items in negative enumeration e.g. "dragons, armor and vampires" or "dragões, armaduras e vampiros"
    const subItems = phrase.split(/\b(?:and|or|e|ou|nem|nor)\b|[,;/]/i);
    for (const item of subItems) {
      const cleanItem = item.trim();
      if (cleanItem) {
        excludedPhrases.push(cleanItem);
        cleanItem.split(/\s+/).forEach(w => {
          const norm = normalizeWord(w);
          // Omit articles, prepositions, and participle/auxiliary verbs
          const STOP_WORDS = [
            "the", "uma", "uns", "umas", "dos", "das", "any", "com", "sem", "para",
            "wearing", "holding", "wielding", "carrying", "having", "using",
            "vestindo", "segurando", "empunhando", "portando", "usando"
          ];
          if (norm.length > 2 && !STOP_WORDS.includes(norm)) {
            getStemVariants(norm).forEach(variant => rawExcludedWords.add(variant));
          }
        });
      }
    }
  }

  // Only consider words as excluded if they were NOT also mentioned affirmatively
  const excludedWords = new Set<string>();
  rawExcludedWords.forEach(word => {
    if (!affirmativeWords.has(word)) {
      excludedWords.add(word);
    }
  });

  return {
    affirmativeText,
    excludedPhrases,
    excludedWords
  };
};
