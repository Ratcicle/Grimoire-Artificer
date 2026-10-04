import { VisualDNA } from '../types';
import { getLocalDNA, getDnaTombstones, saveLocalDNA, areLocalDnaSnapshotsEqual, type DnaTombstone } from './localDbService';
import { assertDnaOperationContext, captureDnaOperationContext, notifyDnaChanges } from './dnaAccountContext';
import { canonicalizeValue } from './visualDnaSyncUtils';

export const GRIMOIRE_BACKUP_FORMAT = 'grimoire-artstyle-backup';
export const GRIMOIRE_BACKUP_VERSION = 1;

export interface GrimoireBackupRecord {
  id: string;
  name: string;
  imageUrl: string;
  imageType: 'full' | 'thumbnail';
  summary?: string;
  linework?: string;
  rendering?: string;
  palette?: string;
  silhouette?: string;
  pose?: string;
  framing?: string;
  composition?: string;
  lighting?: string;
  effects?: string;
  materials?: string;
  details?: string;
  background?: string;
  hierarchy?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  tags?: string[];
  scores?: Record<string, number>;
  profile?: any;
  subjectProfile?: any;
  scoreJustifications?: any;
  isCalibrated?: boolean;
  calibrationVersion?: number;
  analysisStatus?: string;
  createdAt?: number;
  updatedAt?: number;
  revision?: number;
  imageFingerprint?: string;
}

export interface GrimoireBackupTombstone {
  id: string;
  deletedAt: number;
}

export interface GrimoireBackupFile {
  format: typeof GRIMOIRE_BACKUP_FORMAT;
  version: typeof GRIMOIRE_BACKUP_VERSION;
  exportedAt: number;
  libraryScope: {
    ownerId: string | null;
    isLegacy: boolean;
    description: string;
  };
  records: GrimoireBackupRecord[];
  tombstones?: GrimoireBackupTombstone[];
  summary: {
    totalRecords: number;
    calibratedCount: number;
    legacyCount: number;
    thumbnailCount: number;
    fullImageCount: number;
  };
}

export interface ConflictItem {
  id: string;
  name: string;
  current: VisualDNA;
  incoming: VisualDNA;
  resolution: 'keep_current' | 'replace';
}

export interface DeletedConflictItem {
  id: string;
  name: string;
  incoming: VisualDNA;
  deletedAt: number;
  resolution: 'keep_deleted' | 'restore';
}

export interface BackupPreviewResult {
  valid: boolean;
  error?: string;
  fileScope?: {
    ownerId: string | null;
    isLegacy: boolean;
    description: string;
    exportedAt: number;
  };
  targetOwnerId: string | null;
  scopeMismatch?: boolean;
  scopeMismatchWarning?: string;
  newRecords: VisualDNA[];
  identicalRecords: VisualDNA[];
  conflicts: ConflictItem[];
  deletedConflicts: DeletedConflictItem[];
  summary: {
    totalIncoming: number;
    newCount: number;
    identicalCount: number;
    conflictCount: number;
    deletedConflictCount: number;
  };
}

export interface BackupApplyPlan {
  targetOwnerId: string | null;
  newRecords: VisualDNA[];
  conflictsToReplace: { current: VisualDNA; replacement: VisualDNA }[];
  deletedToRestore: VisualDNA[];
}

