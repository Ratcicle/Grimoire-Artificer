# Entrega técnica — manutenção consolidada

## 1. Escopo e baseline

Base recebida: commit `7890ed69213266c4cdec11bb6ea7ffb655eb7f5a`, o mesmo citado na auditoria. Os dois documentos foram lidos integralmente antes de editar código. O checklist de acompanhamento está [nesta pasta](Grimoire-Checklist-Codex.md); os arquivos originais em Downloads foram preservados.

Baseline independente: **173 testes em 9 arquivos**, TypeScript e build Vite aprovados. Isso não cobria os defeitos de orquestração apontados. O chunk Firebase já excedia 500 kB.

Nenhuma chave real, chamada ao Gemini, geração real, Firestore real, biblioteca pessoal, reanálise em lote ou migração de acervo foi usada. Os novos testes usam SDK, auth, Firestore, thumbnails e IndexedDB simulados. O navegador usa um contexto novo e bloqueia rede externa.

## 2. Causas e correções por item

| Itens | Causa confirmada | Correção e evidência |
|---|---|---|
| EXEC-01 | Estado React e lock posterior à leitura permitiam chamadas duplicadas. | Locks síncronos de sessão para geração e por ID para referências; fila e reanálise direta usam a mesma operação. Promises controladas e callbacks reais reproduzem concorrência. |
| EXEC-02 | Retornos por conflito/exclusão pulavam log; falha de log entrava no catch principal. | Consumo retido fora do merge, uma finalização por tentativa, telemetria isolada do resultado. Sucesso, no-op, exclusão, conflito, merge rejeitado e erro com usage são cobertos. Perda de resposta HTTP registra tentativa com consumo desconhecido; rejeição confirmada antes do modelo não registra chamada paga. |
| DATA-01 | `request.onsuccess` precedia commit da transação. | Gravação/exclusão/limpeza aguardam `transaction.oncomplete`; abort e erro rejeitam. Testes comprovam put bem-sucedido seguido de abort. Abertura bloqueada informa que abas antigas devem ser fechadas. |
| DATA-02 | Imagem integral e thumbnail eram comparadas como conteúdo diferente. | Fingerprint da origem separado da representação. Sync repetido sem edição produz zero uploads; troca genuína de imagem atualiza. Legados sem fingerprint são comparados sem rotular pixels antigos como imagem nova. |
| DATA-03 | Exclusão offline desaparecia e cloud-only restaurava o item. | Tombstone durável por proprietário. Ausência local sem tombstone continua recuperável. Deletes repetidos preservam o caminho cloud legado. |
| DATA-04 | Save lento e delete não compartilhavam ordenação. | Operações por ID, intenção síncrona e verificação antes do envio. Tombstone impede recriação por save antigo; restauração exige opção explícita. Promises de thumbnail/rede são intercaladas. |
| DATA-05 | Sync aplicava snapshot local anterior à rede. | Revalidação de intenção, versão e conteúdo; compare-and-save dentro da transação IndexedDB. Edições/exclusões posteriores invalidam o plano. |
| DATA-06 | `auth.currentUser` era relido após await; biblioteca local era global. | Contexto capturado, armazenamento por conta, IDs cloud novos por proprietário e preservação de caminhos antigos. Fila/preparação/callbacks de UI também verificam conta. Dados antigos sem dono permanecem sem dono. |
| DATA-07 | Falha de thumbnail enviava `imageUrl: undefined` ou ameaçava a imagem anterior. | Upload é adiado quando thumbnail falha. Não substitui imagem válida na nuvem nem envia integral. Payload omite undefined. |
| DATA-08 | Cooldown só era marcado no sucesso; tentativas eram o tamanho do plano. | Toda tentativa de sync consome cooldown de 20 s. Contadores refletem requests iniciados; quota de escrita não é liberada por leitura bem-sucedida. |
| MERGE-01 | Tags canônicas eram sempre unidas; prioridades usavam categorias erradas. | Lista explicitamente avaliada substitui canônicas sem suporte; omissão preserva, customizadas e perfis finais continuam considerados; limite 14 e prioridades compartilhadas. |
| MERGE-02 | Selo da base certificava descrições alteradas com scores herdados. | Mapeamento de descrição e dimensão inclui campos avançados. Mudança real sem nova nota invalida selo; números são preservados; igualdade textual mantém calibração. |
| MERGE-03 | Criação via stub passava pelo contrato de atualização esparsa. | `createVisualDNAFromAnalysis` transporta versão/status/avisos do serviço normalizado e identidade local. Teste do handler real executa analisador, criação e save. |
| MERGE-04 | Merge reaplicava valores raw rejeitados pelo normalizador. | Raw determina presença/intenção; normalização compartilhada determina valores válidos e invariantes. Perfis parciais não apagam irmãos. |
| ART-01 | Lighting não era consumido na síntese. | Slot técnico de iluminação usa sua Utility e registra contribuição/rejeição. |
| ART-02 | Motifs, primarySubject, subjects e Context não influenciavam corretamente a busca. | Sinais temáticos e foco de contexto entram na seleção e nos logs. Utility continua usada principalmente por dimensão entre referências selecionadas. |
| ART-03 | Conteúdo passava pela ausência de uma proibição conhecida. | Admissão positiva de anatomia, material, elemento, escala e identidade; contraprovas preservam técnicas reutilizáveis. Campos estruturados de conteúdo não recebem liberdade de um slot técnico. |
| ART-04 | Política auxiliar divergente dos presets e includes por substring. | Papéis de cores por preset e comparação de termos completos. Ciano Tech-Zero permitido; sacred não autoriza red. Presets não foram redesenhados. |
| ART-05 | Negação perdia escopo e confundia “no” português com proibição inglesa. | Exclusões contextuais, coordenação de negativas e transições positivas. Texto original preservado. |
| ART-06 | Diagnóstico omitira rejeições, duplicatas, limites e campos não usados. | Decisões por contribuição alimentam diagnóstico e texto; só referências efetivamente emitidas aparecem como contribuintes. |
| ART-07 | Erro de leitura do banco era ignorado antes da geração. | Falha operacional interrompe antes da IA; banco desativado, vazio, sem seleção e totalmente filtrado têm estados distintos na resposta/UI. Desativar explicitamente o banco continua possível. |
| UX-01 | Aba desmontava a biblioteca enquanto promises continuavam. | Biblioteca permanece montada depois da primeira abertura; locks pertencem à sessão. Dismiss remove finalizados, preserva pendentes/em andamento. Teste usa App real e resposta Gemini mockada pendente durante troca de abas. |
| UX-02 | Seletor ficava desatualizado; compressão não bloqueava submit. | Eventos locais invalidam lista sem leitura cloud. Preparação bloqueia envio e usa versão para a última seleção prevalecer. |
| UX-03 | `split('.')[0]`, deduplicação e compressão concorrente causavam colisões/falhas silenciosas. | Basename remove apenas extensão final; reserva de nomes, preparação sequencial, validação de MIME/tamanho/dimensões e feedback. |
| RUN-01 | localStorage simulava conexão sem credencial. | Estado reflete host com transporte ou configuração no servidor local; ausência permanece desconectada. Testes não usam chave real ou fictícia. |
| RUN-02 | Vite interpolava segredo no bundle. | Removida interpolação; endpoint de desenvolvimento mantém segredo no processo Node. Marcador inofensivo usado apenas na build comprova ausência no dist. Host real permanece pendência de validação, descrita abaixo. |
| MON-01 | Soma de todas as tentativas dividida só por sucessos; ausência virava zero; cache era somado novamente. | Média por tentativa com total conhecido, cobertura explícita, zero distinto de ausente e totais do provedor. Falta de candidate.content conserva usage; 404 não é tratado automaticamente como chave expirada. |
| ENG-01 | Helpers e snapshots estáticos não exercitavam fluxos reais. | Integrações de React, serviço Gemini, orquestrador, IndexedDB e sync com respostas controladas; suite original preservada. |
| ENG-02 | Ciclo de imports e fluxos duplicados de reanálise/log. | Contratos/taxonomia extraídos, orquestrador compartilhado e métricas puras. Sem reescrita do aplicativo ou strict global. |

