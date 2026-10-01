# Grimoire Artificer — auditoria consolidada para o Codex

**Base exclusiva de código:** `grimoire-artificer(2).zip`, enviado pelo usuário.
**SHA-256:** `d8aee9ca5247c3b0b590781b732a1cc66a25e87c216d12bf6128997f8cc91af1`.
**Conteúdo:** 39 arquivos; sem acervo real de referências, sem `.env.local`, sem dependências instaladas no pacote.

## Parecer

Manter a aplicação e os avanços das Rodadas 1, 2 e 3A/3B. Não basta fechar quatro pendências da 3B: a revisão ampliada encontrou riscos independentes na sincronização, no ciclo das operações e no aproveitamento do DNA. Priorizar integridade e chamadas/custos, depois transferência de estilo e integração de UI.

Este documento lista achados e critérios de aceitação, não é prova de ausência de outros bugs nem autorização de migração/reanálise/publicação. Nada foi corrigido no código-fonte recebido.

## Método e evidência

Revisão estática dos arquivos de aplicação/configuração e cobertura dos testes. Reexecução de 38 verificações da revisão anterior sobre os arquivos do ZIP; 26 sondagens adicionais executando os módulos reais com dependências simuladas. Total: **64 verificações, 32 aprovadas e 32 falhas contra os critérios das sondagens**. São testes dirigidos a cenários suspeitos, não uma taxa de erro da aplicação ou da qualidade das imagens. Algumas sondagens verificam melhorias de contrato propostas, não uma garantia preexistente documentada.

Os cinco módulos principais usados no runner anterior coincidem byte a byte com os blobs previamente verificados do commit `7890ed6`; todos os 39 arquivos extraídos coincidem com o ZIP. O manifest incluído relaciona os hashes de cada arquivo. Não houve nova consulta ao GitHub nem substituição do ZIP por código remoto nesta auditoria.

`review.cjs`: 32 cenários, 26/6. `supplemental.cjs`: 6 cenários, 4/2. `audit_extra.cjs`: 26 cenários, 2/24. Callbacks são extraídos do TypeScript real por AST; Gemini, Firestore, IndexedDB e estados de UI são substituídos por mocks controlados. Sync tests executam os serviços reais com respostas/deferimentos simulados. O teste N25 prova resolução antes de commit, não perda real de dados. N26 verifica apenas transporte da complexidade, não sua eficácia artística.

Não houve navegador, conta real, APIs pagas, Firestore real, acesso ao acervo, reanálise, commit ou push. A instalação de dependências não foi concluída: tentativa online excedeu o tempo limite; instalação offline falhou com `ENOTCACHED`. **A suíte Vitest original e `npm run build` não foram executados nesta auditoria.** O total de testes divulgado pelo Gemini não é uma execução independente aqui.

## Prioridades

**P0:** risco de duplicação de chamadas, sobrescrita, exclusão perdida ou contexto de conta incorreto.
**P1:** funcionamento/direção artística incorretos ou bloqueio para uma entrega segura.
**P2:** diagnóstico, interface e manutenção.
**Condicional/opcional:** melhoria ou proteção que depende do modo de uso, sem afirmar incidente em produção.

## Contratos que devem permanecer

- Presets e identidade artística não devem ser redesenhados. O objetivo é filtrar conteúdo e aproveitar técnica, não gerar outra estética.
- Miniaturas 180×180 na nuvem são intencionais; não aumentar resolução ou armazenamento como solução.
- Histórico das imagens geradas continua temporário; backup proposto refere-se exclusivamente às referências analisadas.
- Sem chamadas extras de IA para classificar/corrigir análises, sem loops de retries, sem ampliar concorrência, quotas ou serviços pagos.
- Preservar scores fracionários/zero, rejeição de scores inválidos, N/A, origem da calibração, seleções manuais, limpeza de identidade e preservação de perfis parciais já aprovadas.
- Mudanças de serviço agora podem ser necessárias para os bugs demonstrados, mas devem preservar as travas e ser verificadas em mocks. Não substituir Firebase nem projeto cloud.

## Índice do backlog

