# Grimoire — lista de trabalho do Codex

Base: ZIP auditado em `Grimoire-Auditoria-Consolidada-Codex.md`. IDs remetem às reproduções, fontes e critérios daquele relatório. Não iniciar reanálise real, migração ou publicação.

- [x] **EXEC-01 (P0)** — Uma operação ativa por referência e por geração. Estado: Reproduzido.
- [x] **EXEC-02 (P0)** — Consumo registrado uma vez, sem transformar falha de log em falha de geração. Estado: Reproduzido.
- [x] **DATA-01 (P0)** — Confirmar a transação IndexedDB, não apenas o put. Estado: Reproduzido.
- [x] **DATA-02 (P0)** — Não enviar novamente a mesma referência por comparar imagem integral com thumbnail. Estado: Reproduzido.
- [x] **DATA-03 (P0)** — Preservar exclusões quando a nuvem estiver desligada ou falhar. Estado: Reproduzido.
- [x] **DATA-04 (P0)** — Ordenar saves e deletes por ID também na nuvem. Estado: Reproduzido.
- [x] **DATA-05 (P0)** — Revalidar o local depois da leitura cloud de uma sincronização. Estado: Reproduzido.
- [x] **DATA-06 (P0 condicional)** — Amarrar operações ao usuário que as iniciou. Estado: Reproduzido + inspeção.
- [x] **DATA-07 (P1)** — Fallback de thumbnail sem imageUrl: undefined. Estado: Reproduzido.
- [x] **DATA-08 (P1)** — Cooldown e diagnóstico também nas falhas de sync. Estado: Reproduzido + inspeção.
- [x] **MERGE-01 (P1)** — Substituição explícita das tags canônicas e prioridade coerente. Estado: Reproduzido.
- [x] **MERGE-02 (P1)** — Calibração não pode certificar descrições novas com notas herdadas. Estado: Reproduzido.
- [x] **MERGE-03 (P1)** — Construir novas importações sem perder metadados locais do analisador. Estado: Reproduzido.
- [x] **MERGE-04 (P1)** — Não reintroduzir dados que o normalizador já rejeitou. Estado: Reproduzido.
- [x] **ART-01 (P1)** — Aproveitar a iluminação extraída e sua utilidade. Estado: Reproduzido.
- [x] **ART-02 (P1)** — Fazer a seleção usar os campos que o analisador novo produz. Estado: Reproduzido + inspeção.
- [x] **ART-03 (P1)** — Fechar a admissão de conteúdo sensível em vez de expandir listas sem fim. Estado: Reproduzido.
- [x] **ART-04 (P1)** — Eliminar divergência entre presets e política auxiliar e matches por substring. Estado: Reproduzido.
- [x] **ART-05 (P1)** — Preservar o escopo das negações e o contexto linguístico. Estado: Reproduzido.
- [x] **ART-06 (P2)** — Completar o diagnóstico de contribuições rejeitadas e não consumidas. Estado: Reproduzido.
- [x] **ART-07 (P1)** — Não gerar silenciosamente sem o Artstyle Database solicitado. Estado: Reproduzido.
- [x] **UX-01 (P1)** — Estado da fila e travas durante troca de abas/desmontagem. Estado: Inspeção — validar no navegador.
- [x] **UX-02 (P2)** — Atualizar seletor manual e bloquear envio enquanto imagem está sendo preparada. Estado: Inspeção — validar no navegador.
- [x] **UX-03 (P2)** — Validar importação de arquivos e nomes sem colisões artificiais. Estado: Inspeção.
- [x] **RUN-01 (P1)** — Estado de chave fora do AI Studio precisa corresponder a configuração real. Estado: Reproduzido.
- [x] **RUN-02 (P0 antes de publicação)** — Não publicar build estática com chave Gemini embutida. Estado: Risco demonstrável por inspeção, não vazamento constatado.
- [x] **MON-01 (P2)** — Métricas do Token Monitor e erros de API mais fiéis. Estado: Inspeção.
- [x] **ENG-01 (P1 para entrega)** — Testar orquestração real, não só helpers e rótulos de testes. Estado: Lacuna de testes + execução independente.
- [x] **ENG-02 (P2)** — Reduzir duplicação de regras sem reescrever o aplicativo. Estado: Inspeção — manutenção, não falha demonstrada.
- [ ] **OPT-01 (Preparação antes de lote)** — Backup/restauração explícitos das referências analisadas. Estado: Melhoria proposta.
- [ ] **OPT-02 (Opcional / P2 para MIME)** — Preview de arte pura e download com extensão correta. Estado: Inspeção + melhoria proposta.
- [ ] **OPT-03 (Depois das correções)** — Amostra real para verificar utilidade do novo analisador. Estado: Validação artística proposta.
- [ ] **OPT-04 (Condicional / desempenho)** — Orçamento de prompt e custo de percorrer o acervo. Estado: Inspeção sem perfil de tempo.

## Resultado da manutenção local

Itens obrigatórios implementados; evidências e limitações em [DELIVERY.md](DELIVERY.md). Verificação final: **337 testes aprovados**, TypeScript, build, smoke isolado e verificação de segredo aprovados. RUN/UX ainda dependem da validação real de credenciais/apresentação pelo proprietário no AI Studio, sem chamadas reais nesta manutenção.

Opcionais: OPT-01 adiado; OPT-02 extensão MIME corrigida, preview puro adiado; OPT-03 não executado por restrição expressa; OPT-04 adiado sem benchmark de acervo real.