export interface BackupApplyResult {
  success: boolean;
  appliedCount: number;
  addedCount: number;
  replacedCount: number;
  restoredCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * Classifica se a imagem é miniatura (ex: <= 180px ou JPEG muito reduzido)
 * para transparência honesta no arquivo de backup.
 */
export function classifyImageType(imageUrl: string): 'full' | 'thumbnail' {
  if (!imageUrl) return 'thumbnail';
  // Thumbnails do Grimoire são JPEG com dimensão máxima de 180x180 geradas pelo createThumbnail
  // Se for data URL muito curta (< 12KB) ou identificada como thumb
  if (imageUrl.length < 16384 && imageUrl.startsWith('data:image/jpeg')) {
    return 'thumbnail';
  }
  return 'full';
}

/**
 * Exporta a biblioteca do escopo solicitado em formato JSON versionado.
 * Não altera registros, não faz chamadas de rede e preserva imagens completas locais.
 */
export async function exportLibraryBackup(ownerId: string | null = captureDnaOperationContext().ownerId): Promise<GrimoireBackupFile> {
  const records = await getLocalDNA(ownerId);
  const tombstones = await getDnaTombstones(ownerId);

  let calibratedCount = 0;
  let legacyCount = 0;
  let thumbnailCount = 0;
  let fullImageCount = 0;

  const backupRecords: GrimoireBackupRecord[] = records.map(rec => {
    const isCalib = Boolean(rec.isCalibrated);
    if (isCalib) calibratedCount++;
    else legacyCount++;

    const imgType = classifyImageType(rec.imageUrl);
    if (imgType === 'thumbnail') thumbnailCount++;
    else fullImageCount++;

    return {
      id: rec.id,
      name: rec.name,
      imageUrl: rec.imageUrl,
      imageType: imgType,
      summary: rec.summary,
      linework: rec.linework,
      rendering: rec.rendering,
      palette: rec.palette,
      silhouette: rec.silhouette,
      pose: rec.pose,
      framing: rec.framing,
      composition: rec.composition,
      lighting: rec.lighting,
      effects: rec.effects,
      materials: rec.materials,
      details: rec.details,
      background: rec.background,
      hierarchy: rec.hierarchy,
      positivePrompt: rec.positivePrompt,
      negativePrompt: rec.negativePrompt,
      tags: rec.tags ? [...rec.tags] : [],
      scores: rec.scores ? { ...rec.scores } : {},
      profile: (rec as any).profile ? structuredClone((rec as any).profile) : undefined,
      subjectProfile: rec.subjectProfile ? structuredClone(rec.subjectProfile) : undefined,
      scoreJustifications: rec.scoreJustifications ? structuredClone(rec.scoreJustifications) : undefined,
      isCalibrated: rec.isCalibrated,
      calibrationVersion: rec.calibrationVersion,
      analysisStatus: rec.analysisStatus,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      revision: rec.revision,
      imageFingerprint: rec.imageFingerprint,
    };
  });

  const backupTombstones: GrimoireBackupTombstone[] = tombstones.map(t => ({
    id: t.id,
    deletedAt: t.deletedAt,
  }));

  const backupFile: GrimoireBackupFile = {
    format: GRIMOIRE_BACKUP_FORMAT,
    version: GRIMOIRE_BACKUP_VERSION,
    exportedAt: Date.now(),
    libraryScope: {
      ownerId,
      isLegacy: ownerId === null,
      description: ownerId === null ? 'Biblioteca Legada (Sem conta vinculada)' : `Biblioteca Pessoal (${ownerId})`,
    },
    records: backupRecords,
    tombstones: backupTombstones.length > 0 ? backupTombstones : undefined,
    summary: {
      totalRecords: backupRecords.length,
      calibratedCount,
      legacyCount,
      thumbnailCount,
      fullImageCount,
    },
  };

  return backupFile;
}

/**
 * Valida o arquivo completo e prepara a prévia de restauração com comparação
 * de novos registros, conflitos, idênticos e exclusões prévias.
 */
export async function validateAndPreviewBackup(
  jsonText: string,
  targetOwnerId: string | null = captureDnaOperationContext().ownerId
): Promise<BackupPreviewResult> {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      valid: false,
      error: 'Arquivo inválido: JSON corrompido ou malformado.',
      targetOwnerId,
      newRecords: [],
      identicalRecords: [],
      conflicts: [],
      deletedConflicts: [],
      summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      error: 'Estrutura de arquivo inválida: o conteúdo não é um objeto JSON.',
      targetOwnerId,
      newRecords: [],
      identicalRecords: [],
      conflicts: [],
      deletedConflicts: [],
      summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
    };
  }

  if (parsed.format !== GRIMOIRE_BACKUP_FORMAT) {
    return {
      valid: false,
      error: `Formato de backup não reconhecido: "${parsed.format}". Esperado "${GRIMOIRE_BACKUP_FORMAT}".`,
      targetOwnerId,
      newRecords: [],
      identicalRecords: [],
      conflicts: [],
      deletedConflicts: [],
      summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
    };
  }

  if (parsed.version !== GRIMOIRE_BACKUP_VERSION) {
    return {
      valid: false,
      error: `Versão de backup não suportada: ${parsed.version}. Esta versão do Grimoire suporta a versão ${GRIMOIRE_BACKUP_VERSION}.`,
      targetOwnerId,
      newRecords: [],
      identicalRecords: [],
      conflicts: [],
      deletedConflicts: [],
      summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
    };
  }

  if (!Array.isArray(parsed.records)) {
    return {
      valid: false,
      error: 'O arquivo de backup não contém uma lista válida de referências ("records").',
      targetOwnerId,
      newRecords: [],
      identicalRecords: [],
      conflicts: [],
      deletedConflicts: [],
      summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
    };
  }

  // Validação de registros individuais e detecção de IDs duplicados no próprio arquivo
  const seenIds = new Set<string>();
  const incomingRecords: VisualDNA[] = [];

  for (let i = 0; i < parsed.records.length; i++) {
    const r = parsed.records[i];
    if (!r || typeof r !== 'object') {
      return {
        valid: false,
        error: `Registro no índice ${i} está malformado.`,
        targetOwnerId,
        newRecords: [],
        identicalRecords: [],
        conflicts: [],
        deletedConflicts: [],
        summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
      };
    }
    if (!r.id || typeof r.id !== 'string') {
      return {
        valid: false,
        error: `Registro no índice ${i} não possui um "id" textual válido.`,
        targetOwnerId,
        newRecords: [],
        identicalRecords: [],
        conflicts: [],
        deletedConflicts: [],
        summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
      };
    }
    if (seenIds.has(r.id)) {
      return {
        valid: false,
        error: `O arquivo de backup contém ID duplicado: "${r.id}". Arquivo inconsistente.`,
        targetOwnerId,
        newRecords: [],
        identicalRecords: [],
        conflicts: [],
        deletedConflicts: [],
        summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
      };
    }
    seenIds.add(r.id);

    if (!r.name || typeof r.name !== 'string') {
      return {
        valid: false,
        error: `O registro "${r.id}" não possui um nome válido.`,
        targetOwnerId,
        newRecords: [],
        identicalRecords: [],
        conflicts: [],
        deletedConflicts: [],
        summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
      };
    }
    if (!r.imageUrl || typeof r.imageUrl !== 'string') {
      return {
        valid: false,
        error: `O registro "${r.name}" (${r.id}) não possui imagem válida.`,
        targetOwnerId,
        newRecords: [],
        identicalRecords: [],
        conflicts: [],
        deletedConflicts: [],
        summary: { totalIncoming: 0, newCount: 0, identicalCount: 0, conflictCount: 0, deletedConflictCount: 0 },
      };
    }

    incomingRecords.push({
      ...r,
      ownerId: targetOwnerId, // Associa ao escopo de destino após a confirmação
    });
  }

  // Verificação de escopo (origem vs destino)
  const backupOwnerId = parsed.libraryScope?.ownerId ?? null;
  const isLegacyBackup = parsed.libraryScope?.isLegacy ?? (backupOwnerId === null);
  let scopeMismatch = false;
  let scopeMismatchWarning: string | undefined;

  if (targetOwnerId === null && !isLegacyBackup) {
    scopeMismatch = true;
    scopeMismatchWarning = `Este backup pertence a uma conta de usuário (${backupOwnerId}), mas você está atualmente no acervo local desconectado.`;
  } else if (targetOwnerId !== null && backupOwnerId !== null && backupOwnerId !== targetOwnerId) {
    scopeMismatch = true;
    scopeMismatchWarning = `Este backup pertence à conta "${backupOwnerId}", mas você está conectado como "${targetOwnerId}". Backups de outras contas não são misturados automaticamente.`;
  }

  // Carrega estado local atual para categorizar registros
  const currentRecords = await getLocalDNA(targetOwnerId);
  const currentTombstones = await getDnaTombstones(targetOwnerId);

  const currentMap = new Map<string, VisualDNA>();
  for (const item of currentRecords) {
    currentMap.set(item.id, item);
  }

  const tombstoneMap = new Map<string, DnaTombstone>();
  for (const t of currentTombstones) {
    tombstoneMap.set(t.id, t);
  }

  const newRecords: VisualDNA[] = [];
  const identicalRecords: VisualDNA[] = [];
  const conflicts: ConflictItem[] = [];
  const deletedConflicts: DeletedConflictItem[] = [];

  for (const inc of incomingRecords) {
    const existing = currentMap.get(inc.id);
    const tombstone = tombstoneMap.get(inc.id);

    if (tombstone && !existing) {
      // Registro foi explicitamente excluído anteriormente pelo usuário
      deletedConflicts.push({
        id: inc.id,
        name: inc.name,
        incoming: inc,
        deletedAt: tombstone.deletedAt,
        resolution: 'keep_deleted',
      });
    } else if (existing) {
      // Registro já existe: compara conteúdo canônico
      if (areRecordsSubstantivelyEqual(existing, inc)) {
        identicalRecords.push(inc);
      } else {
        conflicts.push({
          id: inc.id,
          name: inc.name,
          current: existing,
          incoming: inc,
          resolution: 'keep_current',
        });
      }
    } else {
      // Registro novo
      newRecords.push(inc);
    }
  }

  return {
    valid: true,
    fileScope: {
      ownerId: backupOwnerId,
      isLegacy: isLegacyBackup,
      description: parsed.libraryScope?.description || (isLegacyBackup ? 'Biblioteca Legada' : 'Biblioteca Pessoal'),
      exportedAt: parsed.exportedAt || 0,
    },
    targetOwnerId,
    scopeMismatch,
    scopeMismatchWarning,
    newRecords,
    identicalRecords,
    conflicts,
    deletedConflicts,
    summary: {
      totalIncoming: incomingRecords.length,
      newCount: newRecords.length,
      identicalCount: identicalRecords.length,
      conflictCount: conflicts.length,
      deletedConflictCount: deletedConflicts.length,
    },
  };
}

