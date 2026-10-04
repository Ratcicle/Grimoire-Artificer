# Grimoire Artificer

React + TypeScript + Vite para criar ilustrações do Shadow Duel.

## Desenvolvimento e verificação local

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run test:smoke
npm run verify:build-secrets
```

O servidor local escuta `127.0.0.1:3000`. Sem credencial configurada, a interface abre, permite consultar/preparar referências locais e informa que a geração não está conectada. Não cria uma chave fictícia.

Os testes simulam Gemini, autenticação, Firestore, thumbnails e armazenamento. O smoke abre um contexto de navegador novo, bloqueia tráfego externo e não chama o modelo. Usa Edge/Chrome instalado ou o Chromium do Playwright. Não abre o perfil pessoal do navegador.

## Credenciais e AI Studio

O Vite **não substitui** variáveis Gemini por valores dentro do JavaScript distribuído. Não configure `VITE_GEMINI_API_KEY` nem coloque credenciais em arquivos do frontend.

Para uso local real posterior, o usuário pode configurar `GEMINI_API_KEY` no processo Node ou em `.env.local` (ignorado pelo Git). O endpoint local `/api/gemini/generate` usa essa variável somente no servidor. `/api/gemini/status` informa apenas se existe configuração; não valida a chave com uma chamada paga. Não há retries novos. O endpoint aceita apenas mesma origem e os modelos usados pelo projeto.

A seleção por `window.aistudio.hasSelectedApiKey()` / `openSelectKey()` foi preservada. Ela precisa de um transporte efetivo: credencial fornecida pelo próprio runtime do host ou endpoint Gemini no servidor do host. A presença do seletor sozinha não é tratada como conexão funcional. **O mecanismo real do projeto dentro do AI Studio ainda precisa ser validado pelo proprietário.** Não reintroduza `define: process.env.API_KEY = chave` para fazê-lo funcionar.

`dist` é somente o frontend. O endpoint de desenvolvimento não é incluído numa publicação estática. Uma publicação precisa conectar o frontend a um backend autenticado no ambiente de destino. O backend de desenvolvimento não deve ser exposto como serviço público. Nenhuma publicação foi feita nesta manutenção.

O suporte atual a runtime Node no AI Studio e variáveis de segredo no servidor está descrito na [documentação oficial de Build mode](https://ai.google.dev/gemini-api/docs/aistudio-build-mode). O adaptador legado deste projeto precisa ser conferido no host específico.

## Bibliotecas e sincronização

- A biblioteca local conserva a imagem completa; Firestore recebe thumbnails de até **180×180**, JPEG qualidade **0,6**.
- O histórico de imagens geradas continua em memória e desaparece ao recarregar.
- Sync continua explícito, com cooldown de **20 segundos**, sem novos retries. A aplicação não inicia reanálise em lote ao importar ou sincronizar.
- A biblioteca agora tem escopo por conta. Referências legadas sem proprietário permanecem no armazenamento original, disponíveis sem login; não são atribuídas automaticamente à próxima conta conectada. A interface explica esse escopo. Não houve migração de acervo real.
- O primeiro uso normal do código atualizado cria os stores locais de conta e tombstones no IndexedDB v3. Feche abas antigas da aplicação antes de abrir a versão atualizada. Isso não reanalisa nem transforma os registros antigos.
- Uma exclusão explícita produz uma intenção durável associada ao proprietário. Uma referência apenas ausente localmente ainda pode ser recuperada da nuvem.
- Saves, deletes e sync são ordenados por ID na sessão; o commit local compara snapshots. Não há uma transação distribuída entre navegadores/dispositivos. Evite editar a mesma referência em sessões diferentes simultaneamente.

## Importação e monitor

PNG, JPEG e WebP: até 20 MiB por arquivo, 100 MiB por lote e 40 megapixels por imagem decodificada. A preparação local é sequencial. Nomes preservam pontos intermediários; duplicatas geram feedback.

O monitor exibe `-` quando a API não forneceu uma contagem e `0` quando informou zero. Médias usam as tentativas com total conhecido, incluindo falhas. Totais seguem o provedor; cached tokens não são somados novamente ao input. [Contrato oficial de UsageMetadata](https://ai.google.dev/api/generate-content#UsageMetadata)

Se uma resposta HTTP se perder, a tentativa fica com consumo desconhecido. Falha ao salvar telemetria não dispara novamente a IA nem transforma o resultado principal em falha.

## Auditoria e Homologação

- Consulte o [Roteiro de Homologação no AI Studio](docs/HOMOLOGACAO_AI_STUDIO.md) para validar o modo de acesso padrão, seleção de chave pessoal e backup/restauração local de referências.
- Consulte [checklist](docs/audit/Grimoire-Checklist-Codex.md), [plano/baseline](docs/audit/IMPLEMENTATION.md) e [entrega técnica](docs/audit/DELIVERY.md).
