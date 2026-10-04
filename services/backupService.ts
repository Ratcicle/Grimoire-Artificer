import { VisualDNA } from '../types';
import { readDnaBackupSnapshot, applyLocalDnaBackup, type DnaBackupMutation, type DnaTombstone } from './localDbService';
import { assertDnaOperationContext, captureDnaOperationContext, isDnaOperationContextCurrent, subscribeDnaChanges, type DnaOperationContext } from './dnaAccountContext';
import { canonicalizeValue } from './visualDnaSyncUtils';

export const GRIMOIRE_BACKUP_FORMAT = 'grimoire-artstyle-backup';
export const GRIMOIRE_BACKUP_VERSION = 2;

type Rule = 'string' | 'number' | 'boolean' | 'owner' | { array: Rule } | { dictionary: Rule } | { shape: Record<string, Rule> } | { values: readonly string[] } | { either: Rule[] };
const strings: Rule = { array: 'string' };
const subjectShape: Rule = { shape: {
  id: 'string', description: 'string', category: 'string', visualRole: { values: ['primary', 'secondary', 'supporting'] },
  physicalScale: 'string', perceivedPresence: 'string', materials: strings, surfaces: strings, elements: strings,
} };
const scoresShape = {
  style: 'number', palette: 'number', pose: 'number', composition: 'number', lighting: 'number', effects: 'number',
  materials: 'number', background: 'number', details: 'number', silhouette: 'number', rendering: 'number', detailDensity: 'number',
} as const;

// Shared by export, validation, comparison and restore. usageMetadata is
// consumption/provider data, not analytical DNA. Raw responses and arbitrary
// extensions never enter this explicit contract.
const RECORD_SCHEMA = {
  id: 'string', name: 'string', imageUrl: 'string', ownerId: 'owner',
  summary: 'string', linework: 'string', rendering: 'string', palette: 'string', silhouette: 'string', pose: 'string',
  framing: 'string', composition: 'string', lighting: 'string', effects: 'string', materials: 'string', details: 'string',
  background: 'string', hierarchy: 'string', positivePrompt: 'string', negativePrompt: { either: ['string', strings] },
  visualMotifs: 'string', shapeLanguage: 'string', focalAnchors: 'string', detailPlacement: 'string', compositionRecipe: 'string',
  paletteLogic: 'string', materialBehavior: 'string', energyDesign: 'string', styleAnchors: 'string', avoidRules: { either: ['string', strings] },
  stylePromptFragments: strings, contentMotifs: strings, identitySpecificDetails: strings,
  universalQualityAvoids: strings, styleSpecificAvoids: strings, contentSpecificAvoids: strings,
  subjectProfile: { shape: { primarySubject: 'string', subjectCategory: 'string', visualRole: 'string' } },
  scaleProfile: { shape: { physicalScale: 'string', scaleForms: strings, scaleCues: strings, perceivedPresence: 'string', evidence: 'string', confidence: 'number' } },
  substanceProfile: { shape: { materials: strings, surfaces: strings, elements: strings, elementApplications: strings, evidence: 'string', confidence: 'number' } },
  subjects: { array: subjectShape },
  scaleRelationships: { array: { shape: { subjectA: 'string', subjectB: 'string', relationship: 'string', evidence: 'string' } } },
  tags: strings, scores: { shape: scoresShape },
  scoreJustifications: { dictionary: 'string' },
  analysisVersion: 'number', analysisStatus: { values: ['complete', 'partial', 'legacy'] }, warnings: strings,
  isCalibrated: 'boolean', calibrationVersion: 'number', createdAt: 'number', updatedAt: 'number', revision: 'number',
  imageFingerprint: 'string', cloudDocumentId: 'string',
} satisfies Record<Exclude<keyof VisualDNA, 'usageMetadata'>, Rule>;

