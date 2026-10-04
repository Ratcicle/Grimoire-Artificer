import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createIndexedDbMock, flushPromises } from './storageTestUtils';
import { 
  exportLibraryBackup, 
  validateAndPreviewBackup, 
  applyBackupRestoration,
  GRIMOIRE_BACKUP_FORMAT,
  GRIMOIRE_BACKUP_VERSION
} from './backupService';
import { saveLocalDNA, getLocalDNA, deleteLocalDNA, getDnaTombstones, closeLocalDatabase } from './localDbService';
import { setDnaOwnerProvider } from './dnaAccountContext';
import type { VisualDNA } from '../types';

let memory: ReturnType<typeof createIndexedDbMock>;

const sampleDna1: VisualDNA = {
  id: 'ref-1',
  name: 'Arcane Archmage',
  imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
  summary: 'A luminous sorcerer hovering in crystalline chamber',
  linework: 'Crisp and decisive contour lines',
  rendering: 'Luminous cel shading with ambient glow',
  palette: 'Deep sapphire, gold filigree, arcane violet',
  silhouette: 'Floating triangle form with billowing robe',
  pose: 'Levitating with outstretched casting hands',
  framing: 'Close full-body vertical composition',
  composition: 'Golden spiral centered on glowing staff',
  lighting: 'High dynamic range magical luminescence',
  effects: 'Particle dispersion and energy runes',
  materials: 'Silk fabrics, polished brass, glowing quartz',
  details: 'Ornate geometric embroideries',
  background: 'Ancient celestial observatory',
  hierarchy: 'Casting hands first, then staff crystal, then arcane aura',
  positivePrompt: 'masterpiece, arcane sorcerer, intricate celestial background',
  negativePrompt: 'blurry, distorted hands, modern elements',
  tags: ['High Contrast Lighting', 'Crisp Line Quality', 'Ethereal Magic'],
  scores: { style: 0.92, lighting: 0.88 },
  isCalibrated: true,
  calibrationVersion: 3,
  analysisStatus: 'complete',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  revision: 1
};

const sampleDnaLegacy: VisualDNA = {
  id: 'ref-legacy',
  name: 'Old Knight Memory',
  imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
  summary: 'Legacy knight sketch',
  linework: 'Rough sketch lines',
  tags: ['Classic High Fantasy'],
  scores: { style: 0.5 },
  isCalibrated: false,
  createdAt: 1690000000000,
  updatedAt: 1690000000000,
  revision: 1
} as unknown as VisualDNA;

