// EGI Brand · runtime de cada empresa: conversas, terminais reais (pty) e execuções sem tela (canais),
// sempre com o cérebro, o HOME, as variáveis e o usuário Unix DA EMPRESA.
import pty from '@homebridge/node-pty-prebuilt-multiarch';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MOTORES, motorDe, motorValido, comandoTerminal, rodarSemTela, vincularCodex, lerCodex, disponiveis, opcoesProcesso } from './motores.js';

export const MIDIA = /\.(png|jpe?g|webp|gif|svg|mp4|mov|webm|m4v)$/i;

// limite de execuções sem tela ao mesmo tempo (todas as empresas somadas): protege a máquina
export function criarSemaforo(max) {
  let ativos = 0; const fila = [];
  const proximo = () => { if (ativos < max && fila.length) { ativos++; fila.shift()(); } };
  return {
    async usar(fn) {
      await new Promise((ok) => { fila.push(ok); proximo(); });
      try { return await fn(); } finally { ativos--; proximo(); }
    },
    get ocupados() { return ativos; },
    get esperando() { return fila.length; },
  };
}

export function promptSistema(id, empresa) {
  return [
    `Você está rodando dentro do EGI Brand (por EGI Group), no cérebro da empresa ${empresa.nome}.`,
    `A nota de status desta conversa é sessoes/${id}.md (caminho relativo à pasta do cérebro).`,
    'Siga o CLAUDE.md §6: crie essa nota na primeira ação de qualquer tarefa, com título, resumo de 1 ou 2 frases e checklist, e marque cada etapa ao terminar.',
    'A identidade da marca da empresa (brandbook, logos, cores, fontes, tom de voz) está em marca/. Leia marca/CLAUDE.md antes de produzir qualquer peça.',
  ].join(' ');
}

function lerJson(arquivo, padrao) { try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return padrao; } }

class Cerebro {
  constructor({ empresa, cfg, empresas, semaforo, extrasEnv, log }) {
    this.empresa = empresa; this.cfg = cfg; this.empresas = empresas; this.semaforo = semaforo; this.extrasEnv = extrasEnv; this.log = log;
    this.p = empresas.pastas(empresa);
    if (!fs.existsSync(path.join(this.p.cerebro, 'CLAUDE.md'))) empresas.provisionar(empresa);
    this.vault = fs.realpathSync(this.p.cerebro);
    this.projetos = path.join(this.p.casa, '.claude', 'projects', this.vault.replace(/[^a-zA-Z0-9]/g, '-'));
    this.conversas = lerJson(path.join(this.p.dados, 'conversas.json'), []);
    for (const c of this.conversas) c.processando = false; // reiniciou: nada está rodando
    this.vivos = new Map(); // conversa -> { proc, buffer, clientes:Set }
    this.procs = new Set(); // execuções sem tela em andamento
    this.enviados = new Set(); // arquivos enviados pelo dono: não viram card de conversa
    this.vistos = null;
  }

  atualizarEmpresa(e) { this.empresa = e; }
  salvar() { fs.writeFileSync(path.join(this.p.dados, 'conversas.json'), JSON.stringify(this.conversas, null, 2)); }
  lerDados(nome, padrao) { return lerJson(path.join(this.p.dados, nome), padrao); }
  gravarDados(nome, v) { fs.writeFileSync(path.join(this.p.dados, nome), JSON.stringify(v, null, 2)); }

  async amb(extra = {}) {
    const e = this.empresa;
    const env = await this.empresas.ambiente(e, await this.extrasEnv(e));
    return {
      casa: this.p.casa, cwd: this.vault, tmp: this.p.tmp, env: { ...env, ...extra },
      uid: this.empresas.souRoot ? e.unix_uid : null, gid: this.empresas.souRoot ? e.unix_uid : null,
      bins: this.cfg.bins, limiteMinutos: this.cfg.limiteMinutos,
      aoIniciar: (proc) => this.procs.add(proc), aoTerminar: (proc) => this.procs.delete(proc),
    };
  }
  async motores() { return disponiveis(await this.amb()); }

