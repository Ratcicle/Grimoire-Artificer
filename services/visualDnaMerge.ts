import { VisualDNA, VisualDNAPatch, SafeMergeResult } from '../types';
import {
  ALL_CANONICAL_DIMENSIONS,
  isCalibratedRecord,
  ALLOWED_VISUAL_TAGS,
  getTagCategory
} from './visualTags';

export const CLEARABLE_ANALYTICAL_FIELDS = [
  // Analytical strings
  'linework', 'rendering', 'palette', 'silhouette', 'pose', 'framing',
  'composition', 'lighting', 'effects', 'materials', 'details', 'background',
  'hierarchy', 'positivePrompt', 'negativePrompt', 'visualMotifs', 'shapeLanguage',
  'focalAnchors', 'detailPlacement', 'compositionRecipe', 'paletteLogic',
  'materialBehavior', 'energyDesign', 'styleAnchors', 'avoidRules',
  // Analytical string arrays
  'stylePromptFragments', 'contentMotifs', 'identitySpecificDetails',
  'universalQualityAvoids', 'styleSpecificAvoids', 'contentSpecificAvoids',
  // Profiles and structural blocks
  'subjectProfile', 'scaleProfile', 'substanceProfile', 'subjects', 'scaleRelationships'
] as const;

export const PROTECTED_MERGE_FIELDS = [
  'id', 'name', 'imageUrl', 'createdAt', 'updatedAt', 'revision',
  'isCalibrated', 'calibrationVersion', 'analysisVersion', 'summary'
] as const;

const ANALYTICAL_STRING_FIELDS = [
  'linework', 'rendering', 'palette', 'silhouette', 'pose', 'framing',
  'composition', 'lighting', 'effects', 'materials', 'details', 'background',
  'hierarchy', 'positivePrompt', 'negativePrompt', 'visualMotifs', 'shapeLanguage',
  'focalAnchors', 'detailPlacement', 'compositionRecipe', 'paletteLogic',
  'materialBehavior', 'energyDesign', 'styleAnchors', 'avoidRules'
] as const;

const ARRAY_STRING_FIELDS = [
  'stylePromptFragments', 'contentMotifs', 'identitySpecificDetails',
  'universalQualityAvoids', 'styleSpecificAvoids', 'contentSpecificAvoids'
] as const;

export function extractDerivedTagsFromProfiles(data: any): string[] {
  if (!data || typeof data !== 'object') return [];
  const derived: string[] = [];

  if (data.subjectProfile?.subjectCategory) {
    derived.push(String(data.subjectProfile.subjectCategory).toLowerCase().trim());
  }

  if (data.scaleProfile) {
    const conf = Number(data.scaleProfile.confidence) || 0;
    if (conf >= 0.5) {
      if (data.scaleProfile.physicalScale) derived.push(String(data.scaleProfile.physicalScale).toLowerCase().trim());
      if (data.scaleProfile.perceivedPresence) derived.push(String(data.scaleProfile.perceivedPresence).toLowerCase().trim());
      if (Array.isArray(data.scaleProfile.scaleForms)) {
        derived.push(...data.scaleProfile.scaleForms.map((t: string) => String(t).toLowerCase().trim()));
      }
      if (Array.isArray(data.scaleProfile.scaleCues)) {
        derived.push(...data.scaleProfile.scaleCues.map((t: string) => String(t).toLowerCase().trim()));
      }
    }
  }

  if (data.substanceProfile) {
    const conf = Number(data.substanceProfile.confidence) || 0;
    if (conf >= 0.5) {
      if (Array.isArray(data.substanceProfile.materials)) {
        derived.push(...data.substanceProfile.materials.map((t: string) => String(t).toLowerCase().trim()));
      }
      if (Array.isArray(data.substanceProfile.surfaces)) {
        derived.push(...data.substanceProfile.surfaces.map((t: string) => String(t).toLowerCase().trim()));
      }
      if (Array.isArray(data.substanceProfile.elements)) {
        derived.push(...data.substanceProfile.elements.map((t: string) => String(t).toLowerCase().trim()));
      }
      if (Array.isArray(data.substanceProfile.elementApplications)) {
        derived.push(...data.substanceProfile.elementApplications.map((t: string) => String(t).toLowerCase().trim()));
      }
    }
  }

  return derived;
}

