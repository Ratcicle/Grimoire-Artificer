import { CardGenerationRequest, TokenUsageLog, VisualDNA } from '../types';
import { generateCardArt, analyzeReferenceImage, extractUsageFromError, mapUsageMetadata } from './geminiService';
import { resolveAccessPolicy, validateModelAccess } from './accessPolicy';
import { getLocalDNA, saveTokenLog } from './localDbService';
import { saveDNA } from './cloudDnaService';
import { captureDnaOperationContext, assertDnaOperationContext, type DnaOperationContext } from './dnaAccountContext';
import { createVisualDNAFromAnalysis, mergeVisualDNASafe } from './visualDnaMerge';
import { canonicalizeValue } from './visualDnaSyncUtils';

// Session ownership survives component unmounts and covers queue/direct entry points.
const referenceLocks = new Set<string>();
let generationLocked = false;
export const isReferenceAnalyzing = (id: string) => referenceLocks.has(id);
export const isGenerationRunning = () => generationLocked;

async function recordUsage(log: TokenUsageLog) {
  try { await saveTokenLog(log); }
  catch { console.warn('Token usage could not be saved. The operation result is preserved.'); }
}
type Failed = { status: 'failed'; error: string };
type Busy = { status: 'busy' };

export async function runGeneration(request: CardGenerationRequest): Promise<Busy | Failed | {status:'done'; result: Awaited<ReturnType<typeof generateCardArt>>}> {
  if (generationLocked) return {status:'busy'};
  generationLocked = true;
  const start = Date.now();
  let called = false, success = false, usage: unknown, errorMessage: string | undefined;
  try {
    const policy = await resolveAccessPolicy();
    const accessCheck = validateModelAccess(policy.mode, request.model);
    if (!accessCheck.allowed) {
      throw new Error(accessCheck.reason || 'Modelo não permitido para a política de acesso atual.');
    }
    const lockedMode = policy.mode;
    const result = await generateCardArt(request, (attempted = true) => {called = attempted;}, lockedMode);
    usage = result.usageMetadata;
    success = true;
    return {status:'done', result};
  } catch (error) {
    usage = extractUsageFromError(error);
    errorMessage = error instanceof Error ? error.message : String(error);
    return {status:'failed',error:errorMessage};
  } finally {
    try {
      if (called) await recordUsage({id:crypto.randomUUID(),timestamp:Date.now(),operationType:'generate_image',model:request.model,
        ...mapUsageMetadata(usage),success,errorMessage,durationMs:Date.now()-start});
    } finally { generationLocked = false; }
  }
}

export interface ReferenceAnalysisRequest {
  id: string; name: string; imageUrl: string; model: string; reanalyze?: boolean; sessionId?: string; context?: DnaOperationContext;
}
export type ReferenceAnalysisOutcome = Busy | Failed | {status:'deleted'} | {status:'conflict'} | {status:'done';record:VisualDNA;changed:boolean};
export async function runReferenceAnalysis(request: ReferenceAnalysisRequest): Promise<ReferenceAnalysisOutcome> {
  if (referenceLocks.has(request.id)) return {status:'busy'};
  referenceLocks.add(request.id);
  const context = request.context ?? captureDnaOperationContext();
  const start = Date.now();
  let called = false, success = false, usage: unknown, errorMessage: string | undefined;
  let isReanalysis = !!request.reanalyze;
  try {
    assertDnaOperationContext(context);
    const list = await getLocalDNA(context.ownerId);
    assertDnaOperationContext(context);
    const existing = list.find(d => d.id === request.id);
    isReanalysis ||= !!existing;
    if (request.reanalyze && !existing) return {status:'deleted'};
    const snapshot: VisualDNA | null = existing ? structuredClone(existing) : null;
    let lockedMode: any;
    try {
      const policy = await resolveAccessPolicy();
      lockedMode = policy.mode;
    } catch {
      // ignore
    }
    const result = await analyzeReferenceImage(snapshot?.imageUrl || request.imageUrl, snapshot?.name || request.name, request.model, (attempted = true) => {called=attempted;}, lockedMode);
    usage = result.usageMetadata;
    assertDnaOperationContext(context);
    const current = (await getLocalDNA(context.ownerId)).find(d => d.id === request.id);
    assertDnaOperationContext(context);
    if (snapshot && !current) {errorMessage='Reference deleted during analysis';return {status:'deleted'};}
    if ((snapshot && JSON.stringify(canonicalizeValue(snapshot)) !== JSON.stringify(canonicalizeValue(current))) || (!snapshot && current)) {
      errorMessage='Reference changed during analysis';return {status:'conflict'};
    }
    const merged = snapshot
      ? mergeVisualDNASafe(current!, result.patch || result.data)
      : {data:createVisualDNAFromAnalysis({id:request.id,name:request.name,imageUrl:request.imageUrl}, result.data, result.patch),changed:true};
    const record = merged.changed ? await saveDNA(merged.data, {context,expected:snapshot}) : current!;
    assertDnaOperationContext(context);
    success = true;
    return {status:'done',record,changed:merged.changed};
  } catch (error) {
    usage ??= extractUsageFromError(error);
    errorMessage = error instanceof Error ? error.message : String(error);
    return {status:'failed',error:errorMessage};
  } finally {
    try {
      if(called) await recordUsage({id:crypto.randomUUID(),timestamp:Date.now(),operationType:request.sessionId?'analyze_all':isReanalysis?'reanalyze_image':'analyze_image',
        model:request.model,...mapUsageMetadata(usage),success,errorMessage,sessionId:request.sessionId,durationMs:Date.now()-start});
    } finally {referenceLocks.delete(request.id);}
  }
}