| ID | Prioridade | Evidência | Assunto |
|---|---|---|---|
| EXEC-01 | P0 | Reproduzido | Uma operação ativa por referência e por geração |
| EXEC-02 | P0 | Reproduzido | Consumo registrado uma vez, sem transformar falha de log em falha de geração |
| DATA-01 | P0 | Reproduzido | Confirmar a transação IndexedDB, não apenas o put |
| DATA-02 | P0 | Reproduzido | Não enviar novamente a mesma referência por comparar imagem integral com thumbnail |
| DATA-03 | P0 | Reproduzido | Preservar exclusões quando a nuvem estiver desligada ou falhar |
| DATA-04 | P0 | Reproduzido | Ordenar saves e deletes por ID também na nuvem |
| DATA-05 | P0 | Reproduzido | Revalidar o local depois da leitura cloud de uma sincronização |
| DATA-06 | P0 condicional | Reproduzido + inspeção | Amarrar operações ao usuário que as iniciou |
| DATA-07 | P1 | Reproduzido | Fallback de thumbnail sem imageUrl: undefined |
| DATA-08 | P1 | Reproduzido + inspeção | Cooldown e diagnóstico também nas falhas de sync |
| MERGE-01 | P1 | Reproduzido | Substituição explícita das tags canônicas e prioridade coerente |
| MERGE-02 | P1 | Reproduzido | Calibração não pode certificar descrições novas com notas herdadas |
| MERGE-03 | P1 | Reproduzido | Construir novas importações sem perder metadados locais do analisador |
| MERGE-04 | P1 | Reproduzido | Não reintroduzir dados que o normalizador já rejeitou |
| ART-01 | P1 | Reproduzido | Aproveitar a iluminação extraída e sua utilidade |
| ART-02 | P1 | Reproduzido + inspeção | Fazer a seleção usar os campos que o analisador novo produz |
| ART-03 | P1 | Reproduzido | Fechar a admissão de conteúdo sensível em vez de expandir listas sem fim |
| ART-04 | P1 | Reproduzido | Eliminar divergência entre presets e política auxiliar e matches por substring |
| ART-05 | P1 | Reproduzido | Preservar o escopo das negações e o contexto linguístico |
| ART-06 | P2 | Reproduzido | Completar o diagnóstico de contribuições rejeitadas e não consumidas |
| ART-07 | P1 | Reproduzido | Não gerar silenciosamente sem o Artstyle Database solicitado |
| UX-01 | P1 | Inspeção — validar no navegador | Estado da fila e travas durante troca de abas/desmontagem |
| UX-02 | P2 | Inspeção — validar no navegador | Atualizar seletor manual e bloquear envio enquanto imagem está sendo preparada |
| UX-03 | P2 | Inspeção | Validar importação de arquivos e nomes sem colisões artificiais |
| RUN-01 | P1 | Reproduzido | Estado de chave fora do AI Studio precisa corresponder a configuração real |
| RUN-02 | P0 antes de publicação | Risco demonstrável por inspeção, não vazamento constatado | Não publicar build estática com chave Gemini embutida |
| MON-01 | P2 | Inspeção | Métricas do Token Monitor e erros de API mais fiéis |
| ENG-01 | P1 para entrega | Lacuna de testes + execução independente | Testar orquestração real, não só helpers e rótulos de testes |
| ENG-02 | P2 | Inspeção — manutenção, não falha demonstrada | Reduzir duplicação de regras sem reescrever o aplicativo |
| OPT-01 | Preparação antes de lote | Melhoria proposta | Backup/restauração explícitos das referências analisadas |
| OPT-02 | Opcional / P2 para MIME | Inspeção + melhoria proposta | Preview de arte pura e download com extensão correta |
| OPT-03 | Depois das correções | Validação artística proposta | Amostra real para verificar utilidade do novo analisador |
| OPT-04 | Condicional / desempenho | Inspeção sem perfil de tempo | Orçamento de prompt e custo de percorrer o acervo |

## Achados e critérios de aceitação

### EXEC-01 — Uma operação ativa por referência e por geração

**Prioridade:** P0. **Estado:** Reproduzido.

**Fonte no ZIP:** `components/ArtstyleDatabase.tsx:411–459; App.tsx:49–121; components/CardForm.tsx:68–86`.

**Evidência:** S05, S06, N24.

A leitura inicial da reanálise ocorre antes de adquirir a trava e fora do try. Reanálise direta e retry podem produzir duas chamadas e duas gravações. O handler de geração também aceita duas invocações concorrentes; isLoading não constitui uma trava síncrona.

**Correção proposta:** Adquirir lock antes do primeiro await da operação confirmada; cobrir leitura, chamada e encerramento com try/finally; compartilhar a posse entre caminhos e rejeitar submissão duplicada. Preservar confirmação, snapshot e concorrência atual.

**Aceitação:** Intercalar callbacks reais com promises controladas: uma chamada; liberar trava após todas as falhas; nenhuma exceção de leitura fora do feedback; duas operações sequenciais legítimas continuam possíveis.

### EXEC-02 — Consumo registrado uma vez, sem transformar falha de log em falha de geração

**Prioridade:** P0. **Estado:** Reproduzido.

**Fonte no ZIP:** `components/ArtstyleDatabase.tsx:270–368,465–550; App.tsx:84–119`.

**Evidência:** F10, F11, F12, N23.

Conflitos/exclusão após resposta saem sem log; erro de merge perde 123 tokens de entrada/456 totais e registra zero. Em App, erro no saveTokenLog após produzir imagem cai no catch da geração e tenta escrever um segundo log de falha.

