import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAccessPolicy, validateModelAccess, setAccessModeForTesting, AccessMode } from './accessPolicy';
import { runGeneration } from './aiOperations';
import { ImageModel, CardType, Complexity, Context, Archetype } from '../types';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  read: vi.fn(),
  log: vi.fn()
}));

vi.mock('./geminiService', async () => {
  const actual = await vi.importActual<typeof import('./geminiService')>('./geminiService');
  return {
    ...actual,
    generateCardArt: mocks.generate
  };
});

vi.mock('./localDbService', () => ({
  getLocalDNA: mocks.read,
  saveTokenLog: mocks.log
}));

const testRequest = {
  model: ImageModel.Lite,
  subject: 'cybernetic dragon',
  cardType: CardType.Monster,
  context: Context.Character,
  complexity: Complexity.Medium,
  archetype: Archetype.Generic,
  useVisualDB: false
};

describe('Access Policy & Transport Separation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessModeForTesting(null);
    mocks.read.mockResolvedValue([]);
    mocks.log.mockResolvedValue(undefined);
    mocks.generate.mockImplementation(async (_r, started) => {
      started?.(true);
      return {
        imageUrl: 'data:image/png;base64,mockImage',
        usageMetadata: { totalTokenCount: 150 }
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessModeForTesting(null);
  });

  it('1. Lite + host com acesso padrão + nenhuma chave pessoal: geração chega uma vez ao transporte', async () => {
    vi.stubGlobal('window', {
      aistudio: {
        hasSelectedApiKey: async () => false,
        openSelectKey: vi.fn()
      }
    });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn()
    });

    const policy = await resolveAccessPolicy();
    expect(policy.mode).toBe('aistudio_default');
    expect(policy.hasPersonalKey).toBe(false);

    const outcome = await runGeneration(testRequest);
    expect(outcome.status).toBe('done');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    // Locked mode passed to generateCardArt
    expect(mocks.generate.mock.calls[0][2]).toBe('aistudio_default');
  });

  it('2. Pro/Flash sem seleção pessoal no AI Studio: bloqueio esperado, sem chamada ao modelo', async () => {
    vi.stubGlobal('window', {
      aistudio: {
        hasSelectedApiKey: async () => false,
        openSelectKey: vi.fn()
      }
    });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn()
    });

    const policy = await resolveAccessPolicy();
    expect(policy.mode).toBe('aistudio_default');
    expect(validateModelAccess(policy.mode, ImageModel.Pro).allowed).toBe(false);
    expect(validateModelAccess(policy.mode, ImageModel.Flash).allowed).toBe(false);

    const outcomePro = await runGeneration({ ...testRequest, model: ImageModel.Pro });
    expect(outcomePro.status).toBe('failed');
    if (outcomePro.status === 'failed') {
      expect(outcomePro.error).toMatch(/chave pessoal/i);
    }
    expect(mocks.generate).not.toHaveBeenCalled();

    const outcomeFlash = await runGeneration({ ...testRequest, model: ImageModel.Flash });
    expect(outcomeFlash.status).toBe('failed');
    if (outcomeFlash.status === 'failed') {
      expect(outcomeFlash.error).toMatch(/chave pessoal/i);
    }
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('3. Seleção pessoal explícita: transporte correspondente é utilizado para Pro/Flash', async () => {
    vi.stubGlobal('window', {
      aistudio: {
        hasSelectedApiKey: async () => true,
        openSelectKey: vi.fn()
      }
    });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn()
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: true })
    }));

    const policy = await resolveAccessPolicy();
    expect(policy.mode).toBe('aistudio_personal');
    expect(policy.hasPersonalKey).toBe(true);

    const outcome = await runGeneration({ ...testRequest, model: ImageModel.Pro });
    expect(outcome.status).toBe('done');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][2]).toBe('aistudio_personal');
  });

  it('4. Desconexão: volta ao padrão AI Studio quando host está disponível (Lite não fica bloqueado)', async () => {
    const store = new Map<string, string>();
    store.set('apiKeyDisconnected', 'true');
    vi.stubGlobal('window', {
      aistudio: {
        hasSelectedApiKey: async () => true,
        openSelectKey: vi.fn()
      }
    });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    });

    const policy = await resolveAccessPolicy();
    expect(policy.mode).toBe('aistudio_default');
    expect(policy.hasPersonalKey).toBe(false);

    // Lite continua utilizável no modo padrão
    const outcome = await runGeneration(testRequest);
    expect(outcome.status).toBe('done');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][2]).toBe('aistudio_default');
  });

  it('5. Cota esgotada no padrão: uma tentativa, nenhum fallback pago e nenhum retry', async () => {
    setAccessModeForTesting('aistudio_default');
    mocks.generate.mockImplementationOnce(async (_r, started) => {
      started?.(true);
      throw Object.assign(new Error('Quota exceeded 429'), {
        usageMetadata: { totalTokenCount: 50 }
      });
    });

    const outcome = await runGeneration(testRequest);
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error).toMatch(/quota/i);
    }
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    // Registra consumo da única tentativa falha sem retry
    expect(mocks.log).toHaveBeenCalledTimes(1);
  });

  it('6. Host ausente e servidor sem chave: informa indisponibilidade real sem falso conectado', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: false })
    }));

    const policy = await resolveAccessPolicy();
    expect(policy.mode).toBe('unavailable');
    expect(policy.label).toBe('Acesso indisponível');
    expect(policy.hasPersonalKey).toBe(false);

    const outcome = await runGeneration(testRequest);
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error).toMatch(/indisponível/i);
    }
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('7. Modo local sem credencial: nenhuma tentativa de chamar modelo', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    const policy = await resolveAccessPolicy();
    expect(policy.mode).toBe('unavailable');

    const outcome = await runGeneration(testRequest);
    expect(outcome.status).toBe('failed');
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('8. Chave paga disponível em outra rota: tentativa padrão bloqueia modelo Pro antes da chamada', async () => {
    setAccessModeForTesting('aistudio_default');
    const outcome = await runGeneration({ ...testRequest, model: ImageModel.Pro });
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error).toMatch(/chave pessoal/i);
    }
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('9. Troca de modo durante operação e submissões repetidas preservam as travas', async () => {
    setAccessModeForTesting('aistudio_default');
    let resolveGen!: (val: any) => void;
    mocks.generate.mockImplementationOnce(async (_r, started) => {
      started?.(true);
      return new Promise(r => { resolveGen = r; });
    });

    const first = runGeneration(testRequest);
    // Troca de modo enquanto a primeira está em andamento
    setAccessModeForTesting('aistudio_personal');
    // Chamada concorrente é rejeitada como busy
    const second = await runGeneration(testRequest);
    expect(second.status).toBe('busy');

    resolveGen({ imageUrl: 'art', usageMetadata: { totalTokenCount: 100 } });
    const resultFirst = await first;
    expect(resultFirst.status).toBe('done');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    // O modo fixado no início da operação foi 'aistudio_default'
    expect(mocks.generate.mock.calls[0][2]).toBe('aistudio_default');
  });

  it('10. Consumo e falha de telemetria seguem garantias de aiOperations', async () => {
    setAccessModeForTesting('aistudio_default');
    mocks.log.mockRejectedValueOnce(new Error('Falha no log'));

    const outcome = await runGeneration(testRequest);
    expect(outcome.status).toBe('done');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledTimes(1);
  });
});
