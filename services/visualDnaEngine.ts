import { VisualDNA, SynthesisDebug, MatchDetail, DNAMatchingResult, MatchingScoreLog, CardType, Context, Complexity, Archetype } from "../types";
import { VISUAL_TAG_KEYWORDS, isCalibratedRecord } from "./visualTags";
import { parsePromptIntent, matchesPromptExclusion } from "./promptParser";
import { ARCHETYPE_DEFINITIONS } from "../constants";
import {
  SynthesisContext,
  evaluateCandidateFragment as evaluatePolicyFragment,
  filterFragmentForIdentity,
  ARCHETYPE_POLICY_RULES
} from "./visualDnaPolicy";


const normalizeText = (text: string) => {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_\/\\]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^\$\{\}()|\[\]\\]/g, '\\$&');
};

const checkExactMatch = (text: string, queryWordsNormalized: string) => {
  if (!text) return false;
  const normalizedText = normalizeText(text);
  if (!normalizedText) return false;
  
  const boundaryRegex = new RegExp("(^|\\s)" + escapeRegExp(normalizedText) + "($|\\s)", 'i');
  return boundaryRegex.test(queryWordsNormalized);
};

export const scoreVisualDNAReferenceBase = (
  dna: VisualDNA,
  queryWordsNormalized: string,
  cardType: string,
  excludedWords?: Set<string>,
  context?: Context | string
) => {
  let baseScore = 0;
  const matches: MatchDetail[] = [];
  const ignoredLowConfidence: MatchDetail[] = [];
  const penalties: MatchDetail[] = [];
  const matchedCategories = new Set<string>();

  const isTermExcluded = (term: string): boolean => {
    if (!excludedWords || excludedWords.size === 0 || !term) return false;
    const norm = normalizeText(term);
    if (!norm) return false;
    if (excludedWords.has(norm)) return true;
    const words = norm.split(/\s+/);
    return words.some(w => excludedWords.has(w));
  };

  const addMatch = (category: string, tag: string, score: number) => {
    if (isTermExcluded(tag)) return;
    baseScore += score;
    matches.push({ category, tag, score });
    matchedCategories.add(category);
  };

  const addIgnored = (category: string, tag: string) => {
    ignoredLowConfidence.push({ category, tag, score: 0 });
  };

  if (Array.isArray(dna.subjects)) {
    dna.subjects.forEach(sub => {
      if (sub.category && !isTermExcluded(sub.category) && checkExactMatch(sub.category, queryWordsNormalized)) {
        addMatch("SubjectCategory", sub.category, 3);
      }
      if (sub.visualRole && !isTermExcluded(sub.visualRole) && checkExactMatch(sub.visualRole, queryWordsNormalized)) {
        addMatch("VisualRole", sub.visualRole, 2);
      }
    });
  }

  if (dna.subjectProfile && dna.subjectProfile.subjectCategory) {
    if (!isTermExcluded(dna.subjectProfile.subjectCategory) && checkExactMatch(dna.subjectProfile.subjectCategory, queryWordsNormalized)) {
      addMatch("SubjectCategory", dna.subjectProfile.subjectCategory, 3);
    }
  }

  if (dna.scaleProfile) {
    const isHighConfidence = dna.scaleProfile.confidence === undefined || dna.scaleProfile.confidence >= 0.5;
    
    if (dna.scaleProfile.physicalScale && !isTermExcluded(dna.scaleProfile.physicalScale) && checkExactMatch(dna.scaleProfile.physicalScale, queryWordsNormalized)) {
      if (isHighConfidence) addMatch("PhysicalScale", dna.scaleProfile.physicalScale, 3);
      else addIgnored("PhysicalScale", dna.scaleProfile.physicalScale);
    }
    
    if (dna.scaleProfile.scaleForms) {
       dna.scaleProfile.scaleForms.forEach(form => {
          if (!isTermExcluded(form) && checkExactMatch(form, queryWordsNormalized)) {
            if (isHighConfidence) addMatch("ScaleForm", form, 3);
            else addIgnored("ScaleForm", form);
          }
       });
    }
    
    if (dna.scaleProfile.scaleCues) {
       dna.scaleProfile.scaleCues.forEach(cue => {
          if (!isTermExcluded(cue) && checkExactMatch(cue, queryWordsNormalized)) {
             if (isHighConfidence) addMatch("ScaleCue", cue, 2);
             else addIgnored("ScaleCue", cue);
          }
       });
    }
    
    if (dna.scaleProfile.perceivedPresence && !isTermExcluded(dna.scaleProfile.perceivedPresence) && checkExactMatch(dna.scaleProfile.perceivedPresence, queryWordsNormalized)) {
      if (isHighConfidence) addMatch("PerceivedPresence", dna.scaleProfile.perceivedPresence, 2);
      else addIgnored("PerceivedPresence", dna.scaleProfile.perceivedPresence);
    }
  }

  if (dna.substanceProfile) {
    const isHighConfidence = dna.substanceProfile.confidence === undefined || dna.substanceProfile.confidence >= 0.5;
    
    if (dna.substanceProfile.materials) {
       dna.substanceProfile.materials.forEach(mat => {
          if (!isTermExcluded(mat) && checkExactMatch(mat, queryWordsNormalized)) {
             if (isHighConfidence) addMatch("Material", mat, 3);
             else addIgnored("Material", mat);
          }
       });
    }
    
    if (dna.substanceProfile.elements) {
       dna.substanceProfile.elements.forEach(el => {
          if (!isTermExcluded(el) && checkExactMatch(el, queryWordsNormalized)) {
             if (isHighConfidence) addMatch("Element", el, 3);
             else addIgnored("Element", el);
          }
       });
    }
    
    if (dna.substanceProfile.elementApplications) {
       dna.substanceProfile.elementApplications.forEach(app => {
          if (!isTermExcluded(app) && checkExactMatch(app, queryWordsNormalized)) {
             if (isHighConfidence) addMatch("ElementApplication", app, 3);
             else addIgnored("ElementApplication", app);
          }
       });
    }
    
    if (dna.substanceProfile.surfaces) {
       dna.substanceProfile.surfaces.forEach(surf => {
          if (!isTermExcluded(surf) && checkExactMatch(surf, queryWordsNormalized)) {
             if (isHighConfidence) addMatch("Surface", surf, 2);
             else addIgnored("Surface", surf);
          }
       });
    }
  }

  const tags = Array.isArray(dna.tags) ? dna.tags : [];
  tags.forEach(tag => {
    const lowerTag = tag.toLowerCase();
    if (isTermExcluded(lowerTag)) return;

    const isGeneric = ['high detail', 'particles', 'dynamic pose'].includes(lowerTag);
    const tagWeight = isGeneric ? 0.5 : 2;

    if (checkExactMatch(lowerTag, queryWordsNormalized)) {
      addMatch("Tag", lowerTag, tagWeight);
    }
    
    const keywords = VISUAL_TAG_KEYWORDS[lowerTag] || [];
    keywords.forEach((kw: string) => {
       if (!isTermExcluded(kw) && checkExactMatch(kw, queryWordsNormalized)) {
          addMatch("TagKeyword", lowerTag, tagWeight * 0.75);
       }
    });
  });

  if (cardType === "Monster" && (tags.includes("boss monster") || tags.includes("creature") || tags.includes("humanoid"))) {
    addMatch("CardType", "Monster Match", 2);
  }
  if (cardType === "Spell" && (tags.includes("spell artwork") || tags.includes("magical burst"))) {
    addMatch("CardType", "Spell Match", 2);
  }
  if (cardType === "Trap" && (tags.includes("trap artwork") || tags.includes("particles"))) {
    addMatch("CardType", "Trap Match", 2);
  }

  const checkField = (fieldName: string, fieldVal: string | string[] | undefined, weight: number) => {
    if (!fieldVal) return;
    const strVal = Array.isArray(fieldVal) ? fieldVal.join(' ') : String(fieldVal);
    const words = queryWordsNormalized.split(/\s+/).filter(w => w.length > 3 && !isTermExcluded(w));
    const normalizedField = normalizeText(strVal);
    let fieldScore = 0;
    words.forEach(w => {
       const boundaryRegex = new RegExp("(^|\\s)" + escapeRegExp(w) + "($|\\s)", 'i');
       if (boundaryRegex.test(normalizedField)) {
           fieldScore += weight;
       }
    });
    if (fieldScore > 0) {
       addMatch("FieldMatch", fieldName, fieldScore);
    }
  };

  checkField("summary", dna.summary, 0.5);
  checkField("positivePrompt", dna.positivePrompt, 0.5);
  checkField("styleAnchors", dna.styleAnchors, 0.75);
  checkField("visualMotifs", dna.visualMotifs, 0.75);
  checkField("contentMotifs", dna.contentMotifs, 0.75);
  checkField("primarySubject", dna.subjectProfile?.primarySubject, 1);
  checkField("subjectDescriptions", dna.subjects?.map(subject => subject.description), 1);

  // Focus complements thematic relevance; it never selects a record by utility
  // or invents relevance for a reference with no query match.
  if (baseScore > 0 && context) {
    const categories = [dna.subjectProfile?.subjectCategory, ...(dna.subjects || []).filter(s => s.visualRole === 'primary').map(s => s.category)].filter(Boolean).map(normalizeText);
    const focusCategories: Record<string, string[]> = {
      [Context.Character]: ['humanoid', 'human', 'character', 'creature', 'beast', 'dragon', 'monster'],
      [Context.Object]: ['object', 'artifact', 'weapon', 'equipment', 'item'],
      [Context.Scenario]: ['environment', 'scenario', 'landscape', 'architecture', 'location', 'setting']
    };
    if (categories.some(category => focusCategories[context]?.includes(category))) addMatch('ContextFocus', context, 2);
  }

  return {
    baseScore,
    diversityBonus: 0,
    redundancyPenalty: 0,
    finalScore: baseScore,
    matches,
    ignoredLowConfidence,
    penalties,
    matchedCategories: Array.from(matchedCategories)
  };
};