**Correção proposta:** Separar resultado da operação, consumo recebido e falha de telemetria. Finalizar exatamente um registro por tentativa; reter usageMetadata fora do escopo restrito; não disparar chamada/salvamento adicional por erro de log.

**Aceitação:** Sucesso, no-op, conflito, exclusão, falha de API, merge e monitor: verificar chamadas efetivas e contagens. Falha do monitor não apaga sucesso nem deixa promise escapar.

### DATA-01 — Confirmar a transação IndexedDB, não apenas o put

**Prioridade:** P0. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/localDbService.ts:31–39,53–73,87–95`.

**Evidência:** N25.

saveLocalDNA resolve no request.onsuccess antes de transaction.oncomplete; não há tratamento de abort da transação. O mock comprovou resolução antecipada. Não se afirma que houve perda real no acervo.

**Correção proposta:** Resolver gravações/exclusões/limpezas apenas após commit da transação e rejeitar onabort/onerror; manter uma gravação por operação, sem retries automáticos.

**Aceitação:** put bem-sucedido seguido de abort não anuncia sucesso; oncomplete confirma; consumo e registros usam o mesmo contrato de durabilidade.

### DATA-02 — Não enviar novamente a mesma referência por comparar imagem integral com thumbnail

**Prioridade:** P0. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/visualDnaSyncUtils.ts:241–247,290–315`.

**Evidência:** N15.

Com mesmo conteúdo, revision e updatedAt, a imagem local integral e a thumbnail em base64 diferem. Dois planejamentos consecutivos produzem um upload cada um, sem edição.

**Correção proposta:** Distinguir identidade/versão da imagem de sua representação. Usar fingerprint/revisão/estado de sincronização para detectar mudança efetiva. Preservar integral local e thumbnail 180×180 na nuvem.

**Aceitação:** Após sincronização real simulada, novo plano sem alterações contém zero writes. Troca genuína de imagem ainda produz uma atualização. Não resolver reduzindo a imagem local.

### DATA-03 — Preservar exclusões quando a nuvem estiver desligada ou falhar

**Prioridade:** P0. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/cloudDnaService.ts:98–114; services/visualDnaSyncUtils.ts:279–284`.

**Evidência:** N16.

deleteDNA remove localmente. Se não houve exclusão cloud, o próximo sync interpreta a cópia cloud como referência ausente e a restaura.

**Correção proposta:** Registrar intenção local de exclusão pendente com identificação do proprietário; reconciliar antes de recuperar itens cloud-only. Não interpretar qualquer ausência local como autorização de apagar a nuvem.

**Aceitação:** Exclusão explícita offline continua excluída após reconectar; referência legítima cloud-only ainda é recuperável; não apagar dados de outra conta.

### DATA-04 — Ordenar saves e deletes por ID também na nuvem

**Prioridade:** P0. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/cloudDnaService.ts:40–95,98–114`.

**Evidência:** N18, N19.

Um save antigo atrasado pela geração de thumbnail pode chegar depois do novo e substituir a revisão mais recente na nuvem. Um save em voo também pode recriar o documento depois de delete.

**Correção proposta:** Coordenar ordem por ID e validar versão/intenção antes de enviar, com proteção para saves/sync/deletes intercalados. Não aumentar paralelismo nem gravar novamente sem necessidade.

**Aceitação:** Save antigo lento + novo rápido deixa novo nos dois lados; delete durante thumbnail continua excluído. Testar promises invertidas, não só sequência feliz.

### DATA-05 — Revalidar o local depois da leitura cloud de uma sincronização

**Prioridade:** P0. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/cloudDnaService.ts:117–182`.

**Evidência:** N17.

syncCloudAndLocal lê localData antes da rede e aplica o plano sobre essa fotografia antiga. Edição local revisão3 durante leitura cloud foi substituída por cloud revisão2.

**Correção proposta:** Antes de aplicar cada atualização, comparar snapshot com estado atual e coordenar operações locais. Preservar edição/exclusão posterior e sinalizar conflito; não sobrescrever pela versão antiga do plano.

**Aceitação:** Rede pendente + editar/excluir localmente: resultado novo mantido, sem restauração indevida; testes incluindo sync e reanálise ao mesmo tempo.

### DATA-06 — Amarrar operações ao usuário que as iniciou

**Prioridade:** P0 condicional. **Estado:** Reproduzido + inspeção.

**Fonte no ZIP:** `services/cloudDnaService.ts:60–82,153–158,199–229; services/localDbService.ts:3–6; components/ArtstyleDatabase.tsx:94–108`.

**Evidência:** N20.

Iniciei save com uid A, troquei auth para B durante thumbnail: payload enviado com userId B. A biblioteca local também não é particionada por conta. Isso é risco em troca/múltiplas contas, não demonstra acesso real a dados alheios.

**Correção proposta:** Capturar proprietário no início, impedir continuação sob outra conta e definir escopo do acervo local. Importar/transferir biblioteca entre contas deve ser explícito, não efeito colateral de sync.

**Aceitação:** Troca de conta/desconexão em cada await não grava sob outro usuário. Dados legados sem dono não são atribuídos silenciosamente a quem logar depois.

### DATA-07 — Fallback de thumbnail sem imageUrl: undefined

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/visualDnaSyncUtils.ts:164–168; services/cloudDnaService.ts:66–82,202–229`.

