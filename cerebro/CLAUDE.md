# CLAUDE.md ({{NOME}})
> Constituição do segundo cérebro. Leia antes de qualquer ação. Fonte única de contexto e roteamento.
> Instalado pelo Core OS (arquitetura do segundo cérebro do Felipe Tâmbara, v3), adaptação EGI: roda no Coolify, usa o n8n e a Evolution que já existem e atende também pelo Google Chat.

---

## 1. Quem sou eu

**{{NOME}}.** Este cérebro mora numa VPS ligada 24 horas. Eu falo com ele pelo painel no navegador, pelo WhatsApp, pelo Google Chat ou pelo terminal.

### Como falar comigo
Direto, como no WhatsApp. Simples pra qualquer pessoa entender. Técnico só quando eu pedir.

---

## 2. Protocolo de Captura Contínua (regra número 1)

> **Tudo que eu falo vira registro no lugar certo, na hora.** Não existe "depois eu salvo". Não existe inbox.

1. **Toda mensagem minha é fonte de captura.** Fato novo sobre pessoa, negócio, decisão ou número vai pro objeto certo (§4) na hora, mesmo que seja secundário ao pedido.
2. **Anunciar em 1 linha** cada gravação: "Gravei em `tasks/todo.md`".
3. **No máximo 1 pergunta de completude** quando faltar dado-chave. Não interrogar.
4. **Tarefa mencionada vira item em `tasks/todo.md`.**
5. **Correção minha vira lição em `tasks/lessons.md`**, com o padrão que evita repetir o erro.

---

## 3. Estrutura

| Pasta | O que tem |
|---|---|
| `tasks/` | `todo.md` (fonte única de tarefas) e `lessons.md` (padrões aprendidos) |
| `memoria/` | `MEMORY.md`: contexto vivo, 1 linha por nota |
| `conteudo/` | Tudo que o cérebro produz: `carrosseis/`, `thumbnails/`, `reels/`, `whatsapp/`. É daqui que o painel puxa a aba Conteúdos |
| `sessoes/` | Uma nota de status por conversa aberta no painel (§6) |
| `assets/` | Arquivos de apoio: fotos, logos, fontes, PDFs |
| `comercial/` | Oferta, pipeline e um arquivo por lead. Pasta de trabalho do especialista `sdr` |
| `.claude/` | Skills, hooks e `agents/` (os especialistas, §9) |
| `AGENTS.md` + `.agents/skills` | Ponte pros outros motores (Codex, Antigravity): mandam ler este CLAUDE.md e usar as mesmas skills |

**Não existe (e não criar):** inbox, diário, pasta de "processar depois". Material sem destino claro = 1 pergunta e gravar onde eu apontar.

---

## 4. Roteamento (onde gravar)

> Regra de ouro: todo resultado nasce dentro da pasta a que serve.

**Índice de pasta:** cada pasta tem um `CLAUDE.md` com o mapa do que existe ali. Antes de varrer uma pasta, leia o índice dela. O índice é mapa, não fonte da verdade: divergiu, o arquivo vence e o índice se conserta na hora.

| Gatilho | Destino |
|---|---|
| Carrossel | `conteudo/carrosseis/YYYY-MM-DD-tema/` |
| Thumbnail | `conteudo/thumbnails/<slug-do-video>/` |
| Edição de vídeo | `conteudo/reels/<numero-ou-slug>/` |
| Mensagem enviada no WhatsApp (registro) | `conteudo/whatsapp/YYYY-MM-DD-assunto.md` |
| Tarefa, pendência | `tasks/todo.md` |
| Correção/lição | `tasks/lessons.md` |
| Arquivo de apoio | `assets/` |
| Lead, prospect, qualificação | `comercial/leads/YYYY-MM-DD-<empresa>.md` e linha em `comercial/pipeline.md` (via especialista `sdr`) |

Toda entrega ganha um `pedido.md` na pasta dela: o que eu pedi, por onde pedi (painel, WhatsApp ou terminal) e o que foi entregue.

---

## 5. Skills

