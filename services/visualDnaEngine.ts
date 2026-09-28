import { VisualDNA, SynthesisDebug, MatchDetail, DNAMatchingResult, MatchingScoreLog, CardType, Context, Complexity, Archetype } from "../types";
import { VISUAL_TAG_KEYWORDS } from "./visualTags";
import { parsePromptIntent } from "./promptParser";
import { ARCHETYPE_DEFINITIONS } from "../constants";
import {
  SynthesisContext,
  evaluateCandidateFragment,
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
  excludedWords?: Set<string>
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
  maxReferences: number = 3
): VisualDNA[] => {
  const { affirmativeText, excludedWords } = parsePromptIntent(subject);
  const queryWords = [affirmativeText, cardType, archetype].filter(Boolean).join(" ");
  const normalizedQuery = normalizeText(queryWords);

  const scored = database.map(dna => {
    return { dna, result: scoreVisualDNAReferenceBase(dna, normalizedQuery, cardType, excludedWords) };
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
  maxReferences: number = 3
): MatchingScoreLog[] => {
  const { affirmativeText, excludedWords } = parsePromptIntent(subject);
  const queryWords = [affirmativeText, cardType, archetype].filter(Boolean).join(" ");
  const normalizedQuery = normalizeText(queryWords);
  
  const scored = database.map(dna => {
    return { dna, result: scoreVisualDNAReferenceBase(dna, normalizedQuery, cardType, excludedWords) };
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

  const { affirmativeText, excludedWords } = parsePromptIntent(userPrompt || subject);
  const resolvedPreset = params.archetypePreset || ARCHETYPE_DEFINITIONS[archetype as Archetype] || ARCHETYPE_DEFINITIONS[Archetype.Generic];

  const synthesisContext: SynthesisContext = {
    subject,
    affirmativeText,
    excludedWords,
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

  const evaluateAndRecord = (
    rawFragment: string,
    field: string,
    ref: VisualDNA
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

    if (evalRes.decision === "included" && evalRes.text) {
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
      reason: evalRes.reason
    });
    return { included: false, text: "" };
  };

  const getBestSlot = (
    primaryField: keyof VisualDNA,
    fallbackFields: (keyof VisualDNA)[],
    scoreKey: keyof VisualDNA['scores']
  ): string => {
    const sorted = [...references].sort((a, b) => {
      const scoreA = (a.scores && typeof a.scores[scoreKey] === 'number') ? (a.scores[scoreKey] as number) : 0.5;
      const scoreB = (b.scores && typeof b.scores[scoreKey] === 'number') ? (b.scores[scoreKey] as number) : 0.5;
      return scoreB - scoreA;
    });

    for (const ref of sorted) {
      // 1. Check primary field
      const val = ref[primaryField];
      if (val) {
        const items = Array.isArray(val) ? val : [String(val)];
        for (const item of items) {
          const res = evaluateAndRecord(item, String(primaryField), ref);
          if (res.included && res.text) {
            return res.text;
          }
        }
      }

      // 2. Check fallback fields (never summary)
      for (const fbField of fallbackFields) {
        const fbVal = ref[fbField];
        if (fbVal) {
          const items = Array.isArray(fbVal) ? fbVal : [String(fbVal)];
          for (const item of items) {
            const res = evaluateAndRecord(item, String(fbField), ref);
            if (res.included && res.text) {
              return res.text;
            }
          }
        }
      }
    }

    return "";
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
        if (archRules && archRules.signatureTerms.some(st => normalizeText(st).includes(w))) {
          return true;
        }
      }
    }
    return false;
  };

  // Evaluate Style Anchors and Prompt Fragments
  const maxAnchors = intensity === "low" ? 2 : intensity === "medium" ? 4 : 6;
  const acceptedAnchors: string[] = [];
  const seenAnchorTexts = new Set<string>();

  for (const ref of references) {
    const fragments: string[] = [];
    if (Array.isArray(ref.stylePromptFragments)) fragments.push(...ref.stylePromptFragments);
    if (typeof ref.styleAnchors === "string" && ref.styleAnchors.trim()) {
      fragments.push(...ref.styleAnchors.split(/[,;]+/).map(s => s.trim()).filter(Boolean));
    }

    for (const frag of fragments) {
      const normFrag = normalizeText(frag);
      if (!normFrag || seenAnchorTexts.has(normFrag)) continue;
      seenAnchorTexts.add(normFrag);

      if (acceptedAnchors.length < maxAnchors) {
        const res = evaluateAndRecord(frag, "styleAnchors", ref);
        if (res.included && res.text) {
          acceptedAnchors.push(res.text);
        }
      } else {
        // Record as discarded due to intensity limit
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "styleAnchors",
          text: frag,
          decision: "discarded",
          reason: "Exceeds intensity limit for style anchors."
        });
      }
    }
  }

  // Evaluate Motifs
  const usedMotifs: string[] = [];
  const seenMotifTexts = new Set<string>();
  const maxMotifs = intensity === "low" ? 0 : intensity === "medium" ? 3 : 5;

  for (const ref of references) {
    const rawMotifs: string[] = [];
    if (Array.isArray(ref.contentMotifs)) rawMotifs.push(...ref.contentMotifs);
    if (typeof ref.visualMotifs === "string" && ref.visualMotifs.trim()) {
      rawMotifs.push(...ref.visualMotifs.split(/[,;]+/).map(s => s.trim()).filter(Boolean));
    }

    for (const motif of rawMotifs) {
      const normMotif = normalizeText(motif);
      if (!normMotif || seenMotifTexts.has(normMotif)) continue;
      seenMotifTexts.add(normMotif);

      // Check if motif contains excluded words
      const words = normMotif.split(/\s+/).filter(w => w.length > 2);
      const isExcluded = words.some(w => excludedWords.has(w));
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

      if (usedMotifs.length < maxMotifs) {
        const res = evaluateAndRecord(motif, "motifs", ref);
        if (res.included && res.text) {
          usedMotifs.push(res.text);
          debugInfo.motifs.push({ motif, used: true, reason: "Matches user prompt context." });
        } else {
          debugInfo.motifs.push({ motif, used: false, reason: "Filtered by archetype or context policy." });
        }
      } else {
        debugInfo.motifs.push({ motif, used: false, reason: "Exceeds intensity limit for motifs." });
        debugInfo.evaluations!.push({
          referenceId: ref.id,
          referenceName: ref.name || "Unnamed",
          field: "motifs",
          text: motif,
          decision: "discarded",
          reason: "Exceeds intensity limit for motifs."
        });
      }
    }
  }

  // Semantic slot resolutions based on intensity
  const rendering = getBestSlot("rendering", ["linework"], "rendering");
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

  if (intensity !== "low" && primaryRef) {
    if (primaryRef.scaleProfile && primaryRef.scaleProfile.confidence >= 0.5) {
      const sp = primaryRef.scaleProfile;
      const validForms: string[] = [];
      for (const f of (sp.scaleForms || [])) {
        const res = evaluateAndRecord(f, "scaleForms", primaryRef);
        if (res.included && res.text) {
          validForms.push(res.text);
        }
      }
      const validCues: string[] = [];
      for (const c of (sp.scaleCues || [])) {
        const res = evaluateAndRecord(c, "scaleCues", primaryRef);
        if (res.included && res.text) {
          validCues.push(res.text);
        }
      }
      const forms = validForms.join(", ");
      const cues = validCues.join(", ");
      if (forms || cues) {
        scaleProfileStr = `Forms: ${forms || 'standard'}. Cues: ${cues || 'proportional'}.`;
      }
    }

    if (primaryRef.substanceProfile && primaryRef.substanceProfile.confidence >= 0.5) {
      const sp = primaryRef.substanceProfile;
      const maxMat = intensity === "medium" ? 2 : 4;
      const validMats: string[] = [];

      const rawMats = sp.materials || [];
      for (const rawMat of rawMats) {
        if (!rawMat || typeof rawMat !== "string" || !rawMat.trim()) continue;
        const evalRes = evaluateCandidateFragment(rawMat, "substanceMaterials", primaryRef, synthesisContext);
        const blockedList = evalRes.blockedIdentities || (evalRes.blockedIdentity ? [evalRes.blockedIdentity] : []);
        for (const b of blockedList) {
          if (!debugInfo.identityBlocked.includes(b)) debugInfo.identityBlocked.push(b);
        }

        if (evalRes.decision !== "included" || !evalRes.text) {
          debugInfo.evaluations!.push({
            referenceId: primaryRef.id,
            referenceName: primaryRef.name || "Unnamed",
            field: "substanceMaterials",
            text: rawMat.trim(),
            decision: "discarded",
            reason: evalRes.reason
          });
          continue;
        }

        if (validMats.length < maxMat) {
          validMats.push(evalRes.text);
          contributingRefIds.add(primaryRef.id);
          debugInfo.evaluations!.push({
            referenceId: primaryRef.id,
            referenceName: primaryRef.name || "Unnamed",
            field: "substanceMaterials",
            text: rawMat.trim(),
            cleanedText: evalRes.text !== rawMat.trim() ? evalRes.text : undefined,
            decision: "included",
            reason: evalRes.reason
          });
        } else {
          debugInfo.evaluations!.push({
            referenceId: primaryRef.id,
            referenceName: primaryRef.name || "Unnamed",
            field: "substanceMaterials",
            text: rawMat.trim(),
            decision: "discarded",
            reason: "Exceeds intensity limit for substance materials."
          });
        }
      }

      const validElements: string[] = [];
      const rawElements = sp.elements || [];
      const maxElements = 2;
      for (const rawEl of rawElements) {
        if (!rawEl || typeof rawEl !== "string" || !rawEl.trim()) continue;
        const evalRes = evaluateCandidateFragment(rawEl, "substanceElements", primaryRef, synthesisContext);
        const blockedList = evalRes.blockedIdentities || (evalRes.blockedIdentity ? [evalRes.blockedIdentity] : []);
        for (const b of blockedList) {
          if (!debugInfo.identityBlocked.includes(b)) debugInfo.identityBlocked.push(b);
        }

        if (evalRes.decision !== "included" || !evalRes.text) {
          debugInfo.evaluations!.push({
            referenceId: primaryRef.id,
            referenceName: primaryRef.name || "Unnamed",
            field: "substanceElements",
            text: rawEl.trim(),
            decision: "discarded",
            reason: evalRes.reason
          });
          continue;
        }

        if (validElements.length < maxElements) {
          validElements.push(evalRes.text);
          contributingRefIds.add(primaryRef.id);
          debugInfo.evaluations!.push({
            referenceId: primaryRef.id,
            referenceName: primaryRef.name || "Unnamed",
            field: "substanceElements",
            text: rawEl.trim(),
            cleanedText: evalRes.text !== rawEl.trim() ? evalRes.text : undefined,
            decision: "included",
            reason: evalRes.reason
          });
        } else {
          debugInfo.evaluations!.push({
            referenceId: primaryRef.id,
            referenceName: primaryRef.name || "Unnamed",
            field: "substanceElements",
            text: rawEl.trim(),
            decision: "discarded",
            reason: "Exceeds limit for substance elements."
          });
        }
      }

      if (validMats.length > 0 || validElements.length > 0) {
        substanceProfileStr = [
          validMats.length > 0 ? `Materials: ${validMats.join(", ")}` : "",
          validElements.length > 0 ? `Elements: ${validElements.join(", ")}` : ""
        ].filter(Boolean).join(". ") + ".";
      }
    }
  }

  // Avoid rules
  const usedAvoids: string[] = [];
  const seenAvoids = new Set<string>();
  const MAX_AVOID_RULES = 10;

  const processAvoidRule = (rule: string, source: string, ref: VisualDNA) => {
    if (!rule || typeof rule !== "string") return;
    const trimmedRule = rule.trim();
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

  const allNegative = usedAvoids.join(", ");

  // Build the final prompt block cleanly
  let promptBlock = "";

  if (contributingRefIds.size === 0) {
    debugInfo.allContributionsDiscarded = true;
    promptBlock = "VISUAL DNA DIRECTION (SUBORDINATE GUIDANCE):\n[All evaluated database fragments were safely discarded as incompatible with the prompt or archetype. Strictly follow the user description and archetype preset.]";
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
