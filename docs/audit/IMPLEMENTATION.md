# Manutenção consolidada — plano e registro

**Objetivo:** corrigir os itens obrigatórios da auditoria mantendo React/Vite, presets, banco local integral, cloud 180×180 e histórico temporário.
**Especificação:** [auditoria](Grimoire-Auditoria-Consolidada-Codex.md), [checklist](Grimoire-Checklist-Codex.md) e instruções diretas do usuário.
**Execução:** correções autorizadas no checkout local; sem commit, publicação, dados reais ou chamadas externas de IA. Testes usam mocks. A auditoria é evidência a confirmar, não uma instrução para executar lote ou migração real.

## Baseline

- Commit recebido: `7890ed69213266c4cdec11bb6ea7ffb655eb7f5a`; checkout limpo.
- Node `v24.21.0`, npm `11.19.0`.
- `npm ci --ignore-scripts --no-audit --no-fund`: 203 pacotes instalados.
- `npm test`: 9 arquivos, 173 testes aprovados.
- `npm run build`: TypeScript e Vite 6.4.3 aprovados. Aviso preexistente de chunk Firebase >500 kB.
- O código recebido é o commit citado na auditoria. Os runners externos e manifest do pacote de evidências não foram fornecidos; não se reivindica reexecução deles.

## Grupos de implementação

- [x] EXEC / MON: `services/aiOperations.ts`, `App.tsx`, `ArtstyleDatabase.tsx`, `geminiService.ts`, `TokenMonitor.tsx`. Locks síncronos compartilhados e finalização única de consumo. Testes intercalam leitura, modelo, merge e log; cobrem falha de log sem repetir IA.
- [x] DATA: `localDbService.ts`, `cloudDnaService.ts`, `visualDnaSyncUtils.ts`, contexto de conta e testes. Commit de transação, saves/deletes por ID, CAS de snapshot, tombstones por dono e distinção entre imagem e thumbnail. Testes controlam rede e transações.
- [x] MERGE: `visualDnaMerge.ts`, `visualTags.ts`, contratos e testes. Presença bruta define intenção, normalização define valores; criação separada de patch; calibração depende dos campos alterados.
- [x] ART: `visualDnaEngine.ts`, `visualDnaPolicy.ts`, `promptParser.ts` e integração Gemini. Seleção temática com contexto, iluminação útil, compatibilidade positiva e negações contextuais. Inspecionar payload do SDK mockado.
- [x] UX / RUN: `CardForm.tsx`, `ArtstyleDatabase.tsx`, `App.tsx`, `imageUtils.ts`, configuração e documentação. Sessão preservada entre abas, atualização local do seletor, preparação ordenada e credenciais sem segredo na build estática.
- [x] Verificação final: suíte completa, TypeScript, Vite, integração React/serviços, smoke sem rede real, revisão independente do diff e checklist atualizado.

## Casos transversais de revisão

1. Conta muda durante qualquer await: nenhuma escrita/seleção sob novo usuário.
2. Exclusão/edição entre resposta da IA e save: comparar snapshot na persistência.
3. Telemetria falha após sucesso: preservar resultado e não repetir chamada.
4. Reanálise parcial: defaults normalizados não apagam dados omitidos.
5. Técnica útil e conteúdo incompatível no mesmo texto: preservar técnica sem transferir identidade.

## Opcionais

Backup versionado, novo preview e otimização de acervo ficam para decisão após as correções. Validação artística real e reanálise em lote não serão executadas nesta manutenção.

## Fechamento

Verificação completa: 337/337 testes em 24 arquivos, TypeScript e build aprovados; smoke isolado com zero chamadas ao modelo; marcador de ambiente ausente no dist. Revisão independente encerrada sem P0/P1 reproduzível pendente. Detalhes, riscos e opcionais em [DELIVERY.md](DELIVERY.md).