export function hasPersistentChanges(base: any, target: any): boolean {
  if (!base && !target) return false;
  if (!base || !target) return true;

  const sanitize = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);

    const copy: any = {};
    for (const key of Object.keys(obj).sort()) {
      if (['updatedAt', 'createdAt', 'revision', 'usageMetadata', 'warnings'].includes(key)) {
        continue;
      }
      if (obj[key] !== undefined) {
        copy[key] = sanitize(obj[key]);
      }
    }
    return copy;
  };

  const canonicalStringify = (val: any): string => {
    if (val === null || typeof val !== 'object') return JSON.stringify(val);
    if (Array.isArray(val)) {
      return '[' + val.map(canonicalStringify).join(',') + ']';
    }
    const keys = Object.keys(val).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(val[k])).join(',') + '}';
  };

  return canonicalStringify(sanitize(base)) !== canonicalStringify(sanitize(target));
}

export function isValidStringArray(val: any): val is string[] {
  return Array.isArray(val) && val.every((item: any) => typeof item === 'string' && item.trim().length > 0);
}

export function isCompleteSubjectProfile(rawSP: any): boolean {
  if (!rawSP || typeof rawSP !== 'object' || Array.isArray(rawSP)) return false;
  const hasPrimary = typeof rawSP.primarySubject === 'string' && rawSP.primarySubject.trim().length > 0;
  const hasCategory = typeof rawSP.subjectCategory === 'string' && rawSP.subjectCategory.trim().length > 0;
  const hasRole = typeof rawSP.visualRole === 'string' && rawSP.visualRole.trim().length > 0;
  return hasPrimary && hasCategory && hasRole;
}

export function isCompleteScaleProfile(rawSP: any): boolean {
  if (!rawSP || typeof rawSP !== 'object' || Array.isArray(rawSP)) return false;
  const hasScale = typeof rawSP.physicalScale === 'string' && rawSP.physicalScale.trim().length > 0;
  const hasPresence = typeof rawSP.perceivedPresence === 'string' && rawSP.perceivedPresence.trim().length > 0;
  const hasForms = isValidStringArray(rawSP.scaleForms);
  const hasCues = isValidStringArray(rawSP.scaleCues);
  const hasEvidence = typeof rawSP.evidence === 'string' && rawSP.evidence.trim().length > 0;
  const hasConfidence = typeof rawSP.confidence === 'number' && Number.isFinite(rawSP.confidence) && rawSP.confidence >= 0 && rawSP.confidence <= 1;

  return hasScale && hasPresence && hasForms && hasCues && hasEvidence && hasConfidence;
}

export function isCompleteSubstanceProfile(rawSP: any): boolean {
  if (!rawSP || typeof rawSP !== 'object' || Array.isArray(rawSP)) return false;
  const hasMaterials = isValidStringArray(rawSP.materials);
  const hasSurfaces = isValidStringArray(rawSP.surfaces);
  const hasElements = isValidStringArray(rawSP.elements);
  const hasElementApplications = isValidStringArray(rawSP.elementApplications);
  const hasEvidence = typeof rawSP.evidence === 'string' && rawSP.evidence.trim().length > 0;
  const hasConfidence = typeof rawSP.confidence === 'number' && Number.isFinite(rawSP.confidence) && rawSP.confidence >= 0 && rawSP.confidence <= 1;

  return hasMaterials && hasSurfaces && hasElements && hasElementApplications && hasEvidence && hasConfidence;
}

