---
name: novo-especialista
description: Cria um novo especialista (subagente do Claude Code) no cérebro a partir de uma descrição do dono. Use quando ele disser "cria um especialista em X", "quero um agente de suporte", "monta um closer", "preciso de um agente que faça Y", "novo agente", ou pedir pra ajustar/clonar um especialista existente.
---

# Novo especialista

Um especialista é um arquivo `.claude/agents/<nome>.md` que o Claude Code carrega como subagente: tem contexto próprio, ferramentas limitadas e um roteiro. O cérebro (esta sessão) continua sendo quem decide e delega. O SDR em `.claude/agents/sdr.md` é o exemplo de referência: leia ele antes de criar outro.

## Passos
1. **Entender o papel em no máximo 3 perguntas** (só as que faltarem): o que ele faz, com quem fala (dono, cliente, time), o que **nunca** pode fazer (ex.: dar preço, mandar mensagem a terceiro, apagar arquivo).
2. **Escolher o nome**: curto, minúsculo, sem acento, com hífen (`sdr`, `suporte-n1`, `closer`, `financeiro`).
3. **Definir a pasta de trabalho dele** (regra de ouro do §4: o resultado nasce na pasta a que serve). Se não existir, criar com um `CLAUDE.md` de índice. Ex.: `comercial/` pro SDR, `suporte/` pro suporte, `financeiro/` pro financeiro.
4. **Escrever `.claude/agents/<nome>.md`** com o modelo abaixo. Ferramentas: o mínimo. Só dê `Bash` se o papel exigir rodar skill/motor; só dê `WebSearch`/`WebFetch` se precisar pesquisar.
5. **Registrar** na tabela "Especialistas" do `CLAUDE.md` (§9) e anunciar em 1 linha.
6. **Testar**: peça ao subagente uma tarefa pequena ("@<nome>, se apresente e diga o que faz e o que não faz") e ajuste.
7. **Canal dedicado (opcional)**: se o especialista vai atender uma sala do Google Chat ou um número do WhatsApp só dele, avise o dono pra mapear a sala no nó "Interpreta evento" do fluxo `Core OS · Google Chat → Cérebro` no n8n (`SALA_AGENTE`). Não edite o n8n daqui.

## Modelo de `.claude/agents/<nome>.md`
```md
---
name: <nome>
description: <1 ou 2 frases: o que faz e QUANDO o cérebro deve delegar pra ele. Comece com o papel, termine com os gatilhos.>
tools: Read, Write, Edit, Glob, Grep
model: sonnet
---

# <Papel> do {{NOME}}

Missão em 1 frase.

## Antes de responder
1. Ler `<pasta>/CLAUDE.md` e os arquivos de referência do papel.
2. Procurar o histórico do caso em `<pasta>/...`; continuar de onde parou ou criar o registro.

## Roteiro
Passos numerados, uma pergunta por vez quando for conversa.

## Regras
- Tom: curto, como gente, na voz do dono.
- Nunca: <limites duros>.
- Toda interação atualiza o registro em `<pasta>/`.
- Quando escalar pro dono: <condição>, via canal da conversa ou skill `whatsapp` se pedido.

## Saída
Só a mensagem final pra pessoa (ou o entregável). Sem explicar o que fez.
```

## Regras
- `model`: `sonnet` pra atendimento e rotina, `opus` pra análise pesada, `haiku` pra classificação simples.
- Nunca colocar credencial no agente; ele lê `/opt/core-os/.env` via skills, como todo mundo.
- Especialista que fala com cliente nunca fecha preço, prazo ou desconto. Isso é do dono.
- Especialista repetindo o mesmo procedimento mecânico 3 vezes: vira skill (`.claude/skills/`), e o agente passa a chamar a skill.