// These timestamps/revisions describe operations rather than analytical content.
// Everything else, including image bytes, ownership and calibration, is compared.
const OPERATIONAL_FIELDS = new Set(['createdAt', 'updatedAt', 'revision']);
const TOMBSTONE_SCHEMA: Record<string, Rule> = { id: 'string', ownerId: 'owner', deletedAt: 'number', cloudDeleted: 'boolean', cloudDocumentId: 'string' };

export type GrimoireBackupRecord = Partial<Omit<VisualDNA, 'usageMetadata'>> & Pick<VisualDNA, 'id' | 'name' | 'imageUrl'> & {
  imageType: 'unknown' | 'thumbnail' | 'full';
};
export type GrimoireBackupTombstone = Omit<DnaTombstone, 'storageKey'>;
export interface GrimoireBackupFile {
  format: typeof GRIMOIRE_BACKUP_FORMAT; version: number; exportedAt: number;
  libraryScope: { ownerId: string | null; isLegacy: boolean; description: string };
  records: GrimoireBackupRecord[]; tombstones: GrimoireBackupTombstone[]; warnings: string[];
  summary: { totalRecords: number; calibratedCount: number; legacyCount: number; thumbnailCount: number; fullImageCount: number; unknownImageCount: number };
}
export interface ConflictItem { id: string; name: string; current: VisualDNA; incoming: VisualDNA; resolution: 'keep_current' | 'replace' }
export interface DeletedConflictItem { id: string; name: string; incoming: VisualDNA; deletedAt: number; resolution: 'keep_deleted' | 'restore' }
export interface BackupPreviewResult {
  valid: boolean; error?: string; warnings?: string[]; previewToken?: object;
  fileScope?: { ownerId: string | null; isLegacy: boolean; description: string; exportedAt: number };
  targetOwnerId: string | null; scopeMismatch?: boolean; scopeMismatchWarning?: string;
  newRecords: VisualDNA[]; identicalRecords: VisualDNA[]; conflicts: ConflictItem[]; deletedConflicts: DeletedConflictItem[];
  summary: { totalIncoming: number; newCount: number; identicalCount: number; conflictCount: number; deletedConflictCount: number };
}
export type BackupApplyPlan = BackupPreviewResult;
export interface BackupApplyResult {
  success: boolean; appliedCount: number; addedCount: number; replacedCount: number; restoredCount: number; skippedCount: number;
  tombstoneCount?: number; error?: string;
}

const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const same = (a: unknown, b: unknown) => JSON.stringify(canonicalizeValue(a)) === JSON.stringify(canonicalizeValue(b));
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const fail = (message: string): never => { throw new Error(message); };

function describeRecord(record: unknown): string {
  const label = (key: string) => isObject(record) && typeof record[key] === 'string' ? JSON.stringify(record[key]) : '(ausente ou inválido)';
  return `Referência id=${label('id')}, nome=${label('name')}`;
}

function withRecordContext<T>(record: unknown, operation: () => T): T {
  try { return operation(); }
  catch (error) { return fail(`${describeRecord(record)}: ${error instanceof Error ? error.message : String(error)}`); }
}

function projectValue(value: unknown, rule: Rule, path: string, strict: boolean): any {
  if (typeof rule === 'string') {
    if (rule === 'owner' ? value === null || nonempty(value) : typeof value === rule && (rule !== 'number' || Number.isFinite(value))) return value;
    return fail(`Tipo incompatível em ${path}.`);
  }
  if ('array' in rule) {
    if (!Array.isArray(value)) return fail(`Lista inválida em ${path}.`);
    return value.map((item, index) => projectValue(item, rule.array, `${path}[${index}]`, strict));
  }
  if ('dictionary' in rule) {
    if (!isObject(value)) return fail(`Objeto inválido em ${path}.`);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projectValue(item, rule.dictionary, `${path}.${key}`, strict)]));
  }
  if ('shape' in rule) return projectObject(value, rule.shape, path, strict);
  if ('values' in rule) {
    if (typeof value === 'string' && rule.values.includes(value)) return value;
    return fail(`Valor inválido em ${path}.`);
  }
  for (const alternative of rule.either) {
    try { return projectValue(value, alternative, path, strict); } catch { /* historical representation */ }
  }
  return fail(`Tipo incompatível em ${path}.`);
}

