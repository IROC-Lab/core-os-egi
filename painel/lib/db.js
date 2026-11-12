// EGI Brand · acesso ao Postgres. Produção: node-postgres (DATABASE_URL). Testes: PGlite em memória, com a mesma
// interface ({ query, um, exec, transacao }), assim nenhum teste encosta nos bancos compartilhados.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const PASTA_MIGRACOES = path.join(AQUI, '..', 'db', 'migracoes');
const SCHEMA = 'egi_brand';

function embrulhar(executor) {
  const query = async (sql, params = []) => {
    const r = await executor.query(sql, params);
    return { rows: r.rows, rowCount: r.rowCount ?? r.affectedRows ?? r.rows.length };
  };
  return {
    query,
    um: async (sql, params) => (await query(sql, params)).rows[0] || null,
    todos: async (sql, params) => (await query(sql, params)).rows,
  };
}

export async function conectarPostgres(url) {
  const { default: pg } = await import('pg');
  // datas de vencimento (date) voltam como texto AAAA-MM-DD, sem fuso pra atrapalhar
  pg.types.setTypeParser(1082, (v) => v);
  const pool = new pg.Pool({ connectionString: url, max: 10, options: `-c search_path=${SCHEMA},public` });
  pool.on('error', (e) => console.error('[banco]', e.message));
  const base = embrulhar(pool);
  return {
    ...base,
    exec: (sql) => pool.query(sql),
    async transacao(fn) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const r = await fn(embrulhar(c));
        await c.query('commit');
        return r;
      } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
    },
    fechar: () => pool.end(),
  };
}

// PGlite: um processo, uma conexão. Usado nos testes e pra rodar a plataforma localmente sem Postgres.
export async function conectarPglite(pasta) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite({ ...(pasta ? { dataDir: pasta } : {}), parsers: { 1082: (v) => v } });
  await pg.exec(`set search_path to ${SCHEMA}, public`);
  const base = embrulhar(pg);
  let fila = Promise.resolve();
  return {
    ...base,
    exec: (sql) => pg.exec(sql),
    // PGlite não tem pool: as transações entram em fila pra não se misturarem
    transacao(fn) {
      const rodar = fila.then(() => pg.transaction((tx) => fn(embrulhar(tx))));
      fila = rodar.catch(() => {});
      return rodar;
    },
    fechar: () => pg.close(),
  };
}

export async function conectar(url) {
  if (!url) throw new Error('Defina DATABASE_URL (Postgres da plataforma).');
  if (url.startsWith('pglite:')) return conectarPglite(url.slice('pglite:'.length) || undefined);
  return conectarPostgres(url);
}

// aplica, em ordem, as migrações que ainda não rodaram. Cada uma roda inteira ou não roda.
export async function migrar(db, pasta = PASTA_MIGRACOES, log = console.log) {
  await db.exec(`create schema if not exists ${SCHEMA}; create table if not exists ${SCHEMA}.migracoes (versao text primary key, aplicada_em timestamptz not null default now())`);
  const feitas = new Set((await db.todos(`select versao from ${SCHEMA}.migracoes`)).map((r) => r.versao));
  const pendentes = fs.readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort().filter((f) => !feitas.has(f));
  for (const f of pendentes) {
    const sql = fs.readFileSync(path.join(pasta, f), 'utf8');
    await db.transacao(async (tx) => {
      await tx.query(`set local search_path to ${SCHEMA}, public`).catch(() => {});
      for (const comando of dividirSql(sql)) await tx.query(comando);
      await tx.query(`insert into ${SCHEMA}.migracoes (versao) values ($1)`, [f]);
    });
    log(`[banco] migração aplicada: ${f}`);
  }
  return pendentes;
}

// separa o arquivo em comandos (sem funções com $$ nas migrações, então ponto e vírgula fora de aspas basta)
export function dividirSql(sql) {
  const semComentario = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const saida = []; let atual = ''; let aspas = false;
  for (const ch of semComentario) {
    if (ch === "'") aspas = !aspas;
    if (ch === ';' && !aspas) { if (atual.trim()) saida.push(atual.trim()); atual = ''; } else atual += ch;
  }
  if (atual.trim()) saida.push(atual.trim());
  return saida;
}
