# Guia de Homologação no Google AI Studio (Build Mode)

Este roteiro orienta a validação da versão sincronizada do Grimoire Artificer após o pull do repositório no Google AI Studio.

---

## 1. Configurações que pertencem ao ambiente (Não versionadas no Git)

Ao fazer `git pull` ou atualizar branches, os seguintes arquivos/configurações permanecem locais e não são transportados pelo repositório:
- `firebase-applet-config.json`: Chaves de projeto e IDs do Firebase provisionados no AI Studio.
- `firestore.rules` e `firebase-blueprint.json`: Regras de segurança e estrutura de dados de coleções Firestore.
- `metadata.json`: Metadados do applet (`name`, `description`, `majorCapabilities`).
- Segredos de servidor e variáveis de ambiente: injetadas pelo AI Studio (ex: `GEMINI_API_KEY`).
- Dados locais do navegador (`IndexedDB` e `localStorage`): pertencem à origem do navegador e não são alterados pelo Git.

> **Importante:** Nunca limpe os dados do navegador para "tentar resolver" um conflito de código, pois isso apagaria suas referências locais e histórico offline do IndexedDB.

---

## 2. Como verificar o commit em execução

No terminal do AI Studio, verifique a branch e o commit ativo:

```sh
git status
git log -n 1 --oneline
```

Confira se o commit exibido corresponde à versão aprovada e se não há arquivos locais de configuração sobrescritos de forma destrutiva.

---

## 3. Como conferir a separação dos Modos de Acesso

A interface do Grimoire Artificer agora exibe no cabeçalho o indicador de acesso:

1. **Acesso padrão do AI Studio:**
   - Ativo quando nenhuma chave pessoal foi selecionada no modal do host (ou se foi clicado em Desconectar).
   - O botão exibe **"Padrão AI Studio"**.
   - O modelo **Lite** (`gemini-3.1-flash-lite-image`) está disponível para prototipagem utilizando o acesso disponibilizado pelo host.
   - Os modelos **Pro** e **Flash** são travados, exigindo clique no botão para selecionar a chave pessoal.

2. **Chave pessoal selecionada:**
   - Ativo quando o usuário clica em "Conectar Chave" e seleciona sua chave no diálogo do AI Studio (`window.aistudio.openSelectKey()`).
   - O botão exibe **"Chave Pessoal"** (ou "Linked").
   - Todos os modelos (Lite, Flash e Pro) estão liberados.
   - No dropdown do botão, clicar em **"Desconectar"** retorna a aplicação de forma limpa ao modo padrão sem bloquear permanentemente o Lite.

3. **Servidor local configurado:**
   - Exibido quando rodando fora do AI Studio com `GEMINI_API_KEY` configurada no Node.

4. **Acesso indisponível:**
   - Exibido se não houver AI Studio nem backend configurado. Não gera chamadas fictícias.

---

## 4. Localizar, Exportar e Restaurar o Acervo Analisado

Na aba **Artstyle Database**:

1. **Exportação:**
   - Clique em **"Exportar"** para baixar um arquivo JSON estruturado contendo todas as referências do escopo atual com suas imagens originais, metadados de calibração, tags e scores.
   - Se estiver logado em uma conta, use **"Exportar acervo legado"** se possuir registros antigos criados antes do login que deseje salvar separadamente.
   - O backup é 100% estático e não dispara migrações nem chamadas à nuvem.

2. **Restauração com Prévia e Confirmação:**
   - Clique em **"Restaurar"** e selecione o arquivo `.json` de backup.
   - Um modal de prévia abrirá imediatamente apresentando:
     - Validação estrutural do arquivo e versão suportada (`version: 1`).
     - Alerta caso o backup pertença a outro usuário/escopo.
     - Contagem de registros novos (que serão adicionados).
     - Contagem de registros idênticos (que serão preservados sem gravações redundantes).
     - Conflitos detectados (mesmo ID com conteúdo diferente): por padrão mantém o atual, permitindo escolher explicitamente "Substituir".
     - Registros excluídos (tombstones): por padrão mantém excluído, permitindo escolher explicitamente "Ressuscitar".
   - Clique em **"Confirmar Restauração"** para aplicar. A escrita é 100% local no IndexedDB e **não dispara sincronização com o Firestore**.

---

## 5. Roteiro de Verificação Manual pelo Usuário

Execute na interface os seguintes passos de homologação:
- [ ] Entrar na aplicação e verificar se o botão no topo indica **"Padrão AI Studio"** (ou "Chave Pessoal" caso já tenha selecionado anteriormente).
- [ ] No formulário do Grimoire, tentar gerar uma carta com **Lite**: a chamada deve prosseguir sem forçar seleção de chave paga.
- [ ] Tentar selecionar **Pro** ou **Flash**: verificar se a interface solicita a conexão de chave pessoal.
- [ ] Clicar no botão do cabeçalho para conectar a chave pessoal via modal do AI Studio.
- [ ] Após conectar, testar geração com **Pro** ou **Flash**.
- [ ] Clicar no botão do cabeçalho e selecionar **"Desconectar"**: verificar se o modo retorna para **"Padrão AI Studio"** e se o **Lite** continua funcionando normalmente.
- [ ] Na aba **Artstyle Database**, exportar um backup JSON.
- [ ] Clicar em **"Restaurar"** e carregar o arquivo: conferir se a prévia lista os itens corretamente e se a restauração local preserva as referências sem erros.
