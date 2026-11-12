# EGI Brand · por EGI Group

Plataforma **multi-tenant** do segundo cérebro (base: [Core OS](https://github.com/felipefernandees/core-os), Felipe Tâmbara). A EGI cadastra empresas num painel administrador; cada empresa ganha o **próprio cérebro** (Claude Code, Codex ou Antigravity rodando com a **conta do cliente**), fala com ele pelo **painel**, pelo **WhatsApp** e pelo **Telegram**, sobe o **brandbook e os logos** da marca e paga uma **mensalidade recorrente pelo Asaas** (setup cobrado na contratação, suspensão automática no 5º dia de atraso).

```
                     ┌──────────── EGI Brand (1 container) ────────────┐
Admin EGI ─/admin──► │ painel admin · cobrança · rotina horária         │◄── webhook ── Asaas
Cliente ───/ ──────► │ painel do cliente (terminal real, marca, config) │
WhatsApp ─Evolution─►│ /hooks/whatsapp/<empresa>/<segredo>              │──► Evolution (instância da empresa)
Telegram ─bot──────► │ /hooks/telegram/<empresa>  (secret_token)        │──► Bot da empresa
n8n (GChat, Slack) ─►│ /hooks/ponte/<empresa>     (x-core-os-token)     │──► callback do n8n
                     │                                                  │
                     │  /data/empresas/<slug>/  (dono: uid exclusivo)   │
                     │    cerebro/  dados/  casa/(.claude .codex .gemini)  .env
                     └──────────────────────┬───────────────────────────┘
                                            │
                                   Postgres dedicado (schema egi_brand)
```

Arquitetura, modelo de dados e regras de cobrança: [`docs/arquitetura-multitenant.md`](docs/arquitetura-multitenant.md).

## Pastas
| Pasta | O que é |
|---|---|
| `Dockerfile`, `entrypoint.sh`, `docker-compose.yml` | Imagem da plataforma (Claude Code, Codex, Antigravity, ffmpeg, pdftotext) + Postgres dedicado |
| `painel/server.js` | Inicialização: config, migração, admin inicial, usuários Unix, HTTP + WebSocket |
| `painel/lib/` | Plataforma: `empresas`, `cobranca`, `asaas`, `avisos`, `marca`, `auth`, `runtime`, `motores`, `canais/` (`whatsapp`, `telegram`, `ponte`, `nucleo`), `rotas/` |
| `painel/db/migracoes/` | SQL do banco (schema `egi_brand`) |
| `painel/public/` | Painel do cliente (`/`) e painel administrador (`/admin/`) |
| `painel/test/` | Testes de ponta a ponta (PGlite em memória, APIs falsas) |
| `cerebro/` | Cérebro modelo copiado pra cada empresa nova (com `marca/`) |
| `n8n/` | Fluxos do Google Chat por empresa (`preparar.sh`) |

## Instalação no Coolify (recurso NOVO)
> Este repositório também é o Core OS interno da EGI (`cerebro.appegi.com.br`, branch `main`). **Não** troque o recurso atual: suba o EGI Brand como recurso novo, a partir da branch desta versão.

1. **DNS**: registro A `brand.appegi.com.br` (ou o nome que preferir) apontando pro servidor do Coolify.
2. **Segredos** (gere e guarde num cofre):
   ```bash
   openssl rand -hex 32   # EGI_MASTER_KEY  (perder = perder as variáveis das empresas)
   openssl rand -hex 24   # BANCO_SENHA
   openssl rand -hex 24   # ASAAS_WEBHOOK_TOKEN
   ```
3. **Coolify** › New Resource › Docker Compose › este repositório, branch do EGI Brand, `docker-compose.yml`. Variáveis conforme `.env.example`. Domínio `https://brand.appegi.com.br` no serviço `egi-brand`, porta **3000**. Deploy.
   O compose traz um **Postgres próprio** (`banco`), então nenhum banco compartilhado é tocado. A migração roda sozinha na subida (schema `egi_brand`).
4. **Asaas** (comece no sandbox): Integrações › Webhooks › novo webhook
   - URL `https://brand.appegi.com.br/hooks/asaas`, token de autenticação = `ASAAS_WEBHOOK_TOKEN`, API v3;
   - eventos de **cobrança** (`PAYMENT_*`), fila ativa.
   Quando tudo estiver testado: chave de produção em `ASAAS_API_KEY` e `ASAAS_AMBIENTE=producao`.
5. **WhatsApp dos avisos** (opcional, recomendado): crie na Evolution uma instância da EGI (ex.: `egi-avisos`), conecte o número da EGI e defina `EGI_AVISOS_EVO_INSTANCIA=egi-avisos`. Sem ela, os avisos de cobrança saem pelo número da própria empresa.
6. Abra `https://brand.appegi.com.br/admin` e entre com `EGI_ADMIN_EMAIL` / `EGI_ADMIN_SENHA`.

## Ciclo de uma empresa
1. **Admin › + Nova empresa**: dados, CPF/CNPJ, mensalidade, setup, e-mail de acesso do dono. Ao salvar:
   cria a pasta isolada e o usuário Unix, cadastra o cliente no Asaas, **gera a cobrança do setup** (vence hoje) e manda o link no WhatsApp do dono. A tela mostra a **senha temporária** do dono (só uma vez).
2. Cliente paga o setup → webhook → empresa **ativa** + **assinatura mensal** criada no Asaas (1ª mensalidade em 30 dias, ou no dia de vencimento escolhido) + aviso de boas-vindas.
3. Cliente entra em `https://brand.appegi.com.br`, troca a senha e configura:
   - **Configurações › WhatsApp**: QR do número da empresa e quem pode dar ordens;
   - **Configurações › Telegram**: token do bot (@BotFather) e pareamento por código (`/start CODIGO`);
   - **Motores**: Claude Code, Codex ou Antigravity. Na 1ª conversa com cada motor, o login é feito **com a conta do cliente** no terminal (ou via variável `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` da empresa);
   - **Variáveis**: chaves de API da empresa (cifradas; segredo nunca volta pra tela);
   - **Marca** (ícone de paleta): brandbook em PDF, logos, fontes, imagens, cores, fontes e tom de voz.
4. Mensalidade venceu: empresa **inadimplente** (continua usando), aviso no 1º e no 3º dia com o link. **5º dia**: confere no Asaas e **suspende** (agentes param, painel mostra a tela de pagamento, canais respondem com o aviso). Pagou: **reativa na hora**.

## Suporte (admin)
- **Abrir painel da empresa**: o admin vê o painel como o cliente (barra roxa no topo) pra conectar WhatsApp, logar motor junto, etc.
- **Sincronizar com o Asaas**: puxa as mensalidades da assinatura (conserta webhook perdido).
- **Rodar cobrança agora**: executa a régua na hora (ela roda sozinha a cada hora).
- **Suspender / Reativar / Cancelar**: suspensão manual não é desfeita pela régua; cancelar encerra a assinatura no Asaas e guarda os arquivos.

## Desenvolvimento
```bash
cd painel && npm install && npm test        # 15 testes de ponta a ponta, sem banco externo
DATABASE_URL=pglite:./tmp-banco EGI_MASTER_KEY=$(openssl rand -hex 32) EGI_PUBLIC_URL=http://localhost:3000 \
EGI_ADMIN_EMAIL=voce@exemplo.com EGI_ADMIN_SENHA=TroqueEssa123 EGI_EMPRESAS_DIR=./tmp-empresas \
EGI_MODELO_CEREBRO=../cerebro node server.js  # roda local com PGlite (fora de root: sem isolamento por usuário)
```

## Operação
- **Backup**: volume `egi-brand-dados` (cérebros, logins e `.env` de todas as empresas) e `egi-brand-banco`. Sem a `EGI_MASTER_KEY` o backup do banco não decifra as variáveis.
- **Logs**: Coolify › Logs. Prefixos: `[cobrança]`, `[asaas]`, `[avisos]`, `[whatsapp]`, `[telegram]`, `[empresa]`.
- **Atualizar**: push na branch do recurso › Redeploy. Skills e agentes novos do modelo entram nos cérebros existentes sem sobrescrever nada.
