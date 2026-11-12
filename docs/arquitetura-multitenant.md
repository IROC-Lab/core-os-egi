# EGI Brand · arquitetura multi-tenant

## 1. Decisões
| Decisão | Escolha | Por quê |
|---|---|---|
| Isolamento | **1 deploy, empresas isoladas por pasta + usuário Unix** (uid 20001+, pasta 0700) | Um container atende todas as empresas sem a EGI subir um recurso no Coolify por cliente; cada agente roda com o uid da empresa, então um cliente não lê a pasta, o `.env` nem os logins de outro. |
| Login dos motores | `HOME` do agente = `/data/empresas/<slug>/casa` | Claude Code, Codex e Antigravity guardam login no HOME: cada empresa entra com a **própria conta** (ou chave própria). A EGI não empresta assinatura. |
| Variáveis por empresa | Tabela `variaveis_ambiente`, AES-256-GCM com `EGI_MASTER_KEY` | O agente recebe as variáveis da empresa no ambiente do processo e num `.env` 0600 (`$CORE_OS_ENV`). **Nada** do ambiente da plataforma (banco, Asaas, apikey global da Evolution, chave mestra) chega no agente (há teste pra isso). |
| Banco | Postgres **dedicado** (serviço `banco` no compose), schema `egi_brand` | Sem risco pros bancos compartilhados da EGI (TrueNAS, Mac, Supabase). |
| WhatsApp | 1 instância Evolution por empresa (`egi-<slug>`) com token próprio; webhook direto na plataforma | A skill `whatsapp` da empresa recebe só o token da instância dela. Sai o n8n do caminho do WhatsApp; a transcrição de áudio (Groq) vem pra plataforma. |
| Telegram | Bot da empresa (token do @BotFather), webhook com `secret_token`, pareamento por código | Sem precisar descobrir chat id; só chats pareados falam com o cérebro. |
| Outros canais | Ponte genérica por empresa (`/hooks/ponte/<id>`, token próprio) | Google Chat/Slack continuam pelo n8n, um par de fluxos por empresa (`n8n/preparar.sh`). |
| Cobrança | Asaas: setup avulso na contratação + assinatura mensal (`cycle: MONTHLY`) | Webhook idempotente (`eventos_asaas`), régua horária, suspensão só depois de confirmar no Asaas. |

**Limite conhecido**: todas as empresas dividem CPU, memória e rede da mesma máquina (há `EGI_MAX_PARALELO` pra execuções sem tela). Se um cliente precisar de isolamento de máquina, o caminho é subir um segundo deploy do EGI Brand (o banco e o código são os mesmos).

## 2. Modelo de dados (`painel/db/migracoes/001_inicial.sql`)
| Tabela | Guarda |
|---|---|
| `planos` | Pacotes comerciais (só preenchem valores no cadastro; cada empresa guarda o próprio valor) |
| `empresas` | Tenant: slug, CPF/CNPJ, contato, **status** (`aguardando_setup`, `ativa`, `inadimplente`, `suspensa`, `cancelada`), valores, dia de vencimento, ids do Asaas, motores, `unix_uid` |
| `usuarios` | Equipe EGI (`admin_egi`, sem empresa) e usuários da empresa (`dono`, `membro`); senha scrypt |
| `sessoes` | Sessões (só o sha256 do token); `empresa_id` = contexto (admin "entra como" empresa) |
| `variaveis_ambiente` | Variáveis da empresa, cifradas; `segredo` controla se o valor volta pra tela |
| `canais` | WhatsApp / Telegram / ponte por empresa: segredo do webhook, token cifrado, motor e especialista do canal |
| `canal_acessos` | Quem pode dar ordens: número, chat id do Telegram, e-mail ou `@dominio` |
| `canal_pareamentos` | Códigos de pareamento do Telegram (30 min, uso único) |
| `cobrancas` | Setup e mensalidades espelhadas do Asaas (status, vencimento, link da fatura, pago em) |
| `eventos_asaas` | Todo webhook recebido (idempotência pelo id do evento, erro de processamento) |
| `avisos` | Avisos enviados por canal; único por (cobrança, tipo, canal) |
| `marcas`, `marca_arquivos` | Perfil da marca (cores, fontes, tom de voz, público, slogan) e arquivos enviados |
| `auditoria` | Quem fez o quê em cada empresa |

