import { TokenUsageLog } from '../types';

type TokenField = 'promptTokenCount' | 'candidatesTokenCount' | 'thoughtsTokenCount' | 'totalTokenCount';

export const formatTokenCount = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toLocaleString() : '-';

/** Missing provider counts are unknown; cached tokens are already part of prompt tokens.
 * https://ai.google.dev/api/generate-content#UsageMetadata
 */
export function summarizeTokens(logs: TokenUsageLog[], field: TokenField = 'totalTokenCount') {
  const known = logs.map(log => log[field]).filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const sum = known.length ? known.reduce((total, value) => total + value, 0) : undefined;
  return {
    knownCount: known.length,
    attemptCount: logs.length,
    sum,
    average: known.length ? Math.round(sum! / known.length) : undefined
  };
}