  criarConversa(extra = {}) {
    const conv = { id: crypto.randomUUID(), criada: Date.now(), ultimaAtividade: Date.now(), midias: [], numero: this.conversas.length + 1, motor: this.empresa.motor_padrao, ...extra };
    if (!motorValido(conv.motor)) conv.motor = 'claude';
    this.conversas.push(conv);
    this.salvar();
    return conv;
  }
  conversa(id) { return this.conversas.find((c) => c.id === id) || null; }
  arquivar(id) {
    const conv = this.conversa(id);
    if (!conv) return false;
    this.vivos.get(id)?.proc.kill();
    conv.arquivada = true; this.salvar();
    return true;
  }
  jaTemClaude(conv) { return fs.existsSync(path.join(this.projetos, `${conv.id}.jsonl`)); }

  async iniciarTerminal(conv, cols = 120, rows = 32, pedido = '') {
    if (this.vivos.has(conv.id)) return this.vivos.get(conv.id);
    const amb = await this.amb({ TERM: 'xterm-256color', COLORTERM: 'truecolor', CORE_OS_SESSAO: conv.id });
    const { bin, args } = comandoTerminal(conv, { prompt: promptSistema(conv.id, this.empresa), jaTemClaude: this.jaTemClaude(conv) }, amb);
    const op = { name: 'xterm-256color', cols, rows, ...opcoesProcesso(amb) };
    let proc;
    try { proc = pty.spawn(bin, args, op); } catch (e) {
      proc = pty.spawn('bash', ['-c', `echo; echo "  ${MOTORES[motorDe(conv)].nome} não está instalado neste servidor (${e.message})."; echo "  ${MOTORES[motorDe(conv)].login}"; sleep 3600`], op);
    }
    if (!conv.sessaoMotor) { conv.iniciouTerminal = Date.now(); this.salvar(); }
    const vivo = { proc, buffer: '', clientes: new Set(), pedido: String(pedido || '').replace(/[\r\n]+/g, ' ').slice(0, 2000) };
    if (vivo.pedido) setTimeout(() => { vivo.pedido = ''; }, 90_000);
    proc.onData((d) => {
      vivo.buffer = (vivo.buffer + d).slice(-300_000);
      if (vivo.pedido) {
        const tela = vivo.buffer.slice(-6000).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
        if (!/trust this folder|sign in|choose how|log ?in/i.test(tela) && /[❯›]/.test(tela)) {
          const texto = vivo.pedido; vivo.pedido = '';
          setTimeout(() => { try { proc.write(texto); } catch { /* encerrou */ } }, 600);
        }
      }
      conv.ultimaAtividade = Date.now();
      for (const ws of vivo.clientes) if (ws.readyState === 1) ws.send(d);
    });
    proc.onExit(() => {
      this.vivos.delete(conv.id);
      for (const ws of vivo.clientes) if (ws.readyState === 1) ws.send('\r\n\x1b[2m[conversa encerrada. Clique no terminal pra retomar]\x1b[0m\r\n');
    });
    this.vivos.set(conv.id, vivo);
    return vivo;
  }

  // uma mensagem de canal (WhatsApp, Telegram...) numa conversa: roda o motor sem tela e devolve o texto final
  async rodar(conv, texto, { prompt, extraEnv = {} }) {
    conv.processando = true; conv.ultimaAtividade = Date.now(); this.salvar();
    try {
      const r = await this.semaforo.usar(async () => rodarSemTela(conv, texto, {
        prompt: `${promptSistema(conv.id, this.empresa)} ${prompt || ''}`.trim(),
        jaTemClaude: this.jaTemClaude(conv), extraEnv: { CORE_OS_SESSAO: conv.id, ...extraEnv },
      }, await this.amb()));
      if (r.sessao && !conv.sessaoMotor) conv.sessaoMotor = r.sessao;
      if (motorDe(conv) === 'antigravity') {
        conv.historico = [...(conv.historico || []), { papel: 'voce', texto, quando: Date.now() - 1 }, { papel: 'claude', texto: r.resposta, quando: Date.now() }].slice(-300);
      }
      return r.resposta;
    } finally { conv.processando = false; conv.ultimaAtividade = Date.now(); this.salvar(); }
  }

