-- EGI Brand (por EGI Group) · estrutura multi-tenant, cobrança Asaas e canais.
-- Tudo mora no schema egi_brand: dá pra usar um banco dedicado (recomendado) ou um banco já existente sem
-- colidir com as tabelas de outros sistemas. Valores em centavos (inteiro), datas de vencimento em `date`
-- (dia civil de America/Sao_Paulo) e instantes em timestamptz.

create schema if not exists egi_brand;
set search_path to egi_brand, public;

-- ---------------------------------------------------------------- planos
create table planos (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null unique,
  descricao              text not null default '',
  valor_mensal_centavos  integer not null check (valor_mensal_centavos >= 0),
  valor_setup_centavos   integer not null default 0 check (valor_setup_centavos >= 0),
  limites                jsonb not null default '{}'::jsonb,   -- ex.: {"usuarios": 5, "canais": ["whatsapp","telegram"]}
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now()
);

-- ---------------------------------------------------------------- empresas (tenants)
create table empresas (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  nome                   text not null,
  razao_social           text not null default '',
  cpf_cnpj               text not null check (cpf_cnpj ~ '^[0-9]{11}$|^[0-9]{14}$'),
  email                  text not null,
  telefone               text not null default '',
  whatsapp_dono          text not null default '',              -- 55DDDNUMERO: recebe avisos e pode dar ordens
  responsavel            text not null default '',
  status                 text not null default 'aguardando_setup'
                         check (status in ('aguardando_setup','ativa','inadimplente','suspensa','cancelada')),
  plano_id               uuid references planos(id),
  valor_mensal_centavos  integer not null check (valor_mensal_centavos >= 0),
  valor_setup_centavos   integer not null default 0 check (valor_setup_centavos >= 0),
  dia_vencimento         smallint check (dia_vencimento between 1 and 28),
  forma_pagamento        text not null default 'UNDEFINED' check (forma_pagamento in ('UNDEFINED','PIX','BOLETO','CREDIT_CARD')),
  asaas_cliente_id       text,                                  -- o Asaas reaproveita o cliente pelo CPF/CNPJ: pode repetir
  asaas_assinatura_id    text unique,
  motor_padrao           text not null default 'claude' check (motor_padrao in ('claude','codex','antigravity')),
  motor_canais           text not null default 'claude' check (motor_canais in ('claude','codex','antigravity')),
  unix_uid               integer unique,                        -- usuário Unix exclusivo dos agentes desta empresa
  ativada_em             timestamptz,
  suspensa_em            timestamptz,
  motivo_suspensao       text,
  cancelada_em           timestamptz,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index empresas_status_idx on empresas (status);
create index empresas_asaas_cliente_idx on empresas (asaas_cliente_id);
create sequence empresas_uid_seq start 20001;

-- ---------------------------------------------------------------- usuários e sessões
create table usuarios (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid references empresas(id) on delete cascade,  -- null = equipe EGI (admin)
  email          text not null,
  nome           text not null default '',
  senha_hash     text not null,                                   -- scrypt$N$r$p$sal$hash
  papel          text not null check (papel in ('admin_egi','dono','membro')),
  ativo          boolean not null default true,
  ultimo_login   timestamptz,
  criado_em      timestamptz not null default now(),
  check ((papel = 'admin_egi') = (empresa_id is null))
);
create unique index usuarios_email_idx on usuarios (lower(email));

create table sessoes (
  token_hash     text primary key,                               -- sha256 do cookie; o token em si nunca é gravado
  usuario_id     uuid not null references usuarios(id) on delete cascade,
  empresa_id     uuid references empresas(id) on delete cascade, -- contexto atual (admin pode "entrar como" empresa)
  ip             text,
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null
);
create index sessoes_expira_idx on sessoes (expira_em);

-- ---------------------------------------------------------------- variáveis de ambiente por empresa
-- Valor cifrado com AES-256-GCM (chave mestra EGI_MASTER_KEY, fora do banco). O painel nunca devolve o valor de
-- uma variável marcada como segredo: só "definida em ...".
create table variaveis_ambiente (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  chave          text not null check (chave ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  valor_cifrado  text not null,
  segredo        boolean not null default true,
  atualizado_por uuid references usuarios(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  primary key (empresa_id, chave)
);

-- ---------------------------------------------------------------- canais (WhatsApp, Telegram, ponte n8n)
create table canais (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  tipo             text not null check (tipo in ('whatsapp','telegram','ponte')),
  ativo            boolean not null default true,
  config           jsonb not null default '{}'::jsonb,   -- instância Evolution, @ do bot, chatVoce...
  segredo_webhook  text not null,                        -- vai na URL/cabeçalho do webhook de entrada
  token_cifrado    text,                                 -- token da instância Evolution / do bot (cifrado)
  motor            text check (motor in ('claude','codex','antigravity')),  -- null = motor_canais da empresa
  agente           text,                                 -- especialista fixo do canal (ex.: sdr)
  estado           text not null default 'novo',
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (empresa_id, tipo)
);

-- quem pode dar ordens em cada canal: número (WhatsApp), chat id (Telegram), e-mail ou @dominio (ponte)
create table canal_acessos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  canal_tipo     text not null check (canal_tipo in ('whatsapp','telegram','ponte')),
  identificador  text not null,
  nome           text not null default '',
  criado_em      timestamptz not null default now(),
  unique (empresa_id, canal_tipo, identificador)
);

-- código de pareamento do Telegram: a pessoa manda "/start CODIGO" pro bot e passa a ser atendida
create table canal_pareamentos (
  codigo         text primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  canal_tipo     text not null default 'telegram',
  expira_em      timestamptz not null,
  usado_em       timestamptz,
  usado_por      text
);

-- ---------------------------------------------------------------- cobrança (Asaas)
create table cobrancas (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references empresas(id) on delete cascade,
  tipo                 text not null check (tipo in ('setup','mensalidade','avulsa')),
  asaas_pagamento_id   text unique,
  asaas_assinatura_id  text,
  valor_centavos       integer not null check (valor_centavos >= 0),
  vencimento           date not null,
  status               text not null default 'pendente'
                       check (status in ('pendente','paga','vencida','cancelada','estornada')),
  forma_pagamento      text,
  link_fatura          text,
  descricao            text not null default '',
  pago_em              timestamptz,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create index cobrancas_empresa_idx on cobrancas (empresa_id, vencimento desc);
create index cobrancas_abertas_idx on cobrancas (vencimento) where status in ('pendente','vencida');

-- todo webhook do Asaas entra aqui primeiro (idempotência: o mesmo id de evento nunca é processado duas vezes)
create table eventos_asaas (
  id             text primary key,
  tipo           text not null,
  pagamento_id   text,
  payload        jsonb not null,
  recebido_em    timestamptz not null default now(),
  processado_em  timestamptz,
  erro           text
);

-- avisos ao cliente (atraso, suspensão, reativação...). A chave única impede mandar o mesmo aviso da mesma
-- cobrança duas vezes; avisos sem cobrança (suspensão manual etc.) podem se repetir.
create table avisos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  cobranca_id    uuid references cobrancas(id) on delete cascade,
  tipo           text not null,   -- boas_vindas, setup_pendente, atraso_d1, atraso_d3, suspensao, reativacao
  canal          text not null,   -- whatsapp, telegram
  destino        text not null default '',
  status         text not null check (status in ('enviado','falhou','sem_canal')),
  erro           text,
  enviado_em     timestamptz not null default now()
);
create unique index avisos_unico_idx on avisos (cobranca_id, tipo, canal) where cobranca_id is not null;

-- ---------------------------------------------------------------- marca do cliente (brandbook, logos...)
create table marcas (
  empresa_id     uuid primary key references empresas(id) on delete cascade,
  cores          jsonb not null default '[]'::jsonb,   -- [{"nome":"Primária","hex":"#0F766E"}]
  fontes         jsonb not null default '[]'::jsonb,   -- ["Inter", "Playfair Display"]
  tom_de_voz     text not null default '',
  publico        text not null default '',
  slogan         text not null default '',
  atualizado_em  timestamptz not null default now()
);

create table marca_arquivos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  categoria      text not null check (categoria in ('brandbook','logo','fonte','imagem','outro')),
  nome_original  text not null,
  caminho        text not null,      -- relativo ao cérebro da empresa (marca/...)
  mime           text not null default '',
  tamanho        bigint not null,
  sha256         text not null,
  enviado_por    uuid references usuarios(id) on delete set null,
  criado_em      timestamptz not null default now(),
  unique (empresa_id, caminho)
);

-- ---------------------------------------------------------------- auditoria
create table auditoria (
  id             bigserial primary key,
  empresa_id     uuid references empresas(id) on delete set null,
  usuario_id     uuid references usuarios(id) on delete set null,
  acao           text not null,
  detalhe        jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now()
);
create index auditoria_empresa_idx on auditoria (empresa_id, criado_em desc);