| Skill | O que faz |
|---|---|
| `whatsapp` | WhatsApp em mão dupla: lê conversas, acha contato e manda mensagem ou arquivo pra qualquer pessoa (ou pro dono) |
| `carrossel` | Cria carrossel de Instagram: texto em HTML/CSS, renderizado em PNG slide a slide |
| `thumbnail` | Gera thumbnail de YouTube a partir do roteiro e de uma referência de estilo |
| `edicao-video` | Edita vídeo curto: último take de cada fala, cortes, legenda e trilha |
| `save` | Fecha a sessão: captura final, todo, lições e índices em dia |
| `novo-especialista` | Cria um novo especialista (subagente) a partir de uma descrição: arquivo em `.claude/agents/`, pasta de trabalho e registro no §9 |

> Regra pra criar a próxima: fez a mesma coisa 3 vezes, vira skill. Moram em `.claude/skills/<nome>/SKILL.md` e entram nesta tabela.

---

## 6. Conversas do painel (nota de status)

Toda conversa aberta pelo painel recebe, no prompt de sistema, o caminho da nota dela em `sessoes/`. Regras:

1. **Primeira ação de qualquer tarefa:** criar a nota com um checklist, uma linha por etapa.
2. **Formato fixo:**
   ```markdown
   # <título curto da conversa>
   > <resumo em 1 ou 2 frases do que está sendo feito>

   - [ ] etapa 1
   - [ ] etapa 2
   ```
3. Marcar cada etapa assim que terminar e escrever o resultado final no resumo.
4. O painel mostra essa nota na lista de conversas. Se ela não existir, eu fico cego.

---

## 7. Motores de IA

O painel roda cada conversa num motor: **Claude Code** (padrão), **Codex** (OpenAI) ou **Antigravity** (Google, comando `agy`). A escolha fica na engrenagem do painel, separada pra conversas novas e pro WhatsApp. Todos leem as mesmas regras e skills. Código em `/opt/core-os/painel/motores.js` (dentro do container do Coolify).

## 8. Canais

| Canal | Como chega | Quem decide quem pode falar |
|---|---|---|
| Painel | Terminal real do Claude Code no navegador | Senha do painel |
| WhatsApp | Evolution → n8n → painel (`/api/ponte/whatsapp`) → eu → Evolution | Painel, Configurações › WhatsApp |
| Google Chat | App do Chat → n8n → painel (`/api/ponte/canal`) → eu → n8n → sala | `dados/canais-acesso.json` (e-mails ou `@dominio`) |

Pelo WhatsApp e pelo Google Chat a resposta final vira mensagem: curta, texto simples, negrito só com *asteriscos*. A sala ou thread do Google Chat é uma conversa; `/nova` abre outra. Se a sala estiver mapeada pra um especialista (no n8n), o pedido já chega com ele indicado e eu delego direto. Variáveis `CORE_OS_CANAL`, `CORE_OS_CANAL_DE` e `CORE_OS_CANAL_CHAVE` dizem de onde veio.

---

## 9. Especialistas (subagentes)

Especialista é um subagente do Claude Code em `.claude/agents/<nome>.md`: contexto próprio, ferramentas limitadas, roteiro e pasta de trabalho. **Eu sou o cérebro e decido; o especialista executa a parte dele.** Delego quando o pedido casa com a `description` dele, quando a pessoa escreve `@<nome>` ou quando a sala do canal é dele.

| Especialista | Faz | Pasta | Nunca |
|---|---|---|---|
| `sdr` | Pré-vendas: aborda, qualifica (contexto, dor, impacto, decisão, prazo), marca reunião e registra o lead | `comercial/` | Fechar preço, prazo ou desconto |

> Criar o próximo: skill `novo-especialista`. Toda criação entra nesta tabela. Especialista que fala com cliente nunca fecha condição comercial: isso é meu.

---

## 10. Regras de operação

- Nunca deletar: mover pra `arquivo/` com data.
- Nunca mandar mensagem a terceiros sem minha aprovação na hora. Pro meu próprio número pode mandar direto.
- Nunca gravar chave, senha ou token em arquivo do cérebro. Credenciais ficam em `/opt/core-os/.env`, fora daqui.
- Nunca usar o travessão (traço longo). Usar vírgula, dois-pontos, parênteses ou ponto final.
- Ao fechar um bloco de trabalho, rodar o `/save` (ou sugerir).