function projectObject(value: unknown, schema: Record<string, Rule>, path: string, strict: boolean): Record<string, any> {
  if (!isObject(value)) return fail(`Objeto inválido em ${path}.`);
  if (strict) for (const key of Object.keys(value)) if (!own(schema, key)) fail(`Campo não permitido em ${path}.${key}.`);
  const output: Record<string, any> = {};
  for (const [key, rule] of Object.entries(schema)) {
    if (own(value, key) && value[key] !== undefined) output[key] = projectValue(value[key], rule, `${path}.${key}`, strict);
  }
  return output;
}

function validateImage(value: string): void {
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) fail('Representação de imagem inválida; o backup exige bytes locais em data URL, sem URLs remotas.');
  let bytes: string;
  try { bytes = atob(match[2]); } catch { return fail('Imagem base64 inválida.'); }
  const at = (i: number) => bytes.charCodeAt(i);
  const png = bytes.startsWith('\x89PNG\r\n\x1a\n') && bytes.length >= 45 && bytes.slice(12, 16) === 'IHDR' && bytes.slice(-8, -4) === 'IEND';
  const jpeg = bytes.length >= 20 && at(0) === 255 && at(1) === 216 && at(2) === 255 && at(bytes.length - 2) === 255 && at(bytes.length - 1) === 217;
  const webp = bytes.length >= 20 && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP' && /^VP8[ LX]$/.test(bytes.slice(12, 16));
  const gif = bytes.length >= 14 && /^(GIF87a|GIF89a)/.test(bytes) && bytes.endsWith(';');
  if (!({ png, jpeg, webp, gif }[match[1]])) fail('Bytes da imagem incompatíveis com o formato declarado.');
}

function validateRecord(record: Record<string, any>, ownerId: string | null, warnings: Set<string>): VisualDNA {
  if (!nonempty(record.id) || !nonempty(record.name) || typeof record.imageUrl !== 'string') fail('Registro sem id, nome ou imagem válidos.');
  validateImage(record.imageUrl);
  if (record.ownerId !== undefined && record.ownerId !== ownerId) fail('Proprietário do registro difere do escopo do arquivo.');
  for (const key of OPERATIONAL_FIELDS) if (record[key] !== undefined && (!Number.isSafeInteger(record[key]) || record[key] < 0)) fail(`Metadado operacional inválido: ${key}.`);
  const subjectIds = new Set<string>();
  for (const subject of record.subjects || []) {
    if (!nonempty(subject.id) || subjectIds.has(subject.id)) fail('Sujeito com id vazio ou duplicado.');
    subjectIds.add(subject.id);
  }
  for (const [index, relation] of (record.scaleRelationships || []).entries()) {
    for (const key of ['subjectA', 'subjectB', 'relationship']) {
      if (typeof relation[key] !== 'string') fail(`Campo obrigatório ausente ou inválido em scaleRelationships[${index}].${key}.`);
    }
  }
  collectAnalyticalWarnings(record as VisualDNA, warnings);
  return record as VisualDNA;
}