function areRecordsSubstantivelyEqual(a: VisualDNA, b: VisualDNA): boolean {
  // Compara campos de dados essenciais sem falsos positivos de timestamps
  const fieldsA = {
    name: a.name,
    imageUrl: a.imageUrl,
    summary: a.summary,
    linework: a.linework,
    rendering: a.rendering,
    palette: a.palette,
    silhouette: a.silhouette,
    pose: a.pose,
    framing: a.framing,
    composition: a.composition,
    lighting: a.lighting,
    effects: a.effects,
    materials: a.materials,
    details: a.details,
    background: a.background,
    hierarchy: a.hierarchy,
    tags: a.tags,
    scores: a.scores,
    positivePrompt: a.positivePrompt,
    negativePrompt: a.negativePrompt,
    profile: (a as any).profile,
    subjectProfile: a.subjectProfile,
    scoreJustifications: a.scoreJustifications,
  };

  const fieldsB = {
    name: b.name,
    imageUrl: b.imageUrl,
    summary: b.summary,
    linework: b.linework,
    rendering: b.rendering,
    palette: b.palette,
    silhouette: b.silhouette,
    pose: b.pose,
    framing: b.framing,
    composition: b.composition,
    lighting: b.lighting,
    effects: b.effects,
    materials: b.materials,
    details: b.details,
    background: b.background,
    hierarchy: b.hierarchy,
    tags: b.tags,
    scores: b.scores,
    positivePrompt: b.positivePrompt,
    negativePrompt: b.negativePrompt,
    profile: (b as any).profile,
    subjectProfile: b.subjectProfile,
    scoreJustifications: b.scoreJustifications,
  };

  return JSON.stringify(canonicalizeValue(fieldsA)) === JSON.stringify(canonicalizeValue(fieldsB));
}