## 3. Régua de cobrança (`painel/lib/cobranca.js`)
```
contratação ──► setup (vence hoje) ──pago──► ATIVA + assinatura mensal
                    │ (aguardando_setup: painel mostra o link; canais respondem com o link)
mensalidade vence ──► D+1 INADIMPLENTE + aviso "pague até D+5"
                      D+3 lembrete "suspende em D+5"
                      D+5 confere no Asaas ── continua aberta ──► SUSPENSA + aviso (agentes param)
                                          └── Asaas fora do ar ──► não suspende, tenta na próxima hora
pagamento confirmado (webhook ou rotina) ──► ATIVA + aviso de reativação
```
- Dias contados no fuso de São Paulo. `EGI_DIAS_SUSPENSAO` (5) e `EGI_DIAS_LEMBRETE` (3) configuráveis.
- Suspensão manual do admin (motivo "Manual: ...") nunca é desfeita pela régua.
- Avisos saem por WhatsApp (número da EGI em `EGI_AVISOS_EVO_INSTANCIA`, ou o da empresa) e pelo Telegram da empresa; o Asaas também manda os e-mails dele.
- Empresas que usam: `ativa` e `inadimplente`. As outras só veem a tela de assinatura (HTTP 402 nas demais rotas).

## 4. Pasta de cada empresa
```
/data/empresas/<slug>/          dono egi<uid>, 0700
  cerebro/                      cópia do cérebro modelo ({{NOME}} e {{EMPRESA}} trocados)
    marca/                      brandbook/ logos/ fontes/ imagens/ outros/ + CLAUDE.md (índice gerado)
  dados/                        conversas.json, canais.json, capas de vídeo
  casa/                         HOME: .claude/ .codex/ .gemini/ .local/ (logins e instalações DA EMPRESA)
  tmp/
  .env                          variáveis da empresa + EVO_*/TELEGRAM_BOT_TOKEN dela (0600)
```

## 5. O que mudou em relação ao Core OS single-tenant
| Antes | Agora |
|---|---|
| Senha única do painel (`CORE_OS_PASSWORD`) | Usuários por e-mail, papéis, sessões no banco |
| Estado em JSON (`dados/*.json`) | Negócio no Postgres; só o estado de conversa fica na pasta da empresa |
| `/opt/core-os/.env` global, lido por todas as skills | `.env` por empresa em `$CORE_OS_ENV` (skills atualizadas) |
| WhatsApp via n8n com `x-core-os-token` global | Webhook direto, segredo por empresa, transcrição na plataforma |
| Logins dos motores nos volumes do container | Logins no HOME de cada empresa |
| Container roda como `coreos` | Servidor roda como root e abre cada agente com o uid da empresa |

## 6. Migrar o Core OS atual da EGI pra dentro do EGI Brand (quando quiser)
1. Cadastrar a EGI como empresa (sem setup: "Ativar sem setup", ou valor 0).
2. Copiar o cérebro atual do volume `cerebro-dados` (`/data/cerebro`) pra `/data/empresas/<slug>/cerebro/` e os logins (`cerebro-claude`, `cerebro-codex`, `cerebro-gemini`) pra `casa/.claude`, `casa/.codex`, `casa/.gemini`; depois "Refazer pasta" na ficha (devolve a posse ao uid da empresa).
3. Conectar o WhatsApp de novo pelo painel (a instância nova é `egi-<slug>`) e só então desligar o recurso antigo.
