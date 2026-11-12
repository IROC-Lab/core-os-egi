// EGI Brand · empresas (tenants): cadastro, pasta isolada, usuário Unix exclusivo e variáveis de ambiente.
//
// Pasta de cada empresa (EGI_EMPRESAS_DIR/<slug>/, dona: o usuário Unix da empresa, modo 0700):
//   cerebro/   o cérebro dela (.md, skills, agentes, marca/)        -> cwd dos agentes
//   dados/     estado do painel (conversas, capas de vídeo)
//   casa/      HOME dos agentes: logins do Claude Code (.claude), Codex (.codex) e Antigravity (.gemini) DO CLIENTE
//   tmp/       temporários dos motores
//   .env       variáveis da empresa materializadas (as skills leem via $CORE_OS_ENV)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const STATUS_USO = new Set(['ativa', 'inadimplente']); // podem usar o cérebro
// chaves que a empresa não pode sobrescrever: são o encanamento do isolamento
const RESERVADAS = /^(HOME|PATH|USER|LOGNAME|SHELL|PWD|TMPDIR|CODEX_HOME|LD_[A-Z_]*|CORE_OS_[A-Z_]*|EGI_[A-Z_]*|DATABASE_URL|ASAAS_[A-Z_]*)$/;
export const chaveReservada = (k) => RESERVADAS.test(k);
export const chaveValida = (k) => /^[A-Z][A-Z0-9_]{1,63}$/.test(k) && !chaveReservada(k);

export function gerarSlug(nome) {
  const s = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s.length >= 3 ? s : `${s || 'empresa'}-${Math.random().toString(36).slice(2, 6)}`;
}
export const slugValido = (s) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(s || ''));
export const soDigitos = (s) => String(s || '').replace(/\D/g, '');

