// EGI Brand · login e sessões. Equipe EGI (admin_egi) administra todas as empresas; dono e membro só veem a sua.
// Sessão no banco guardando só o sha256 do token (vazou o banco, não vaza sessão). Cookie HttpOnly, SameSite=Strict.
import { conferirSenha, hashSenha, sha256, token } from './cripto.js';

const TRINTA_DIAS = 30 * 86400_000;

export function lerCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export function senhaForte(s) {
  return typeof s === 'string' && s.length >= 10 && /[a-zA-Z]/.test(s) && /\d/.test(s);
}
export const senhaTemporaria = () => `${token(9).replace(/[-_]/g, 'x')}9a`;

export function criarAuth({ db, cfg, log = console.log }) {
  const falhas = new Map(); // ip -> [instantes]

  async function bootstrap() {
    const tem = await db.um("select 1 from usuarios where papel = 'admin_egi' limit 1");
    if (tem) return false;
    if (!cfg.adminEmail || !cfg.adminSenha) { log('[auth] AVISO: nenhum admin EGI cadastrado. Defina EGI_ADMIN_EMAIL e EGI_ADMIN_SENHA e reinicie.'); return false; }
    if (!senhaForte(cfg.adminSenha)) { log('[auth] EGI_ADMIN_SENHA fraca: mínimo 10 caracteres com letras e números.'); return false; }
    await db.query("insert into usuarios (email, nome, senha_hash, papel) values ($1, 'Admin EGI', $2, 'admin_egi')", [cfg.adminEmail, hashSenha(cfg.adminSenha)]);
    log(`[auth] admin EGI criado: ${cfg.adminEmail}`);
    return true;
  }

  async function entrar(email, senha, ip) {
    const agora = Date.now();
    const recentes = (falhas.get(ip) || []).filter((t) => agora - t < 60_000);
    if (recentes.length >= 5) throw Object.assign(new Error('Muitas tentativas. Espere 1 minuto.'), { status: 429 });
    const u = await db.um('select * from usuarios where lower(email) = lower($1) and ativo', [String(email || '').trim()]);
    if (!u || !conferirSenha(senha || '', u.senha_hash)) {
      falhas.set(ip, [...recentes, agora]);
      throw Object.assign(new Error('E-mail ou senha errados.'), { status: 401 });
    }
    const t = token(32);
    await db.query('insert into sessoes (token_hash, usuario_id, empresa_id, ip, expira_em) values ($1,$2,$3,$4,$5)', [sha256(t), u.id, u.empresa_id, ip || null, new Date(agora + TRINTA_DIAS)]);
    await db.query('update usuarios set ultimo_login = now() where id = $1', [u.id]);
    return { token: t, usuario: publico(u) };
  }

  const publico = (u) => ({ id: u.id, email: u.email, nome: u.nome, papel: u.papel, empresa_id: u.empresa_id });

  async function sessao(req) {
    const t = lerCookies(req).egi;
    if (!t) return null;
    const s = await db.um(`select s.token_hash, s.empresa_id as contexto, u.* from sessoes s join usuarios u on u.id = s.usuario_id
      where s.token_hash = $1 and s.expira_em > now() and u.ativo`, [sha256(t)]);
    if (!s) return null;
    return { tokenHash: s.token_hash, usuario: publico(s), empresaId: s.papel === 'admin_egi' ? s.contexto : s.empresa_id, admin: s.papel === 'admin_egi' };
  }

  async function sair(req) {
    const t = lerCookies(req).egi;
    if (t) await db.query('delete from sessoes where token_hash = $1', [sha256(t)]);
  }

  // admin EGI abre o painel de uma empresa (suporte, conectar WhatsApp, logar o motor junto com o cliente)
  async function entrarComo(s, empresaId) {
    if (!s?.admin) throw Object.assign(new Error('Só a equipe EGI.'), { status: 403 });
    await db.query('update sessoes set empresa_id = $2 where token_hash = $1', [s.tokenHash, empresaId]);
  }

  async function criarUsuario({ empresaId, email, nome = '', papel = 'dono', senha }) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) throw Object.assign(new Error('E-mail inválido.'), { status: 400 });
    if (!['dono', 'membro', 'admin_egi'].includes(papel)) throw Object.assign(new Error('Papel inválido.'), { status: 400 });
    const s = senha || senhaTemporaria();
    if (!senhaForte(s)) throw Object.assign(new Error('Senha fraca: mínimo 10 caracteres com letras e números.'), { status: 400 });
    if (await db.um('select 1 from usuarios where lower(email) = lower($1)', [email])) throw Object.assign(new Error('Já existe um usuário com esse e-mail.'), { status: 409 });
    const u = await db.um('insert into usuarios (empresa_id, email, nome, senha_hash, papel) values ($1,$2,$3,$4,$5) returning *',
      [papel === 'admin_egi' ? null : empresaId, email.trim().toLowerCase(), nome, hashSenha(s), papel]);
    return { usuario: publico(u), senhaTemporaria: senha ? null : s };
  }

  async function redefinirSenha(usuarioId) {
    const s = senhaTemporaria();
    await db.query('update usuarios set senha_hash = $2 where id = $1', [usuarioId, hashSenha(s)]);
    await db.query('delete from sessoes where usuario_id = $1', [usuarioId]);
    return s;
  }
  async function trocarSenha(usuarioId, atual, nova) {
    const u = await db.um('select senha_hash from usuarios where id = $1', [usuarioId]);
    if (!u || !conferirSenha(atual || '', u.senha_hash)) throw Object.assign(new Error('Senha atual errada.'), { status: 401 });
    if (!senhaForte(nova)) throw Object.assign(new Error('Senha nova fraca: mínimo 10 caracteres com letras e números.'), { status: 400 });
    await db.query('update usuarios set senha_hash = $2 where id = $1', [usuarioId, hashSenha(nova)]);
  }

  const limpar = () => db.query('delete from sessoes where expira_em < now()');

  return { bootstrap, entrar, sessao, sair, entrarComo, criarUsuario, redefinirSenha, trocarSenha, limpar, cookie: (t, seguro) => `egi=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TRINTA_DIAS / 1000}${seguro ? '; Secure' : ''}` };
}
