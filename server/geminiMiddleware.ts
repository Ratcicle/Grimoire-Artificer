import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GenerateContentParameters } from '@google/genai';

interface ServerGeminiOptions {
  configured: boolean;
  generate: (request: GenerateContentParameters) => Promise<any>;
}

/** Development-only, same-origin endpoint. Keys never leave the Node process. */
export function createGeminiMiddleware(options: ServerGeminiOptions) {
  let running = false;
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/gemini/')) return next();
    let apiAttempted = false;
    const respond = (status: number, data: object) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ...data, apiAttempted }));
    };

    // Prevent another website from spending the user's locally configured key.
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return respond(403, { error: 'Origin rejected.' });
      } catch {
        return respond(403, { error: 'Origin rejected.' });
      }
    }

    if (req.url === '/api/gemini/status' && req.method === 'GET') {
      return respond(200, { configured: options.configured });
    }

    if (req.url !== '/api/gemini/generate' || req.method !== 'POST') {
      return respond(404, { error: 'Not found.' });
    }

    if (!options.configured) {
      return respond(503, { error: 'GEMINI_API_KEY is not configured on the local server.' });
    }

    if (running) {
      return respond(409, { error: 'A Gemini operation is already running.' });
    }

    running = true;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 20 * 1024 * 1024) {
          return respond(413, { error: 'Request too large.' });
        }
      }

      const parsedBody = JSON.parse(body);
      const request = parsedBody as GenerateContentParameters & { accessMode?: string };
      const models = [
        'gemini-3-pro-image',
        'gemini-3.1-flash-image',
        'gemini-3.1-flash-lite-image',
        'gemini-3.5-flash',
        'gemini-3.1-pro-preview'
      ];

      if (!models.includes(request.model) || !request.contents || request.config?.httpOptions) {
        return respond(400, { error: 'Invalid Gemini request.' });
      }

      // Separação explícita de acesso: o modo padrão não pode consumir Pro/Flash silenciosamente
      const clientAccessMode = req.headers['x-grimoire-access-mode'] || request.accessMode;
      if (clientAccessMode === 'aistudio_default') {
        if (request.model === 'gemini-3-pro-image' || request.model === 'gemini-3.1-flash-image') {
          return respond(403, { error: 'O modelo Pro/Flash requer seleção explícita da chave pessoal no AI Studio.' });
        }
      }

      apiAttempted = true;
      const response = await options.generate(request);
      respond(200, { ...response, text: response.text });
    } catch (error: any) {
      const isQuota = /quota|rate|exhausted|429/i.test(error?.message || '');
      const status = error instanceof SyntaxError ? 400 : isQuota ? 429 : 502;
      const errorMsg = isQuota
        ? (error?.message || 'Cota de requisições excedida no provedor.')
        : 'Gemini operation failed. Check model availability and server configuration.';
      respond(status, {
        error: errorMsg,
        usageMetadata: error?.usageMetadata || error?.cause?.usageMetadata
      });
    } finally {
      running = false;
    }
  };
}