/**
 * Aplica o plano de restauração validado e explicitamente confirmado pelo usuário.
 * Operação 100% LOCAL: usa saveLocalDNA, sem chamadas ao Gemini ou Firestore.
 */
export async function applyBackupRestoration(plan: BackupApplyPlan): Promise<BackupApplyResult> {
  const currentContext = captureDnaOperationContext();
  if (currentContext.ownerId !== plan.targetOwnerId) {
    return {
      success: false,
      appliedCount: 0,
      addedCount: 0,
      replacedCount: 0,
      restoredCount: 0,
      skippedCount: 0,
      error: 'A conta ativa mudou durante a confirmação da restauração. Operação cancelada.',
    };
  }

  let addedCount = 0;
  let replacedCount = 0;
  let restoredCount = 0;
  let skippedCount = 0;

  try {
    assertDnaOperationContext({ ownerId: plan.targetOwnerId });

    // 1. Gravar registros novos
    for (const record of plan.newRecords) {
      assertDnaOperationContext({ ownerId: plan.targetOwnerId });
      const toSave: VisualDNA = {
        ...record,
        ownerId: plan.targetOwnerId,
        updatedAt: Date.now(),
      };
      await saveLocalDNA(toSave, plan.targetOwnerId, null, false);
      addedCount++;
    }

    // 2. Gravar conflitos explicitamente escolhidos para substituição
    for (const conflict of plan.conflictsToReplace) {
      assertDnaOperationContext({ ownerId: plan.targetOwnerId });
      const toSave: VisualDNA = {
        ...conflict.replacement,
        ownerId: plan.targetOwnerId,
        updatedAt: Date.now(),
        revision: (conflict.current.revision ?? 1) + 1,
      };
      await saveLocalDNA(toSave, plan.targetOwnerId, conflict.current, false);
      replacedCount++;
    }

    // 3. Restaurar registros explicitamente ressuscitados (anteriormente excluídos)
    for (const deletedRecord of plan.deletedToRestore) {
      assertDnaOperationContext({ ownerId: plan.targetOwnerId });
      const toSave: VisualDNA = {
        ...deletedRecord,
        ownerId: plan.targetOwnerId,
        updatedAt: Date.now(),
      };
      // allowRestore = true para remover a tombstone
      await saveLocalDNA(toSave, plan.targetOwnerId, null, true);
      restoredCount++;
    }

    notifyDnaChanges();

    return {
      success: true,
      appliedCount: addedCount + replacedCount + restoredCount,
      addedCount,
      replacedCount,
      restoredCount,
      skippedCount,
    };
  } catch (err: any) {
    return {
      success: false,
      appliedCount: addedCount + replacedCount + restoredCount,
      addedCount,
      replacedCount,
      restoredCount,
      skippedCount,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
