import { describe, expect, it, vi } from 'vitest';
import { classifyAnalysisFailure, runAnalysisBatch, type BatchItemResult } from './analysisBatch';

const clock = () => {
  let time = 0;
  return { now: () => time, sleep: async (ms: number) => { time += ms; } };
};
const ids = (count: number) => Array.from({ length: count }, (_, index) => `art-${index}`);
const fail = (kind: 'quota_exhausted' | 'rate_limit' | 'transient' | 'permanent', retryAfterMs?: number): BatchItemResult =>
  ({ status: 'failed', kind, error: kind, retryAfterMs });

describe('classifyAnalysisFailure', () => {
  it.each([
    [{ status: 429, message: 'Resource exhausted' }, 'rate_limit'],
    [{ message: '429 RESOURCE_EXHAUSTED' }, 'rate_limit'],
    [{ status: 429, message: 'GenerateRequestsPerDayPerProjectPerModel exceeded' }, 'quota_exhausted'],
    [{ status: 429, message: 'Your prepayment credits are depleted' }, 'quota_exhausted'],
    [{ status: 503, message: 'The model is overloaded' }, 'transient'],
    [{ status: 409, message: 'A Gemini operation is already running.' }, 'transient'],
    [{ name: 'TimeoutError', message: 'signal timed out' }, 'transient'],
    [{ message: 'Failed to fetch' }, 'transient'],
    [{ status: 400, message: 'schema too complex' }, 'permanent'],
    [{ message: 'Visual DNA score validation failed' }, 'permanent'],
    // "generate" contains "rate" and must not read as a rate limit.
    [{ message: 'Failed to generate a valid analysis' }, 'permanent'],
  ])('%j is %s', (error, kind) => {
    expect(classifyAnalysisFailure(error).kind).toBe(kind);
  });

  it('reads the wait the provider asks for', () => {
    expect(classifyAnalysisFailure({ status: 429, message: 'Please retry in 23.4s.' }).retryAfterMs).toBe(23400);
    expect(classifyAnalysisFailure({ status: 429, message: '"retryDelay": "41s"' }).retryAfterMs).toBe(41000);
  });
});

describe('runAnalysisBatch', () => {
  it('analyzes every item once and never exceeds the concurrency', async () => {
    let running = 0, peak = 0;
    const analyze = vi.fn(async (): Promise<BatchItemResult> => {
      peak = Math.max(peak, ++running);
      await new Promise(resolve => setTimeout(resolve, 1));
      running--;
      return { status: 'done' };
    });
    const summary = await runAnalysisBatch({ ids: ids(20), concurrency: 3, analyze, shouldStop: () => false });
    expect(summary).toMatchObject({ reason: 'finished', completed: 20, failed: 0 });
    expect(analyze).toHaveBeenCalledTimes(20);
    expect(peak).toBe(3);
  });

  it('stops launching new items when asked, without losing the rest', async () => {
    let stop = false;
    const analyze = vi.fn(async (): Promise<BatchItemResult> => { stop = true; return { status: 'done' }; });
    const summary = await runAnalysisBatch({ ids: ids(10), concurrency: 1, analyze, shouldStop: () => stop });
    expect(summary).toMatchObject({ reason: 'stopped', completed: 1 });
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('waits after a rate limit, retries the same item and honors the provider hint', async () => {
    const time = clock();
    const analyze = vi.fn<(id: string) => Promise<BatchItemResult>>().mockResolvedValueOnce(fail('rate_limit', 90_000)).mockResolvedValue({ status: 'done' });
    const onWaiting = vi.fn();
    const summary = await runAnalysisBatch({ ids: ['a'], concurrency: 1, analyze, shouldStop: () => false, onWaiting, ...time });
    expect(summary).toMatchObject({ reason: 'finished', completed: 1, failed: 0 });
    expect(analyze.mock.calls.map(call => call[0])).toEqual(['a', 'a']);
    expect(onWaiting).toHaveBeenCalledWith(90_000, 'rate_limit');
    expect(time.now()).toBeGreaterThanOrEqual(90_000);
  });

  it('gives up after repeated rate limits and keeps the item pending', async () => {
    const analyze = vi.fn(async () => fail('rate_limit'));
    const summary = await runAnalysisBatch({ ids: ids(3), concurrency: 1, analyze, shouldStop: () => false, maxRateLimitWaits: 2, ...clock() });
    expect(summary).toMatchObject({ reason: 'rate_limit', completed: 0, failed: 0 });
    expect(analyze).toHaveBeenCalledTimes(3);
  });

  it('stops at once when the quota is gone, without attempting the rest', async () => {
    const analyze = vi.fn(async () => fail('quota_exhausted'));
    const summary = await runAnalysisBatch({ ids: ids(50), concurrency: 1, analyze, shouldStop: () => false, ...clock() });
    expect(summary.reason).toBe('quota_exhausted');
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures a limited number of times, then moves on', async () => {
    const analyze = vi.fn(async (id: string): Promise<BatchItemResult> => id === 'bad' ? fail('transient') : { status: 'done' });
    const summary = await runAnalysisBatch({ ids: ['bad', 'good'], concurrency: 1, analyze, shouldStop: () => false, maxTransientRetries: 2, ...clock() });
    expect(summary).toMatchObject({ reason: 'finished', completed: 1, failed: 1 });
    expect(analyze.mock.calls.filter(call => call[0] === 'bad')).toHaveLength(3);
  });

  it('never retries a failure that may have been billed', async () => {
    const analyze = vi.fn(async (id: string): Promise<BatchItemResult> => id === 'bad' ? fail('permanent') : { status: 'done' });
    const summary = await runAnalysisBatch({ ids: ['bad', 'good'], concurrency: 1, analyze, shouldStop: () => false });
    expect(summary).toMatchObject({ reason: 'finished', completed: 1, failed: 1, lastError: 'permanent' });
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it('stops after consecutive failures so a broken setup cannot burn the whole queue', async () => {
    const analyze = vi.fn(async () => fail('permanent'));
    const summary = await runAnalysisBatch({ ids: ids(1136), concurrency: 1, analyze, shouldStop: () => false, maxConsecutiveFailures: 5 });
    expect(summary.reason).toBe('too_many_failures');
    expect(analyze).toHaveBeenCalledTimes(5);
  });

  it('a success resets the consecutive failure count', async () => {
    const results: BatchItemResult[] = [fail('permanent'), fail('permanent'), { status: 'done' }, fail('permanent'), fail('permanent'), { status: 'done' }];
    const analyze = vi.fn(async () => results.shift()!);
    const summary = await runAnalysisBatch({ ids: ids(6), concurrency: 1, analyze, shouldStop: () => false, maxConsecutiveFailures: 3 });
    expect(summary).toMatchObject({ reason: 'finished', completed: 2, failed: 4 });
  });
});