## 3. Confronto com a auditoria

Nenhum achado obrigatório foi descartado como inválido na base recebida. Há limites na evidência:

- Os runners externos `review.cjs`, `supplemental.cjs`, `audit_extra.cjs` e manifest não foram fornecidos. Foram criadas reproduções no Vitest; não se reivindica reexecução daqueles 64 casos.
- DATA-01 comprova confirmação antecipada, não perda histórica de dados reais. RUN-02 comprova risco de interpolação, não vazamento anterior. DATA-06 continua sendo risco condicional a troca/múltiplas contas.
- UX foi validada com componentes reais e navegador isolado, sem validação visual do host.
- Algumas fixtures antigas esperavam iron armor, crimson embers ou golden crown sem o pedido autorizar o material/efeito. Foram ajustados apenas os pedidos dessas fixtures para manter o teste original de deduplicação/seleção. Novas contraprovas exigem bloquear esse conteúdo quando não solicitado.

## 4. Arquivos alterados

**Interface e tipos:** `App.tsx`, `types.ts`, `components/ArtstyleDatabase.tsx`, `CardForm.tsx`, `TokenMonitor.tsx`.

**Operações/runtime:** `services/aiOperations.ts`, `geminiService.ts`, `geminiTransport.ts`, `imagePreparation.ts`, `imageUtils.ts`, `tokenMetrics.ts`, `server/geminiMiddleware.ts`, `vite.config.ts`.