describe('Backup and Restoration Service', () => {
  beforeEach(() => {
    closeLocalDatabase();
    memory = createIndexedDbMock();
    vi.stubGlobal('indexedDB', memory.indexedDB);
    setDnaOwnerProvider(() => null);
  });

  afterEach(() => {
    closeLocalDatabase();
    vi.unstubAllGlobals();
    setDnaOwnerProvider(() => null);
  });

  it('1. exportar e restaurar preserva conteúdo analítico e imagens', async () => {
    setDnaOwnerProvider(() => 'user-123');
    await saveLocalDNA(sampleDna1, 'user-123', null, false);

    const backup = await exportLibraryBackup('user-123');
    expect(backup.format).toBe(GRIMOIRE_BACKUP_FORMAT);
    expect(backup.version).toBe(GRIMOIRE_BACKUP_VERSION);
    expect(backup.records).toHaveLength(1);
    expect(backup.records[0].name).toBe('Arcane Archmage');
    expect(backup.records[0].linework).toBe('Crisp and decisive contour lines');
    expect(backup.records[0].imageUrl).toBe(sampleDna1.imageUrl);
    expect(backup.records[0].isCalibrated).toBe(true);

    // Limpa IndexedDB para testar restauração limpa
    closeLocalDatabase();
    memory = createIndexedDbMock();
    vi.stubGlobal('indexedDB', memory.indexedDB);

    const jsonText = JSON.stringify(backup);
    const preview = await validateAndPreviewBackup(jsonText, 'user-123');
    expect(preview.valid).toBe(true);
    expect(preview.newRecords).toHaveLength(1);

    const applyResult = await applyBackupRestoration(preview);

    expect(applyResult.success).toBe(true);
    expect(applyResult.appliedCount).toBe(1);

    const restoredList = await getLocalDNA('user-123');
    expect(restoredList).toHaveLength(1);
    expect(restoredList[0].name).toBe('Arcane Archmage');
    expect(restoredList[0].linework).toBe('Crisp and decisive contour lines');
    expect(restoredList[0].isCalibrated).toBe(true);
  });

  it('2. registros legados e calibrados mantêm sua procedência', async () => {
    setDnaOwnerProvider(() => null);
    await saveLocalDNA(sampleDna1, null, null, false);
    await saveLocalDNA(sampleDnaLegacy, null, null, false);

    const backup = await exportLibraryBackup(null);
    expect(backup.summary.calibratedCount).toBe(1);
    expect(backup.summary.legacyCount).toBe(1);

    const calibRec = backup.records.find(r => r.id === 'ref-1');
    const legacyRec = backup.records.find(r => r.id === 'ref-legacy');

    expect(calibRec?.isCalibrated).toBe(true);
    expect(legacyRec?.isCalibrated).toBe(false);
  });

  it('3. biblioteca vazia produz backup válido sem erros', async () => {
    setDnaOwnerProvider(() => 'empty-account');
    const backup = await exportLibraryBackup('empty-account');
    expect(backup.records).toHaveLength(0);
    expect(backup.summary.totalRecords).toBe(0);

    const jsonText = JSON.stringify(backup);
    const preview = await validateAndPreviewBackup(jsonText, 'empty-account');
    expect(preview.valid).toBe(true);
    expect(preview.summary.totalIncoming).toBe(0);
    expect(preview.newRecords).toHaveLength(0);
  });

  it('4. arquivo malformado, versão desconhecida e IDs duplicados são rejeitados', async () => {
    // Malformado (JSON corrompido)
    const previewCorrupted = await validateAndPreviewBackup('{ invalid json', null);
    expect(previewCorrupted.valid).toBe(false);
    expect(previewCorrupted.error).toMatch(/corrompido|malformado/i);

    // Versão desconhecida
    const badVersion = {
      format: GRIMOIRE_BACKUP_FORMAT,
      version: 999,
      libraryScope: { ownerId: null, isLegacy: true, description: '' },
      records: []
    };
    const previewBadVersion = await validateAndPreviewBackup(JSON.stringify(badVersion), null);
    expect(previewBadVersion.valid).toBe(false);
    expect(previewBadVersion.error).toMatch(/versão.*não suportada/i);

    // Formato incorreto
    const badFormat = { format: 'unknown-format', version: 1, records: [] };
    const previewBadFormat = await validateAndPreviewBackup(JSON.stringify(badFormat), null);
    expect(previewBadFormat.valid).toBe(false);
    expect(previewBadFormat.error).toMatch(/formato.*não reconhecido/i);

    // IDs duplicados dentro do próprio backup
    const duplicateIds = {
      format: GRIMOIRE_BACKUP_FORMAT,
      version: 1,
      libraryScope: { ownerId: null, isLegacy: true, description: '' },
      records: [
        { id: 'dup-1', name: 'First', imageUrl: 'data:image/png;base64,1' },
        { id: 'dup-1', name: 'Second Duplicate', imageUrl: 'data:image/png;base64,2' }
      ]
    };
    const previewDuplicate = await validateAndPreviewBackup(JSON.stringify(duplicateIds), null);
    expect(previewDuplicate.valid).toBe(false);
    expect(previewDuplicate.error).toMatch(/ID duplicado/i);
  });

  it('5. conflito com referência existente: mantém atual por padrão e substitui com escolha explícita', async () => {
    setDnaOwnerProvider(() => 'user-A');
    await saveLocalDNA(sampleDna1, 'user-A', null, false);

    const conflictingBackupRecord: VisualDNA = {
      ...sampleDna1,
      name: 'Arcane Archmage (Backup Version)',
      summary: 'Different summary from backup'
    };

    const backupFile = {
      format: GRIMOIRE_BACKUP_FORMAT,
      version: 1,
      exportedAt: Date.now(),
      libraryScope: { ownerId: 'user-A', isLegacy: false, description: '' },
      records: [conflictingBackupRecord]
    };

    const preview = await validateAndPreviewBackup(JSON.stringify(backupFile), 'user-A');
    expect(preview.valid).toBe(true);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0].resolution).toBe('keep_current');

    // Cenário A: Mantém o atual (nenhum replace enviado)
    expect((await applyBackupRestoration(preview)).success).toBe(true);

    const currentRecords = await getLocalDNA('user-A');
    expect(currentRecords[0].name).toBe('Arcane Archmage');

    // Cenário B: Escolha explícita de substituir
    const replacementPreview = await validateAndPreviewBackup(JSON.stringify(backupFile), 'user-A');
    replacementPreview.conflicts[0].resolution = 'replace';
    expect((await applyBackupRestoration(replacementPreview)).success).toBe(true);

    const updatedRecords = await getLocalDNA('user-A');
    expect(updatedRecords[0].name).toBe('Arcane Archmage (Backup Version)');
  });

  it('6. restauração explícita de item anteriormente excluído (tombstone)', async () => {
    setDnaOwnerProvider(() => 'user-A');
    await saveLocalDNA(sampleDna1, 'user-A', null, false);
    // Exclui a referência, gerando tombstone
    await deleteLocalDNA('ref-1', 'user-A');

    const tombstones = await getDnaTombstones('user-A');
    expect(tombstones).toHaveLength(1);

    const backupFile = {
      format: GRIMOIRE_BACKUP_FORMAT,
      version: 1,
      exportedAt: Date.now(),
      libraryScope: { ownerId: 'user-A', isLegacy: false, description: '' },
      records: [sampleDna1]
    };

    const preview = await validateAndPreviewBackup(JSON.stringify(backupFile), 'user-A');
    expect(preview.valid).toBe(true);
    // Identificado como excluído
    expect(preview.deletedConflicts).toHaveLength(1);
    expect(preview.deletedConflicts[0].resolution).toBe('keep_deleted');

    // Sem escolha explícita, o item NÃO é ressuscitado
    expect((await applyBackupRestoration(preview)).success).toBe(true);

    const afterIgnored = await getLocalDNA('user-A');
    expect(afterIgnored).toHaveLength(0);

    // Com escolha explícita, ressuscita e limpa a tombstone
    const restorationPreview = await validateAndPreviewBackup(JSON.stringify(backupFile), 'user-A');
    restorationPreview.deletedConflicts[0].resolution = 'restore';
    expect((await applyBackupRestoration(restorationPreview)).success).toBe(true);

    const afterRestored = await getLocalDNA('user-A');
    expect(afterRestored).toHaveLength(1);
    expect(afterRestored[0].id).toBe('ref-1');
  });

  it('7. tentativa de misturar contas gera alerta de escopo', async () => {
    setDnaOwnerProvider(() => 'user-Bob');
    const backupFile = {
      format: GRIMOIRE_BACKUP_FORMAT,
      version: 1,
      exportedAt: Date.now(),
      libraryScope: { ownerId: 'user-Alice', isLegacy: false, description: '' },
      records: [sampleDna1]
    };

    // Tentativa de restaurar o backup de Alice estando logado como Bob
    const preview = await validateAndPreviewBackup(JSON.stringify(backupFile), 'user-Bob');
    expect(preview.valid).toBe(false);
    expect(preview.scopeMismatch).toBe(true);
    expect(preview.scopeMismatchWarning).toMatch(/Alice.*Bob/i);
    expect((await applyBackupRestoration(preview)).success).toBe(false);
    expect(await getLocalDNA('user-Bob')).toEqual([]);
  });

  it('8. reaplicação idêntica não gera escrita desnecessária', async () => {
    setDnaOwnerProvider(() => 'user-A');
    await saveLocalDNA(sampleDna1, 'user-A', null, false);

    const backupFile = {
      format: GRIMOIRE_BACKUP_FORMAT,
      version: 1,
      exportedAt: Date.now(),
      libraryScope: { ownerId: 'user-A', isLegacy: false, description: '' },
      records: [sampleDna1]
    };

    const preview = await validateAndPreviewBackup(JSON.stringify(backupFile), 'user-A');
    expect(preview.valid).toBe(true);
    expect(preview.identicalRecords).toHaveLength(1);
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.newRecords).toHaveLength(0);
  });

  it('9. backup exportado não contém chaves, segredos nem dados transitórios', async () => {
    setDnaOwnerProvider(() => 'user-A');
    await saveLocalDNA(sampleDna1, 'user-A', null, false);
    const backup = await exportLibraryBackup('user-A');
    const jsonStr = JSON.stringify(backup);

    expect(jsonStr).not.toContain('API_KEY');
    expect(jsonStr).not.toContain('GEMINI_API_KEY');
    expect(jsonStr).not.toContain('secret');
    expect(jsonStr).not.toContain('token');
    expect(jsonStr).not.toContain('VisualDNAPatch');
  });
});
