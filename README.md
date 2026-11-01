# Core OS · EGI

Adaptação do [Core OS](https://github.com/felipefernandees/core-os) (Felipe Tâmbara) pra rodar no **Coolify** (`coolify.appegi.com.br`) usando o **n8n** (`n8n.appegi.com.br`) e a **Evolution API** (`evo.appegi.com.br`) que já existem, com:

- um **cérebro** (Claude Code rodando numa pasta de `.md` + skills) que atende pelo **painel**, pelo **WhatsApp** e pelo **Google Chat**;
- **especialistas** como subagentes do Claude Code (`.claude/agents/`), com o **SDR** já pronto e uma skill (`novo-especialista`) pra criar os próximos;
- uma **ponte genérica de canais** no painel (`POST /api/ponte/canal`), então Telegram, Slack etc. entram só com um fluxo novo no n8n.

```
WhatsApp ──► Evolution (evo.appegi) ──► n8n ──► painel /api/ponte/whatsapp ──► claude -p ──► Evolution ──► WhatsApp
Google Chat ─► app do Chat ──► n8n (ack ⏳) ──► painel /api/ponte/canal ──► claude -p ──► n8n (callback) ──► sala do Chat
Navegador ──► painel (cerebro.appegi.com.br) ──► terminal real do Claude Code
```

O que mudou em relação ao original: o painel virou container (Dockerfile + entrypoint), não há mais Postgres/Redis/Evolution/n8n/Caddy próprios, os fluxos do n8n não dependem de `$env`, e o cérebro ganhou `comercial/`, o agente `sdr`, a skill `novo-especialista` e os §8 (Canais) e §9 (Especialistas) no `CLAUDE.md`.

## Pastas
| Pasta | O que é |
|---|---|
| `Dockerfile`, `entrypoint.sh`, `docker-compose.yml` | Imagem do painel com Claude Code CLI, pronta pro Coolify |
| `painel/` | Servidor do painel (upstream + ponte de canais) |
| `cerebro/` | Cérebro modelo copiado pro volume na primeira subida (inclui `.claude/agents/sdr.md`) |
| `n8n/` | 3 fluxos pra importar no seu n8n + `preparar.sh` que preenche URLs e token |
| `evolution/configurar.sh` | Cria a instância do WhatsApp do cérebro na sua Evolution e aponta o webhook pro n8n |

## Instalação (uns 20 minutos)

### 0. Antes
- Suba esta pasta pra um repositório Git seu (privado), ex. `iuriroc/core-os-egi`.
- DNS: registro A `cerebro.appegi.com.br` apontando pro servidor do Coolify (ou use outro nome; troque em tudo abaixo).
- Gere o token da ponte: `openssl rand -hex 24`. Guarde: ele vai no Coolify e nos fluxos do n8n.
- Pegue a **apikey global** da sua Evolution (variável `AUTHENTICATION_API_KEY` dela).

### 1. Coolify
1. Projeto > **New Resource** > **Docker Compose** (ou **Dockerfile**) > seu repositório, branch `main`, compose file `docker-compose.yml`.
2. Em **Environment Variables**, preencha (modelo em `.env.example`):
   | Variável | Valor |
   |---|---|
   | `CORE_OS_PASSWORD` | senha do painel (mín. 8, sem espaço/aspas/`$`) |
   | `CORE_OS_HOOK_TOKEN` | o token gerado |
   | `EVO_KEY` | apikey global da Evolution |
   | `EVO_URL` | `https://evo.appegi.com.br` |
   | `EVO_INSTANCE` | `cerebro` (ou o nome de uma instância que já exista) |
   | `N8N_URL` | `https://n8n.appegi.com.br` |
   | `CORE_OS_PUBLIC_URL` | `https://cerebro.appegi.com.br` |
   | `CORE_OS_NOME` | seu nome |
   | `WHATS_DONO` | seu número pessoal, `55DDDNÚMERO` (quem pode dar ordens pelo WhatsApp) |
   | `GCHAT_PERMITIDOS` | `iuriroc@gmail.com,@appegi.com.br` (quem pode falar pelo Google Chat) |
   | `ANTHROPIC_API_KEY` | opcional. Vazio = login com a assinatura (passo 2) |
3. No serviço `cerebro`: domínio `https://cerebro.appegi.com.br`, porta **3000**. Os dois volumes (`cerebro-dados`, `cerebro-claude`) são criados pelo compose.
4. **Deploy**. A primeira build demora (instala o Claude Code e compila o node-pty). Veja os logs: o entrypoint avisa o que montou.

### 2. Logar o Claude Code (uma vez, fica no volume)
Pulo este passo quem definiu `ANTHROPIC_API_KEY`. Com assinatura (Pro/Max):
1. Coolify > recurso > **Terminal** do container (ou `docker exec -it core-os-cerebro bash`).
2. `gosu coreos claude` → dentro do Claude, `/login` → abra o link no seu navegador, autorize e cole o código de volta. `/exit`.
3. Teste: `gosu coreos claude -p "diga oi"`.

Abra `https://cerebro.appegi.com.br`, entre com a senha. Já dá pra conversar com o cérebro pelo painel.

### 3. n8n
```bash
bash n8n/preparar.sh https://cerebro.appegi.com.br https://n8n.appegi.com.br <CORE_OS_HOOK_TOKEN>
```
Gera `n8n/pronto/*.json`. No `n8n.appegi.com.br`: **Workflows > Import from File**, um por um, salve e **ative** os três:
- `Core OS · WhatsApp → Cérebro` (webhook `/webhook/core-os-whatsapp`)
- `Core OS · Google Chat → Cérebro` (webhook `/webhook/core-os-gchat`)
- `Core OS · Cérebro → Google Chat` (webhook `/webhook/core-os-gchat-resposta`)

> O painel precisa alcançar `https://n8n.appegi.com.br` (callback) e o n8n precisa alcançar `https://cerebro.appegi.com.br`. Se estiverem no mesmo Docker/Coolify e quiser ir por dentro da rede, troque as URLs nos fluxos e em `CORE_OS_PUBLIC_URL`, mas por fora funciona.

### 4. Evolution (WhatsApp)
```bash
EVO_KEY=<apikey> bash evolution/configurar.sh https://evo.appegi.com.br cerebro https://n8n.appegi.com.br
```
Cria a instância `cerebro` (se não existir), aponta o webhook `MESSAGES_UPSERT` pro n8n e desliga grupos. Depois leia o QR no painel (**Configurações › WhatsApp**) ou no manager da Evolution. Quem pode dar ordens: o chat "Você" do número conectado e os números em **Configurações › WhatsApp › Quem pode dar ordens** (`WHATS_DONO` já entra na lista).

Teste: mande "oi, o que tem no meu cérebro?" pro número conectado.

**Áudio**: o fluxo do WhatsApp transcreve áudio antes de entregar ao cérebro (Evolution → Groq Whisper → texto com 🎤). Crie no n8n duas credenciais *Header Auth*: `Evolution EGI (apikey)` (nome `apikey`, valor = apikey global) e `Groq (Whisper)` (nome `Authorization`, valor `Bearer gsk_...`, chave grátis em console.groq.com), e selecione-as nos nós "Baixa áudio" e "Transcreve".

### 5. Google Chat
Precisa de um **app do Google Chat** (quem recebe as mensagens) e, pra responder, um **webhook de entrada** em cada sala (mais simples que conta de serviço).

1. [console.cloud.google.com](https://console.cloud.google.com) > projeto (pode ser novo) > **APIs e serviços > Biblioteca > Google Chat API > Ativar**.
2. Google Chat API > **Configuração**: nome "Cérebro", avatar, descrição; **Funcionalidade**: receber mensagens 1:1 e em espaços; **Configurações de conexão**: **URL do endpoint HTTP** = `https://n8n.appegi.com.br/webhook/core-os-gchat`; **Visibilidade**: disponibilize pra você/seu domínio Workspace. Salvar.
3. No Google Chat, crie a sala (ex. "Cérebro" e outra "SDR"), adicione o app. Na sala: **Apps e integrações > Webhooks > Adicionar** ("Cérebro"), copie a URL.
4. No n8n, fluxo `Cérebro → Google Chat`, nó **Monta envio**: cole no mapa `WEBHOOKS` o id da sala (`spaces/AAAA...`, aparece na URL do webhook) → URL do webhook. Salve.
5. Sala dedicada a um especialista: no fluxo `Google Chat → Cérebro`, nó **Interpreta evento**, mapa `SALA_AGENTE` (`'SDR': 'sdr'`). Tudo que chegar nessa sala vai direto pro SDR.

Teste: na sala, "@Cérebro oi, o que você sabe fazer?". Chega um ⏳ na hora e a resposta em seguida, na mesma thread. Pessoas fora de `GCHAT_PERMITIDOS` são ignoradas em silêncio (ajuste em `dados/canais-acesso.json` ou `POST /api/config/canais/acesso`).

> Limite do app do Chat: ele precisa de resposta em 30 s, por isso o ack vem do n8n e a resposta de verdade volta pelo webhook de entrada da sala (aparece como "Cérebro" do webhook). Se preferir que a resposta venha do próprio app, troque o nó **Posta no Google Chat** por um nó Google Chat com credencial de conta de serviço.

## Especialistas
- O SDR está em `cerebro/.claude/agents/sdr.md`. Preencha `comercial/oferta.md` (o que vende, pra quem, faixa de preço, objeções) antes de usar: ele só fala do que está lá e nunca fecha preço.
- Acionar: pelo painel ou canal, "@sdr qualifica esse lead: ..." ou mande a conversa na sala mapeada pro SDR. Leads ficam em `comercial/leads/`, visão geral em `comercial/pipeline.md`.
- Criar outro: diga ao cérebro "cria um especialista em suporte N1 que..." e a skill `novo-especialista` monta o arquivo, a pasta de trabalho e registra no `CLAUDE.md` §9. Ou copie `sdr.md` à mão.
- Sala do Chat por especialista: mapeie em `SALA_AGENTE` (passo 5.5). Número de WhatsApp por especialista: hoje o WhatsApp vai sempre pro cérebro, que delega pelo conteúdo ("@sdr ..."); uma segunda instância na Evolution com fluxo próprio apontando pra `/api/ponte/canal` com `canal: "whatsapp-sdr"` e `agente: "sdr"` também funciona.

## Operação
- **Atualizar**: push no repositório > Redeploy no Coolify. O cérebro e o login ficam nos volumes. Skills e agentes novos do modelo que ainda não existirem no seu cérebro são copiados; o que já existe nunca é sobrescrito.
- **Backup**: volume `cerebro-dados` (é o seu segundo cérebro inteiro) e `cerebro-claude` (login e histórico das sessões).
- **Logs**: Coolify > Logs. Erros de canal aparecem como `[gchat]` ou `[whatsapp]`.
- **Segurança**: o painel só aceita `/api/ponte/*` com o header `x-core-os-token`; o fluxo de resposta do Google Chat também confere o token. Troque o token nos dois lugares ao mesmo tempo (Coolify e n8n).
- **Travamento**: `claude -p` tem 20 min de limite por mensagem; uma fila por canal evita que duas respostas brigem pela mesma sessão.

## Diferenças que valem saber
- Não há `ufw`/Caddy aqui: TLS e exposição são do Coolify (Traefik).
- O container roda como usuário `coreos` (uid 1000). Se o Coolify criar os volumes como root, o entrypoint ajusta a dono na subida.
- O cérebro fica em `/data/cerebro` e os dados do painel em `/data/dados` (no original, `~/cerebro` e `/opt/core-os/dados`). As skills continuam lendo credenciais de `/opt/core-os/.env`, que o entrypoint monta a partir das variáveis do Coolify.