// Archiving existing analysis does not certify its consistency. Keep recognizable
// legacy relationships verbatim; structural/type/scope checks remain mandatory.
function collectAnalyticalWarnings(record: VisualDNA, warnings: Set<string>): void {
  const label = describeRecord(record);
  const subjectIds = new Set((record.subjects || []).map(subject => subject.id));
  for (const [index, relation] of (record.scaleRelationships || []).entries()) {
    const issues: string[] = [];
    if (!subjectIds.has(relation.subjectA)) issues.push(`subjectA ${JSON.stringify(relation.subjectA)} ausente em subjects`);
    if (!subjectIds.has(relation.subjectB)) issues.push(`subjectB ${JSON.stringify(relation.subjectB)} ausente em subjects`);
    if (relation.subjectA === relation.subjectB) issues.push('autorrelação: subjectA e subjectB são iguais');
    if (!nonempty(relation.relationship)) issues.push('relationship contém descrição vazia');
    if (issues.length) warnings.add(`${label}: scaleRelationships[${index}]: ${issues.join('; ')}. Conteúdo preservado sem correção; consistência analítica não certificada.`);
  }
  if (Object.values(record.scores || {}).some(score => score < 0 || score > 1)) warnings.add(`${label}: notas legadas fora de 0–1 foram preservadas sem conversão nem recalibração.`);
  if (!record.analysisVersion || record.analysisVersion < 3 || !record.isCalibrated || record.calibrationVersion !== 3) warnings.add(`${label}: registro legado ou sem calibração V3 comprovada; a restauração preserva essa procedência.`);
}

// Bytes alone cannot prove provenance, regardless of base64 length.
export function classifyImageType(_imageUrl: string): 'unknown' { return 'unknown'; }

export async function exportLibraryBackup(ownerId: string | null = captureDnaOperationContext().ownerId): Promise<GrimoireBackupFile> {
  const context = captureDnaOperationContext();
  if (ownerId !== null && ownerId !== context.ownerId) fail('Não é permitido exportar outra conta.');
  const snapshot = await readDnaBackupSnapshot(ownerId);
  assertDnaOperationContext(context);
  const warnings = new Set<string>(['As imagens disponíveis localmente foram preservadas sem recompressão. A procedência como imagem original não está comprovada.']);
  const records = snapshot.records.map(record => withRecordContext(record, () => {
    const projected = projectObject(record, RECORD_SCHEMA, 'record', false);
    validateRecord(projected, ownerId, warnings);
    return { ...projected, imageType: classifyImageType(record.imageUrl) } as GrimoireBackupRecord;
  }));
  const tombstones = snapshot.tombstones.map(t => projectObject(t, TOMBSTONE_SCHEMA, 'tombstone', false) as GrimoireBackupTombstone);
  const calibratedCount = records.filter(r => r.isCalibrated === true && r.calibrationVersion === 3 && Object.values(r.scores || {}).every(score => typeof score === 'number' && score >= 0 && score <= 1)).length;
  return {
    format: GRIMOIRE_BACKUP_FORMAT, version: GRIMOIRE_BACKUP_VERSION, exportedAt: Date.now(),
    libraryScope: { ownerId, isLegacy: ownerId === null, description: ownerId === null ? 'Biblioteca Legada (Sem conta vinculada)' : `Biblioteca Pessoal (${ownerId})` },
    records, tombstones, warnings: [...warnings],
    summary: { totalRecords: records.length, calibratedCount, legacyCount: records.length - calibratedCount, thumbnailCount: 0, fullImageCount: 0, unknownImageCount: records.length },
  };
}