export function createVisualDNAPatch(raw: any, normalized?: Partial<VisualDNA>): VisualDNAPatch {
  const presentFields = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.keys(raw)
    : [];

  const clearFields = Array.isArray(raw?.clearFields)
    ? raw.clearFields.filter((f: any): f is string => typeof f === 'string')
    : [];

  return {
    raw: raw ? JSON.parse(JSON.stringify(raw)) : {},
    normalized: normalized ? JSON.parse(JSON.stringify(normalized)) : (raw ? JSON.parse(JSON.stringify(raw)) : {}),
    presentFields,
    clearFields
  };
}

export function mergeVisualDNASafe(
  base: VisualDNA,
  patchOrAnalysis: VisualDNAPatch | Partial<VisualDNA>,
  options?: { rawAnalysis?: any }
): SafeMergeResult {
  const merged: any = JSON.parse(JSON.stringify(base || {}));

  // Resolve patch
  let patch: VisualDNAPatch;
  if (
    patchOrAnalysis &&
    typeof patchOrAnalysis === 'object' &&
    'raw' in patchOrAnalysis &&
    'presentFields' in patchOrAnalysis
  ) {
    patch = patchOrAnalysis as VisualDNAPatch;
  } else if (options?.rawAnalysis) {
    patch = createVisualDNAPatch(options.rawAnalysis, patchOrAnalysis as Partial<VisualDNA>);
  } else {
    patch = createVisualDNAPatch(patchOrAnalysis, patchOrAnalysis as Partial<VisualDNA>);
  }

  const updatedFields: string[] = [];
  const preservedFields: string[] = [];
  const clearedFields: string[] = [];
  const unappliedPartialBlocks: string[] = [];
  const inheritanceWarnings: string[] = [];

  const clearFields = patch.clearFields || [];

  // Validate clearFields against whitelist, protected fields, and contradictions
  for (const field of clearFields) {
    if ((PROTECTED_MERGE_FIELDS as readonly string[]).includes(field as any)) {
      throw new Error(`Campo protegido "${field}" não pode ser limpo via clearFields.`);
    }
    if (!(CLEARABLE_ANALYTICAL_FIELDS as readonly string[]).includes(field as any)) {
      throw new Error(`Campo desconhecido "${field}" não permitido em clearFields.`);
    }

    if (field in patch.raw) {
      const rawVal = patch.raw[field];
      const hasValue =
        (typeof rawVal === 'string' && rawVal.trim().length > 0) ||
        (Array.isArray(rawVal) && rawVal.length > 0) ||
        (typeof rawVal === 'object' && rawVal !== null && Object.keys(rawVal).length > 0) ||
        typeof rawVal === 'number';

      if (hasValue) {
        throw new Error(
          `Operação conflitante: campo "${field}" fornecido com valor e simultaneamente marcado para limpeza em clearFields.`
        );
      }
    }
  }

  // Preserve core protected identity metadata strictly from base
  merged.id = base?.id || patch.raw?.id || Date.now().toString();
  merged.name = base?.name || patch.raw?.name || "Unnamed";
  merged.imageUrl = base?.imageUrl || patch.raw?.imageUrl || "";
  if (base?.createdAt) merged.createdAt = base.createdAt;
  if (base?.updatedAt) merged.updatedAt = base.updatedAt;
  if (base?.revision !== undefined) merged.revision = base.revision;

  // 1. Summary (Required by 3A - never cleared)
  if ('summary' in patch.raw) {
    const rawSum = patch.raw.summary;
    if (typeof rawSum === 'string' && rawSum.trim().length > 0) {
      merged.summary = rawSum.trim().replace(/\s+/g, ' ');
      updatedFields.push('summary');
    } else {
      merged.summary = base?.summary || "";
      preservedFields.push('summary');
    }
  } else {
    merged.summary = base?.summary || "";
    preservedFields.push('summary');
  }

  // 2. Analytical String Fields
  for (const field of ANALYTICAL_STRING_FIELDS) {
    if (clearFields.includes(field)) {
      merged[field] = "";
      clearedFields.push(field);
    } else if (field in patch.raw) {
      const rawVal = patch.raw[field];
      if (rawVal === null || (typeof rawVal !== 'string' && !Array.isArray(rawVal))) {
        throw new Error(`Tipo incompatível para "${field}": esperado string, recebido ${typeof rawVal}.`);
      }
      const strVal = typeof rawVal === 'string'
        ? rawVal.trim().replace(/\s+/g, ' ')
        : rawVal.filter((x: any) => typeof x === 'string').join(', ').trim().replace(/\s+/g, ' ');

      if (strVal.length > 0) {
        merged[field] = strVal;
        updatedFields.push(field);
      } else {
        // Empty string or only whitespace: preserve previous value
        merged[field] = base?.[field] || "";
        preservedFields.push(field);
      }
    } else {
      // Omitted in raw JSON: preserve previous value
      merged[field] = base?.[field] || "";
      preservedFields.push(field);
    }
  }

  // 3. Analytical Array Fields
  for (const field of ARRAY_STRING_FIELDS) {
    if (clearFields.includes(field)) {
      merged[field] = [];
      clearedFields.push(field);
    } else if (field in patch.raw) {
      const rawArr = patch.raw[field];
      if (!Array.isArray(rawArr)) {
        throw new Error(`Tipo incompatível para "${field}": esperado array, recebido ${typeof rawArr}.`);
      }
      if (rawArr.length === 0) {
        // Explicit [] in raw JSON clears list
        merged[field] = [];
        clearedFields.push(field);
      } else {
        const validItems = rawArr
          .filter((item: any) => typeof item === 'string' && item.trim().length > 0)
          .map((item: string) => item.trim().replace(/\s+/g, ' '));

        if (validItems.length > 0) {
          merged[field] = validItems;
          updatedFields.push(field);
        } else {
          // Array contained only empty strings like ["", "   "] -> preserve base
          merged[field] = Array.isArray(base?.[field]) ? [...base[field]] : [];
          preservedFields.push(field);
        }
      }
    } else {
      // Omitted in raw JSON: preserve base
      merged[field] = Array.isArray(base?.[field]) ? [...base[field]] : [];
      preservedFields.push(field);
    }
  }

  // 4. Subject Profile
  if (clearFields.includes('subjectProfile')) {
    delete merged.subjectProfile;
    clearedFields.push('subjectProfile');
  } else if ('subjectProfile' in patch.raw) {
    const rawSP = patch.raw.subjectProfile;
    if (rawSP === null || typeof rawSP !== 'object' || Array.isArray(rawSP)) {
      throw new Error(`Tipo incompatível para subjectProfile: esperado objeto, recebido ${rawSP === null ? 'null' : Array.isArray(rawSP) ? 'array' : typeof rawSP}.`);
    }
    if (isCompleteSubjectProfile(rawSP)) {
      merged.subjectProfile = {
        primarySubject: rawSP.primarySubject.trim().replace(/\s+/g, ' '),
        subjectCategory: rawSP.subjectCategory.trim().toLowerCase().replace(/\s+/g, ' '),
        visualRole: rawSP.visualRole.trim().toLowerCase()
      };
      updatedFields.push('subjectProfile');
    } else {
      // Incomplete block: preserve previous profile
      if (base?.subjectProfile) {
        merged.subjectProfile = { ...base.subjectProfile };
      } else {
        delete merged.subjectProfile;
      }
      unappliedPartialBlocks.push('subjectProfile: proposta incompleta (exige primarySubject, subjectCategory e visualRole)');
      preservedFields.push('subjectProfile');
    }
  } else {
    if (base?.subjectProfile) {
      merged.subjectProfile = { ...base.subjectProfile };
    } else {
      delete merged.subjectProfile;
    }
    preservedFields.push('subjectProfile');
  }

  // 5. Scale Profile
  if (clearFields.includes('scaleProfile')) {
    delete merged.scaleProfile;
    clearedFields.push('scaleProfile');
  } else if ('scaleProfile' in patch.raw) {
    const rawSP = patch.raw.scaleProfile;
    if (rawSP === null || typeof rawSP !== 'object' || Array.isArray(rawSP)) {
      throw new Error(`Tipo incompatível para scaleProfile: esperado objeto, recebido ${rawSP === null ? 'null' : Array.isArray(rawSP) ? 'array' : typeof rawSP}.`);
    }
    if (isCompleteScaleProfile(rawSP)) {
      merged.scaleProfile = {
        physicalScale: rawSP.physicalScale.trim().toLowerCase(),
        perceivedPresence: rawSP.perceivedPresence.trim().toLowerCase(),
        scaleForms: rawSP.scaleForms.map((f: string) => f.trim().toLowerCase()),
        scaleCues: rawSP.scaleCues.map((c: string) => c.trim().toLowerCase()),
        evidence: rawSP.evidence.trim().replace(/\s+/g, ' '),
        confidence: rawSP.confidence
      };
      updatedFields.push('scaleProfile');
    } else {
      if (base?.scaleProfile) {
        merged.scaleProfile = { ...base.scaleProfile };
      } else {
        delete merged.scaleProfile;
      }
      unappliedPartialBlocks.push('scaleProfile: proposta incompleta (exige physicalScale, perceivedPresence, scaleForms, scaleCues, evidence e confidence)');
      preservedFields.push('scaleProfile');
    }
  } else {
    if (base?.scaleProfile) {
      merged.scaleProfile = { ...base.scaleProfile };
    } else {
      delete merged.scaleProfile;
    }
    preservedFields.push('scaleProfile');
  }

  // 6. Substance Profile
  if (clearFields.includes('substanceProfile')) {
    delete merged.substanceProfile;
    clearedFields.push('substanceProfile');
  } else if ('substanceProfile' in patch.raw) {
    const rawSP = patch.raw.substanceProfile;
    if (rawSP === null || typeof rawSP !== 'object' || Array.isArray(rawSP)) {
      throw new Error(`Tipo incompatível para substanceProfile: esperado objeto, recebido ${rawSP === null ? 'null' : Array.isArray(rawSP) ? 'array' : typeof rawSP}.`);
    }
    if (isCompleteSubstanceProfile(rawSP)) {
      merged.substanceProfile = {
        materials: rawSP.materials.map((m: string) => m.trim().toLowerCase()),
        surfaces: rawSP.surfaces.map((s: string) => s.trim().toLowerCase()),
        elements: rawSP.elements.map((e: string) => e.trim().toLowerCase()),
        elementApplications: rawSP.elementApplications.map((ea: string) => ea.trim().toLowerCase()),
        evidence: rawSP.evidence.trim().replace(/\s+/g, ' '),
        confidence: rawSP.confidence
      };
      updatedFields.push('substanceProfile');
    } else {
      if (base?.substanceProfile) {
        merged.substanceProfile = { ...base.substanceProfile };
      } else {
        delete merged.substanceProfile;
      }
      unappliedPartialBlocks.push('substanceProfile: proposta incompleta (exige materials, surfaces, elements, elementApplications, evidence e confidence)');
      preservedFields.push('substanceProfile');
    }
  } else {
    if (base?.substanceProfile) {
      merged.substanceProfile = { ...base.substanceProfile };
    } else {
      delete merged.substanceProfile;
    }
    preservedFields.push('substanceProfile');
  }

  // 7. Subjects & Scale Relationships
  if (clearFields.includes('subjects')) {
    delete merged.subjects;
    clearedFields.push('subjects');
  } else if ('subjects' in patch.raw) {
    if (Array.isArray(patch.raw.subjects)) {
      merged.subjects = patch.normalized?.subjects
        ? [...patch.normalized.subjects]
        : [...patch.raw.subjects];
      updatedFields.push('subjects');
    } else {
      throw new Error(`Tipo incompatível para subjects: esperado array, recebido ${typeof patch.raw.subjects}.`);
    }
  } else {
    if (base?.subjects && Array.isArray(base.subjects)) {
      merged.subjects = [...base.subjects];
    } else {
      delete merged.subjects;
    }
    preservedFields.push('subjects');
  }

  if (clearFields.includes('scaleRelationships')) {
    delete merged.scaleRelationships;
    clearedFields.push('scaleRelationships');
  } else if ('scaleRelationships' in patch.raw) {
    if (Array.isArray(patch.raw.scaleRelationships)) {
      merged.scaleRelationships = patch.normalized?.scaleRelationships
        ? [...patch.normalized.scaleRelationships]
        : [...patch.raw.scaleRelationships];
      updatedFields.push('scaleRelationships');
    } else {
      throw new Error(`Tipo incompatível para scaleRelationships: esperado array, recebido ${typeof patch.raw.scaleRelationships}.`);
    }
  } else {
    if (base?.scaleRelationships && Array.isArray(base.scaleRelationships)) {
      merged.scaleRelationships = [...base.scaleRelationships];
    } else {
      delete merged.scaleRelationships;
    }
    preservedFields.push('scaleRelationships');
  }

  // Prevent scaleRelationships pointing to deleted subjects
  if (merged.scaleRelationships && Array.isArray(merged.scaleRelationships)) {
    if (!merged.subjects || !Array.isArray(merged.subjects) || merged.subjects.length === 0) {
      delete merged.scaleRelationships;
    } else {
      const validSubjectIds = new Set(merged.subjects.map((s: any) => s.id));
      merged.scaleRelationships = merged.scaleRelationships.filter(
        (rel: any) => validSubjectIds.has(rel.subjectA) && validSubjectIds.has(rel.subjectB)
      );
      if (merged.scaleRelationships.length === 0) {
        delete merged.scaleRelationships;
      }
    }
  }

  // 8. Reconcile Tags
  const profilesChanged =
    updatedFields.some(f => ['subjectProfile', 'scaleProfile', 'substanceProfile'].includes(f)) ||
    clearedFields.some(f => ['subjectProfile', 'scaleProfile', 'substanceProfile'].includes(f));

  if (!profilesChanged && !('tags' in patch.raw)) {
    merged.tags = Array.isArray(base?.tags) ? [...base.tags] : [];
    preservedFields.push('tags');
  } else {
    const oldDerivedTags = new Set(extractDerivedTagsFromProfiles(base));
    const newDerivedTags = new Set(extractDerivedTagsFromProfiles(merged));

    const baseTags = Array.isArray(base?.tags) ? base.tags : [];
    // Preserve custom and core tags that were not tied to removed profile elements
    const keptNonDerivedTags = baseTags.filter(t => !oldDerivedTags.has(t) || newDerivedTags.has(t));

    const combinedTags = new Set<string>(keptNonDerivedTags);
    for (const t of newDerivedTags) {
      if (ALLOWED_VISUAL_TAGS.includes(t)) {
        combinedTags.add(t);
      }
    }

    if ('tags' in patch.raw && Array.isArray(patch.raw.tags)) {
      for (const t of patch.raw.tags) {
        if (typeof t === 'string') {
          const cleanT = t.toLowerCase().trim();
          if (ALLOWED_VISUAL_TAGS.includes(cleanT)) {
            combinedTags.add(cleanT);
          }
        }
      }
    }

    const priorityOrder = [
      'Style & Medium', 'Subject & Character', 'Materials & Textures',
      'Elements & Magic', 'Surface & Finish', 'Physical Scale',
      'Scale Forms', 'Scale Cues', 'Perceived Presence', 'Lighting & Color', 'Atmosphere & Framing'
    ];

    const sortedTags = Array.from(combinedTags).sort((a, b) => {
      const catA = getTagCategory(a);
      const catB = getTagCategory(b);
      return priorityOrder.indexOf(catA) - priorityOrder.indexOf(catB);
    });
    merged.tags = sortedTags.slice(0, 14);
    updatedFields.push('tags');
  }

  // 9. Scores, Justifications and Calibration
  merged.scores = { ...(base?.scores || {}) };
  merged.scoreJustifications = { ...(base?.scoreJustifications || {}) };

  const scoresEvaluatedInPatch = new Set<string>();

  if ('scores' in patch.raw && patch.raw.scores && typeof patch.raw.scores === 'object' && !Array.isArray(patch.raw.scores)) {
    for (const dim of ALL_CANONICAL_DIMENSIONS) {
      if (dim in patch.raw.scores) {
        const val = patch.raw.scores[dim];
        if (val === undefined) continue;
        if (val === null || typeof val !== 'number' || isNaN(val) || !Number.isFinite(val) || val < 0.0 || val > 1.0) {
          throw new Error(`Score inválido para "${dim}": recebido ${val}. Atualização rejeitada.`);
        }
        merged.scores[dim] = val;
        scoresEvaluatedInPatch.add(dim);
        updatedFields.push(`scores.${dim}`);

        if (
          patch.raw.scoreJustifications?.[dim] &&
          typeof patch.raw.scoreJustifications[dim] === 'string' &&
          patch.raw.scoreJustifications[dim].trim().length > 0
        ) {
          merged.scoreJustifications[dim] = patch.raw.scoreJustifications[dim].trim().replace(/\s+/g, ' ');
        } else {
          // Score updated without new justification -> remove previous justification
          delete merged.scoreJustifications[dim];
        }
      }
    }
  }

  // Preserve omitted scores and check for description updates without score evaluation
  for (const dim of ALL_CANONICAL_DIMENSIONS) {
    if (!scoresEvaluatedInPatch.has(dim) && dim in merged.scores) {
      preservedFields.push(`scores.${dim}`);
      if (updatedFields.includes(dim)) {
        inheritanceWarnings.push(
          `Dimensão "${dim}" teve sua descrição atualizada mas o score foi herdado da avaliação anterior.`
        );
      }
    }
  }

  // Determine calibration
  const baseCalibrated = isCalibratedRecord(base);
  const canonicalInMerged = Object.keys(merged.scores).filter(k =>
    (ALL_CANONICAL_DIMENSIONS as readonly string[]).includes(k as any)
  );

  let fullyCalibrated = false;
  if (baseCalibrated) {
    // Both base scores and newly evaluated patch scores are V3 calibrated
    fullyCalibrated = true;
  } else {
    // Base was uncalibrated. Only fully calibrated if all retained scores were reevaluated
    if (canonicalInMerged.length > 0 && canonicalInMerged.every(k => scoresEvaluatedInPatch.has(k))) {
      fullyCalibrated = true;
    } else {
      fullyCalibrated = false;
      if (canonicalInMerged.some(k => !scoresEvaluatedInPatch.has(k))) {
        inheritanceWarnings.push(
          "Registro retém avaliações herdadas de contrato anterior; selo de calibração integral não aplicável."
        );
      }
    }
  }

  if (fullyCalibrated && isCalibratedRecord({ ...merged, isCalibrated: true, calibrationVersion: 3 })) {
    merged.isCalibrated = true;
    merged.calibrationVersion = 3;
  } else {
    merged.isCalibrated = false;
    delete merged.calibrationVersion;
  }

  // Strip any accidental undefined values
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      delete merged[key];
    }
  }

  const changed = hasPersistentChanges(base, merged);

  return {
    data: merged as VisualDNA,
    changed,
    diagnostic: {
      updatedFields,
      preservedFields,
      clearedFields,
      unappliedPartialBlocks,
      inheritanceWarnings
    },
    updatedFields,
    preservedFields,
    clearedFields,
    unappliedPartialBlocks,
    inheritanceWarnings
  };
}