  // empresa suspensa/cancelada: derruba tudo que está rodando
  encerrarTudo() {
    for (const v of this.vivos.values()) { try { v.proc.kill(); } catch { /* */ } }
    for (const p of this.procs) { try { p.kill('SIGTERM'); } catch { /* */ } }
    this.vivos.clear(); this.procs.clear();
  }

  // ---------- leitura do registro do Claude Code (status e histórico) ----------
  static cache = new Map();
  lerRegistro(arquivo) {
    let st; try { st = fs.statSync(arquivo); } catch { return null; }
    const c = Cerebro.cache.get(arquivo);
    if (c && c.tamanho === st.size) return c.dados;
    let ultimaAcao = null; let terminou = false;
    for (const l of fs.readFileSync(arquivo, 'utf8').split('\n')) {
      if (!l) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      const conteudo = o.message?.content;
      if (o.type !== 'assistant' || !Array.isArray(conteudo)) continue;
      const usos = conteudo.filter((b) => b.type === 'tool_use');
      if (usos.length) { ultimaAcao = descreverAcao(usos[usos.length - 1]); terminou = false; } else if (o.message?.stop_reason === 'end_turn') terminou = true;
    }
    const dados = { ultimaAcao, terminou, mtime: st.mtimeMs };
    Cerebro.cache.set(arquivo, { tamanho: st.size, dados });
    return dados;
  }
  registroDe(c) {
    const m = motorDe(c);
    if (m === 'claude') return this.lerRegistro(path.join(this.projetos, `${c.id}.jsonl`)) || {};
    if (m === 'codex') return lerCodex(c.sessaoMotor, { casa: this.p.casa }).reg || {};
    return {};
  }
  subagentes(id) {
    const dir = path.join(this.projetos, id, 'subagents');
    let itens = []; try { itens = fs.readdirSync(dir).filter((f) => f.endsWith('.meta.json')); } catch { return []; }
    return itens.map((f) => {
      let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { /* */ }
      const reg = this.lerRegistro(path.join(dir, f.replace('.meta.json', '.jsonl'))) || {};
      const recente = reg.mtime && Date.now() - reg.mtime < 30_000;
      return { id: f.replace('.meta.json', ''), descricao: meta.description || 'Subagente', tipo: meta.agentType || '', status: reg.terminou ? 'concluido' : recente ? 'trabalhando' : 'parado', ultimaAcao: reg.ultimaAcao, inicio: reg.mtime };
    }).sort((a, b) => (a.inicio || 0) - (b.inicio || 0));
  }
  lerNota(id) { try { return fs.readFileSync(path.join(this.vault, 'sessoes', `${id}.md`), 'utf8'); } catch { return ''; } }