**Evidência:** N21.

Falha de thumbnail leva a sanitizeCloudImageUrl que pode retornar undefined; setDoc recebe uma propriedade própria imageUrl com esse valor. O mock verifica payload, não uma resposta real do Firestore.

**Correção proposta:** Preservar thumbnail válida anterior quando existir; adiar/falhar o upload quando necessário ou omitir campo por contrato. Não enviar integral como atalho nem habilitar tolerância global a undefined.

**Aceitação:** Thumbnail falha na primeira gravação e numa atualização: sem undefined, sem perda de imagem válida, sem aumento da resolução cloud.

### DATA-08 — Cooldown e diagnóstico também nas falhas de sync

**Prioridade:** P1. **Estado:** Reproduzido + inspeção.

**Fonte no ZIP:** `services/cloudDnaService.ts:146–174,187–190,252–265`.

**Evidência:** N22.

Erro de leitura retorna antes de lastSyncAt: duas tentativas imediatas executam duas leituras apesar do intervalo configurado. Contadores de tentativas são preenchidos com o plano completo antes de executar, confundindo planejado com tentado.

**Correção proposta:** Marcar tentativas em todos os desfechos, manter quota/cooldown e contar operações realmente iniciadas. Não usar sucesso de leitura como prova de que uma restrição de escrita desapareceu.

**Aceitação:** Falhas repetidas respeitam intervalo; contador de tentativas é real; falhas parciais preservam dados e feedback, sem loop de retry.

### MERGE-01 — Substituição explícita das tags canônicas e prioridade coerente

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/visualDnaMerge.ts:478–525; services/visualTags.ts:63–80`.

**Evidência:** F06.

Base [dragon,custom-local] mais tags:[humanoid] resulta nos três, sem perfil sustentando dragon. priorityOrder contém nomes diferentes das categorias retornadas por getTagCategory.

**Correção proposta:** Distinguir omissão de lista explicitamente avaliada, preservar personalizadas não afetadas e tags sustentadas pelos perfis finais; reutilizar categorias/prioridades reais.

**Aceitação:** Lista nova substitui canônicas indevidas; omissão não limpa; perfil final pode justificar tag; limite14 mantém prioridades e não ressuscita elementos removidos.

### MERGE-02 — Calibração não pode certificar descrições novas com notas herdadas

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/visualDnaMerge.ts:559–607`.

**Evidência:** F05.

Base calibrada recebe palette nova e só scores.rendering novo. Há aviso de nota herdada da paleta, mas o ramo baseCalibrated mantém selo integral.

**Correção proposta:** Considerar alterações efetivas e associação descrição/score, inclusive campos avançados correspondentes; manter números sem promover procedência. Igualdade de texto não é mudança.

**Aceitação:** Descrição muda sem nota: aviso e sem selo integral; descrição igual não descalibra; reavaliação integral válida restaura; repetição é idempotente.

### MERGE-03 — Construir novas importações sem perder metadados locais do analisador

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `components/ArtstyleDatabase.tsx:309–316; services/visualTags.ts:841–853; services/visualDnaMerge.ts`.

**Evidência:** F07.

Importação sobre stub via merge seguro perde analysisVersion, analysisStatus e warnings que o serviço produziu. Pode aparecer simultaneamente nova calibração e engine legada.

**Correção proposta:** Distinguir criação de referência de atualização esparsa. Transportar metadados legitimamente atribuídos pelo serviço; não promover flags arbitrárias da resposta bruta.

**Aceitação:** Importação no handler real conserva versão/status/avisos, identidade local e calibração; uma gravação; nenhum raw/patch/clearFields persistido.

### MERGE-04 — Não reintroduzir dados que o normalizador já rejeitou

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/visualDnaMerge.ts:344–413; services/visualTags.ts:496–515`.

**Evidência:** N11.

Perfil completo com elements:[] e elementApplications:[weapon infusion]: normalizador remove a aplicação sem elemento, mas merge reconstrói a partir do raw e recoloca weapon infusion.

**Correção proposta:** Raw define presença/intenção; valores aplicados precisam passar validação/normalização equivalente. Validar invariantes e itens sem tratar normalização como autorização para apagar irmãos.

**Aceitação:** Infusão impossível não reaparece; blocos parciais permanecem preservados; perfil completo vazio legítimo limpa; tipos/enum/invariantes inválidos não entram.

### ART-01 — Aproveitar a iluminação extraída e sua utilidade

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/visualDnaEngine.ts:727–748,1093–1129`.

**Evidência:** N01.

