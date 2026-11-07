// Reference analysis through the official Anthropic SDK. The key is typed by the only user
// of this tool and stays in this browser: it never reaches the repository, the cloud or backups.
const CLAUDE_KEY_STORAGE = 'grimoire_claude_api_key';

export const getClaudeApiKey = (): string => localStorage.getItem(CLAUDE_KEY_STORAGE) ?? '';
export const setClaudeApiKey = (key: string): void => localStorage.setItem(CLAUDE_KEY_STORAGE, key.trim());
export const clearClaudeApiKey = (): void => localStorage.removeItem(CLAUDE_KEY_STORAGE);

/**
 * Adapts the shared analysis schema to Claude's structured outputs. Every field becomes required
 * because optional ones are capped per request, and `maxItems` is dropped because it is not
 * supported there. The normalizer applies the same list limits to every analysis afterwards.
 */
export function toClaudeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const { type, properties, items, required: _required, maxItems: _maxItems, ...rest } = schema;
  const adapted: any = { ...rest, type: String(type).toLowerCase() };
  if (items) adapted.items = toClaudeSchema(items);
  if (properties) {
    adapted.properties = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, toClaudeSchema(value)]));
    adapted.required = Object.keys(properties);
    adapted.additionalProperties = false;
  }
  return adapted;
}

export interface ClaudeAnalysisRequest {
  model: string;
  prompt: string;
  schema: unknown;
  imageBase64: string;
  mimeType: string;
  signal?: AbortSignal;
  onRequest?: (attempted?: boolean) => void;
}

const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ClaudeMediaType = typeof SUPPORTED_MEDIA_TYPES[number];

/** Same field names as Gemini's usage, so the Token Monitor reads both. Input includes cached tokens. */
function toUsageMetadata(usage: any) {
  const read = usage?.cache_read_input_tokens ?? 0;
  const written = usage?.cache_creation_input_tokens ?? 0;
  const input = (usage?.input_tokens ?? 0) + read + written;
  const output = usage?.output_tokens ?? 0;
  const thinking = usage?.output_tokens_details?.thinking_tokens ?? 0;
  return {
    promptTokenCount: input,
    candidatesTokenCount: output - thinking,
    thoughtsTokenCount: thinking,
    cachedContentTokenCount: read,
    totalTokenCount: input + output,
    cacheCreationTokenCount: written,
  };
}

export async function requestClaudeAnalysis(request: ClaudeAnalysisRequest) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new Error('Informe a chave da API do Claude.');
  const mediaType = request.mimeType as ClaudeMediaType;
  if (!SUPPORTED_MEDIA_TYPES.includes(mediaType)) throw new Error(`Formato de imagem não aceito pelo Claude: ${request.mimeType}.`);

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // The analysis queue owns waiting and retrying, so a limit is not retried twice.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 });
  request.onRequest?.();
  const response = await client.beta.messages.create({
    model: request.model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: toClaudeSchema(request.schema) },
    },
    // The prompt and schema repeat on every art, so they are cached ahead of the image.
    system: [{ type: 'text', text: request.prompt, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: request.imageBase64 } },
        { type: 'text', text: 'Analyze this image and return its Visual DNA.' },
      ],
    }],
  }, request.signal ? { signal: request.signal } : undefined).catch((error: any) => {
    // A timeout reaches the queue as a timeout, and an API error as what the API said, not its JSON.
    if (request.signal?.aborted) throw request.signal.reason;
    const said = error?.error?.error?.message;
    if (said) error.message = `${error.status} ${said}`;
    throw error;
  });

  const usageMetadata = toUsageMetadata(response.usage);
  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error(`O Claude recusou analisar esta imagem${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}.`), { usageMetadata });
  }
  if (response.stop_reason === 'max_tokens') {
    throw Object.assign(new Error('A resposta do Claude foi cortada pelo limite de tokens.'), { usageMetadata });
  }
  const text = response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('');
  return { text, usageMetadata, servedModel: response.model as string };
}
