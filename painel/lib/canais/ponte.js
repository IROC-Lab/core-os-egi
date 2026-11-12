// EGI Brand · ponte genérica de canais pelo n8n (Google Chat, Slack...), por empresa.
// O n8n faz POST em /hooks/ponte/<empresa> com o cabeçalho x-core-os-token = token da ponte da empresa:
//   { canal: 'gchat', chave: 'spaces/AAA/threads/BBB', de: 'fulano@empresa.com', nome: 'Fulano', texto: 'oi',
//     agente: 'sdr' (opcional), callback: 'https://n8n.../webhook/...', meta: {...} }
// Respondemos 202 na hora e, quando o agente terminar, POST no callback com { texto, canal, chave, de, meta }.
// Quem pode falar: acessos do canal "ponte" (e-mail, @dominio.com ou *).
import { iguais } from '../cripto.js';

export function criarPonte({ registro, empresas, nucleo, fetch: f = fetch, log = console.log }) {
  async function permitido(empresaId, de) {
    const quem = String(de || '').trim().toLowerCase();
    return (await registro.acessos(empresaId, 'ponte')).some(({ identificador }) => {
      const r = identificador.trim().toLowerCase();
      return r === '*' || (r.startsWith('@') ? quem.endsWith(r) : quem === r);
    });
  }

  async function receber(empresaId, tokenCabecalho, b = {}) {
    const e = await empresas.buscar(empresaId);
    if (!e) return { status: 404 };
    const c = await registro.canal(e.id, 'ponte');
    if (!c || !c.ativo || !iguais(tokenCabecalho, c.segredo_webhook)) return { status: 401 };
    const canal = String(b.canal || '').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
    const chave = String(b.chave || '').trim();
    const texto = String(b.texto || '').trim();
    const callback = String(b.callback || '').trim();
    const agente = String(b.agente || '').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
    if (!canal || !chave) return { status: 400, erro: 'canal e chave são obrigatórios' };
    if (!/^https:\/\//.test(callback)) return { status: 400, erro: 'callback precisa ser uma URL https' };
    if (!(await permitido(e.id, b.de))) return { status: 202, ignorado: true };
    if (!texto) return { status: 400, erro: 'texto vazio' };
    const entregar = async (t) => {
      try {
        const r = await f(callback, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-core-os-token': c.segredo_webhook }, body: JSON.stringify({ canal, chave, de: b.de, texto: t, meta: b.meta ?? {} }) });
        if (!r.ok) log(`[ponte:${canal}] ${e.slug}: callback recusou ${r.status}`);
      } catch (err) { log(`[ponte:${canal}] ${e.slug}: callback falhou: ${err.message}`); }
    };
    nucleo.receber(e.id, { canal: 'ponte', canalNome: canal, chave: `${canal}:${chave}`, de: String(b.de || ''), nome: String(b.nome || ''), texto, agente: agente || c.agente || undefined, motor: c.motor || undefined, responder: (t) => entregar(t.slice(0, 4000)) });
    return { status: 202, ok: true };
  }

  async function configurar(e, { ativo = true, permitidos = [] } = {}) {
    const c = await registro.garantir(e.id, 'ponte');
    await registro.atualizar(c.id, { ativo: Boolean(ativo) });
    await registro.substituirAcessos(e.id, 'ponte', permitidos.map(String).map((s) => s.trim()).filter(Boolean));
    return estado(e);
  }
  async function estado(e) {
    const c = await registro.canal(e.id, 'ponte');
    return { ativo: Boolean(c?.ativo), token: c?.segredo_webhook || null, permitidos: (await registro.acessos(e.id, 'ponte')).map((a) => a.identificador) };
  }

  return { receber, configurar, estado };
}