export const calculateComplementaryScores = (
  allScored: { dna: VisualDNA, result: DNAMatchingResult }[],
  maxReferences: number
): { dna: VisualDNA, result: DNAMatchingResult }[] => {
  if (allScored.length === 0) return [];
  
  let remaining = [...allScored].sort((a, b) => b.result.baseScore - a.result.baseScore);
  
  const selected: { dna: VisualDNA, result: DNAMatchingResult }[] = [];
  const coveredCategories = new Set<string>();
  
  const first = remaining.shift();
  if (first) {
     selected.push(first);
     first.result.matchedCategories.forEach(c => coveredCategories.add(c));
  }
  
  while (selected.length < maxReferences && remaining.length > 0) {
     remaining.forEach(item => {
        let divBonus = 0;
        
        // Only award diversity bonus for categories that actually matched the prompt query
        item.result.matchedCategories.forEach(cat => {
           if (!coveredCategories.has(cat)) divBonus += 1.5;
        });
        
        // Do not penalize similar references that improve coherence, and do not
        // give bonuses for unrequested materials or elements.
        item.result.diversityBonus = divBonus;
        item.result.redundancyPenalty = 0;
        item.result.finalScore = item.result.baseScore + divBonus;
     });
     
     remaining.sort((a, b) => b.result.finalScore - a.result.finalScore);
     
     const nextBest = remaining.shift();
     if (nextBest && nextBest.result.finalScore > 0) {
        selected.push(nextBest);
        nextBest.result.matchedCategories.forEach(c => coveredCategories.add(c));
     } else {
        break;
     }
  }
  
  return selected;
};