export function numeroWhats(n) {
  const d = soDigitos(n);
  if (!d) return '';
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

const CAMPOS_EDITAVEIS = ['nome', 'razao_social', 'email', 'telefone', 'whatsapp_dono', 'responsavel', 'plano_id', 'valor_mensal_centavos',
  'valor_setup_centavos', 'dia_vencimento', 'forma_pagamento', 'motor_padrao', 'motor_canais'];

export function criarServicoEmpresas({ db, cfg, cofre, log = console.log }) {
  const souRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (!souRoot) log('[empresas] AVISO: o servidor não roda como root, então os agentes de todas as empresas rodam com o MESMO usuário Unix. Use só em desenvolvimento.');

  function pastas(e) {
    const raiz = path.join(cfg.pastaEmpresas, e.slug);
    return { raiz, cerebro: path.join(raiz, 'cerebro'), dados: path.join(raiz, 'dados'), casa: path.join(raiz, 'casa'), tmp: path.join(raiz, 'tmp'), env: path.join(raiz, '.env') };
  }
  const usuarioUnix = (e) => `egi${e.unix_uid}`;

  function garantirUsuarioUnix(e) {
    if (!souRoot || !e.unix_uid) return;
    try { execFileSync('getent', ['passwd', String(e.unix_uid)], { stdio: 'ignore' }); return; } catch { /* não existe */ }
    const p = pastas(e);
    try { execFileSync('groupadd', ['-g', String(e.unix_uid), usuarioUnix(e)], { stdio: 'ignore' }); } catch { /* já existe */ }
    execFileSync('useradd', ['-M', '-d', p.casa, '-u', String(e.unix_uid), '-g', String(e.unix_uid), '-s', '/bin/bash', usuarioUnix(e)], { stdio: 'ignore' });
  }

  // dono de um caminho = usuário da empresa (o servidor grava uploads como root e devolve a posse)
  function entregar(e, alvo, recursivo = false) {
    if (!souRoot || !e.unix_uid) return;
    if (recursivo) execFileSync('chown', ['-R', `${e.unix_uid}:${e.unix_uid}`, alvo]);
    else fs.chownSync(alvo, e.unix_uid, e.unix_uid);
  }

  function copiarModelo(e, destino) {
    if (!fs.existsSync(cfg.modeloCerebro)) { log(`[empresas] modelo do cérebro não encontrado em ${cfg.modeloCerebro}; cérebro começa vazio`); fs.mkdirSync(destino, { recursive: true }); return; }
    fs.cpSync(cfg.modeloCerebro, destino, { recursive: true });
    const troca = { '{{NOME}}': e.responsavel || e.nome, '{{EMPRESA}}': e.nome };
    (function andar(dir) {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) andar(p);
        else if (/\.(md|json|txt)$/i.test(d.name)) {
          const txt = fs.readFileSync(p, 'utf8');
          const novo = txt.replace(/\{\{(NOME|EMPRESA)\}\}/g, (m) => troca[m]);
          if (novo !== txt) fs.writeFileSync(p, novo);
        } else if (/\/motor\//.test(p) && /\.(sh|py)$/.test(d.name)) fs.chmodSync(p, 0o755);
      }
    })(destino);
  }

  // cria (ou completa) a pasta da empresa. Idempotente: nunca sobrescreve um cérebro que já existe.
  function provisionar(e) {
    const p = pastas(e);
    garantirUsuarioUnix(e);
    for (const d of [p.raiz, p.dados, p.casa, p.tmp]) fs.mkdirSync(d, { recursive: true });
    const novo = !fs.existsSync(path.join(p.cerebro, 'CLAUDE.md'));
    if (novo) copiarModelo(e, p.cerebro);
    else {
      // skills e agentes novos do modelo entram; o que a empresa já tem nunca é sobrescrito
      for (const sub of ['.claude/skills', '.claude/agents']) {
        const origem = path.join(cfg.modeloCerebro, sub);
        if (!fs.existsSync(origem)) continue;
        for (const item of fs.readdirSync(origem)) {
          const alvo = path.join(p.cerebro, sub, item);
          if (!fs.existsSync(alvo)) { fs.mkdirSync(path.dirname(alvo), { recursive: true }); fs.cpSync(path.join(origem, item), alvo, { recursive: true }); }
        }
      }
    }
    fs.mkdirSync(path.join(p.cerebro, 'marca'), { recursive: true });
    // ninguém além da empresa (e do servidor) entra na pasta dela
    fs.chmodSync(p.raiz, 0o700);
    entregar(e, p.raiz, true);
    return { ...p, novo };
  }

  async function buscar(id) { return db.um('select * from empresas where id = $1', [id]); }
  async function porSlug(slug) { return db.um('select * from empresas where slug = $1', [slug]); }

  async function listar({ status, busca } = {}) {
    const onde = []; const params = [];
    if (status) { params.push(status); onde.push(`e.status = $${params.length}`); }
    if (busca) { params.push(`%${busca.toLowerCase()}%`); onde.push(`(lower(e.nome) like $${params.length} or e.slug like $${params.length} or e.cpf_cnpj like $${params.length} or lower(e.email) like $${params.length})`); }
    return db.todos(`
      select e.*, p.nome as plano_nome,
        (select count(*)::int from cobrancas c where c.empresa_id = e.id and c.status in ('pendente','vencida') and c.vencimento < current_date) as cobrancas_atrasadas,
        (select min(c.vencimento) from cobrancas c where c.empresa_id = e.id and c.status in ('pendente','vencida')) as proximo_vencimento
      from empresas e left join planos p on p.id = e.plano_id
      ${onde.length ? `where ${onde.join(' and ')}` : ''}
      order by e.criado_em desc`, params);
  }

  function validar(d, { parcial = false } = {}) {
    const erros = [];
    const exige = (c, msg) => { if (!parcial || c in d) { if (d[c] === undefined || d[c] === null || String(d[c]).trim() === '') erros.push(msg); } };
    exige('nome', 'Informe o nome da empresa.');
    exige('email', 'Informe o e-mail de cobrança.');
    if (!parcial || 'cpf_cnpj' in d) { const doc = soDigitos(d.cpf_cnpj); if (doc.length !== 11 && doc.length !== 14) erros.push('CPF (11 dígitos) ou CNPJ (14 dígitos) inválido.'); }
    if ('email' in d && d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) erros.push('E-mail inválido.');
    if ('dia_vencimento' in d && d.dia_vencimento != null && d.dia_vencimento !== '' && !(Number(d.dia_vencimento) >= 1 && Number(d.dia_vencimento) <= 28)) erros.push('Dia de vencimento entre 1 e 28.');
    for (const c of ['valor_mensal_centavos', 'valor_setup_centavos']) if (c in d && !(Number.isInteger(Number(d[c])) && Number(d[c]) >= 0)) erros.push(`Valor inválido em ${c}.`);
    if ('forma_pagamento' in d && !['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD'].includes(d.forma_pagamento)) erros.push('Forma de pagamento inválida.');
    if (erros.length) { const e = new Error(erros.join(' ')); e.status = 400; throw e; }
  }

  async function criar(d, porUsuario = null) {
    validar(d);
    let plano = null;
    if (d.plano_id) plano = await db.um('select * from planos where id = $1 and ativo', [d.plano_id]);
    const slug = d.slug ? String(d.slug).toLowerCase() : gerarSlug(d.nome);
    if (!slugValido(slug)) { const e = new Error('Identificador (slug) inválido: use 3 a 40 letras minúsculas, números e hífen.'); e.status = 400; throw e; }
    if (await porSlug(slug)) { const e = new Error(`Já existe uma empresa com o identificador "${slug}".`); e.status = 409; throw e; }
    const mensal = d.valor_mensal_centavos ?? plano?.valor_mensal_centavos;
    const setup = d.valor_setup_centavos ?? plano?.valor_setup_centavos ?? 0;
    if (mensal == null) { const e = new Error('Informe o valor mensal ou escolha um plano.'); e.status = 400; throw e; }
    const e = await db.um(`
      insert into empresas (slug, nome, razao_social, cpf_cnpj, email, telefone, whatsapp_dono, responsavel, plano_id,
        valor_mensal_centavos, valor_setup_centavos, dia_vencimento, forma_pagamento, motor_padrao, motor_canais, unix_uid)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, nextval('empresas_uid_seq'))
      returning *`, [slug, d.nome.trim(), d.razao_social || '', soDigitos(d.cpf_cnpj), d.email.trim().toLowerCase(), d.telefone || '',
      numeroWhats(d.whatsapp_dono), d.responsavel || '', plano?.id || null, Number(mensal), Number(setup),
      d.dia_vencimento ? Number(d.dia_vencimento) : null, d.forma_pagamento || 'UNDEFINED', d.motor_padrao || 'claude', d.motor_canais || 'claude']);
    await db.query('insert into marcas (empresa_id) values ($1) on conflict do nothing', [e.id]);
    await auditar(e.id, porUsuario, 'empresa.criada', { slug });
    try { provisionar(e); } catch (err) { log(`[empresas] ${slug}: não consegui criar a pasta: ${err.message}`); }
    return e;
  }

  async function atualizar(id, d, porUsuario = null) {
    validar(d, { parcial: true });
    const sets = []; const params = [];
    for (const c of CAMPOS_EDITAVEIS) {
      if (!(c in d)) continue;
      let v = d[c];
      if (c === 'whatsapp_dono') v = numeroWhats(v);
      if (c === 'email') v = String(v).trim().toLowerCase();
      if (c === 'dia_vencimento') v = v ? Number(v) : null;
      if (c.endsWith('_centavos')) v = Number(v);
      params.push(v); sets.push(`${c} = $${params.length}`);
    }
    if (!sets.length) return buscar(id);
    params.push(id);
    const e = await db.um(`update empresas set ${sets.join(', ')}, atualizado_em = now() where id = $${params.length} returning *`, params);
    await auditar(id, porUsuario, 'empresa.atualizada', { campos: Object.keys(d).filter((c) => CAMPOS_EDITAVEIS.includes(c)) });
    return e;
  }

  async function mudarStatus(id, status, motivo = null, porUsuario = null) {
    const extra = status === 'suspensa' ? ', suspensa_em = now(), motivo_suspensao = $3'
      : status === 'ativa' ? ', ativada_em = coalesce(ativada_em, now()), suspensa_em = null, motivo_suspensao = null'
        : status === 'cancelada' ? ', cancelada_em = now()' : '';
    const params = status === 'suspensa' ? [status, id, motivo] : [status, id];
    const antes = await buscar(id);
    const e = await db.um(`update empresas set status = $1${extra}, atualizado_em = now() where id = $2 returning *`, params);
    if (antes && antes.status !== status) await auditar(id, porUsuario, 'empresa.status', { de: antes.status, para: status, motivo });
    return e;
  }

  // ---------- variáveis de ambiente ----------
  async function listarVariaveis(empresaId) {
    const linhas = await db.todos('select chave, valor_cifrado, segredo, atualizado_em from variaveis_ambiente where empresa_id = $1 order by chave', [empresaId]);
    return linhas.map((l) => {
      let valor = null;
      if (!l.segredo) { try { valor = cofre.decifrar(l.valor_cifrado); } catch { valor = null; } }
      return { chave: l.chave, segredo: l.segredo, valor, atualizado_em: l.atualizado_em };
    });
  }
  async function definirVariavel(empresaId, chave, valor, segredo = true, porUsuario = null) {
    const k = String(chave || '').trim().toUpperCase();
    if (!chaveValida(k)) { const e = new Error(chaveReservada(k) ? `${k} é reservada pela plataforma.` : 'Nome de variável inválido (use MAIÚSCULAS, números e _).'); e.status = 400; throw e; }
    const v = String(valor ?? '');
    if (/[\r\n\0]/.test(v)) { const e = new Error('O valor não pode ter quebra de linha.'); e.status = 400; throw e; }
    await db.query(`insert into variaveis_ambiente (empresa_id, chave, valor_cifrado, segredo, atualizado_por) values ($1,$2,$3,$4,$5)
      on conflict (empresa_id, chave) do update set valor_cifrado = excluded.valor_cifrado, segredo = excluded.segredo, atualizado_por = excluded.atualizado_por, atualizado_em = now()`,
    [empresaId, k, cofre.cifrar(v), Boolean(segredo), porUsuario]);
    await auditar(empresaId, porUsuario, 'variavel.definida', { chave: k });
    return k;
  }
  async function removerVariavel(empresaId, chave, porUsuario = null) {
    const r = await db.query('delete from variaveis_ambiente where empresa_id = $1 and chave = $2', [empresaId, String(chave).toUpperCase()]);
    if (r.rowCount) await auditar(empresaId, porUsuario, 'variavel.removida', { chave });
    return r.rowCount > 0;
  }
  async function variaveis(empresaId) {
    const saida = {};
    for (const l of await db.todos('select chave, valor_cifrado from variaveis_ambiente where empresa_id = $1', [empresaId])) {
      try { saida[l.chave] = cofre.decifrar(l.valor_cifrado); } catch { log(`[empresas] variável ${l.chave} não decifra (chave mestra trocada?)`); }
    }
    return saida;
  }

  // Ambiente dos agentes da empresa: NADA do process.env da plataforma entra (nem banco, nem Asaas, nem chave mestra).
  async function ambiente(e, extras = {}) {
    const p = pastas(e);
    const daEmpresa = await variaveis(e.id);
    const env = {
      ...daEmpresa,
      ...extras,
      HOME: p.casa,
      USER: e.unix_uid ? usuarioUnix(e) : process.env.USER || 'egi',
      LOGNAME: e.unix_uid ? usuarioUnix(e) : process.env.USER || 'egi',
      SHELL: '/bin/bash',
      PATH: cfg.pathAgentes,
      TMPDIR: p.tmp,
      LANG: process.env.LANG || 'C.UTF-8',
      TZ: process.env.TZ || 'America/Sao_Paulo',
      CODEX_HOME: path.join(p.casa, '.codex'),
      DISABLE_AUTOUPDATER: '1',
      CORE_OS_ENV: p.env,
      CORE_OS_VAULT: p.cerebro,
      CORE_OS_EMPRESA: e.slug,
      CORE_OS_EMPRESA_NOME: e.nome,
      CORE_OS_MARCA: path.join(p.cerebro, 'marca'),
    };
    materializarEnv(e, { ...daEmpresa, ...extras });
    return env;
  }

  // .env que as skills leem (set -a; . $CORE_OS_ENV). Só o da empresa; reescrito quando muda.
  function materializarEnv(e, vars) {
    const p = pastas(e);
    const aspas = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
    const corpo = ['# gerado pelo EGI Brand a partir das variáveis da empresa. Edite no painel, não aqui.',
      ...Object.keys(vars).sort().map((k) => `${k}=${aspas(vars[k])}`)].join('\n') + '\n';
    let atual = null; try { atual = fs.readFileSync(p.env, 'utf8'); } catch { /* */ }
    if (atual === corpo) return;
    fs.mkdirSync(p.raiz, { recursive: true });
    fs.writeFileSync(p.env, corpo, { mode: 0o600 });
    fs.chmodSync(p.env, 0o600);
    entregar(e, p.env);
  }

  async function auditar(empresaId, usuarioId, acao, detalhe = {}) {
    await db.query('insert into auditoria (empresa_id, usuario_id, acao, detalhe) values ($1,$2,$3,$4)', [empresaId, usuarioId, acao, JSON.stringify(detalhe)]).catch((err) => log('[auditoria]', err.message));
  }

  // na subida: /etc/passwd não sobrevive à recriação do container, então recria os usuários das empresas
  async function garantirTodos() {
    for (const e of await db.todos("select * from empresas where status <> 'cancelada'")) {
      try { provisionar(e); } catch (err) { log(`[empresas] ${e.slug}: ${err.message}`); }
    }
  }

  return { pastas, provisionar, entregar, buscar, porSlug, listar, criar, atualizar, mudarStatus, listarVariaveis, definirVariavel, removerVariavel, variaveis, ambiente, auditar, garantirTodos, souRoot, usuarioUnix };
}
