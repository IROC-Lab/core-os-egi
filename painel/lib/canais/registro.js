// EGI Brand · registro dos canais de cada empresa (tabela canais) e de quem pode dar ordens (canal_acessos).
import { token } from '../cripto.js';

export function criarRegistroCanais({ db, cofre }) {
  async function canal(empresaId, tipo) {
    return db.um('select * from canais where empresa_id = $1 and tipo = $2', [empresaId, tipo]);
  }
  async function garantir(empresaId, tipo, config = {}) {
    const atual = await canal(empresaId, tipo);
    if (atual) return atual;
    return db.um(`insert into canais (empresa_id, tipo, config, segredo_webhook) values ($1,$2,$3,$4)
      on conflict (empresa_id, tipo) do update set atualizado_em = canais.atualizado_em returning *`, [empresaId, tipo, JSON.stringify(config), token(24)]);
  }
  async function atualizar(id, campos) {
    const sets = []; const params = [];
    for (const [k, v] of Object.entries(campos)) {
      if (!['ativo', 'config', 'token_cifrado', 'motor', 'agente', 'estado'].includes(k)) continue;
      params.push(k === 'config' ? JSON.stringify(v) : v); sets.push(`${k} = $${params.length}`);
    }
    params.push(id);
    return db.um(`update canais set ${sets.join(', ')}, atualizado_em = now() where id = $${params.length} returning *`, params);
  }
  const tokenDe = (c) => { if (!c?.token_cifrado) return ''; try { return cofre.decifrar(c.token_cifrado); } catch { return ''; } };
  const cifrar = (t) => cofre.cifrar(t);

  const acessos = (empresaId, tipo) => db.todos('select identificador, nome, criado_em from canal_acessos where empresa_id = $1 and canal_tipo = $2 order by criado_em', [empresaId, tipo]);
  async function autorizar(empresaId, tipo, identificador, nome = '') {
    await db.query(`insert into canal_acessos (empresa_id, canal_tipo, identificador, nome) values ($1,$2,$3,$4)
      on conflict (empresa_id, canal_tipo, identificador) do update set nome = case when excluded.nome <> '' then excluded.nome else canal_acessos.nome end`, [empresaId, tipo, String(identificador), nome]);
  }
  const desautorizar = (empresaId, tipo, identificador) => db.query('delete from canal_acessos where empresa_id = $1 and canal_tipo = $2 and identificador = $3', [empresaId, tipo, String(identificador)]);
  async function substituirAcessos(empresaId, tipo, lista) {
    await db.transacao(async (tx) => {
      await tx.query('delete from canal_acessos where empresa_id = $1 and canal_tipo = $2', [empresaId, tipo]);
      for (const i of lista) await tx.query('insert into canal_acessos (empresa_id, canal_tipo, identificador, nome) values ($1,$2,$3,$4) on conflict do nothing', [empresaId, tipo, String(i.identificador ?? i), i.nome || '']);
    });
  }

  return { canal, garantir, atualizar, tokenDe, cifrar, acessos, autorizar, desautorizar, substituirAcessos };
}