Uma referência apenas com lighting:volumetric rim lighting e score alto não contribui nem em High. A montagem dos slots não consome o campo lighting; o diagnóstico ainda diz que tudo foi descartado como incompatível.

**Correção proposta:** Adicionar contribuição de iluminação subordinada ao pedido/preset, com escolha entre referências e diagnóstico. Diferenciar campo não consumido de rejeição por incompatibilidade.

**Aceitação:** Iluminação técnica compatível chega ao payload; iluminação que impõe cor/energia incompatível continua filtrada; score de iluminação influencia esse slot.

### ART-02 — Fazer a seleção usar os campos que o analisador novo produz

**Prioridade:** P1. **Estado:** Reproduzido + inspeção.

**Fonte no ZIP:** `services/visualDnaEngine.ts:66–80,185–205,293–309; services/geminiService.ts:287–317`.

**Evidência:** N02.

contentMotifs, primarySubject e descrições de subjects não entram como sinais de texto na busca testada. Referência cuja relevância lunar observatory existia só nesses campos perdeu para a primeira irrelevante. Context Focus também não chega à seleção automática.

**Correção proposta:** Consumir esses campos com pesos explícitos e exclusões preservadas; usar Context Character/Object/Scenario na relevância. Não transformar utilidade artística em tema nem escolher aleatoriamente para disfarçar empates.

**Aceitação:** Referências relevam por conteúdo, não ordem de armazenamento em empate artificial; limpar técnica/conteúdo no analisador não elimina sinais de busca; logs da seleção e geração concordam.

### ART-03 — Fechar a admissão de conteúdo sensível em vez de expandir listas sem fim

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/visualDnaPolicy.ts:731–782; services/visualDnaEngine.ts:814–969`.

**Evidência:** N03, N04.

Para nobre humano em seda branca, foram emitidos Elements: fire e six insect legs and a scorpion tail em casos separados. Conteúdo passa quando não aciona proibição conhecida, mesmo sem compatibilidade demonstrada.

**Correção proposta:** Distinguir conteúdo condicional de técnica em todos os caminhos. Anatomia, escala, elemento e material sem suporte não podem tornar-se instrução positiva só por não estarem numa blacklist. Preservar técnica independente, não desativar todo DNA.

**Aceitação:** Fogo/pernas extras não solicitados ausentes; pedido explícito correspondente em Generic permitido; técnica de contorno/sombra útil continua contribuindo.

### ART-04 — Eliminar divergência entre presets e política auxiliar e matches por substring

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `constants.ts:234–259; services/visualDnaPolicy.ts:123–129,695–740`.

**Evidência:** N05, N06.

Tech-Zero permite ciano como acento no preset, mas small cyan accents é rejeitado para A modular robot por ausência nos signatureTerms auxiliares. Em outro caso, sacred foi tratado como pedido de red por includes.

**Correção proposta:** Tornar a política explicitamente coerente com todos os presets sem redesenhá-los. Comparar termos e papéis, não substring interna de qualquer palavra. Não exigir repetição literal no subject do que o preset já permite.

**Aceitação:** Acerto ciano Tech-Zero passa sem forçá-lo para toda carta; sacred não libera vermelho; preto de Shadow-Heart e branco/carmim de RoyalCarmine mantêm seus papéis.

### ART-05 — Preservar o escopo das negações e o contexto linguístico

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/promptParser.ts:73–94,165–188; services/visualDnaPolicy.ts:817–864`.

**Evidência:** N07, N08, N09.

no grande palácio em português vira exclusão; avoid wearing black clothes and holding weapons torna armas afirmativas; no black clothing remove black linework por perder o vínculo entre preto e roupa.

**Correção proposta:** Formalizar interpretação local de trechos/exclusões e seus limites; preferir representação de exclusão contextual a conjunto solto de palavras. Não implementar parser NLP universal nem remendar cada frase exata.

**Aceitação:** Três reproduções corrigidas, transições wearing white silk/holding staff continuam positivas onde aplicável; no wyvern continua sem override; texto original intacto.

### ART-06 — Completar o diagnóstico de contribuições rejeitadas e não consumidas

**Prioridade:** P2. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/visualDnaEngine.ts:764–812,1080–1154`.

**Evidência:** N12 + N01.

scaleForms/scaleCues registram apenas contribuições aceitas dentro do limite. Rejeições, duplicatas e cortes não recebem avaliação; campo ignorado pode ser explicado como incompatível.

**Correção proposta:** Gerar texto e diagnóstico a partir da lista final de decisões. Registrar rejeição, duplicação, limite e campo não utilizado sem dizer que foi enviado. Não mandar detalhes bloqueados ao modelo para explicar.

**Aceitação:** Cada contribuição avaliada tem decisão; rejeição de colossal aparece; referências contribuintes refletem só texto realmente emitido; nenhuma identidade limpa retorna pelo log.

### ART-07 — Não gerar silenciosamente sem o Artstyle Database solicitado

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/geminiService.ts:287–330`.