export const resolveManualReferences = (
  manualIds: string[] | undefined,
  allDna: VisualDNA[],
  maxReferences: number = 3
): VisualDNA[] => {
  if (!manualIds || manualIds.length === 0) return [];
  
  const dnaMap = new Map(allDna.map(dna => [dna.id, dna]));
  const seenIds = new Set<string>();
  const resolved: VisualDNA[] = [];

  for (const id of manualIds) {
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const dna = dnaMap.get(id);
    if (dna) {
      resolved.push(dna);
      if (resolved.length >= maxReferences) {
        break;
      }
    }
  }

  return resolved;
};

export const getAutomaticReferences = (
  subject: string,
  cardType: string,
  archetype: string,
  database: VisualDNA[],
  maxReferences: number = 3,
  context?: Context | string
): VisualDNA[] => {
  const { affirmativeText, excludedWords } = parsePromptIntent(subject);
  const queryWords = [affirmativeText, cardType, archetype].filter(Boolean).join(" ");
  const normalizedQuery = normalizeText(queryWords);

  const scored = database.map(dna => {
    return { dna, result: scoreVisualDNAReferenceBase(dna, normalizedQuery, cardType, excludedWords, context) };
  }).filter(item => item.result.baseScore > 0);

  const finalSelection = calculateComplementaryScores(scored, maxReferences);
  return finalSelection.map(item => item.dna);
};

export const getMatchingLogs = (
  subject: string,
  cardType: string,
  archetype: string,
  database: VisualDNA[],
  selectedIds: string[],
  maxReferences: number = 3,
  context?: Context | string
): MatchingScoreLog[] => {
  const { affirmativeText, excludedWords } = parsePromptIntent(subject);
  const queryWords = [affirmativeText, cardType, archetype].filter(Boolean).join(" ");
  const normalizedQuery = normalizeText(queryWords);
  
  const scored = database.map(dna => {
    return { dna, result: scoreVisualDNAReferenceBase(dna, normalizedQuery, cardType, excludedWords, context) };
  });
  
  // Use the exact maxReferences as generation
  const scoredWithBonuses = calculateComplementaryScores([...scored].filter(s => s.result.baseScore > 0), maxReferences);
  
  return database.map(dna => {
    const autoScoreResult = scoredWithBonuses.find(s => s.dna.id === dna.id)?.result || scored.find(s => s.dna.id === dna.id)!.result;
    
    return {
      id: dna.id,
      name: dna.name || "Unnamed Reference",
      score: autoScoreResult.baseScore,
      weight: autoScoreResult.finalScore,
      selected: selectedIds.includes(dna.id),
      details: autoScoreResult
    };
  }).sort((a, b) => b.weight - a.weight);
};

export const getEffectiveUtilityScore = (
  ref: VisualDNA,
  scoreKey: keyof VisualDNA['scores']
): number => {
  if (!ref || !ref.scores) return 0;
  const rawScore = ref.scores[scoreKey];
  // Defensively verify number
  if (typeof rawScore !== 'number' || isNaN(rawScore) || !Number.isFinite(rawScore) || rawScore < 0 || rawScore > 1) {
    return 0;
  }
  // Unified calibration check:
  if (isCalibratedRecord(ref)) {
    return rawScore;
  }
  // Legacy / uncalibrated compatibility:
  // Maps uncalibrated scores to a conservative baseline [0, 0.5]
  // This ensures an uncalibrated 1.0 (0.5) never overrules a solid calibrated score (e.g. 0.75, 0.85),
  // while preserving relative ordering among uncalibrated records deterministically.
  return Math.min(0.5, Math.max(0, rawScore * 0.5));
};

export interface SynthesizeParams {
  references: VisualDNA[];
  intensity: "low" | "medium" | "high";
  subject: string;
  cardType: CardType | string;
  archetype: Archetype | string;
  userPrompt?: string;
  context?: Context | string;
  complexity?: Complexity | string;
  archetypePreset?: string;
}