**Persistência/conta:** `services/localDbService.ts`, `cloudDnaService.ts`, `visualDnaSyncUtils.ts`, `dnaAccountContext.ts`, `firebase.ts`.

**DNA:** `services/visualDnaMerge.ts`, `visualTags.ts`, `visualDnaContracts.ts`, `visualDnaEngine.ts`, `visualDnaPolicy.ts`, `promptParser.ts`.

**Verificação/configuração/documentação:** `package.json`, `package-lock.json`, `scripts/smoke.mjs`, `scripts/check-build-secrets.mjs`, `README.md`, os arquivos desta pasta e os testes listados a seguir. Dependências acrescentadas são somente de desenvolvimento.

## 5. Testes adicionados e ajustados

- `App.integration.test.tsx`: callback real concorrente e log que falha.
- `App.generation.integration.test.tsx`: formulário → App → operação → serviço Gemini → SDK mockado; prompt e contagens reais.
- `components/ArtstyleDatabase.integration.test.tsx`: criação com metadados, dismiss, fila/troca de conta, respostas tardias de save/delete, análise em andamento entre abas e reanálise direta concorrente com edição/exclusão.
- `components/CardForm.integration.test.tsx`: compressões invertidas, bloqueio de submit e invalidação local.
- `components/TokenMonitor.integration.test.tsx`: médias, ausência/zero, totais e sessões.
- `services/aiOperations.test.ts`: locks antes da leitura, no-op, conflito, exclusão, merge/API/log falhando e CAS.
- `services/localDbService.integration.test.ts`: commit/abort, comparação atômica, isolamento, tombstones e abertura bloqueada.
- `services/cloudDnaService.integration.test.ts`: saves/deletes/sync reais com rede, thumbnails e tempo controlados.
- `services/storageTestUtils.ts`: fronteiras IndexedDB/Firestore em memória usadas pelos testes.
- `services/visualDnaMergeAudit.test.ts`: tags, calibração, criação e invariantes normalizadas.
- `services/visualDnaAuditArt.test.ts`: seleção temática, iluminação, técnicas válidas, conteúdo incompatível, negação e diagnóstico.
- `services/geminiAudit.test.ts`: banco indisponível, erro com usage, status de banco, configuração ausente/host incompleto.
- `services/geminiTransport.test.ts`: perda de resposta, JSON inválido e rejeição anterior à chamada.
- `services/imagePreparation.test.ts`: nomes, tipos/limites e extensão MIME.
- `services/imageUtils.test.ts`: dimensão mínima de um pixel e exceções de canvas resolvidas como falhas tratadas.
- `server/geminiMiddleware.test.ts`: configuração ausente, origem inválida e transporte mockado.
- Fixtures pontuais ajustadas em `generationAndReferenceSelection.test.ts`, `visualDnaSynthesis.test.ts`, `visualDnaComplemento2.test.ts` e `visualDnaFechamento2.test.ts` conforme seção 3.

As reproduções iniciais observaram falhas reais: DATA 13 casos vermelhos; MERGE 13 dos primeiros 14; ART 16 iniciais; App/Gemini 5; CardForm 2; monitor 4. Revisões subsequentes acrescentaram casos vermelhos antes de seus respectivos consertos. Testes de novos módulos também foram escritos antes da implementação; a prova dos defeitos originais está nas reproduções contra os fluxos existentes, não apenas na ausência inicial desses módulos.

## 6. Comandos e resultados

Verificação final em 30/09/2026, após revisão cruzada e correção das reproduções adicionais:

| Comando | Resultado observado |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | Baseline instalado: 203 pacotes. |
| `npm install --save-dev @testing-library/react @testing-library/user-event jsdom fake-indexeddb --ignore-scripts --no-audit --no-fund` | Dependências de teste instaladas; user-event, não utilizado, removido ao fechar a entrega. |
| `npm install --save-dev @playwright/test --ignore-scripts --no-audit --no-fund` | Ferramenta do smoke instalada. |
| `npm uninstall --save-dev @testing-library/user-event --ignore-scripts --no-audit --no-fund` | Dependência não utilizada removida. |
| `npm test -- <arquivos de regressão>` | Reproduções vermelhas verificadas antes dos consertos; grupos depois aprovados. |
| `npm test` | **24 arquivos, 337 testes aprovados, 0 falhas**. Baseline: 9 arquivos/173; acréscimo líquido de **164 testes**. |
| `npm run typecheck` / `npx tsc --noEmit` | Exit 0. |
| `npm run build` | Exit 0; TypeScript + Vite 6.4.3, 1.749 módulos transformados. |
| `npm run test:smoke` | Aprovado em navegador isolado: chave local, biblioteca vazia, preparação PNG, abas e dismiss; **0 chamadas ao modelo**, rede externa bloqueada. O teste React adicional cobre a troca de abas com chamada mockada em andamento. |
| `npm run verify:build-secrets` | Exit 0; marcador `GRIMOIRE_BUILD_MARKER_NOT_A_CREDENTIAL` não aparece em nenhum arquivo do dist. Nenhuma credencial real usada. |
| `git -c core.safecrlf=false diff --check` | Exit 0; sem erros de whitespace. |

O build avisa sobre chunks acima de 500 kB: Firebase aproximadamente 656 kB, entrada aproximadamente 507 kB (minificados, antes de gzip). O aviso Firebase já existia; a entrada ficou maior com os controles compartilhados. Não há erro de compilação. Não foi adicionada persistência cloud de arte gerada.

A revisão independente não encontrou P0/P1 reproduzível pendente depois dos últimos ajustes. Isso não substitui a validação no host ou uma prova de ausência de outros bugs. O baseline e a sequência estão em [IMPLEMENTATION.md](IMPLEMENTATION.md).

## 7. Proteções de custo revisadas

- Nenhuma chamada extra para classificar/corrigir DNA; nenhuma geração real durante testes.
- Nenhum retry novo. Uma tentativa de fila não é repetida automaticamente na mesma execução.
- Concorrência cloud reduzida para execução por ID; não foi ampliada. Cooldown continua 20 s.
- Thumbnails continuam 180×180/0,6. Falha de thumbnail adia upload.
- Histórico gerado continua temporário. Não foi adicionado armazenamento cloud dele.
- Não houve mudança de projeto Firebase ou das regras publicadas.
- Dependências de navegador/testes não entram no runtime do frontend.

## 8. Limitações do AI Studio e riscos restantes

1. A integração real de credenciais do host não foi executada. `window.aistudio` conserva seleção/verificação; precisa fornecer transporte efetivo ou usar um endpoint no servidor do host. A presença do seletor sem esse transporte resulta em recusa honesta. Consulte [README](../../README.md).
2. Qualidade visual, influência artística do DNA e aparência no AI Studio dependem da revisão posterior do proprietário. A rede CDN foi bloqueada no smoke; esse teste valida funcionamento, não a apresentação final com Tailwind remoto.
3. Ordenação cloud é de sessão, não uma transação distribuída entre abas/dispositivos. Tombstones duráveis ajudam a reconciliar, mas edição concorrente do mesmo ID em sessões diferentes ainda pode exigir novo sync.
4. Abertura normal do IndexedDB v3 cria stores novos; o store legado permanece intacto. Feche abas antigas. Não há atribuição/migração silenciosa das referências legadas à conta.
5. Parser e política artística são regras locais testadas, não compreensão universal de linguagem. Vocabulário/contextos não cobertos podem exigir refinamento posterior; isso não autoriza conteúdo incompatível.
6. Ausência de usageMetadata é desconhecida. Perda de resposta HTTP não permite recuperar contagens exatas. Falha do storage de telemetria é avisada sem repetir a IA; não existe garantia de log durável quando o próprio armazenamento falha.
7. O build ainda avisa sobre chunks grandes. Não foi feita otimização ampla nem benchmark do acervo real.

## 9. Opcionais

- **OPT-01:** backup/restauração versionados não implementados. Nenhum lote ou migração real foi feito; antes de operações em massa futuras, preparar backup separado e ensaiar restauração.
- **OPT-02:** corrigida extensão do download conforme MIME; preview puro adiado. A apresentação existente foi preservada.
- **OPT-03:** amostra artística real não executada, por proibição expressa nesta tarefa.
- **OPT-04:** orçamento global de prompt/benchmark do acervo adiado. Não há evidência medida de gargalo no acervo pessoal.

## 10. Entrega local

Alterações inicialmente entregues no checkout para revisão. Após essa entrega, o proprietário autorizou commit e push para `main`. Nenhum deploy foi realizado e nenhum arquivo de credencial do host foi copiado. A integração no AI Studio permanece sob revisão do proprietário.
