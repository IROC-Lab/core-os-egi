# AGENTS.md ({{NOME}})
> Regras deste cérebro pra Codex, Antigravity e qualquer agente que não seja o Claude Code.

**A constituição é o `CLAUDE.md` desta pasta. Leia ele inteiro antes de qualquer ação e siga como se fosse este arquivo.** Onde ele diz "Claude", leia "você".

O Claude Code tem ganchos automáticos que os outros motores não têm. Então faça você mesmo:

1. **Nota de status do painel (CLAUDE.md §6):** se a variável de ambiente `CORE_OS_SESSAO` existir (rode `echo $CORE_OS_SESSAO`), a nota desta conversa é `sessoes/<valor>.md`. Crie ela na primeira ação, no formato fixo, e marque cada etapa ao terminar.
2. **Início de conversa:** leia o topo de `tasks/todo.md` pra saber o que está aberto.
3. **Captura contínua (CLAUDE.md §2):** a cada mensagem do dono, fato novo vai pro lugar certo na hora, com anúncio de 1 linha.
4. **Skills:** estão em `.claude/skills/<nome>/SKILL.md` (também visíveis em `.agents/skills/`). Antes de fazer carrossel, thumbnail, edição de vídeo, WhatsApp ou fechar sessão, leia a skill correspondente e siga.
5. **Credenciais:** são as variáveis da empresa, no arquivo apontado por `$CORE_OS_ENV` (carregue com `set -a; . "$CORE_OS_ENV"; set +a`). Nunca copiar pra dentro do cérebro.
8. **Marca:** antes de criar qualquer peça visual ou texto de marca, leia `marca/CLAUDE.md` (brandbook em `marca/brandbook/`, use o `.txt` ao lado do PDF).
6. **Especialistas:** os papéis em `.claude/agents/*.md` (SDR etc.) valem pra você também: leia o arquivo do especialista e siga o roteiro quando o pedido for dele.
7. **Nunca usar travessão** (traço longo).