**Evidência:** N13.

Falha de leitura do banco foi capturada apenas no console; a geração de imagem ainda foi executada sem DNA, embora useVisualDB estivesse habilitado.

**Correção proposta:** Falhar antes da chamada paga ou solicitar/registrar aprovação explícita do fallback. Diferenciar banco vazio legítimo, tudo filtrado e erro operacional; mostrar estado final.

**Aceitação:** Erro local não vira uma geração normal sem referências; fallback explícito continua possível; banco desligado/vazio tem comportamento documentado e sem diagnóstico falso.

### UX-01 — Estado da fila e travas durante troca de abas/desmontagem

**Prioridade:** P1. **Estado:** Inspeção — validar no navegador.

**Fonte no ZIP:** `App.tsx:515–519; components/ArtstyleDatabase.tsx:43,84–108,370–393,613–615`.

**Evidência:** Inspeção de montagem e estado local.

O componente da biblioteca é desmontado ao trocar abas, mas filas/travas estão dentro dele. Promises já iniciadas não são canceladas pelo trecho de limpeza do componente; nova montagem cria novas travas.

**Correção proposta:** Definir uma operação de sessão independente da montagem visual, ou impedir/descrever a saída enquanto trabalha. Separar dispensar visualmente, pausar novos itens e cancelar quando possível. Não confundir Dismiss com cancelamento retroativo.

**Aceitação:** Trocar aba/voltar durante chamada não oculta trabalho sem controle nem abre nova chamada para mesmo ID. Validar botões e feedback no AI Studio sem ampliar concorrência.

### UX-02 — Atualizar seletor manual e bloquear envio enquanto imagem está sendo preparada

**Prioridade:** P2. **Estado:** Inspeção — validar no navegador.

**Fonte no ZIP:** `components/CardForm.tsx:56–107,441–458; App.tsx:279–281,515–519`.

**Evidência:** Inspeção de useEffect, montagem e disabled.

CardForm permanece montado e relê DNA apenas por isLoading/useVisualDB; voltar da biblioteca após importar não invalida sua lista. Botão de geração não considera isCompressing.

**Correção proposta:** Invalidar dados locais mediante alterações da biblioteca com evento/estado compartilhado, sem nova leitura cloud. Esperar preparação da Reference Image; prevenir corrida entre arquivos selecionados rapidamente.

**Aceitação:** Importar/excluir/editar aparece ao voltar; enviar durante compressão não produz imagem sem referência; última seleção de imagem prevalece.

### UX-03 — Validar importação de arquivos e nomes sem colisões artificiais

**Prioridade:** P2. **Estado:** Inspeção.

**Fonte no ZIP:** `components/ArtstyleDatabase.tsx:192–227; components/CardForm.tsx:95–108; services/imageUtils.ts:1–72`.

**Evidência:** Inspeção do lote e uso de file.name.split(".")[0].

Deduplicação consulta estado anterior durante forEach async, sem conjunto do lote. split no primeiro ponto conflita nomes como carta.v1.png e carta.v2.png. Compressão simultânea de todo lote não tem orçamento explícito de tamanho.

**Correção proposta:** Usar basename sem apenas a extensão final, reservar IDs/nomes de forma determinística, validar tipos e limites proporcionais. Controlar preparação local sem aumentar concorrência da API.

**Aceitação:** Mesmo nome no mesmo lote tem resolução explícita; versões no nome preservadas; arquivo inválido/grande gera feedback sem travar fila; nada enviado silenciosamente.

### RUN-01 — Estado de chave fora do AI Studio precisa corresponder a configuração real

**Prioridade:** P1. **Estado:** Reproduzido.

**Fonte no ZIP:** `services/geminiService.ts:659–687; README.md:13–20`.

**Evidência:** N14.

Fora de window.aistudio, promptApiKeySelection apenas grava apiKeyConnected=true. No teste sem credencial configurada, checkApiKey passou a true.

**Correção proposta:** Distinguir integração do host e execução local. Mostrar configuração ausente sem afirmar conexão válida só por localStorage; continuar permitindo ambiente local configurado pelo usuário sem expor segredo nos logs.

**Aceitação:** Sem credencial/bridge não aparece conectado; bridge do AIStudio preservada; testes locais com mocks não precisam de uma chave real.

### RUN-02 — Não publicar build estática com chave Gemini embutida

**Prioridade:** P0 antes de publicação. **Estado:** Risco demonstrável por inspeção, não vazamento constatado.

**Fonte no ZIP:** `vite.config.ts:5–16; services/geminiService.ts:278,436; README.md:18–20`.

**Evidência:** Inspeção da substituição build-time.

Vite substitui process.env.API_KEY pelo valor literal de GEMINI_API_KEY, e o SDK é chamado no frontend. Uma build feita com chave real pode conter o segredo. Não há prova de exposição na implantação atual; o ZIP não inclui .env.local.

