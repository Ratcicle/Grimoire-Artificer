import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClaudeApiKey, getClaudeApiKey, requestClaudeAnalysis, setClaudeApiKey, toClaudeSchema } from './claudeAnalysis';
import { analyzeReferenceImage, VISUAL_DNA_RESPONSE_SCHEMA } from './geminiService';
import { classifyAnalysisFailure } from './analysisBatch';

const m = vi.hoisted(() => ({ create: vi.fn(), options: [] as any[], gemini: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { beta = { messages: { create: m.create } }; constructor(options: any) { m.options.push(options); } },
}));
vi.mock('./geminiTransport', () => ({
  createGeminiClient: () => ({ models: { generateContent: m.gemini } }),
  hasHostRuntimeCredential: () => false,
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
});

const analysis = { summary: 'A dragon', rendering: 'Crisp graphic shadow shapes', scores: { rendering: .7 }, subjectProfile: { primarySubject: 'dragon', subjectCategory: 'dragon', visualRole: 'protagonist' } };
const reply = (patch: any = {}) => ({
  model: 'claude-sonnet-5-5', stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(analysis) }],
  usage: { input_tokens: 540, cache_read_input_tokens: 8600, cache_creation_input_tokens: 0, output_tokens: 2600, output_tokens_details: { thinking_tokens: 300 } },
  ...patch,
});
const request = { model: 'claude-sonnet-5-5', prompt: 'THE PROMPT', schema: { type: 'OBJECT', properties: {} }, imageBase64: 'IMG', mimeType: 'image/jpeg' };

beforeEach(() => {
  vi.clearAllMocks();
  m.options.length = 0;
  store.clear();
  setClaudeApiKey(' sk-test-key ');
  m.create.mockResolvedValue(reply());
});

describe('toClaudeSchema', () => {
  const adapted = toClaudeSchema(VISUAL_DNA_RESPONSE_SCHEMA);
  const walk = (node: any, visit: (n: any) => void) => {
    if (!node || typeof node !== 'object') return;
    visit(node);
    if (node.items) walk(node.items, visit);
    for (const child of Object.values(node.properties ?? {})) walk(child, visit);
  };

  it('uses lowercase JSON types, keeps enums and drops unsupported constraints', () => {
    expect(adapted.type).toBe('object');
    walk(adapted, node => {
      expect(node.type).toBe(String(node.type).toLowerCase());
      expect(node).not.toHaveProperty('maxItems');
    });
    expect(adapted.properties.archetypeAffinity.items.enum).toContain('Royal Carmine');
  });

  it('leaves no optional field and closes every object, as the API requires', () => {
    let objects = 0;
    walk(adapted, node => {
      if (node.type !== 'object') return;
      objects++;
      expect(node.additionalProperties).toBe(false);
      expect([...node.required].sort()).toEqual(Object.keys(node.properties).sort());
    });
    expect(objects).toBeGreaterThan(5);
  });

  it('does not change the schema Gemini receives', () => {
    expect(VISUAL_DNA_RESPONSE_SCHEMA.type).not.toBe('object');
    expect(VISUAL_DNA_RESPONSE_SCHEMA.properties).not.toHaveProperty('additionalProperties');
  });
});