function readBackup(text: string) {
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return fail('Arquivo inválido: JSON corrompido ou malformado.'); }
  if (!isObject(parsed)) fail('Estrutura de arquivo inválida.');
  const envelopeFields = new Set(['format', 'version', 'exportedAt', 'libraryScope', 'records', 'tombstones', 'warnings', 'summary']);
  for (const key of Object.keys(parsed)) if (!envelopeFields.has(key)) fail(`Campo não permitido no arquivo: ${key}.`);
  if (parsed.format !== GRIMOIRE_BACKUP_FORMAT) fail('Formato de backup não reconhecido.');
  if (parsed.version !== 1 && parsed.version !== 2) fail(`Versão de backup não suportada: ${parsed.version}.`);
  if (parsed.warnings !== undefined) projectValue(parsed.warnings, strings, 'warnings', true);
  if (parsed.summary !== undefined) {
    const summary = projectObject(parsed.summary, {
      totalRecords: 'number', calibratedCount: 'number', legacyCount: 'number', thumbnailCount: 'number', fullImageCount: 'number', unknownImageCount: 'number',
    }, 'summary', true);
    if (Object.values(summary).some(count => !Number.isSafeInteger(count) || count < 0)) fail('Contagens inválidas no resumo do backup.');
  }
  const scope = projectObject(parsed.libraryScope, { ownerId: 'owner', isLegacy: 'boolean', description: 'string' }, 'libraryScope', true);
  if (!own(scope, 'ownerId') || scope.isLegacy !== (scope.ownerId === null)) fail('Escopo/proprietário de backup inválido.');
  if (parsed.exportedAt !== undefined && (typeof parsed.exportedAt !== 'number' || !Number.isFinite(parsed.exportedAt) || parsed.exportedAt < 0)) fail('Data de exportação inválida.');
  if (!Array.isArray(parsed.records) || (parsed.tombstones !== undefined && !Array.isArray(parsed.tombstones))) fail('Listas de registros ou exclusões inválidas.');
  const warnings = new Set<string>();
  if (parsed.version === 1) warnings.add('Backup V1 incompleto: campos ausentes serão preservados nas substituições; informações nunca exportadas não podem ser recuperadas.');
  const ids = new Set<string>();
  for (const record of parsed.records) {
    if (!isObject(record) || !nonempty(record.id)) fail(`${describeRecord(record)}: registro com id vazio ou inválido.`);
    if (ids.has(record.id)) fail(`${describeRecord(record)}: ID duplicado no backup.`);
    ids.add(record.id);
  }
  const records = parsed.records.map((raw: any) => withRecordContext(raw, () => {
    const { imageType, profile, ...data } = raw;
    if (imageType !== undefined && !['full', 'thumbnail', 'unknown'].includes(imageType)) fail('Tipo de procedência da imagem inválido.');
    if (profile !== undefined) {
      if (parsed.version !== 1) fail('Campo profile desconhecido no contrato VisualDNA.');
      warnings.add('O campo profile do formato V1 não possui contrato analítico definido e não será persistido.');
    }
    warnings.add(imageType === 'thumbnail' ? 'O arquivo contém miniaturas recuperáveis; elas não recuperam as imagens originais.' : 'As imagens serão preservadas como disponíveis no arquivo; a procedência original não está comprovada.');
    return validateRecord(projectObject(data, RECORD_SCHEMA, 'record', true), scope.ownerId, warnings);
  })) as VisualDNA[];
  const deletionIds = new Set<string>();
  const tombstones = (parsed.tombstones || []).map((raw: unknown) => {
    const t = projectObject(raw, TOMBSTONE_SCHEMA, 'tombstone', true);
    if (!nonempty(t.id) || deletionIds.has(t.id) || ids.has(t.id)) fail('Exclusão com id vazio, duplicado ou conflitante com registro ativo no arquivo.');
    if (!Number.isSafeInteger(t.deletedAt) || t.deletedAt < 0) fail('Data da intenção de exclusão inválida.');
    if (t.ownerId !== undefined && t.ownerId !== scope.ownerId) fail('Exclusão pertence a outro proprietário.');
    if (parsed.version === 2 && (t.ownerId === undefined || t.cloudDeleted === undefined)) fail('Metadados da intenção de exclusão V2 incompletos.');
    deletionIds.add(t.id);
    return { ...t, ownerId: scope.ownerId, cloudDeleted: t.cloudDeleted ?? false, storageKey: JSON.stringify([scope.ownerId, t.id]) } as DnaTombstone;
  });
  return { records, tombstones, warnings: [...warnings], version: parsed.version as number, scope, exportedAt: parsed.exportedAt ?? 0 };
}

function mergeLegacy(current: any, incoming: any): any {
  if (!isObject(current) || !isObject(incoming)) return structuredClone(incoming);
  const merged = structuredClone(current);
  for (const key of Object.keys(incoming)) merged[key] = mergeLegacy(current[key], incoming[key]);
  return merged;
}