**Correção proposta:** Documentar e preservar o mecanismo seguro do host; separar teste local e produção. Não distribuir dist com chave real; revisar a integração de credenciais antes de publicar. Não confundir configuração pública de Firebase com chave privada Gemini.

**Aceitação:** Build de teste com marcador fictício revela eventual injeção; distribuição final sem segredo; migração de ambiente testada sem alterar preset/cloud project. Arquitetura de credenciais é decisão explícita, não rebuild automático.

### MON-01 — Métricas do Token Monitor e erros de API mais fiéis

**Prioridade:** P2. **Estado:** Inspeção.

**Fonte no ZIP:** `components/TokenMonitor.tsx:44–52,235–256; services/geminiService.ts:381–408,691–699; App.tsx:110–116`.

**Evidência:** Expressão de média e composição no código.

Média soma tokens de todas as chamadas e divide só pelas bem-sucedidas. Contagens ausentes viram zero. Falta de content em candidate pode gerar TypeError sem usageMetadata. 404 é atribuído genericamente à chave.

**Correção proposta:** Definir média por tentativa ou por sucesso coerentemente. Distinguir dado ausente de consumo zero e preservar resposta/erro tipado. Validar oficialmente a relação input/cache/tool/thoughts antes de somar colunas; esta auditoria não consultou documentação externa de tokens.

**Aceitação:** Sucesso100+falha100 =100 por tentativa, não200; falta de conteúdo preserva consumo; não culpar chave por qualquer404; totais e componentes auditáveis sem contagens inventadas.

### ENG-01 — Testar orquestração real, não só helpers e rótulos de testes

**Prioridade:** P1 para entrega. **Estado:** Lacuna de testes + execução independente.

**Fonte no ZIP:** `services/visualDnaSafeMergeRound3B.test.ts:760–870; testes existentes; App/Artstyle/cloud/localDb`.

**Evidência:** 38 verificações anteriores +26 adicionais.

O teste L constrói snapshots manualmente e não executa duas chamadas intercaladas dos handlers. Testes existentes passam sem cobrir sync↔save↔delete, logging que falha, desmontagem e commit de transação.

**Correção proposta:** Adicionar testes de integração com promises controladas aos callbacks/orquestrador usados de fato pela UI, storage e SDK mocks. Preservar testes anteriores; testes e build em ambiente com dependências instaladas.

**Aceitação:** Reproduções vermelhas antes de corrigir, verdes depois; executar suíte/build completos e smoke test local/AIStudio; nunca usar conta real para testar falhas de quota.

### ENG-02 — Reduzir duplicação de regras sem reescrever o aplicativo

**Prioridade:** P2. **Estado:** Inspeção — manutenção, não falha demonstrada.

**Fonte no ZIP:** `services/visualTags.ts:839–853; services/visualDnaMerge.ts:1–8; components/ArtstyleDatabase.tsx; tsconfig.json`.

**Evidência:** Ciclo de importações e orquestrações duplicadas no código.

visualTags reexporta merge e merge importa visualTags. Biblioteca monolítica mistura UI, fila, persistência e consumo; fluxos duplicados evoluíram de modo diferente. tsconfig não ativa strict.

**Correção proposta:** Extrair somente orquestração/contratos puros necessários; separar taxonomia do merge se tocar o ciclo; tipar fronteiras raw de forma localizada. Não ligar strict global e refatorar tudo na mesma entrega sem medir escopo.

**Aceitação:** Mesma regra de trava/log para direta e fila; mudanças pequenas com cobertura; política artística, storage e host não trocados sem aprovação.

### OPT-01 — Backup/restauração explícitos das referências analisadas

**Prioridade:** Preparação antes de lote. **Estado:** Melhoria proposta.

**Fonte no ZIP:** `components/TokenMonitor.tsx:34–42; components/ArtstyleDatabase.tsx`.

**Evidência:** Não há exportação integral da biblioteca implementada nos caminhos lidos.

O export atual é de logs, não das referências. Uma sincronização de miniaturas não substitui um backup das imagens locais/análises antes de alterações em massa.

**Correção proposta:** Criar export/import local versionado apenas do acervo analisado, com validação, conflitos explícitos e restauração ensaiada. Sem dados brutos extensos, chaves ou histórico de imagens geradas.

**Aceitação:** Exportar pequena amostra, restaurar num banco de teste e verificar conteúdo/imagens/metadados. Não acionar cloud nem reanálise automaticamente.

### OPT-02 — Preview de arte pura e download com extensão correta

**Prioridade:** Opcional / P2 para MIME. **Estado:** Inspeção + melhoria proposta.

**Fonte no ZIP:** `components/CardFrame.tsx:30–54; App.tsx:123–134; services/geminiService.ts:391–395`.

**Evidência:** Inspeção de object-cover/reflexo e extensão fixa.

