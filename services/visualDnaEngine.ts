import { VisualDNA, SynthesisDebug, MatchDetail, DNAMatchingResult, MatchingScoreLog } from "../types";
import { VISUAL_TAG_KEYWORDS } from "./visualTags";
import { parsePromptIntent } from "./promptParser";


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
  const coveredMaterials = new Set<string>();
  const coveredElements = new Set<string>();
  
  const first = remaining.shift();
  if (first) {
     selected.push(first);
     first.result.matchedCategories.forEach(c => coveredCategories.add(c));
     if (first.dna.substanceProfile?.materials) first.dna.substanceProfile.materials.forEach(m => coveredMaterials.add(m));
     if (first.dna.substanceProfile?.elements) first.dna.substanceProfile.elements.forEach(e => coveredElements.add(e));
  }
  
  while (selected.length < maxReferences && remaining.length > 0) {
     remaining.forEach(item => {
        let divBonus = 0;
        let redPenalty = 0;
        
        item.result.matchedCategories.forEach(cat => {
           if (!coveredCategories.has(cat)) divBonus += 1.5;
        });
        
        if (item.dna.substanceProfile?.materials) {
           item.dna.substanceProfile.materials.forEach(m => {
              if (!coveredMaterials.has(m)) divBonus += 1;
              else redPenalty += 0.5;
           });
        }
        
        if (item.dna.substanceProfile?.elements) {
           item.dna.substanceProfile.elements.forEach(e => {
              if (!coveredElements.has(e)) divBonus += 1;
              else redPenalty += 0.5;
           });
        }
        
        item.result.diversityBonus = divBonus;
        item.result.redundancyPenalty = redPenalty;
        item.result.finalScore = item.result.baseScore + divBonus - redPenalty;
     });
     
     remaining.sort((a, b) => b.result.finalScore - a.result.finalScore);
     
     const nextBest = remaining.shift();
     if (nextBest && nextBest.result.finalScore > 0) {
        selected.push(nextBest);
        nextBest.result.matchedCategories.forEach(c => coveredCategories.add(c));
        if (nextBest.dna.substanceProfile?.materials) nextBest.dna.substanceProfile.materials.forEach(m => coveredMaterials.add(m));
        if (nextBest.dna.substanceProfile?.elements) nextBest.dna.substanceProfile.elements.forEach(e => coveredElements.add(e));
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
  selectedIds: string[]
): MatchingScoreLog[] => {
  const { affirmativeText, excludedWords } = parsePromptIntent(subject);
  const queryWords = [affirmativeText, cardType, archetype].filter(Boolean).join(" ");
  const normalizedQuery = normalizeText(queryWords);
  
  const scored = database.map(dna => {
    return { dna, result: scoreVisualDNAReferenceBase(dna, normalizedQuery, cardType, excludedWords) };
  });
  
  const scoredWithBonuses = calculateComplementaryScores([...scored].filter(s => s.result.baseScore > 0), 5);
  
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
  cardType: string;
  archetype: string;
  userPrompt: string;
}

export const synthesizeVisualDNA = (
  params: SynthesizeParams
): { promptBlock: string; usedReferences: { id: string; name: string }[], debugInfo: SynthesisDebug | null } => {
  const { references, intensity, subject, cardType, archetype, userPrompt } = params;
  
  if (references.length === 0) {
    return { promptBlock: "", usedReferences: [], debugInfo: null };
  }

  const debugInfo: SynthesisDebug = {
    motifs: [],
    avoidRules: [],
    identityBlocked: []
  };

  const getBest = (field: keyof VisualDNA, fallbackField: keyof VisualDNA, scoreKey: keyof VisualDNA['scores']): string => {
    const sorted = [...references].sort((a, b) => {
      const scoreA = (a.scores && typeof a.scores[scoreKey] === 'number') ? (a.scores[scoreKey] as number) : 0.5;
      const scoreB = (b.scores && typeof b.scores[scoreKey] === 'number') ? (b.scores[scoreKey] as number) : 0.5;
      return scoreB - scoreA;
    });
    const best = sorted[0];
    if (!best) return "";
    const val = best[field] || best[fallbackField] || best.summary;
    return Array.isArray(val) ? val.join(", ") : String(val || "");
  };

  const { affirmativeText, excludedWords } = parsePromptIntent(userPrompt || subject);
  const userPromptNorm = normalizeText(affirmativeText || userPrompt || subject);

  const getArrayConcat = (field: keyof VisualDNA): string[] => {
    return Array.from(new Set(
      references.flatMap(r => {
        const val = r[field];
        if (Array.isArray(val)) return val.filter(v => typeof v === 'string' && v.trim() !== '');
        if (typeof val === 'string' && val.trim() !== '') return val.split(',').map(s => s.trim());
        return [];
      })
    ));
  };

  const isTermExcluded = (term: string): boolean => {
    if (!excludedWords || excludedWords.size === 0 || !term) return false;
    const norm = normalizeText(term);
    if (!norm) return false;
    if (excludedWords.has(norm)) return true;
    return norm.split(/\s+/).some(w => excludedWords.has(w));
  };

  const isPositiveMotifRelevant = (motif: string): boolean => {
     if (isTermExcluded(motif)) return false;
     const words = motif.split(/\s+/).filter(w => w.length > 2 && !isTermExcluded(w));
     let matches = 0;
     words.forEach(w => {
         const boundaryRegex = new RegExp("(^|\\s)" + escapeRegExp(normalizeText(w)) + "($|\\s)", 'i');
         if (boundaryRegex.test(userPromptNorm) || boundaryRegex.test(normalizeText(affirmativeText)) || boundaryRegex.test(normalizeText(cardType))) {
             matches++;
         }
     });
     return matches > 0;
  };

  const doesAvoidRuleContradict = (rule: string): boolean => {
     // Strip avoid prefixes
     const cleanRule = rule.replace(/^(?:avoid|do not include|don't include|n[ãa]o incluir|evitar)\s+/i, "").trim();
     // Split compound avoid rule by conjunctions / delimiters
     const subItems = cleanRule.split(/\b(?:and|or|e|ou|nem|nor)\b|[,;/]/i);
     for (const item of subItems) {
        const words = item.split(/\s+/).map(w => normalizeText(w)).filter(w => w.length > 2);
        for (const w of words) {
           // If the word was excluded by the user (e.g. "no dragon"), avoiding it does NOT contradict!
           if (excludedWords.has(w)) continue;

           // If the word matches what the user affirmatively requested, avoiding it DOES contradict!
           const boundaryRegex = new RegExp("(^|\\s)" + escapeRegExp(w) + "($|\\s)", 'i');
           if (boundaryRegex.test(userPromptNorm) || boundaryRegex.test(normalizeText(affirmativeText)) || boundaryRegex.test(normalizeText(cardType))) {
              return true; // Contradiction found!
           }
        }
     }
     return false;
  };

  const styleFragments = getArrayConcat("stylePromptFragments");
  let contentMotifs = getArrayConcat("contentMotifs");
  const visualMotifs = getArrayConcat("visualMotifs");
  const styleAnchorsList = getArrayConcat("styleAnchors");
  
  const usedMotifs: string[] = [];
  [...contentMotifs, ...visualMotifs].forEach(motif => {
      const isRelevant = isPositiveMotifRelevant(motif);
      debugInfo.motifs.push({
         motif,
         used: isRelevant,
         reason: isRelevant ? "Matches user prompt context." : "Not relevant to current prompt."
      });
      if (isRelevant) usedMotifs.push(motif);
  });
  
  const identitySpecifics = getArrayConcat("identitySpecificDetails");
  identitySpecifics.forEach(id => {
      debugInfo.identityBlocked.push(id);
  });
  
  const styleAnchorsStr = [...new Set([...styleFragments, ...styleAnchorsList])].slice(0, intensity === "high" ? 10 : intensity === "medium" ? 5 : 3).join(", ");
  const motifsStr = [...new Set(usedMotifs)].slice(0, 5).join(", ");

  const rendering = getBest("rendering", "linework", "rendering");
  const shapeLanguage = getBest("shapeLanguage", "silhouette", "silhouette");
  const palette = getBest("paletteLogic", "palette", "palette");
  const composition = getBest("compositionRecipe", "composition", "composition");
  const pose = getBest("pose", "summary", "pose");
  const framing = getBest("framing", "summary", "pose");
  const materials = getBest("materialBehavior", "materials", "materials");
  const focalAnchors = getBest("focalAnchors", "hierarchy", "details");
  const details = getBest("detailPlacement", "details", "details");
  const background = getBest("background", "summary", "background");
  const effects = getBest("energyDesign", "effects", "effects");
  
  const primaryRef = references[0];
  let scaleProfileStr = "";
  if (primaryRef.scaleProfile && primaryRef.scaleProfile.confidence >= 0.5) {
     const sp = primaryRef.scaleProfile;
     const forms = (sp.scaleForms || []).join(', ');
     const cues = (sp.scaleCues || []).join(', ');
     scaleProfileStr = "Scale: " + (sp.physicalScale || '') + ". Presence: " + (sp.perceivedPresence || '') + ". Forms: " + forms + ". Cues: " + cues + ".";
  }
  
  let substanceProfileStr = "";
  if (primaryRef.substanceProfile && primaryRef.substanceProfile.confidence >= 0.5) {
     const sp = primaryRef.substanceProfile;
     const mat = (sp.materials || []).slice(0, intensity === "medium" ? 2 : 4).join(', ');
     const el = (sp.elements || []).join(', ');
     const apps = (sp.elementApplications || []).join(', ');
     substanceProfileStr = "Materials: " + mat + ". Elements: " + el + ". Applications: " + apps + ".";
  }

  const universalAvoids = getArrayConcat("universalQualityAvoids");
  const styleAvoids = getArrayConcat("styleSpecificAvoids");
  const contentAvoids = getArrayConcat("contentSpecificAvoids");
  
  const usedAvoids: string[] = [];
  
  universalAvoids.forEach(rule => {
     usedAvoids.push(rule);
     debugInfo.avoidRules.push({ rule, source: "universal", applied: true, reason: "Broadly applicable quality rule." });
  });
  
  styleAvoids.forEach(rule => {
     usedAvoids.push(rule);
     debugInfo.avoidRules.push({ rule, source: "style", applied: true, reason: "Applicable to the visual direction." });
  });
  
  contentAvoids.forEach(rule => {
     const contradicts = doesAvoidRuleContradict(rule);
     if (contradicts) {
        debugInfo.avoidRules.push({ rule, source: "content", applied: false, reason: "Contradicts current user prompt context." });
     } else {
        usedAvoids.push(rule);
        debugInfo.avoidRules.push({ rule, source: "content", applied: true, reason: "Does not contradict current prompt." });
     }
  });

  [...getArrayConcat("negativePrompt"), ...getArrayConcat("avoidRules")].forEach(rule => {
     const contradicts = doesAvoidRuleContradict(rule);
     if (contradicts) {
        debugInfo.avoidRules.push({ rule, source: "legacy", applied: false, reason: "Contradicts current user prompt context." });
     } else {
        usedAvoids.push(rule);
        debugInfo.avoidRules.push({ rule, source: "legacy", applied: true, reason: "Does not contradict current prompt." });
     }
  });

  const allNegative = Array.from(new Set(usedAvoids)).slice(0, 15).join(", ");

  let promptBlock = "";

  if (intensity === "low") {
    promptBlock = "VISUAL DNA DIRECTION:\n- Style Anchors: " + styleAnchorsStr.slice(0, 100) + "\n- Rendering: " + rendering + "\n- Composition: " + composition + "\n- Avoid: " + (allNegative ? allNegative + ", " : "") + "photorealism, generic concept art.";
  } else if (intensity === "medium") {
    promptBlock = "VISUAL DNA DIRECTION:\n- Style Anchors: " + styleAnchorsStr + "\n- Motifs: " + motifsStr + "\n- Rendering: " + rendering + "\n- Silhouette & Shape: " + shapeLanguage + "\n- Profiles: " + scaleProfileStr + " " + substanceProfileStr + "\n- Palette: " + palette + "\n- Avoid: " + (allNegative ? allNegative + ", " : "") + "photorealism, generic concept art.";
  } else {
    let relationshipStr = "";
    if (primaryRef.subjects && primaryRef.subjects.length > 1) {
       relationshipStr = "Multiple Subjects: " + primaryRef.subjects.map(s => "[" + s.visualRole + "] " + s.category + " (" + s.physicalScale + ")").join(", ") + ".";
    }
    if (primaryRef.scaleRelationships && primaryRef.scaleRelationships.length > 0) {
       relationshipStr += " Scale Relationships: " + primaryRef.scaleRelationships.map(r => r.subjectA + " " + r.relationship + " " + r.subjectB).join(", ") + ".";
    }

    promptBlock = "VISUAL DNA DIRECTION:\n- Style Anchors & Prompt Fragments: " + styleAnchorsStr + "\n- Content Motifs: " + motifsStr + "\n- Rendering: " + rendering + "\n- Palette & Color Logic: " + palette + "\n- Silhouette & Shape Language: " + shapeLanguage + "\n- Profiles: " + scaleProfileStr + " " + substanceProfileStr + " " + relationshipStr + "\n- Composition & Camera: " + composition + ". " + framing + "\n- Pose & Motion: " + pose + "\n- Material Behavior: " + materials + "\n- Focal Hierarchy & Anchors: " + focalAnchors + "\n- Detail Placement: " + details + "\n- Background: " + background + "\n- Effects & Energy: " + effects + "\n- Avoid: " + (allNegative ? allNegative + ", " : "") + "photorealism, realistic portrait painting, western oil painting, 3D render look, plastic CGI look, generic concept art and flat illustration unless explicitly requested.\n\nCRITICAL SAFETY RULE: Use the Artstyle Database only as abstract visual guidance. Do not copy characters, exact costumes, logos, symbols, watermarks, card borders, text, layouts, poses or identifiable artwork. Create an original illustration using only general visual traits.";
  }

  return {
    promptBlock,
    usedReferences: references.map(ref => ({ id: ref.id, name: ref.name })),
    debugInfo
  };
};