  estado() {
    const NOMES_CANAL = { whatsapp: 'WhatsApp', telegram: 'Telegram', gchat: 'Google Chat', ponte: 'Ponte', slack: 'Slack' };
    return this.conversas.filter((c) => !c.arquivada).map((c) => {
      const reg = this.registroDe(c);
      const nota = this.lerNota(c.id);
      const externa = c.origem && c.origem !== 'painel';
      const padrao = externa
        ? `${NOMES_CANAL[c.origem] || c.origem}${c.agente ? ` · ${c.agente}` : ''}${c.canalNome ? ` · ${c.canalNome}` : ''} · ${new Date(c.criada).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
        : `Conversa ${c.numero}`;
      return {
        id: c.id, motor: motorDe(c), motorNome: MOTORES[motorDe(c)].nome, titulo: nota.match(/^#\s+(.+)$/m)?.[1]?.trim() || padrao, nota, numero: c.numero, criada: c.criada,
        origem: c.origem || 'painel', processando: Boolean(c.processando), ativo: this.vivos.has(c.id),
        trabalhando: Boolean(c.processando) || (reg.mtime ? Date.now() - reg.mtime < 8000 && !reg.terminou : false),
        ultimaAcao: reg.ultimaAcao, midias: c.midias || [], subagentes: motorDe(c) === 'claude' ? this.subagentes(c.id) : [],
      };
    });
  }

  historico(id) {
    const conv = this.conversa(id);
    if (conv && motorDe(conv) === 'codex') return lerCodex(conv.sessaoMotor, { casa: this.p.casa }).itens.slice(-300);
    if (conv && motorDe(conv) !== 'claude') return (conv.historico || []).slice(-300);
    let linhas = [];
    try { linhas = fs.readFileSync(path.join(this.projetos, `${id}.jsonl`), 'utf8').split('\n'); } catch { return []; }
    const itens = [];
    for (const l of linhas) {
      if (!l) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      const quando = o.timestamp ? Date.parse(o.timestamp) : null;
      const c = o.message?.content;
      if (o.type === 'user' && !o.isMeta) {
        const texto = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
        if (texto && !texto.startsWith('<')) itens.push({ papel: 'voce', texto, quando });
      } else if (o.type === 'assistant' && Array.isArray(c)) {
        for (const b of c) {
          if (b.type === 'text' && b.text.trim()) itens.push({ papel: 'claude', texto: b.text.trim(), quando });
          if (b.type === 'tool_use') itens.push({ papel: 'acao', texto: descreverAcao(b), quando });
        }
      }
    }
    return itens.slice(-300);
  }

  // mídias novas em conteudo/ viram cards da conversa que as gerou
  vigiarMidias(listar) {
    const atual = new Map(listar(path.join(this.vault, 'conteudo'), 'conteudo').filter((f) => MIDIA.test(f.caminho) && !this.enviados.has(f.caminho)).map((f) => [f.caminho, f.mtime]));
    if (this.vistos) {
      for (const [p, m] of atual) {
        if (this.vistos.get(p) === m) continue;
        const dona = this.conversas.filter((c) => !c.arquivada)
          .map((c) => ({ c, t: Math.max(c.ultimaAtividade || 0, this.registroDe(c).mtime || 0) }))
          .filter((x) => Date.now() - x.t < 180_000).sort((a, b) => b.t - a.t)[0]?.c;
        if (dona && !dona.midias.includes(p)) { dona.midias.push(p); this.salvar(); }
      }
    }
    this.vistos = atual;
  }
  vincularCodex() { if (vincularCodex(this.conversas, { casa: this.p.casa, cwd: this.vault })) this.salvar(); }
}

export function descreverAcao(u) {
  const i = u.input || {};
  const curto = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 90);
  if (/sessoes\/[0-9a-f-]{36}\.md/.test(i.file_path || '')) return 'Atualizando a nota de status';
  if (i.description) return `${u.name}: ${curto(i.description)}`;
  if (i.file_path) return `${u.name}: ${path.basename(i.file_path)}`;
  if (i.command) return `${u.name}: ${curto(i.command)}`;
  if (i.pattern) return `${u.name}: ${curto(i.pattern)}`;
  return u.name;
}

export function criarRuntime({ cfg, empresas, log = console.log }) {
  const cerebros = new Map();
  const semaforo = criarSemaforo(cfg.maxParalelo);
  let extrasEnv = async () => ({});
  return {
    semaforo,
    definirExtrasEnv(fn) { extrasEnv = fn; },
    // o Cerebro da empresa (criado na primeira vez), sempre com o registro mais novo da empresa
    de(empresa) {
      let c = cerebros.get(empresa.id);
      if (!c) { c = new Cerebro({ empresa, cfg, empresas, semaforo, extrasEnv: (e) => extrasEnv(e), log }); cerebros.set(empresa.id, c); } else c.atualizarEmpresa(empresa);
      return c;
    },
    existente: (id) => cerebros.get(id) || null,
    encerrar(empresaId) { cerebros.get(empresaId)?.encerrarTudo(); },
    todos: () => [...cerebros.values()],
  };
}