// A V1 omission preserves current content, but cannot certify newly imported
// analytical evidence using the current record's calibration claim.
const CALIBRATION_INDEPENDENT_FIELDS = new Set([
  ...OPERATIONAL_FIELDS, 'id', 'name', 'imageUrl', 'ownerId', 'cloudDocumentId', 'imageFingerprint',
  'isCalibrated', 'calibrationVersion',
]);

export function areRecordsSubstantivelyEqual(a: VisualDNA, b: VisualDNA): boolean {
  const content = (record: VisualDNA) => {
    const projected = projectObject(record, RECORD_SCHEMA, 'record', false);
    for (const key of OPERATIONAL_FIELDS) delete projected[key];
    return projected;
  };
  return same(content(a), content(b));
}

function validateCloudLink(value: { id: string; cloudDocumentId?: string }, ownerId: string | null, trusted?: string): void {
  const link = value.cloudDocumentId;
  if (link === undefined) return;
  if (!nonempty(link) || link.includes('/')) fail('Identificador cloud inválido no backup.');
  const scoped = ownerId === null ? undefined : `${encodeURIComponent(ownerId)}:${encodeURIComponent(value.id)}`;
  // Legacy document ids matched reference ids. Other aliases need an existing
  // local association; an imported file cannot authorize arbitrary cloud paths.
  if (link !== trusted && link !== scoped && !(link === value.id && !link.includes(':'))) fail('Vínculo cloud não comprovado para este proprietário. A restauração foi bloqueada.');
}

interface PreparedPreview {
  context: DnaOperationContext; targetOwnerId: string | null; invalidated: boolean; applied: boolean;
  records: Map<string, VisualDNA>; tombstones: Map<string, DnaTombstone>;
  incoming: Map<string, VisualDNA>; categories: Map<string, 'new' | 'identical' | 'conflict' | 'deleted'>;
  deletionChanges: DnaTombstone[];
}
const preparedPreviews = new WeakMap<object, PreparedPreview>();
let activePreview: PreparedPreview | undefined;
let previewGeneration = 0;
const applyingScopes = new Set<string | null>();
subscribeDnaChanges(() => {
  if (activePreview && !isDnaOperationContextCurrent(activePreview.context)) activePreview.invalidated = true;
});

