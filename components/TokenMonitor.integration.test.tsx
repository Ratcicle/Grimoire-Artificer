// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenUsageLog } from '../types';
import TokenMonitor from './TokenMonitor';

const storage = vi.hoisted(() => ({ getTokenLogs: vi.fn(), clearTokenLogs: vi.fn() }));
vi.mock('../services/localDbService', () => storage);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const log = (id: string, overrides: Partial<TokenUsageLog> = {}): TokenUsageLog => ({
  id, timestamp: 42, operationType: 'analyze_image', model: id, success: true, ...overrides
});
const load = async (logs: TokenUsageLog[]) => {
  storage.getTokenLogs.mockResolvedValue(logs);
  render(<TokenMonitor />);
  await screen.findByText(logs[0].model, { selector: 'td.text-stone-300' });
};
const card = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement!;
const historyRow = (model: string) => screen.getByText(model, { selector: 'td.text-stone-400' }).closest('tr')!;

describe('MON-01 rendered token monitor', () => {
  it('averages successful and failed attempts consistently in summary and batch session', async () => {
    await load([log('success', { totalTokenCount: 100, sessionId: 'batch' }),
      log('failure', { totalTokenCount: 100, success: false, sessionId: 'batch' })]);
    expect(within(card('Avg Tokens / Call')).getByText('100')).toBeTruthy();
    expect(screen.getByText(/100 avg \/ attempt/)).toBeTruthy();
    expect(within(card('Total Tokens')).getByText('200')).toBeTruthy();
  });

  it('distinguishes explicit zeros from absent counts and reports known-total coverage', async () => {
    await load([log('zero', { totalTokenCount: 0, promptTokenCount: 0, candidatesTokenCount: 0,
      thoughtsTokenCount: 0, cachedContentTokenCount: 0, toolUsePromptTokenCount: 0 }), log('unknown')]);
    const zeroCells = within(historyRow('zero')).getAllByRole('cell');
    expect(zeroCells.slice(3, 8).map(cell => cell.textContent)).toEqual(['0', '0', '0', '0', '0']);
    const unknownCells = within(historyRow('unknown')).getAllByRole('cell');
    expect(unknownCells.slice(3, 8).map(cell => cell.textContent)).toEqual(['-', '-', '-', '-', '-']);
    expect(card('Avg Tokens / Call').textContent).toContain('1 of 2 attempts reported totals');
    expect(within(card('Avg Tokens / Call')).getByText('0')).toBeTruthy();
  });

  it('uses reported totals and exposes raw metadata without double-counting cached prompt tokens', async () => {
    const rawUsageMetadata = { promptTokenCount: 100, cachedContentTokenCount: 80, candidatesTokenCount: 10, totalTokenCount: 110 };
    await load([log('cached-model', { ...rawUsageMetadata, rawUsageMetadata })]);
    expect(within(card('Total Tokens')).getByText('110')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Unaccounted' })).toBeNull();
    const details = within(historyRow('cached-model')).getByText('Details');
    expect(JSON.parse(details.getAttribute('title')!)).toEqual(rawUsageMetadata);
  });

  it('keeps an entirely unknown total unknown instead of summing reported components', async () => {
    await load([log('missing-total', { promptTokenCount: 100, candidatesTokenCount: 10 })]);
    expect(within(card('Total Tokens')).getByText('-')).toBeTruthy();
    expect(within(card('Avg Tokens / Call')).getByText('-')).toBeTruthy();
    expect(card('Avg Tokens / Call').textContent).toContain('0 of 1 attempts reported totals');
  });
});