O preview possui corte/reflexo de apresentação; o download sempre recebe .png apesar de imageUrl aceitar outro MIME. Isso não prova que a arte gerada tem brilho ou enquadramento incorretos.

**Correção proposta:** Oferecer visualização sem corte/reflexo para avaliar a arte, preservando aparência atual como opção. Escolher extensão a partir do MIME sem reconverter imagem desnecessariamente.

**Aceitação:** PNG/JPEG saem com extensão correspondente; visão pura mostra a imagem inteira; nenhuma alteração do tema do app.

### OPT-03 — Amostra real para verificar utilidade do novo analisador

**Prioridade:** Depois das correções. **Estado:** Validação artística proposta.

**Fonte no ZIP:** `services/geminiService.ts:434–647; services/visualDnaEngine.ts; presets`.

**Evidência:** Não foram feitas gerações ou reanálises reais nesta auditoria.

Notas válidas/variadas e testes mockados não provam que técnica, materiais ou identidade foram interpretados corretamente. ZIP não contém o acervo analisado nem resultados de A/B.

**Correção proposta:** Comparar uma pequena amostra antes/depois e geração com banco desligado, antigo e reanalisado usando mesmo pedido/modelo. Inspecionar influência do DNA e preservação da identidade; ampliar somente após aprovação.

**Aceitação:** Não fixar notas corretas da referência favorita nem rebaixar fundo simples artificialmente. Rodar apenas chamadas explicitamente autorizadas; sem reanalisar centenas para validar código.

### OPT-04 — Orçamento de prompt e custo de percorrer o acervo

**Prioridade:** Condicional / desempenho. **Estado:** Inspeção sem perfil de tempo.

**Fonte no ZIP:** `services/geminiService.ts:287–317; services/visualDnaEngine.ts:185–205; components/CardForm.tsx:56–66; services/localDbService.ts:76–84`.

**Evidência:** Inspeção; sem benchmark do acervo real.

Referências carregadas por getAll incluem imagens; seleção e logs repetem trabalho; limites de quantidade de fragmentos não limitam comprimento total. Não foi medido gargalo de CPU/memória no acervo do usuário.

**Correção proposta:** Após correções, perfilar com fixtures representativas, reutilizar resultados da seleção e impor orçamento textual seguro com cortes por fragmento, sem mutilar frases. Otimizar leitura local somente se houver ganho medido.

**Aceitação:** Testes de centenas de registros simulados, sem cloud; logs correspondem ao texto realmente emitido; limites não removem restrições essenciais nem justificam trocar modelos.

## Ordem sugerida de implementação pelo Codex

1. Congelar esta base, preparar mocks/fixtures e casos de regressão. Criar um meio de backup local antes de qualquer alteração real de dados.
2. EXEC e DATA: travas, telemetria, transações e sync/save/delete/conta. Corrigir uma causa por etapa interna, executar a suíte acumulada; não pedir ao usuário para arbitrar cada regex.
3. MERGE: fechar tags, calibração, criação e normalização dos perfis. Reexecutar os casos já aprovados.
4. ART: iluminação, campos de relevância e uma política de transferência consistente. Preservar técnicas úteis em contraprovas; não desligar o banco para obter testes verdes.
5. UX/RUN: ciclo de sessão, seletores, upload e runtime local/AI Studio; validar a segurança antes de publicar builds.
6. Rodar Vitest/build completos, smoke test com rede simulada, revisar diff. Entregar arquivos alterados, testes, limitações e instruções de substituição no AI Studio, preservando segredos/configuração do host.
7. Somente depois, amostra artística autorizada e decisão sobre reanálise em lote.

As mudanças podem ser realizadas numa entrega consolidada, mas com passos internos verificáveis. “Arrumar tudo” não significa uma refatoração sem critérios ou garantia de que nenhum outro bug exista.

## Arquivos do pacote de evidências

- `evidence/source-manifest.json`: hashes e tamanhos dos 39 arquivos da base.
- `results.json`, `supplemental-results.json`, `evidence/audit-extra-results.json`: as 64 verificações, resultados e observações de payloads/estados.
- `review.cjs`, `supplemental.cjs`, `audit_extra.cjs`: runners de auditoria com mocks; não são a suíte Vitest do aplicativo.
- `source/`: cópia exata do ZIP, sem node_modules, credenciais ou arte gerada.
- `logs/`: saídas da auditoria e falha da instalação offline.
- `SOURCE_EXCERPTS.md`: trechos numerados para localizar os pontos mais importantes.

Os runners usam o TypeScript global disponível no ambiente da auditoria. Para executar no ambiente do Codex, adaptar apenas a resolução do compilador para a dependência TypeScript instalada (ou definir `AUDIT_TYPESCRIPT_PATH`, quando suportado pelo runner), sem alterar a lógica do aplicativo. O conjunto não substitui testes de browser ou aprovação de deploy.