describe('requestClaudeAnalysis', () => {
  it('sends the image before the question and caches the prompt ahead of it', async () => {
    const started = vi.fn();
    await requestClaudeAnalysis({ ...request, onRequest: started });
    const body = m.create.mock.calls[0][0];
    expect(m.options[0]).toMatchObject({ apiKey: 'sk-test-key', dangerouslyAllowBrowser: true, maxRetries: 0 });
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.system).toEqual([{ type: 'text', text: 'THE PROMPT', cache_control: { type: 'ephemeral' } }]);
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'IMG' } });
    expect(body.messages[0].content[1].type).toBe('text');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.effort).toBe('medium');
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.fallbacks).toBe('default');
    expect(body.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(started).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain('sk-test-key');
  });

  it('reports usage in the fields the Token Monitor reads', async () => {
    const { text, usageMetadata, servedModel } = await requestClaudeAnalysis(request);
    expect(JSON.parse(text).summary).toBe('A dragon');
    expect(servedModel).toBe('claude-sonnet-5-5');
    expect(usageMetadata).toEqual({ promptTokenCount: 9140, candidatesTokenCount: 2300, thoughtsTokenCount: 300, cachedContentTokenCount: 8600, totalTokenCount: 11740, cacheCreationTokenCount: 0 });
  });

  it('counts tokens written to the cache as input', async () => {
    m.create.mockResolvedValue(reply({ usage: { input_tokens: 540, cache_read_input_tokens: 0, cache_creation_input_tokens: 8600, output_tokens: 100 } }));
    expect((await requestClaudeAnalysis(request)).usageMetadata).toMatchObject({ promptTokenCount: 9140, cachedContentTokenCount: 0, cacheCreationTokenCount: 8600, thoughtsTokenCount: 0 });
  });

  it('without a key it stops before any request and counts no attempt', async () => {
    clearClaudeApiKey();
    const started = vi.fn();
    await expect(requestClaudeAnalysis({ ...request, onRequest: started })).rejects.toThrow(/chave da API do Claude/);
    expect(m.create).not.toHaveBeenCalled();
    expect(started).not.toHaveBeenCalled();
  });

  it.each([
    [{ stop_reason: 'refusal', stop_details: { category: 'general_harms' } }, /recusou.*general_harms/],
    [{ stop_reason: 'max_tokens' }, /cortada/],
  ])('reports %j with the tokens it spent, without parsing', async (patch, message) => {
    m.create.mockResolvedValue(reply(patch));
    const error: any = await requestClaudeAnalysis(request).catch(e => e);
    expect(error.message).toMatch(message);
    expect(error.usageMetadata.totalTokenCount).toBe(11740);
    expect(classifyAnalysisFailure(error).kind).toBe('permanent');
  });

  it('reports what the API said instead of its raw JSON', async () => {
    const body = { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low.' } };
    m.create.mockRejectedValue(Object.assign(new Error(`400 ${JSON.stringify(body)}`), { status: 400, error: body }));
    const error: any = await requestClaudeAnalysis(request).catch(e => e);
    expect(error.message).toBe('400 Your credit balance is too low.');
    expect(error.status).toBe(400);
    expect(classifyAnalysisFailure(error).kind).toBe('quota_exhausted');
  });

  it('a timeout reaches the queue as a timeout, so it can be retried', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Timed out', 'TimeoutError'));
    m.create.mockRejectedValue(new Error('Request was aborted.'));
    const error = await requestClaudeAnalysis({ ...request, signal: controller.signal }).catch(e => e);
    expect(classifyAnalysisFailure(error).kind).toBe('transient');
  });

  it('rejects an image format the API does not take before calling it', async () => {
    await expect(requestClaudeAnalysis({ ...request, mimeType: 'image/bmp' })).rejects.toThrow(/Formato/);
    expect(m.create).not.toHaveBeenCalled();
  });

  it('keeps and removes the key', () => {
    expect(getClaudeApiKey()).toBe('sk-test-key');
    clearClaudeApiKey();
    expect(getClaudeApiKey()).toBe('');
  });
});

describe('analyzeReferenceImage with a Claude model', () => {
  it('goes to Claude, not Gemini, and validates through the same contract', async () => {
    const { data, usageMetadata, servedModel } = await analyzeReferenceImage('data:image/jpeg;base64,IMG', 'Art', 'claude-opus-5-5');
    expect(m.gemini).not.toHaveBeenCalled();
    expect(m.create.mock.calls[0][0].model).toBe('claude-opus-5-5');
    expect(m.create.mock.calls[0][0].system[0].text).toContain('TRANSFERABLE TECHNIQUE');
    expect(data).toMatchObject({ analysisVersion: 4, isCalibrated: true, calibrationVersion: 3 });
    expect(usageMetadata.totalTokenCount).toBe(11740);
    expect(servedModel).toBe('claude-sonnet-5-5');
    expect(m.create.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects invalid scores from Claude as it does from Gemini', async () => {
    m.create.mockResolvedValue(reply({ content: [{ type: 'text', text: JSON.stringify({ ...analysis, scores: { rendering: 85 } }) }] }));
    await expect(analyzeReferenceImage('data:image/jpeg;base64,IMG', 'Art', 'claude-sonnet-5-5')).rejects.toThrow(/score validation/);
  });

  it('a Gemini model never touches the Claude client', async () => {
    m.gemini.mockResolvedValue({ text: JSON.stringify(analysis), usageMetadata: {} });
    await analyzeReferenceImage('data:image/jpeg;base64,IMG', 'Art', 'gemini-4-argon');
    expect(m.create).not.toHaveBeenCalled();
    expect(m.gemini).toHaveBeenCalledTimes(1);
  });
});

describe('Claude API errors in the queue', () => {
  const headers = (value: string) => new Headers({ 'retry-after': value });
  it.each([
    [{ status: 429, message: '429 rate_limit_error', headers: headers('37') }, 'rate_limit', 37000],
    [{ status: 529, message: '529 overloaded_error' }, 'transient', undefined],
    [{ message: 'Connection error.' }, 'transient', undefined],
    [{ status: 400, message: '400 Your credit balance is too low to access the Anthropic API.' }, 'quota_exhausted', undefined],
    [{ status: 429, message: '429 You have reached your API usage limits' }, 'quota_exhausted', undefined],
    [{ status: 400, message: '400 You have reached your specified API usage limits' }, 'quota_exhausted', undefined],
    [{ status: 401, message: '401 invalid x-api-key' }, 'permanent', undefined],
    [{ status: 400, message: '400 Schema is too complex for compilation.' }, 'permanent', undefined],
  ])('%j', (error, kind, retryAfterMs) => {
    const failure = classifyAnalysisFailure(error);
    expect(failure.kind).toBe(kind);
    if (retryAfterMs) expect(failure.retryAfterMs).toBe(retryAfterMs);
  });
});
