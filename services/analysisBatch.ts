// Runs a long, paid analysis queue. No imports: every external effect is injected,
// so stop, retry and backoff decisions can be tested without a model or a browser.

export type AnalysisFailureKind = 'quota_exhausted' | 'rate_limit' | 'transient' | 'permanent';

export interface AnalysisFailure {
  kind: AnalysisFailureKind;
  retryAfterMs?: number;
}

const retryHint = (message: string): number | undefined => {
  const match = /retry(?:\s+in|Delay["':\s]+)\s*"?([\d.]+)\s*s/i.exec(message);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
};

/** Only failures the model did not bill are retried automatically. */
export function classifyAnalysisFailure(error: unknown): AnalysisFailure {
  const { status, name, message: rawMessage } = (error ?? {}) as { status?: unknown; name?: unknown; message?: unknown };
  const message = String(rawMessage ?? error ?? '');
  if (status === 429 || /\b429\b|resource.?exhausted|rate.?limit|too many requests|\bquota\b/i.test(message)) {
    // Waiting cannot recover a daily quota or an empty billing balance.
    if (/per.?day|daily|billing|prepa(?:y|id)|credits?\b/i.test(message)) return { kind: 'quota_exhausted' };
    return { kind: 'rate_limit', retryAfterMs: retryHint(message) };
  }
  if (name === 'AbortError' || name === 'TimeoutError') return { kind: 'transient' };
  if (status === 409 || (typeof status === 'number' && status >= 500)) return { kind: 'transient' };
  if (/\b50[0-4]\b|overloaded|unavailable|deadline|timed? ?out|failed to fetch|network|connection/i.test(message)) return { kind: 'transient' };
  return { kind: 'permanent' };
}

export type BatchItemResult =
  | { status: 'done' }
  | { status: 'skipped' }
  | { status: 'failed'; kind: AnalysisFailureKind; retryAfterMs?: number; error: string };

export type BatchEndReason = 'finished' | 'stopped' | 'quota_exhausted' | 'rate_limit' | 'too_many_failures';

export interface BatchSummary {
  reason: BatchEndReason;
  completed: number;
  failed: number;
  lastError?: string;
}

export interface BatchOptions {
  ids: string[];
  concurrency: number;
  analyze: (id: string) => Promise<BatchItemResult>;
  shouldStop: () => boolean;
  onWaiting?: (waitMs: number, reason: AnalysisFailureKind) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxConsecutiveFailures?: number;
  maxTransientRetries?: number;
  maxRateLimitWaits?: number;
}

const MAX_WAIT_MS = 5 * 60_000;
const TRANSIENT_WAIT_MS = 15_000;
const RATE_LIMIT_WAIT_MS = 30_000;
const STOP_POLL_MS = 500;

export async function runAnalysisBatch(options: BatchOptions): Promise<BatchSummary> {
  const {
    ids, analyze, shouldStop, onWaiting,
    sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
    now = Date.now, maxConsecutiveFailures = 5, maxTransientRetries = 2, maxRateLimitWaits = 6,
  } = options;
  const queue = [...ids];
  const transientAttempts = new Map<string, number>();
  let resumeAt = 0, consecutiveFailures = 0, rateLimitWaits = 0, completed = 0, failed = 0;
  let endReason: BatchEndReason | undefined;
  let lastError: string | undefined;

  const waitFor = (ms: number, kind: AnalysisFailureKind) => {
    const wait = Math.min(ms, MAX_WAIT_MS);
    // One shared gate: a limit hit by one worker applies to all of them.
    if (now() + wait > resumeAt) {
      resumeAt = now() + wait;
      onWaiting?.(wait, kind);
    }
  };
  const countFailure = (error: string) => {
    failed++;
    lastError = error;
    if (++consecutiveFailures >= maxConsecutiveFailures) endReason ??= 'too_many_failures';
  };

  const worker = async () => {
    while (!endReason) {
      if (shouldStop()) { endReason = 'stopped'; return; }
      const remaining = resumeAt - now();
      if (remaining > 0) { await sleep(Math.min(remaining, STOP_POLL_MS)); continue; }
      const id = queue.shift();
      if (id === undefined) return;
      const result = await analyze(id);
      if (result.status === 'skipped') continue;
      if (result.status === 'done') {
        completed++;
        consecutiveFailures = 0;
        rateLimitWaits = 0;
        continue;
      }
      lastError = result.error;
      if (result.kind === 'quota_exhausted') {
        queue.unshift(id);
        endReason = 'quota_exhausted';
      } else if (result.kind === 'rate_limit') {
        queue.unshift(id);
        if (++rateLimitWaits > maxRateLimitWaits) endReason = 'rate_limit';
        else waitFor(Math.max(result.retryAfterMs ?? 0, RATE_LIMIT_WAIT_MS * 2 ** (rateLimitWaits - 1)), 'rate_limit');
      } else if (result.kind === 'transient' && (transientAttempts.get(id) ?? 0) < maxTransientRetries) {
        const attempt = (transientAttempts.get(id) ?? 0) + 1;
        transientAttempts.set(id, attempt);
        queue.push(id);
        waitFor(TRANSIENT_WAIT_MS * attempt, 'transient');
      } else {
        countFailure(result.error);
      }
    }
  };

  const workers = Math.max(1, Math.min(options.concurrency, ids.length || 1));
  await Promise.all(Array.from({ length: workers }, worker));
  return { reason: endReason ?? 'finished', completed, failed, lastError };
}
