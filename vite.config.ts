import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';
import { createGeminiMiddleware } from './server/geminiMiddleware';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
      },
      plugins: [react(), {
        name: 'grimoire-local-gemini',
        configureServer(server) {
          const apiKey = env.GEMINI_API_KEY;
          server.middlewares.use(createGeminiMiddleware({
            configured: Boolean(apiKey),
            generate: request => new GoogleGenAI({ apiKey }).models.generateContent(request)
          }));
        }
      }],
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ["react", "react-dom"],
              firebase: ["firebase/app", "firebase/firestore"],
              genai: ["@google/genai"],
              lucide: ["lucide-react"]
            }
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
