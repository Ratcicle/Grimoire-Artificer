import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGeminiClient } from './geminiTransport';

beforeEach(() => {
  vi.stubGlobal('window', {});
});
afterEach(() => vi.unstubAllGlobals());

const request = { model: 'gemini-3.5-flash', contents: 'Mock request' };

it.each(['network', 'json'])('keeps an unknown attempt when the %s response fails', async failure => {
  const callback = vi.fn();
  const fetchMock = failure === 'network'
    ? vi.fn().mockRejectedValue(new Error('Connection lost'))
    : vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('Incomplete response'); } });
  vi.stubGlobal('fetch', fetchMock);
  await expect(createGeminiClient(callback).models.generateContent(request)).rejects.toThrow();
  expect(callback.mock.calls).toEqual([[]]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('withdraws the unknown attempt when the server confirms a preflight rejection', async () => {
  const callback = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false, status: 503,
    json: async () => ({ apiAttempted: false, error: 'Server credential missing' })
  }));
  await expect(createGeminiClient(callback).models.generateContent(request)).rejects.toThrow('Server credential missing');
  expect(callback.mock.calls).toEqual([[], [false]]);
});

it('does not count an accepted response as a second attempt', async () => {
  const callback = vi.fn();
  const response = { apiAttempted: true, usageMetadata: { totalTokenCount: 12 } };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
  expect(await createGeminiClient(callback).models.generateContent(request)).toEqual(response);
  expect(callback.mock.calls).toEqual([[]]);
});