export const synthesizeVisualDNA = (
  params: SynthesizeParams
): {
  promptBlock: string;
  usedReferences: { id: string; name: string }[];
  selectedReferences: { id: string; name: string }[];
  contributingReferences?: { id: string; name: string }[];
  debugInfo: SynthesisDebug | null;
} => {
  const { references, intensity, subject, cardType, archetype, userPrompt } = params;
  
  const selectedReferences = references.map(r => ({ id: r.id, name: r.name || "Unnamed Reference" }));

  if (references.length === 0) {
    return { promptBlock: "", usedReferences: [], selectedReferences: [], debugInfo: null };
  }

  const { affirmativeText, excludedWords, excludedPhrases } = parsePromptIntent(userPrompt || subject);
  const resolvedPreset = params.archetypePreset || ARCHETYPE_DEFINITIONS[archetype as Archetype] || ARCHETYPE_DEFINITIONS[Archetype.Generic];

  const synthesisContext: SynthesisContext = {
    subject,
    affirmativeText,
    excludedWords,
    excludedPhrases,
    cardType,
    context: params.context || Context.Character,
    complexity: params.complexity || Complexity.Medium,
    archetype,
    archetypePreset: resolvedPreset,
    intensity
  };

  const debugInfo: SynthesisDebug = {
    motifs: [],
    avoidRules: [],
    identityBlocked: [],
    evaluations: [],
    contributingReferenceIds: [],
    allContributionsDiscarded: false
  };

  const contributingRefIds = new Set<string>();

  const evaluateCandidateFragment = (...args: Parameters<typeof evaluatePolicyFragment>) => {
    const result = evaluatePolicyFragment(...args);
    const [, field, ref] = args;
    for (const rejected of result.rejectedClauses || []) {
      debugInfo.evaluations!.push({ referenceId: ref.id, referenceName: ref.name || 'Unnamed', field: `${field}.clause`, text: rejected.text, decision: 'discarded', reason: rejected.reason });
    }
    return result;
  };

  const evaluateAndRecord = (
    rawFragment: string,
    field: string,
    ref: VisualDNA,
    unusedReason?: string
  ): { included: boolean; text: string } => {
    if (!rawFragment || typeof rawFragment !== "string" || !rawFragment.trim()) {
      return { included: false, text: "" };
    }

    const evalRes = evaluateCandidateFragment(rawFragment, field, ref, synthesisContext);
    
    const blockedList = evalRes.blockedIdentities || (evalRes.blockedIdentity ? [evalRes.blockedIdentity] : []);
    for (const b of blockedList) {
      if (!debugInfo.identityBlocked.includes(b)) {
        debugInfo.identityBlocked.push(b);
      }
    }

    if (evalRes.decision === "included" && evalRes.text && !unusedReason) {
      contributingRefIds.add(ref.id);
      debugInfo.evaluations!.push({
        referenceId: ref.id,
        referenceName: ref.name || "Unnamed",
        field,
        text: evalRes.originalText || rawFragment.trim(),
        cleanedText: evalRes.text !== rawFragment.trim() ? evalRes.text : undefined,
        decision: "included",
        reason: evalRes.reason
      });
      return { included: true, text: evalRes.text };
    }

    debugInfo.evaluations!.push({
      referenceId: ref.id,
      referenceName: ref.name || "Unnamed",
      field,
      text: evalRes.originalText || rawFragment.trim(),
      decision: "discarded",
      reason: evalRes.decision === 'discarded' ? evalRes.reason : unusedReason || evalRes.reason
    });
    return { included: false, text: "" };
  };

  const getBestSlot = (
    primaryField: keyof VisualDNA,
    fallbackFields: (keyof VisualDNA)[],
    scoreKey: keyof VisualDNA['scores']
  ): string => {
    const sorted = [...references].sort((a, b) => {
      const scoreA = getEffectiveUtilityScore(a, scoreKey);
      const scoreB = getEffectiveUtilityScore(b, scoreKey);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return references.indexOf(a) - references.indexOf(b);
    });

    let selected = '';
    for (const ref of sorted) {
      // 1. Check primary field
      const val = ref[primaryField];
      if (val) {
        const items = Array.isArray(val) ? val : [String(val)];
        for (const item of items) {
          const res = evaluateAndRecord(item, String(primaryField), ref, selected ? 'Not used: a higher-priority compatible contribution already fills this slot.' : undefined);
          if (res.included && res.text) {
            selected = res.text;
          }
        }
      }

      // 2. Check fallback fields (never summary)
      for (const fbField of fallbackFields) {
        const fbVal = ref[fbField];
        if (fbVal) {
          const items = Array.isArray(fbVal) ? fbVal : [String(fbVal)];
          for (const item of items) {
            const res = evaluateAndRecord(item, String(fbField), ref, selected ? 'Not used: the selected contribution already fills this slot.' : undefined);
            if (res.included && res.text) {
              selected = res.text;
            }
          }
        }
      }
    }

    return selected;
  };

  const userPromptNorm = normalizeText(affirmativeText || userPrompt || subject);

  const doesAvoidRuleContradict = (rule: string): boolean => {
    const cleanRule = rule.replace(/^(?:avoid|do not include|don't include|n[ãa]o incluir|evitar)\s+/i, "").trim();
    const subItems = cleanRule.split(/\b(?:and|or|e|ou|nem|nor)\b|[,;/]/i);
    for (const item of subItems) {
      const words = item.split(/\s+/).map(w => normalizeText(w)).filter(w => w.length > 2);
      for (const w of words) {
        if (excludedWords.has(w)) continue;

        const boundaryRegex = new RegExp("(^|\\s)" + escapeRegExp(w) + "($|\\s)", 'i');
        if (boundaryRegex.test(userPromptNorm) || boundaryRegex.test(normalizeText(affirmativeText)) || boundaryRegex.test(normalizeText(cardType))) {
          return true;
        }

        // Check if archetype preset specifically requires this signature trait
        const archRules = ARCHETYPE_POLICY_RULES[archetype as string];
        if (archRules && archRules.signatureTerms.some(st => checkExactMatch(w, normalizeText(st)))) {
          return true;
        }
      }
    }
    return false;
  };

  // Evaluate Style Anchors and Prompt Fragments
  const maxAnchors = intensity === "low" ? 2 : intensity === "medium" ? 4 : 6;
  const acceptedAnchors: string[] = [];
  const seenCleanAnchorTexts = new Set<string>();

  for (const ref of references) {
    const fragments: string[] = [];
    if (Array.isArray(ref.stylePromptFragments)) fragments.push(...ref.stylePromptFragments);
    if (typeof ref.styleAnchors === "string" && ref.styleAnchors.trim()) {
      fragments.push(...ref.styleAnchors.split(/[,;]+/).map(s => s.trim()).filter(Boolean));
    }

    for (const frag of fragments) {
      if (!frag || typeof frag !== "string" || !frag.trim()) continue;

      const evalRes = evaluateCandidateFragment(frag, "styleAnchors", ref, synthesisContext);
      const blockedList = evalRes.blockedIdentities || (evalRes.blockedIdentity ? [evalRes.blockedIdentity] : []);
      for (const b of blockedList) {
        if (!debugInfo.identityBlocked.includes(b)) {
          debugInfo.identityBlocked.push(b);
        }
      }

      if (evalRes.decision === "discarded" || !evalRes.text) {
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "styleAnchors",
          text: evalRes.originalText || frag.trim(),
          decision: "discarded",
          reason: evalRes.reason
        });
        continue;
      }

      // Check duplicate AFTER cleaning
      const normCleanText = normalizeText(evalRes.text);
      if (seenCleanAnchorTexts.has(normCleanText)) {
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "styleAnchors",
          text: evalRes.originalText || frag.trim(),
          cleanedText: evalRes.text !== frag.trim() ? evalRes.text : undefined,
          decision: "discarded",
          reason: "Duplicate style anchor after cleaning."
        });
        continue;
      }

      // Check limit AFTER deduplication
      if (acceptedAnchors.length < maxAnchors) {
        seenCleanAnchorTexts.add(normCleanText);
        acceptedAnchors.push(evalRes.text);
        contributingRefIds.add(ref.id);
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "styleAnchors",
          text: evalRes.originalText || frag.trim(),
          cleanedText: evalRes.text !== frag.trim() ? evalRes.text : undefined,
          decision: "included",
          reason: evalRes.reason
        });
      } else {
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "styleAnchors",
          text: evalRes.originalText || frag.trim(),
          cleanedText: evalRes.text !== frag.trim() ? evalRes.text : undefined,
          decision: "discarded",
          reason: "Exceeds intensity limit for style anchors."
        });
      }
    }
  }

  // Evaluate Motifs
  const usedMotifs: string[] = [];
  const seenCleanMotifTexts = new Set<string>();
  const maxMotifs = intensity === "low" ? 0 : intensity === "medium" ? 3 : 5;

  for (const ref of references) {
    const rawMotifs: string[] = [];
    if (Array.isArray(ref.contentMotifs)) rawMotifs.push(...ref.contentMotifs);
    if (typeof ref.visualMotifs === "string" && ref.visualMotifs.trim()) {
      rawMotifs.push(...ref.visualMotifs.split(/[,;]+/).map(s => s.trim()).filter(Boolean));
    }

    for (const motif of rawMotifs) {
      if (!motif || typeof motif !== "string" || !motif.trim()) continue;
      const normMotif = normalizeText(motif);

      // Check if motif contains excluded words
      const words = normMotif.split(/\s+/).filter(w => w.length > 2);
      const isExcluded = matchesPromptExclusion(motif, excludedPhrases);
      if (isExcluded) {
        debugInfo.motifs.push({ motif, used: false, reason: "Contains user-excluded word." });
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "motifs",
          text: motif,
          decision: "discarded",
          reason: "Contains user-excluded word."
        });
        continue;
      }

      // Check prompt relevance
      const isRelevant = words.some(w => {
        const boundaryRegex = new RegExp("(^|\\s)" + escapeRegExp(w) + "($|\\s)", 'i');
        return boundaryRegex.test(userPromptNorm) || boundaryRegex.test(normalizeText(affirmativeText)) || boundaryRegex.test(normalizeText(cardType));
      });

      if (!isRelevant) {
        debugInfo.motifs.push({ motif, used: false, reason: "Not relevant to current prompt context." });
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "motifs",
          text: motif,
          decision: "discarded",
          reason: "Not relevant to current prompt context."
        });
        continue;
      }

      const evalRes = evaluateCandidateFragment(motif, "motifs", ref, synthesisContext);
      const blockedList = evalRes.blockedIdentities || (evalRes.blockedIdentity ? [evalRes.blockedIdentity] : []);
      for (const b of blockedList) {
        if (!debugInfo.identityBlocked.includes(b)) debugInfo.identityBlocked.push(b);
      }

      if (evalRes.decision === "discarded" || !evalRes.text) {
        debugInfo.motifs.push({ motif, used: false, reason: evalRes.reason });
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "motifs",
          text: evalRes.originalText || motif.trim(),
          decision: "discarded",
          reason: evalRes.reason
        });
        continue;
      }

      // Check duplicate after cleaning
      const normCleanMotif = normalizeText(evalRes.text);
      if (seenCleanMotifTexts.has(normCleanMotif)) {
        debugInfo.motifs.push({ motif, used: false, reason: "Duplicate motif after cleaning." });
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "motifs",
          text: evalRes.originalText || motif.trim(),
          cleanedText: evalRes.text !== motif.trim() ? evalRes.text : undefined,
          decision: "discarded",
          reason: "Duplicate motif after cleaning."
        });
        continue;
      }

      if (usedMotifs.length < maxMotifs) {
        seenCleanMotifTexts.add(normCleanMotif);
        usedMotifs.push(evalRes.text);
        contributingRefIds.add(ref.id);
        debugInfo.motifs.push({ motif, used: true, reason: "Matches user prompt context." });
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "motifs",
          text: evalRes.originalText || motif.trim(),
          cleanedText: evalRes.text !== motif.trim() ? evalRes.text : undefined,
          decision: "included",
          reason: evalRes.reason
        });
      } else {
        debugInfo.motifs.push({ motif, used: false, reason: "Exceeds intensity limit for motifs." });
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "motifs",
          text: evalRes.originalText || motif.trim(),
          cleanedText: evalRes.text !== motif.trim() ? evalRes.text : undefined,
          decision: "discarded",
          reason: "Exceeds intensity limit for motifs."
        });
      }
    }
  }

  // Semantic slot resolutions based on intensity
  const rendering = getBestSlot("rendering", ["linework"], "rendering");
  const lighting = getBestSlot("lighting", [], "lighting");
  const composition = getBestSlot("compositionRecipe", ["composition", "framing"], "composition");

  const shapeLanguage = intensity !== "low" ? getBestSlot("shapeLanguage", ["silhouette"], "silhouette") : "";
  const palette = intensity !== "low" ? getBestSlot("paletteLogic", ["palette"], "palette") : "";

  let pose = "";
  let materials = "";
  let focalAnchors = "";
  let details = "";
  let background = "";
  let effects = "";

  if (intensity === "high") {
    pose = getBestSlot("pose", ["framing"], "pose");
    materials = getBestSlot("materialBehavior", ["materials"], "materials");
    focalAnchors = getBestSlot("focalAnchors", ["hierarchy", "detailPlacement"], "details");
    details = getBestSlot("detailPlacement", ["details"], "details");
    background = getBestSlot("background", [], "background");
    effects = getBestSlot("energyDesign", ["effects"], "effects");
  }

  // Profiles (filtered, only for medium and high)
  const primaryRef = references[0];
  let scaleProfileStr = "";
  let substanceProfileStr = "";

  if (intensity !== "low") {
    // scaleProfile: uses only primary reference to avoid anatomical semantic contamination
    if (primaryRef && primaryRef.scaleProfile && primaryRef.scaleProfile.confidence >= 0.5) {
      const sp = primaryRef.scaleProfile;
      const validForms: string[] = [];
      const seenCleanForms = new Set<string>();
      const validCues: string[] = [];
      const seenCleanCues = new Set<string>();

      const collectScale = (items: string[], field: string, accepted: string[], seen: Set<string>) => {
        for (const item of items) {
          if (typeof item !== 'string' || !item.trim()) continue;
          const evaluation = evaluatePolicyFragment(item, field, primaryRef, synthesisContext);
          const normalized = normalizeText(evaluation.text);
          const unusedReason = evaluation.decision !== 'included' ? undefined
            : seen.has(normalized) ? 'Duplicate scale contribution after cleaning.'
            : accepted.length >= 2 ? 'Exceeds intensity limit for scale contributions.' : undefined;
          const result = evaluateAndRecord(item, field, primaryRef, unusedReason);
          if (result.included) {
            accepted.push(result.text);
            seen.add(normalized);
          }
        }
      };
      collectScale(sp.scaleForms || [], 'scaleForms', validForms, seenCleanForms);
      collectScale(sp.scaleCues || [], 'scaleCues', validCues, seenCleanCues);

      const forms = validForms.join(", ");
      const cues = validCues.join(", ");
      if (forms || cues) {
        scaleProfileStr = `Forms: ${forms || 'standard'}. Cues: ${cues || 'proportional'}.`;
      }
    }

    // Substance Profile: materials & elements
    const maxMat = intensity === "medium" ? 2 : 4;
    const validMats: string[] = [];
    const seenCleanMats = new Set<string>();

    for (const ref of references) {
      if (ref.substanceProfile && ref.substanceProfile.confidence >= 0.5) {
        const rawMats = ref.substanceProfile.materials || [];
        for (const rawMat of rawMats) {
          if (!rawMat || typeof rawMat !== "string" || !rawMat.trim()) continue;

          const evalRes = evaluateCandidateFragment(rawMat, "substanceMaterials", ref, synthesisContext);
          const blockedList = evalRes.blockedIdentities || (evalRes.blockedIdentity ? [evalRes.blockedIdentity] : []);
          for (const b of blockedList) {
            if (!debugInfo.identityBlocked.includes(b)) debugInfo.identityBlocked.push(b);
          }

          if (evalRes.decision !== "included" || !evalRes.text) {
            debugInfo.evaluations!.push({
              referenceId: ref.id,
              referenceName: ref.name || "Unnamed",
              field: "substanceMaterials",
              text: evalRes.originalText || rawMat.trim(),
              decision: "discarded",
              reason: evalRes.reason
            });
            continue;
          }

          // Check duplicate AFTER cleaning
          const normCleanMat = normalizeText(evalRes.text);
          if (seenCleanMats.has(normCleanMat)) {
            debugInfo.evaluations!.push({
              referenceId: ref.id,
              referenceName: ref.name || "Unnamed",
              field: "substanceMaterials",
              text: evalRes.originalText || rawMat.trim(),
              cleanedText: evalRes.text !== rawMat.trim() ? evalRes.text : undefined,
              decision: "discarded",
              reason: "Duplicate substance material after cleaning."
            });
            continue;
          }

          if (validMats.length < maxMat) {
            seenCleanMats.add(normCleanMat);
            validMats.push(evalRes.text);
            contributingRefIds.add(ref.id);
            debugInfo.evaluations!.push({
              referenceId: ref.id,
              referenceName: ref.name || "Unnamed",
              field: "substanceMaterials",
              text: evalRes.originalText || rawMat.trim(),
              cleanedText: evalRes.text !== rawMat.trim() ? evalRes.text : undefined,
              decision: "included",
              reason: evalRes.reason
            });
          } else {
            debugInfo.evaluations!.push({
              referenceId: ref.id,
              referenceName: ref.name || "Unnamed",
              field: "substanceMaterials",
              text: evalRes.originalText || rawMat.trim(),
              cleanedText: evalRes.text !== rawMat.trim() ? evalRes.text : undefined,
              decision: "discarded",
              reason: "Exceeds intensity limit for substance materials."
            });
          }
        }
      }
    }

    const validElements: string[] = [];
    const seenCleanElements = new Set<string>();
    const maxElements = 2;

    for (const ref of references) {
      if (ref.substanceProfile && ref.substanceProfile.confidence >= 0.5) {
        const rawElements = ref.substanceProfile.elements || [];
        for (const rawEl of rawElements) {
          if (!rawEl || typeof rawEl !== "string" || !rawEl.trim()) continue;

          const evalRes = evaluateCandidateFragment(rawEl, "substanceElements", ref, synthesisContext);
          const blockedList = evalRes.blockedIdentities || (evalRes.blockedIdentity ? [evalRes.blockedIdentity] : []);
          for (const b of blockedList) {
            if (!debugInfo.identityBlocked.includes(b)) debugInfo.identityBlocked.push(b);
          }

          if (evalRes.decision !== "included" || !evalRes.text) {
            debugInfo.evaluations!.push({
              referenceId: ref.id,
              referenceName: ref.name || "Unnamed",
              field: "substanceElements",
              text: evalRes.originalText || rawEl.trim(),
              decision: "discarded",
              reason: evalRes.reason
            });
            continue;
          }

          // Check duplicate AFTER cleaning
          const normCleanElement = normalizeText(evalRes.text);
          if (seenCleanElements.has(normCleanElement)) {
            debugInfo.evaluations!.push({
              referenceId: ref.id,
              referenceName: ref.name || "Unnamed",
              field: "substanceElements",
              text: evalRes.originalText || rawEl.trim(),
              cleanedText: evalRes.text !== rawEl.trim() ? evalRes.text : undefined,
              decision: "discarded",
              reason: "Duplicate substance element after cleaning."
            });
            continue;
          }

          if (validElements.length < maxElements) {
            seenCleanElements.add(normCleanElement);
            validElements.push(evalRes.text);
            contributingRefIds.add(ref.id);
            debugInfo.evaluations!.push({
              referenceId: ref.id,
              referenceName: ref.name || "Unnamed",
              field: "substanceElements",
              text: evalRes.originalText || rawEl.trim(),
              cleanedText: evalRes.text !== rawEl.trim() ? evalRes.text : undefined,
              decision: "included",
              reason: evalRes.reason
            });
          } else {
            debugInfo.evaluations!.push({
              referenceId: ref.id,
              referenceName: ref.name || "Unnamed",
              field: "substanceElements",
              text: evalRes.originalText || rawEl.trim(),
              cleanedText: evalRes.text !== rawEl.trim() ? evalRes.text : undefined,
              decision: "discarded",
              reason: "Exceeds limit for substance elements."
            });
          }
        }
      }
    }

    if (validMats.length > 0 || validElements.length > 0) {
      substanceProfileStr = [
        validMats.length > 0 ? `Materials: ${validMats.join(", ")}` : "",
        validElements.length > 0 ? `Elements: ${validElements.join(", ")}` : ""
      ].filter(Boolean).join(". ") + ".";
    }
  }

  // Avoid rules
  const usedAvoids: string[] = [];
  const seenAvoids = new Set<string>();
  const MAX_AVOID_RULES = 10;

  const processAvoidRule = (rule: string, source: string, ref: VisualDNA) => {
    if (!rule || typeof rule !== "string") return;
    const identity = filterFragmentForIdentity(rule, ref.identitySpecificDetails || []);
    for (const blocked of identity.blockedDetails) {
      if (!debugInfo.identityBlocked.includes(blocked)) debugInfo.identityBlocked.push(blocked);
    }
    if (!identity.safeToKeep) {
      debugInfo.avoidRules.push({ rule: rule.trim(), source, applied: false, reason: 'Contains blocked identity detail.' });
      debugInfo.evaluations!.push({ referenceId: ref.id, referenceName: ref.name || 'Unnamed', field: 'avoidRules', text: rule.trim(), decision: 'discarded', reason: 'Contains blocked identity detail.' });
      return;
    }
    const trimmedRule = identity.cleanedText;
    if (!trimmedRule) return;

    const norm = normalizeText(trimmedRule);
    if (!norm) return;

    if (seenAvoids.has(norm)) {
      debugInfo.avoidRules.push({ rule: trimmedRule, source, applied: false, reason: "Duplicated avoid rule." });
      debugInfo.evaluations!.push({
        referenceId: ref.id,
        referenceName: ref.name || "Unnamed",
        field: "avoidRules",
        text: trimmedRule,
        decision: "discarded",
        reason: "Duplicated avoid rule."
      });
      return;
    }
    seenAvoids.add(norm);

    const contradicts = doesAvoidRuleContradict(trimmedRule);
    if (contradicts) {
      debugInfo.avoidRules.push({ rule: trimmedRule, source, applied: false, reason: "Contradicts current user prompt context." });
      debugInfo.evaluations!.push({
        referenceId: ref.id,
        referenceName: ref.name || "Unnamed",
        field: "avoidRules",
        text: trimmedRule,
        decision: "discarded",
        reason: "Contradicts current user prompt context."
      });
      return;
    }

    if (usedAvoids.length >= MAX_AVOID_RULES) {
      debugInfo.avoidRules.push({ rule: trimmedRule, source, applied: false, reason: "Exceeds maximum limit of negative rules." });
      debugInfo.evaluations!.push({
        referenceId: ref.id,
        referenceName: ref.name || "Unnamed",
        field: "avoidRules",
        text: trimmedRule,
        decision: "discarded",
        reason: "Exceeds maximum limit of negative rules."
      });
      return;
    }

    debugInfo.avoidRules.push({ rule: trimmedRule, source, applied: true, reason: "Applicable quality/style avoidance." });
    debugInfo.evaluations!.push({
      referenceId: ref.id,
      referenceName: ref.name || "Unnamed",
      field: "avoidRules",
      text: trimmedRule,
      decision: "included",
      reason: "Applicable avoidance constraint."
    });
    usedAvoids.push(trimmedRule);
    contributingRefIds.add(ref.id);
  };

  references.forEach(ref => {
    if (Array.isArray(ref.universalQualityAvoids)) {
      ref.universalQualityAvoids.forEach(r => processAvoidRule(r, "universal", ref));
    }
    if (Array.isArray(ref.styleSpecificAvoids)) {
      ref.styleSpecificAvoids.forEach(r => processAvoidRule(r, "style", ref));
    }
    if (Array.isArray(ref.contentSpecificAvoids)) {
      ref.contentSpecificAvoids.forEach(r => processAvoidRule(r, "content", ref));
    }

    // Support both string and array for negativePrompt
    if (ref.negativePrompt) {
      const negs = Array.isArray(ref.negativePrompt)
        ? ref.negativePrompt
        : typeof ref.negativePrompt === "string"
          ? ref.negativePrompt.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
          : [];
      negs.forEach(r => {
        // Skip generic placeholder tags like "low quality", "worst quality", "lowres", "bad quality"
        const norm = normalizeText(r);
        if (norm === "low quality" || norm === "worst quality" || norm === "bad quality" || norm === "lowres" || norm === "poor quality") {
          return;
        }
        processAvoidRule(r, "negativePrompt", ref);
      });
    }

    // Support both string and array for avoidRules
    if (ref.avoidRules) {
      const avoids = Array.isArray(ref.avoidRules)
        ? ref.avoidRules
        : typeof ref.avoidRules === "string"
          ? ref.avoidRules.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
          : [];
      avoids.forEach(r => processAvoidRule(r, "avoidRules", ref));
    }
  });

  // Explain available fields that are intentionally not emitted (search metadata,
  // intensity, confidence, secondary scale profiles). These are not incompatibilities.
  const textFields = ['summary', 'positivePrompt', 'linework', 'rendering', 'palette', 'silhouette', 'pose', 'framing', 'composition', 'lighting', 'effects', 'materials', 'details', 'background', 'hierarchy', 'shapeLanguage', 'focalAnchors', 'detailPlacement', 'compositionRecipe', 'paletteLogic', 'materialBehavior', 'energyDesign'] as const;
  for (const ref of references) {
    for (const field of textFields) {
      const value = ref[field];
      if (typeof value !== 'string' || !value.trim()) continue;
      if (debugInfo.evaluations!.some(e => e.referenceId === ref.id && e.field === field)) continue;
      debugInfo.evaluations!.push({ referenceId: ref.id, referenceName: ref.name || 'Unnamed', field, text: value, decision: 'discarded', reason: field === 'summary' || field === 'positivePrompt' ? 'Not used in synthesis: search metadata only.' : 'Not consumed at the selected intensity.' });
    }
    for (const [profileField, profile] of [['scaleProfile', ref.scaleProfile], ['substanceProfile', ref.substanceProfile]] as const) {
      if (!profile) continue;
      for (const [field, value] of Object.entries(profile)) {
        if (field === 'confidence') continue;
        const consumedField = field === 'materials' ? 'substanceMaterials' : field === 'elements' ? 'substanceElements' : field;
        if (debugInfo.evaluations!.some(e => e.referenceId === ref.id && e.field === consumedField)) continue;
        for (const item of Array.isArray(value) ? value : [value]) {
          if (typeof item !== 'string' || !item.trim()) continue;
          debugInfo.evaluations!.push({ referenceId: ref.id, referenceName: ref.name || 'Unnamed', field: `${profileField}.${field}`, text: item, decision: 'discarded', reason: profile.confidence < .5 ? 'Not consumed: profile confidence is below the threshold.' : 'Not consumed: profile metadata, secondary reference, or intensity limit.' });
        }
      }
    }
  }

  const allNegative = usedAvoids.join(", ");

  // Build the final prompt block cleanly
  let promptBlock = "";

  if (contributingRefIds.size === 0) {
    debugInfo.allContributionsDiscarded = true;
    promptBlock = "VISUAL DNA DIRECTION (SUBORDINATE GUIDANCE):\n[No database contribution was emitted after compatibility, field availability and intensity decisions. Strictly follow the user description and archetype preset.]";
  } else {
    debugInfo.allContributionsDiscarded = false;
    const lines: string[] = [
      "VISUAL DNA DIRECTION (SUBORDINATE GUIDANCE):",
      "[Priority: Subject description and Context Focus take absolute precedence. Archetype preset defines artistic identity. DNA provides subordinate illustration technique only; never override the user's description, requested colors/materials, or archetype boundaries.]"
    ];

    if (acceptedAnchors.length > 0) {
      lines.push(`- Style Anchors: ${acceptedAnchors.join(", ")}`);
    }

    if (intensity !== "low" && usedMotifs.length > 0) {
      lines.push(`- Motifs: ${usedMotifs.join(", ")}`);
    }

    if (rendering) {
      lines.push(`- Rendering: ${rendering}`);
    }
    if (lighting) lines.push(`- Lighting: ${lighting}`);

    if (intensity !== "low" && shapeLanguage) {
      lines.push(`- Silhouette & Shape: ${shapeLanguage}`);
    }

    if (intensity !== "low" && (scaleProfileStr || substanceProfileStr)) {
      const profStr = [scaleProfileStr, substanceProfileStr].filter(Boolean).join(" ");
      lines.push(`- Profiles: ${profStr}`);
    }

    if (palette) {
      lines.push(`- Palette Logic: ${palette}`);
    }

    if (composition) {
      lines.push(`- Composition & Framing: ${composition}`);
    }

    if (intensity === "high") {
      if (pose) lines.push(`- Pose & Motion: ${pose}`);
      if (materials) lines.push(`- Material Behavior: ${materials}`);
      if (focalAnchors) lines.push(`- Focal Hierarchy: ${focalAnchors}`);
      if (details) lines.push(`- Detail Placement: ${details}`);
      if (background) lines.push(`- Background: ${background}`);
      if (effects) lines.push(`- Effects & Energy: ${effects}`);
    }

    const defaultAvoid = "photorealism, 3D render look, plastic CGI look, generic concept art";
    const combinedAvoid = allNegative ? `${allNegative}, ${defaultAvoid}` : defaultAvoid;
    lines.push(`- Avoid: ${combinedAvoid}`);

    if (intensity === "high") {
      lines.push("\nCRITICAL SAFETY RULE: Use the Artstyle Database only as abstract visual guidance. Do not copy characters, exact costumes, logos, symbols, watermarks, card borders, text, layouts, poses or identifiable artwork. Create an original illustration using only general visual traits.");
    }

    promptBlock = lines.join("\n");
  }

  const contributingReferences = references
    .filter(r => contributingRefIds.has(r.id))
    .map(r => ({ id: r.id, name: r.name || "Unnamed Reference" }));

  debugInfo.contributingReferenceIds = Array.from(contributingRefIds);

  return {
    promptBlock,
    usedReferences: selectedReferences,
    selectedReferences,
    contributingReferences,
    debugInfo
  };
};
