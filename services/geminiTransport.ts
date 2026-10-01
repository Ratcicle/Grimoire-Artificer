import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from '@google/genai';

// AI Studio's host adapter remains distinct from ordinary local execution.
// No Vite build-time replacement of these environment expressions is allowed.
export function hasHostRuntimeCredential(): boolean {
  return typeof window !== 'undefined' && Boolean(window.aistudio) &&
    typeof process !== 'undefined' && Boolean(process.env?.API_KEY);
}

export function createGeminiClient(onRequest?: (attempted?: boolean) => void) {
  if (typeof window === 'undefined' || hasHostRuntimeCredential()) {
    const client = new GoogleGenAI({apiKey: typeof process !== 'undefined' ? process.env.API_KEY : undefined});
    return {models:{generateContent:(request: GenerateContentParameters) => {
      onRequest?.();
      return client.models.generateContent(request);
    }}};
  }
  return {models:{generateContent: async (request: GenerateContentParameters): Promise<GenerateContentResponse> => {
    const body = JSON.stringify(request);
    // A lost HTTP response cannot prove the server skipped the paid operation.
    // Keep one attempt with unknown usage unless the server confirms rejection.
    onRequest?.();
    const response = await fetch('/api/gemini/generate', {method:'POST',headers:{'Content-Type':'application/json'},body});
    const data = await response.json();
    if (data.apiAttempted === false) onRequest?.(false);
    if (!response.ok) throw Object.assign(new Error(data.error || 'Gemini server request failed.'), {usageMetadata:data.usageMetadata});
    // SDK .text is a getter; the server transports it explicitly.
    return data;
  }}};
}