export async function validateAndPreviewBackup(jsonText: string, targetOwnerId: string | null = captureDnaOperationContext().ownerId): Promise<BackupPreviewResult> {
  const empty: BackupPreviewResult = { valid: false, targetOwnerId, newRecords: [], identicalRecords: [], conflicts: [], deletedConflicts: [], summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 } };
  const context = captureDnaOperationContext();
  const generation = ++previewGeneration;
  if (activePreview) activePreview.invalidated = true;
  const pending = { invalidated: false };
  const unsubscribe = subscribeDnaChanges(() => { if (!isDnaOperationContextCurrent(context)) pending.invalidated = true; });
  try {
    const data = readBackup(jsonText);
    if (targetOwnerId !== context.ownerId || data.scope.ownerId !== targetOwnerId) {
      return { ...empty, scopeMismatch: true, error: `Backup do escopo ${data.scope.ownerId ?? 'legado'} não pode ser restaurado no escopo ${targetOwnerId ?? 'legado'}. Nenhuma reassociação será feita.`, scopeMismatchWarning: `Origem: ${data.scope.ownerId ?? 'legado'}; destino: ${targetOwnerId ?? 'legado'}.` };
    }
    const snapshot = await readDnaBackupSnapshot(targetOwnerId);
    assertDnaOperationContext(context);
    if (generation !== previewGeneration) fail('Uma prévia mais recente substituiu este arquivo.');
    if (pending.invalidated) fail('A conta mudou durante a preparação da prévia.');
    const records = new Map(snapshot.records.map(record => [record.id, record]));
    const tombstones = new Map(snapshot.tombstones.map(t => [t.id, t]));
    const incoming = new Map<string, VisualDNA>();
    const categories: PreparedPreview['categories'] = new Map();
    const preview: BackupPreviewResult = { ...empty, valid: true, warnings: data.warnings, previewToken: {}, fileScope: { ownerId: data.scope.ownerId, isLegacy: data.scope.isLegacy, description: data.scope.description || 'Biblioteca', exportedAt: data.exportedAt } };
    data.records.forEach(record => withRecordContext(record, () => {
      const current = records.get(record.id);
      const deleted = tombstones.get(record.id);
      if (current && deleted) fail('Estado local inconsistente: referência ativa e exclusão com o mesmo ID.');
      const trustedLink = current?.cloudDocumentId ?? deleted?.cloudDocumentId;
      validateCloudLink(record, targetOwnerId, trustedLink);
      if (trustedLink && record.cloudDocumentId && trustedLink !== record.cloudDocumentId) fail('O vínculo cloud local difere do backup; restauração bloqueada.');
      const projected = projectObject(record, RECORD_SCHEMA, 'record', false);
      const replacement = (data.version === 1 && current ? mergeLegacy(projectObject(current, RECORD_SCHEMA, 'current', false), projected) : projected) as VisualDNA;
      replacement.ownerId = targetOwnerId;
      if (!replacement.cloudDocumentId && trustedLink) replacement.cloudDocumentId = trustedLink;
      if (data.version === 1 && current && replacement.isCalibrated && (record.isCalibrated === undefined || record.calibrationVersion === undefined) &&
          (current.isCalibrated !== replacement.isCalibrated || current.calibrationVersion !== replacement.calibrationVersion ||
           Object.keys(replacement).some(key => !CALIBRATION_INDEPENDENT_FIELDS.has(key) && !same(replacement[key as keyof VisualDNA], current[key as keyof VisualDNA])))) {
        replacement.isCalibrated = false;
        preview.warnings!.push('O backup V1 não comprova a calibração do conteúdo combinado. As notas serão preservadas e a calibração herdada não será aplicada.');
      }
      // Recheck the merged structure and report inherited analytical inconsistencies.
      const mergedWarnings = new Set(preview.warnings);
      validateRecord(replacement, targetOwnerId, mergedWarnings);
      preview.warnings = [...mergedWarnings];
      incoming.set(record.id, replacement);
      if (deleted) {
        categories.set(record.id, 'deleted'); preview.deletedConflicts.push({ id: record.id, name: record.name, incoming: structuredClone(replacement), deletedAt: deleted.deletedAt, resolution: 'keep_deleted' });
      } else if (!current) {
        categories.set(record.id, 'new'); preview.newRecords.push(structuredClone(replacement));
      } else if (areRecordsSubstantivelyEqual({ ...current, ownerId: targetOwnerId }, replacement)) {
        categories.set(record.id, 'identical'); preview.identicalRecords.push(structuredClone(replacement));
      } else {
        categories.set(record.id, 'conflict'); preview.conflicts.push({ id: record.id, name: record.name, current: structuredClone(current), incoming: structuredClone(replacement), resolution: 'keep_current' });
      }
    }));
    const deletionChanges: DnaTombstone[] = [];
    for (const tombstone of data.tombstones) {
      if (records.has(tombstone.id)) fail(`A exclusão importada de "${tombstone.id}" atinge uma referência ativa. Os controles atuais não autorizam essa exclusão; nenhum item será restaurado.`);
      const current = tombstones.get(tombstone.id);
      validateCloudLink(tombstone, targetOwnerId, current?.cloudDocumentId);
      if (current?.cloudDocumentId && tombstone.cloudDocumentId && current.cloudDocumentId !== tombstone.cloudDocumentId) fail('Vínculo cloud de exclusão conflitante.');
      if (!current || tombstone.deletedAt > current.deletedAt) deletionChanges.push({ ...tombstone, ...(current?.cloudDocumentId && !tombstone.cloudDocumentId ? { cloudDocumentId: current.cloudDocumentId } : {}) });
    }
    if (data.tombstones.length) preview.warnings = [...preview.warnings!, `${deletionChanges.length} intenções de exclusão serão preservadas localmente; sem operações cloud nesta restauração.`];
    preview.summary = { totalIncoming: data.records.length, newCount: preview.newRecords.length, identicalCount: preview.identicalRecords.length, conflictCount: preview.conflicts.length, deletedConflictCount: preview.deletedConflicts.length };
    const prepared: PreparedPreview = { context, targetOwnerId, invalidated: false, applied: false, records, tombstones, incoming, categories, deletionChanges };
    preparedPreviews.set(preview.previewToken!, prepared); activePreview = prepared;
    return preview;
  } catch (error) { return { ...empty, error: error instanceof Error ? error.message : String(error) }; }
  finally { unsubscribe(); }
}

