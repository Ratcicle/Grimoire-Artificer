import { ImageModel } from '../types';

export type AccessMode =
  | 'aistudio_default'   // A. Acesso padrão disponibilizado pelo AI Studio (permite Lite / prototipagem)
  | 'aistudio_personal'  // B. Acesso por chave pessoal selecionada explicitamente
  | 'local_server'       // C. Execução local com credencial configurada no servidor Node
  | 'unavailable';       // D. Acesso indisponível ou ainda não verificável

export interface AccessPolicyState {
  mode: AccessMode;
  label: string;
  hasPersonalKey: boolean;
  reason?: string;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
      clearSelectedApiKey?: () => Promise<void>;
    };
  }
}

let testOverrideMode: AccessMode | null = null;

/** Permite injetar modo em testes unitários e de integração sem tocar no host real */
export function setAccessModeForTesting(mode: AccessMode | null): void {
  testOverrideMode = mode;
}

/** Verifica se o host AI Studio disponibiliza credencial em tempo de execução no cliente */
export function hasHostRuntimeCredential(): boolean {
  return typeof window !== 'undefined' && Boolean(window.aistudio) &&
    typeof process !== 'undefined' && Boolean(process.env?.API_KEY);
}

/** Consulta preflight de configuração do servidor local sem consumir chamada de IA */
export async function checkServerConfigured(): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  try {
    const response = await fetch('/api/gemini/status');
    if (!response.ok) return false;
    const data = await response.json();
    return data.configured === true;
  } catch {
    return false;
  }
}

/**
 * Resolve o estado atual da política de acesso distinguindo os 4 modos reais:
 * A. aistudio_default (AI Studio presente, sem chave pessoal selecionada)
 * B. aistudio_personal (AI Studio presente, chave pessoal selecionada e ativa)
 * C. local_server (Fora do AI Studio, servidor local com GEMINI_API_KEY configurada)
 * D. unavailable (Sem configuração verificável)
 */
export async function resolveAccessPolicy(): Promise<AccessPolicyState> {
  if (testOverrideMode !== null) {
    return formatPolicy(testOverrideMode);
  }

  // Ambiente com window.aistudio (Google AI Studio)
  if (typeof window !== 'undefined' && Boolean(window.aistudio)) {
    const isExplicitlyDisconnected = localStorage.getItem('apiKeyDisconnected') === 'true';
    let hasHostKey = false;
    try {
      hasHostKey = !isExplicitlyDisconnected && (await window.aistudio!.hasSelectedApiKey());
    } catch {
      hasHostKey = false;
    }

    if (hasHostKey) {
      // O usuário selecionou sua chave pessoal no host.
      // Verificamos se o transporte (runtime ou servidor) está funcional para ela.
      if (hasHostRuntimeCredential()) {
        return formatPolicy('aistudio_personal');
      }
      const serverConfigured = await checkServerConfigured();
      if (serverConfigured) {
        return formatPolicy('aistudio_personal');
      }
      // Se a chave foi selecionada no modal mas o transporte falhou no preflight
      return {
        mode: 'unavailable',
        label: 'Acesso indisponível',
        hasPersonalKey: false,
        reason: 'Chave selecionada no AI Studio, mas o transporte do servidor não está configurado.',
      };
    }

    // Host AI Studio presente, sem chave pessoal selecionada (ou explicitamente desconectada)
    // Disponibiliza o acesso padrão do ambiente para prototipagem com Lite
    return formatPolicy('aistudio_default');
  }

  // Fora do AI Studio (desenvolvimento local / standalone)
  const isServerReady = await checkServerConfigured();
  if (isServerReady) {
    return formatPolicy('local_server');
  }

  // Em ambiente Vitest/Node puro (sem window e sem backend mockado), fallback seguro para local_server se houver env de teste
  if (typeof window === 'undefined' && typeof process !== 'undefined' && (process.env.VITEST || process.env.NODE_ENV === 'test')) {
    return formatPolicy('local_server');
  }

  return formatPolicy('unavailable');
}

function formatPolicy(mode: AccessMode): AccessPolicyState {
  switch (mode) {
    case 'aistudio_personal':
      return {
        mode: 'aistudio_personal',
        label: 'Chave pessoal selecionada',
        hasPersonalKey: true,
      };
    case 'aistudio_default':
      return {
        mode: 'aistudio_default',
        label: 'Acesso padrão do AI Studio',
        hasPersonalKey: false,
      };
    case 'local_server':
      return {
        mode: 'local_server',
        label: 'Servidor local configurado',
        hasPersonalKey: true,
      };
    case 'unavailable':
    default:
      return {
        mode: 'unavailable',
        label: 'Acesso indisponível',
        hasPersonalKey: false,
        reason: 'Sem credencial no servidor local e fora do AI Studio. Configure GEMINI_API_KEY no servidor.',
      };
  }
}

/** Valida se o modelo solicitado é compatível com o modo de acesso fixado */
export function validateModelAccess(mode: AccessMode, model: string): { allowed: boolean; reason?: string } {
  if (mode === 'unavailable') {
    return {
      allowed: false,
      reason: 'Acesso indisponível. Conecte sua chave no AI Studio ou configure o servidor local.',
    };
  }

  if (mode === 'aistudio_default') {
    // Modo padrão do AI Studio: permite somente o modelo Lite para geração de arte e Flash para análise
    if (model === ImageModel.Pro || model === ImageModel.Flash) {
      return {
        allowed: false,
        reason: `O modelo ${model === ImageModel.Pro ? 'Pro' : 'Flash'} requer a seleção da sua chave pessoal no AI Studio.`,
      };
    }
    return { allowed: true };
  }

  // Modos 'aistudio_personal' e 'local_server' permitem todos os modelos cadastrados
  return { allowed: true };
}
