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

Para uso local real posterior, o usuário pode configurar `GEMINI_API_KEY` no processo Node ou em `.env.local` (ignorado pelo Git). O endpoint local `/api/gemini/generate` usa essa variável somente no servidor. `/api/gemini/status` informa apenas se existe configuração; não valida a chave com uma chamada paga. O endpoint não faz retries, aceita até 4 operações simultâneas, apenas mesma origem e os modelos usados pelo projeto.

A seleção por `window.aistudio.hasSelectedApiKey()` / `openSelectKey()` foi preservada. Ela precisa de um transporte efetivo: credencial fornecida pelo próprio runtime do host ou endpoint Gemini no servidor do host. A presença do seletor sozinha não é tratada como conexão funcional. **O mecanismo real do projeto dentro do AI Studio ainda precisa ser validado pelo proprietário.** Não reintroduza `define: process.env.API_KEY = chave` para fazê-lo funcionar.

`dist` é somente o frontend. O endpoint de desenvolvimento não é incluído numa publicação estática. Uma publicação precisa conectar o frontend a um backend autenticado no ambiente de destino. O backend de desenvolvimento não deve ser exposto como serviço público. Nenhuma publicação foi feita nesta manutenção.

O suporte atual a runtime Node no AI Studio e variáveis de segredo no servidor está descrito na [documentação oficial de Build mode](https://ai.google.dev/gemini-api/docs/aistudio-build-mode). O adaptador legado deste projeto precisa ser conferido no host específico.

## Bibliotecas e sincronização

- A biblioteca local conserva a imagem importada neste aparelho; Firestore recebe thumbnails de até **180×180**, JPEG qualidade **0,6**, e é isso que outro aparelho recebe ao sincronizar.
- O histórico de imagens geradas continua em memória e desaparece ao recarregar.
- Sync continua explícito, com cooldown de **20 segundos**, sem novos retries. A aplicação não inicia reanálise em lote ao importar ou sincronizar.
- A biblioteca agora tem escopo por conta. Referências legadas sem proprietário permanecem no armazenamento original, disponíveis sem login; não são atribuídas automaticamente à próxima conta conectada. A interface explica esse escopo. Não houve migração de acervo real.
- O primeiro uso normal do código atualizado cria os stores locais de conta e tombstones no IndexedDB v3. Feche abas antigas da aplicação antes de abrir a versão atualizada. Isso não reanalisa nem transforma os registros antigos.
- Uma exclusão explícita produz uma intenção durável associada ao proprietário. Uma referência apenas ausente localmente ainda pode ser recuperada da nuvem.
- Saves, deletes e sync são ordenados por ID na sessão; o commit local compara snapshots. Não há uma transação distribuída entre navegadores/dispositivos. Evite editar a mesma referência em sessões diferentes simultaneamente.

## Importação e monitor

PNG, JPEG e WebP: até 20 MiB por arquivo, 2 GiB por lote e 40 megapixels por imagem decodificada. A preparação local é sequencial. Nomes preservam pontos intermediários; nomes repetidos no lote geram feedback.

Um arquivo com o nome de um registro existente substitui a imagem e a análise dele, mantendo id, data de criação e tags personalizadas. Registros já na análise atual, com imagem completa, são pulados. Por isso, selecionar a pasta de novo retoma um lote interrompido sem pagar duas vezes.

Na fila, **Piloto (5)** analisa só cinco itens para conferir custo e resultado, e **Analyze All** processa o restante, com até 4 análises simultâneas e botão **Pausar**. Só falhas não cobradas são repetidas sozinhas: limite de requisições (429) e indisponibilidade (5xx ou tempo esgotado). Cota diária ou saldo esgotado param o lote, e 5 falhas seguidas também. Uma resposta inválida, que pode ter sido cobrada, nunca é repetida automaticamente.

Imagens idênticas com nomes diferentes são recusadas na importação, tanto dentro do lote quanto em relação à biblioteca.

**Apagar biblioteca** recomeça do zero. Baixa um backup, pede confirmação digitada e apaga neste aparelho e na nuvem, ou só neste aparelho. Se a nuvem falhar no meio, nada local é apagado, e repetir a ação termina o trabalho. Em outro aparelho conectado, use "Só neste aparelho" antes de sincronizar: sem isso, a sincronização de lá reenvia a biblioteca antiga para a nuvem.

A análise pode ser feita pelo Gemini ou pelo Claude (Sonnet 5.5 e Opus 5.5), e cada registro guarda uma análise de cada provedor. A análise visível é a que o gerador usa, e o botão de troca no topo do painel alterna entre elas sem nova chamada. Analisar de novo substitui só a análise daquele provedor. Com um modelo Claude selecionado, importar a pasta enfileira só as artes que ainda não têm análise do Claude. A geração de imagens continua sempre no Gemini.

A chave do Claude é digitada na tela e fica só no armazenamento local deste navegador: não entra no repositório, na nuvem nem nos backups. Como a chamada sai direto do navegador, use uma chave exclusiva para isso e um limite de gasto no Console do Claude.

Em um aparelho que recebeu a biblioteca pela nuvem, as imagens são miniaturas de até 180 px. A interface as identifica e recusa reanalisá-las até que o arquivo original seja importado. Sincronizar em outro aparelho um registro cuja imagem foi substituída também troca a cópia local desse aparelho pela miniatura.

A análise v4 escreve os campos de técnica sem nomear o que está na arte, e por isso eles podem chegar ao prompt com vocabulário aberto. Conteúdo que apareça neles ainda precisa de apoio no pedido ou no arquétipo. Registros de versões anteriores continuam sob a lista de vocabulário.

Pedidos em português funcionam com a biblioteca em inglês por um glossário local de termos de fantasia ([portugueseTerms.ts](services/portugueseTerms.ts)), sem chamada de IA. Uma palavra fora do glossário não é traduzida: acrescente-a lá se fizer falta.

O monitor exibe `-` quando a API não forneceu uma contagem e `0` quando informou zero. Médias usam as tentativas com total conhecido, incluindo falhas. Totais seguem o provedor; cached tokens não são somados novamente ao input. [Contrato oficial de UsageMetadata](https://ai.google.dev/api/generate-content#UsageMetadata)

Se uma resposta HTTP se perder, a tentativa fica com consumo desconhecido. Falha ao salvar telemetria não dispara novamente a IA nem transforma o resultado principal em falha.

## Auditoria e Homologação

- Consulte o [Roteiro de Homologação no AI Studio](docs/HOMOLOGACAO_AI_STUDIO.md) para validar o modo de acesso padrão, seleção de chave pessoal e backup/restauração local de referências.
- Consulte [checklist](docs/audit/Grimoire-Checklist-Codex.md), [plano/baseline](docs/audit/IMPLEMENTATION.md) e [entrega técnica](docs/audit/DELIVERY.md).