export async function applyBackupRestoration(preview: BackupApplyPlan): Promise<BackupApplyResult> {
  const failed = (error: string): BackupApplyResult => ({ success: false, appliedCount: 0, addedCount: 0, replacedCount: 0, restoredCount: 0, skippedCount: 0, error });
  const prepared = preview?.previewToken && preparedPreviews.get(preview.previewToken);
  if (!preview?.valid || !prepared || prepared.invalidated || prepared.applied || preview.targetOwnerId !== prepared.targetOwnerId) return failed('Prévia inválida ou expirada. Prepare uma nova prévia antes de confirmar.');
  const { targetOwnerId } = prepared;
  if (applyingScopes.has(targetOwnerId)) return failed('Uma restauração já está em andamento.');
  applyingScopes.add(targetOwnerId); // Before the first await, independent of React state.
  try {
    assertDnaOperationContext(prepared.context);
    const mutations: DnaBackupMutation[] = [];
    let addedCount = 0, replacedCount = 0, restoredCount = 0, skippedCount = 0;
    for (const [id, record] of prepared.incoming) {
      const category = prepared.categories.get(id);
      const replace = preview.conflicts.find(item => item.id === id)?.resolution === 'replace';
      const restore = preview.deletedConflicts.find(item => item.id === id)?.resolution === 'restore';
      if (category === 'identical' || (category === 'conflict' && !replace) || (category === 'deleted' && !restore)) { skippedCount++; continue; }
      const current = prepared.records.get(id) ?? null;
      const deleted = prepared.tombstones.get(id) ?? null;
      const revision = Math.max(current?.revision ?? 0, record.revision ?? 0) + 1;
      const updatedAt = Math.max(Date.now(), current?.updatedAt ?? 0, record.updatedAt ?? 0, deleted?.deletedAt ?? 0) + 1;
      if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(updatedAt)) fail('Metadados excedem o intervalo seguro para restauração.');
      mutations.push({ id, expectedRecord: current, expectedTombstone: deleted, record: { ...record, ownerId: targetOwnerId, revision, updatedAt, ...(current?.createdAt !== undefined ? { createdAt: current.createdAt } : {}) } });
      if (category === 'new') addedCount++; else if (category === 'conflict') replacedCount++; else restoredCount++;
    }
    for (const tombstone of prepared.deletionChanges) mutations.push({ id: tombstone.id, expectedRecord: null, expectedTombstone: prepared.tombstones.get(tombstone.id) ?? null, tombstone });
    await applyLocalDnaBackup(targetOwnerId, mutations);
    prepared.applied = true;
    return { success: true, appliedCount: addedCount + replacedCount + restoredCount, addedCount, replacedCount, restoredCount, skippedCount, tombstoneCount: prepared.deletionChanges.length };
  } catch (error) { return failed(error instanceof Error ? error.message : String(error)); }
  finally { applyingScopes.delete(targetOwnerId); }
}
