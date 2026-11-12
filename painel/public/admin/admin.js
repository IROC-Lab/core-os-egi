// EGI Brand · painel administrador da EGI Group: empresas, cobrança (Asaas), canais, variáveis e usuários.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reais = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const quando = (t) => (t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const doc = (d) => { const s = String(d || ''); return s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'); };
const fone = (n) => (n ? String(n).replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '+$1 ($2) $3-$4') : '');
const ROTULO = { ativa: 'Em dia', inadimplente: 'Atrasada', suspensa: 'Suspensa', aguardando_setup: 'Aguardando setup', cancelada: 'Cancelada',
  pendente: 'Em aberto', paga: 'Paga', vencida: 'Vencida', estornada: 'Estornada', enviado: 'Enviado', falhou: 'Falhou', sem_canal: 'Sem canal' };
const pilula = (s) => `<span class="pilula ${esc(s)}">${esc(ROTULO[s] || s)}</span>`;
const FORMAS = { UNDEFINED: 'Cliente escolhe (Pix, boleto ou cartão)', PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de crédito' };
const MOTORES = { claude: 'Claude Code', codex: 'Codex', antigravity: 'Antigravity' };

async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, { headers: { 'Content-Type': 'application/json' }, ...opcoes, body: opcoes.body && typeof opcoes.body !== 'string' ? JSON.stringify(opcoes.body) : opcoes.body });
  if (r.status === 401) { mostrarLogin(); throw new Error('Faça login.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
const tentar = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e.message !== 'Faça login.') alert(e.message); } };

// ---------- tema e login ----------
const tema = (t) => { document.documentElement.dataset.tema = t; try { localStorage.setItem('tema-admin', t); } catch { /* */ } };
tema((() => { try { return localStorage.getItem('tema-admin'); } catch { return null; } })() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'));
function mostrarLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#email').focus(); }
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#email').value, senha: $('#senha').value }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { $('#login-erro').textContent = j.erro || 'Não consegui entrar.'; return; }
  if (!j.admin) { location.href = '/'; return; }
  iniciar();
});

// ---------- visão geral ----------
const E = { empresas: [], planos: [], aberta: null, aba: 'dados', ficha: null };
async function iniciar() {
  const eu = await fetch('/api/eu').then((r) => r.json());
  if (!eu.logado) return mostrarLogin();
  if (!eu.admin) { location.href = '/'; return; }
  if (eu.empresa) await fetch('/api/admin/sair-da-empresa', { method: 'POST' }); // voltou do suporte
  $('#login').hidden = true; $('#app').hidden = false;
  $('#quem').textContent = eu.usuario.email;
  await Promise.all([pintarResumo(), carregarEmpresas(), carregarPlanos()]);
}

async function pintarResumo() {
  const r = await api('/api/admin/resumo');
  const n = (s) => r.porStatus[s] || 0;
  $('#kpis').innerHTML = [
    ['Receita recorrente (MRR)', reais(r.mrrCentavos), `${n('ativa') + n('inadimplente')} empresas pagantes`],
    ['Recebido neste mês', reais(r.recebidoNoMesCentavos), 'setup + mensalidades'],
    ['Em atraso', reais(r.emAtraso.centavos), `${r.emAtraso.quantidade} mensalidade(s)`],
    ['Suspensas', n('suspensa'), `suspende no ${r.diasSuspensao}º dia de atraso`],
    ['Aguardando setup', n('aguardando_setup'), 'cadastradas, setup não pago'],
  ].map(([t, v, s]) => `<div class="kpi"><span>${esc(t)}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`).join('');
  const alertas = [];
  if (!r.asaas.configurado) alertas.push('ASAAS_API_KEY não configurada: nenhuma cobrança sai.');
  else if (!r.asaas.webhook) alertas.push('ASAAS_WEBHOOK_TOKEN vazio: os pagamentos não chegam por webhook (só pela rotina horária).');
  if (r.asaas.configurado && r.asaas.ambiente === 'sandbox') alertas.push('Asaas em modo SANDBOX (testes). Pra cobrar de verdade: ASAAS_AMBIENTE=producao.');
  if (!r.evolution) alertas.push('Evolution (EVO_URL/EVO_KEY) não configurada: WhatsApp e avisos por WhatsApp desligados.');
  if (r.errosAsaas7d) alertas.push(`${r.errosAsaas7d} webhook(s) do Asaas com erro nos últimos 7 dias.`);
  $('#alertas').innerHTML = alertas.map((a) => `<div class="alerta">${esc(a)}</div>`).join('');
}

async function carregarEmpresas() {
  const q = new URLSearchParams({ busca: $('#busca').value.trim(), status: $('#filtro-status').value });
  E.empresas = await api(`/api/admin/empresas?${q}`);
  $('#tabela-empresas tbody').innerHTML = E.empresas.map((e) => `<tr data-id="${e.id}">
    <td><b>${esc(e.nome)}</b><small>${esc(e.slug)} · ${esc(doc(e.cpf_cnpj))}</small></td>
    <td>${pilula(e.status)}</td>
    <td>${reais(e.valor_mensal_centavos)}<small>${esc(e.plano_nome || 'sem plano')}</small></td>
    <td>${dataBr(e.proximo_vencimento) || '-'}</td>
    <td>${e.cobrancas_atrasadas ? `<span class="perigo">${e.cobrancas_atrasadas}</span>` : '-'}</td>
    <td>${dataBr(e.criado_em)}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma empresa ainda. Clique em "+ Nova empresa".</td></tr>';
}
async function carregarPlanos() { E.planos = await api('/api/admin/planos'); }
let tBusca;
$('#busca').addEventListener('input', () => { clearTimeout(tBusca); tBusca = setTimeout(tentar(carregarEmpresas), 250); });
$('#filtro-status').addEventListener('change', tentar(carregarEmpresas));
$('#tabela-empresas').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) abrirFicha(tr.dataset.id); });

// ---------- modal ----------
function modal(html) { $('#modal-caixa').innerHTML = html; $('#modal').hidden = false; $('#modal-caixa').querySelector('input, select')?.focus(); }
const fecharModal = () => { $('#modal').hidden = true; };

function novaEmpresa() {
  const planos = E.planos.filter((p) => p.ativo);
  modal(`<h2>Nova empresa</h2>
    <form id="form-empresa" class="grade-form">
      <label class="inteira">Nome da empresa (marca)<input name="nome" required></label>
      <label>Razão social<input name="razao_social"></label>
      <label>CPF ou CNPJ<input name="cpf_cnpj" required inputmode="numeric"></label>
      <label>Responsável<input name="responsavel"></label>
      <label>E-mail de cobrança<input name="email" type="email" required></label>
      <label>WhatsApp do dono (recebe avisos)<input name="whatsapp_dono" inputmode="tel" placeholder="27 99999-9999"></label>
      <label>Telefone<input name="telefone" inputmode="tel"></label>
      <label>Plano<select name="plano_id"><option value="">Sem plano (valores abaixo)</option>${planos.map((p) => `<option value="${p.id}" data-mensal="${p.valor_mensal_centavos}" data-setup="${p.valor_setup_centavos}">${esc(p.nome)} · ${reais(p.valor_mensal_centavos)}/mês</option>`).join('')}</select></label>
      <label>Mensalidade (R$)<input name="valor_mensal" inputmode="decimal" placeholder="497,00"></label>
      <label>Setup (R$, cobrado na contratação)<input name="valor_setup" inputmode="decimal" placeholder="1.500,00"></label>
      <label>Dia de vencimento (1 a 28, opcional)<input name="dia_vencimento" type="number" min="1" max="28"></label>
      <label>Forma de pagamento<select name="forma_pagamento">${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      <label>Identificador (opcional)<input name="slug" placeholder="gerado do nome" pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"></label>
      <label>E-mail de acesso do dono ao painel<input name="usuario_email" type="email" placeholder="igual ao de cobrança se vazio"></label>
      <label class="linha-check inteira"><input type="checkbox" name="cobrar_setup" checked> Cobrar o setup agora (o cérebro só libera depois do pagamento)</label>
      <label class="linha-check inteira"><input type="checkbox" name="contratar" checked> Contratar já no Asaas (cadastra o cliente e gera a cobrança)</label>
      <div class="botoes inteira"><button class="primario" type="submit">Cadastrar</button><button class="leve" type="button" data-acao="fechar-modal">Cancelar</button></div>
    </form>`);
  const f = $('#form-empresa');
  f.plano_id.addEventListener('change', () => {
    const o = f.plano_id.selectedOptions[0];
    if (o?.dataset.mensal) { f.valor_mensal.value = (o.dataset.mensal / 100).toFixed(2).replace('.', ','); f.valor_setup.value = (o.dataset.setup / 100).toFixed(2).replace('.', ','); }
  });
  f.addEventListener('submit', tentar(async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    d.cobrar_setup = f.cobrar_setup.checked; d.contratar = f.contratar.checked;
    for (const k of ['slug', 'dia_vencimento', 'plano_id', 'valor_setup']) if (!d[k]) delete d[k];
    if (!d.usuario_email) d.usuario_email = d.email;
    const botao = f.querySelector('button[type=submit]'); botao.disabled = true; botao.textContent = 'Cadastrando...';
    try {
      const r = await api('/api/admin/empresas', { method: 'POST', body: d });
      modal(`<h2>${esc(r.empresa.nome)} cadastrada</h2>
        <div class="resultado">
          <div>Status: ${pilula(r.empresa.status)}</div>
          ${r.senhaTemporaria ? `<div>Acesso do dono: <code>${esc(r.dono.email)}</code> · senha temporária <code>${esc(r.senhaTemporaria)}</code></div><div class="sutil">Mande pra pessoa por um canal seguro; ela troca em Configurações › Sua conta. Esta senha não aparece de novo.</div>` : ''}
          ${r.setup ? `<div>Setup de ${reais(r.setup.valor_centavos)}, vence ${dataBr(r.setup.vencimento)}: <a href="${esc(r.setup.link_fatura)}" target="_blank" rel="noopener">${esc(r.setup.link_fatura)}</a></div><div class="sutil">O link já foi mandado pro WhatsApp do dono (se configurado). A empresa é liberada sozinha quando o Asaas confirmar o pagamento.</div>` : ''}
          ${r.aviso ? `<div class="perigo">${esc(r.aviso)}</div>` : ''}
        </div>
        <div class="botoes"><button class="primario" data-acao="abrir-ficha" data-id="${r.empresa.id}">Abrir ficha</button><button class="leve" data-acao="fechar-modal">Fechar</button></div>`);
      await Promise.all([carregarEmpresas(), pintarResumo()]);
    } finally { botao.disabled = false; botao.textContent = 'Cadastrar'; }
  }));
}

function planos() {
  modal(`<h2>Planos</h2>
    <ul class="lista-simples">${E.planos.map((p) => `<li><b>${esc(p.nome)}</b><span>${reais(p.valor_mensal_centavos)}/mês · setup ${reais(p.valor_setup_centavos)}</span><span class="sutil">${esc(p.descricao)}</span><span class="espaco"></span>
      <button class="leve" data-acao="plano-ativo" data-id="${p.id}" data-ativo="${p.ativo ? '0' : '1'}">${p.ativo ? 'Desativar' : 'Reativar'}</button></li>`).join('') || '<li class="sutil">Nenhum plano. Planos só preenchem os valores do cadastro; cada empresa guarda o próprio valor.</li>'}</ul>
    <form id="form-plano" class="grade-form">
      <label>Nome<input name="nome" required></label><label>Mensalidade (R$)<input name="valor_mensal" required inputmode="decimal"></label>
      <label>Setup (R$)<input name="valor_setup" inputmode="decimal"></label><label class="inteira">Descrição<input name="descricao"></label>
      <div class="botoes inteira"><button class="primario" type="submit">Criar plano</button><button class="leve" type="button" data-acao="fechar-modal">Fechar</button></div>
    </form>`);
  $('#form-plano').addEventListener('submit', tentar(async (e) => { e.preventDefault(); await api('/api/admin/planos', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); await carregarPlanos(); planos(); }));
}

// ---------- ficha da empresa ----------
async function abrirFicha(id) {
  E.aberta = id; $('#ficha').hidden = false; fecharModal();
  await pintarFicha();
}
async function pintarFicha() {
  const f = E.ficha = await api(`/api/admin/empresas/${E.aberta}`);
  const e = f.empresa;
  const pode = (s) => s.includes(e.status);
  $('#ficha-topo').innerHTML = `
    <h2>${esc(e.nome)} ${pilula(e.status)}</h2>
    <div class="sutil">${esc(e.slug)} · ${esc(doc(e.cpf_cnpj))} · ${reais(e.valor_mensal_centavos)}/mês${e.motivo_suspensao ? ` · <span class="perigo">${esc(e.motivo_suspensao)}</span>` : ''}${f.uso ? ` · ${f.uso.conversas} conversas, ${f.uso.rodando} rodando agora` : ''}</div>
    <div class="acoes">
      ${pode(['ativa', 'inadimplente']) ? '<button class="primario" data-acao="entrar-como">Abrir painel da empresa</button>' : ''}
      ${pode(['aguardando_setup']) ? '<button class="primario" data-acao="contratar">Gerar cobrança do setup</button><button class="leve" data-acao="ativar-sem-setup">Ativar sem setup</button>' : ''}
      ${pode(['ativa', 'inadimplente']) ? '<button class="leve" data-acao="suspender">Suspender</button>' : ''}
      ${pode(['suspensa']) ? '<button class="primario" data-acao="reativar">Reativar</button>' : ''}
      ${e.asaas_assinatura_id ? '<button class="leve" data-acao="sincronizar">Sincronizar com o Asaas</button>' : ''}
      ${!pode(['cancelada']) ? '<button class="leve perigo" data-acao="cancelar">Cancelar assinatura</button>' : ''}
      <button class="leve" data-acao="fechar-ficha">Fechar</button>
    </div>`;
  document.querySelectorAll('#ficha-abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === E.aba));
  pintarAba();
}

function pintarAba() {
  const f = E.ficha; const e = f.empresa;
  const corpo = $('#ficha-corpo');
  if (E.aba === 'dados') {
    corpo.innerHTML = `<form id="form-dados" class="grade-form cartao">
      <label class="inteira">Nome<input name="nome" value="${esc(e.nome)}"></label>
      <label>Razão social<input name="razao_social" value="${esc(e.razao_social)}"></label>
      <label>Responsável<input name="responsavel" value="${esc(e.responsavel)}"></label>
      <label>E-mail de cobrança<input name="email" type="email" value="${esc(e.email)}"></label>
      <label>WhatsApp do dono<input name="whatsapp_dono" value="${esc(e.whatsapp_dono)}"></label>
      <label>Telefone<input name="telefone" value="${esc(e.telefone)}"></label>
      <label>Mensalidade (R$)<input name="valor_mensal" value="${(e.valor_mensal_centavos / 100).toFixed(2).replace('.', ',')}"></label>
      <label>Dia de vencimento<input name="dia_vencimento" type="number" min="1" max="28" value="${e.dia_vencimento || ''}"></label>
      <label>Forma de pagamento<select name="forma_pagamento">${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}" ${e.forma_pagamento === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label>Motor das conversas<select name="motor_padrao">${Object.entries(MOTORES).map(([k, v]) => `<option value="${k}" ${e.motor_padrao === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Motor do WhatsApp/Telegram<select name="motor_canais">${Object.entries(MOTORES).map(([k, v]) => `<option value="${k}" ${e.motor_canais === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="botoes inteira"><button class="primario" type="submit">Salvar</button><span class="sutil">Mudar a mensalidade também atualiza a assinatura no Asaas (e as cobranças em aberto).</span></div>
    </form>
    <div class="cartao"><dl class="dl">
      <dt>Cliente no Asaas</dt><dd>${e.asaas_cliente_id ? `<code>${esc(e.asaas_cliente_id)}</code>` : '-'}</dd>
      <dt>Assinatura no Asaas</dt><dd>${e.asaas_assinatura_id ? `<code>${esc(e.asaas_assinatura_id)}</code>` : '-'}</dd>
      <dt>Ativada em</dt><dd>${quando(e.ativada_em) || '-'}</dd>
      <dt>Usuário Unix</dt><dd><code>egi${e.unix_uid}</code> (uid ${e.unix_uid})</dd>
      <dt>Pasta</dt><dd><code>/data/empresas/${esc(e.slug)}/</code> <button class="leve" data-acao="reprovisionar">Refazer pasta</button></dd>
    </dl></div>`;
    $('#form-dados').addEventListener('submit', tentar(async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target));
      await api(`/api/admin/empresas/${e.id}`, { method: 'PUT', body: d });
      await Promise.all([pintarFicha(), carregarEmpresas(), pintarResumo()]);
    }));
  }
  if (E.aba === 'cobrancas') {
    const s = f.situacao;
    corpo.innerHTML = `${s.vencida ? `<div class="alerta">Mensalidade de ${dataBr(s.vencida.vencimento)} em aberto. Suspende em ${dataBr(s.suspendeEm)} se não for paga.</div>` : ''}
    <div class="cartao tabela-rolagem"><table class="tabela"><thead><tr><th>Vencimento</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Pago em</th><th>Fatura</th><th></th></tr></thead><tbody>
      ${f.cobrancas.map((c) => `<tr><td>${dataBr(c.vencimento)}</td><td>${esc(c.tipo)}</td><td>${reais(c.valor_centavos)}</td><td>${pilula(c.status)}</td><td>${quando(c.pago_em)}</td>
        <td>${c.link_fatura ? `<a href="${esc(c.link_fatura)}" target="_blank" rel="noopener">abrir</a>` : ''}</td>
        <td>${['pendente', 'vencida'].includes(c.status) ? `<button class="leve" data-acao="reenviar" data-id="${c.id}">Reenviar aviso</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhuma cobrança ainda.</td></tr>'}
    </tbody></table></div>`;
  }
  if (E.aba === 'canais') {
    corpo.innerHTML = '<div class="cartao sutil">Carregando o estado dos canais...</div>';
    api(`/api/admin/empresas/${e.id}/canais`).then((c) => {
      const cfgCanal = (tipo) => f.canais.find((x) => x.tipo === tipo) || {};
      const linha = (tipo, titulo, estado, extra) => {
        const k = cfgCanal(tipo);
        return `<div class="cartao"><h3 style="margin:0 0 8px">${titulo} ${estado}</h3>${extra}
          <div class="grade-form" style="margin-top:10px">
            <label>Motor deste canal<select data-canal="${tipo}" data-campo="motor"><option value="">Padrão da empresa (${MOTORES[e.motor_canais]})</option>${Object.entries(MOTORES).map(([m, n]) => `<option value="${m}" ${k.motor === m ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label>Especialista fixo (opcional)<input data-canal="${tipo}" data-campo="agente" value="${esc(k.agente || '')}" placeholder="ex.: sdr"></label>
          </div></div>`;
      };
      corpo.innerHTML = [
        linha('whatsapp', 'WhatsApp', pilula(c.whatsapp.estado === 'open' ? 'ativa' : 'pendente'), `<dl class="dl"><dt>Instância</dt><dd><code>${esc(c.whatsapp.instancia)}</code></dd><dt>Número</dt><dd>${esc(fone(c.whatsapp.numero) || 'não conectado')}</dd><dt>Autorizados</dt><dd>${esc(c.acessoWhats.numeros.map(fone).join(', ') || 'só o dono')}</dd></dl>`),
        linha('telegram', 'Telegram', pilula(c.telegram.conectado ? 'ativa' : 'pendente'), `<dl class="dl"><dt>Bot</dt><dd>${c.telegram.bot ? `@${esc(c.telegram.bot)}` : 'não configurado'}</dd><dt>Chats pareados</dt><dd>${(c.telegram.acessos || []).length}</dd>${c.telegram.ultimoErro ? `<dt>Último erro</dt><dd class="perigo">${esc(c.telegram.ultimoErro)}</dd>` : ''}</dl>`),
        linha('ponte', 'Ponte n8n (Google Chat, Slack...)', pilula(c.ponte.ativo ? 'ativa' : 'cancelada'), `<dl class="dl"><dt>Permitidos</dt><dd>${esc(c.ponte.permitidos.join(', ') || 'ninguém')}</dd></dl>`),
        '<p class="sutil">QR do WhatsApp, token do bot e pareamentos são feitos pelo próprio cliente (ou por você em "Abrir painel da empresa"), em Configurações.</p>',
      ].join('');
    }).catch((x) => { corpo.innerHTML = `<div class="alerta">${esc(x.message)}</div>`; });
  }
  if (E.aba === 'variaveis') {
    corpo.innerHTML = `<div class="cartao"><p class="sutil" style="margin-top:0">Variáveis de ambiente só desta empresa, cifradas no banco e entregues apenas aos agentes dela (no ambiente do processo e em <code>$CORE_OS_ENV</code>). Segredo nunca volta pra tela.</p>
      <ul class="lista-simples">${f.variaveis.map((v) => `<li><code>${esc(v.chave)}</code><span class="sutil">${v.segredo ? '•••••• segredo' : esc(v.valor)}</span><span class="sutil">${quando(v.atualizado_em)}</span><span class="espaco"></span><button class="leve perigo" data-acao="var-remover" data-chave="${esc(v.chave)}">Remover</button></li>`).join('') || '<li class="sutil">Nenhuma variável.</li>'}</ul>
      <form id="form-var" class="grade-form" style="margin-top:12px">
        <label>Nome<input name="chave" required placeholder="OPENAI_API_KEY" pattern="[A-Za-z][A-Za-z0-9_]{1,63}"></label>
        <label>Valor<input name="valor" type="password" autocomplete="new-password"></label>
        <label class="linha-check"><input type="checkbox" name="segredo" checked> Segredo</label>
        <div class="botoes"><button class="primario" type="submit">Salvar variável</button></div>
      </form></div>`;
    $('#form-var').addEventListener('submit', tentar(async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target));
      await api(`/api/admin/empresas/${e.id}/variaveis/${encodeURIComponent(d.chave.toUpperCase())}`, { method: 'PUT', body: { valor: d.valor, segredo: ev.target.segredo.checked } });
      await pintarFicha();
    }));
  }
  if (E.aba === 'usuarios') {
    corpo.innerHTML = `<div class="cartao"><ul class="lista-simples">${f.usuarios.map((u) => `<li><b>${esc(u.email)}</b><span class="sutil">${esc(u.nome)}</span>${pilula(u.ativo ? 'ativa' : 'cancelada')}<span class="sutil">${u.papel}${u.ultimo_login ? ` · último acesso ${quando(u.ultimo_login)}` : ' · nunca entrou'}</span><span class="espaco"></span>
        <button class="leve" data-acao="redefinir-senha" data-id="${u.id}">Nova senha</button><button class="leve" data-acao="usuario-ativo" data-id="${u.id}" data-ativo="${u.ativo ? '0' : '1'}">${u.ativo ? 'Bloquear' : 'Desbloquear'}</button></li>`).join('') || '<li class="sutil">Nenhum usuário.</li>'}</ul>
      <form id="form-usuario" class="grade-form" style="margin-top:12px">
        <label>E-mail<input name="email" type="email" required></label><label>Nome<input name="nome"></label>
        <label>Papel<select name="papel"><option value="membro">Membro (usa o cérebro)</option><option value="dono">Dono (também configura e vê a cobrança)</option></select></label>
        <div class="botoes"><button class="primario" type="submit">Criar acesso</button></div>
      </form><div id="senha-gerada"></div></div>`;
    $('#form-usuario').addEventListener('submit', tentar(async (ev) => {
      ev.preventDefault();
      const r = await api(`/api/admin/empresas/${e.id}/usuarios`, { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) });
      await pintarFicha();
      $('#senha-gerada').innerHTML = `<div class="resultado">Acesso criado: <code>${esc(r.usuario.email)}</code> · senha temporária <code>${esc(r.senhaTemporaria)}</code></div>`;
    }));
  }
  if (E.aba === 'historico') {
    corpo.innerHTML = `<div class="cartao"><h3 style="margin-top:0">Avisos enviados</h3><ul class="lista-simples">${f.avisos.map((a) => `<li>${pilula(a.status)}<b>${esc(a.tipo)}</b><span class="sutil">${esc(a.canal)} ${esc(fone(a.destino) || a.destino)}</span><span class="espaco"></span><span class="sutil">${quando(a.enviado_em)}</span>${a.erro ? `<span class="perigo">${esc(a.erro)}</span>` : ''}</li>`).join('') || '<li class="sutil">Nenhum aviso.</li>'}</ul></div>
      <div class="cartao"><h3 style="margin-top:0">Auditoria</h3><ul class="lista-simples">${f.auditoria.map((a) => `<li><b>${esc(a.acao)}</b><code>${esc(JSON.stringify(a.detalhe))}</code><span class="espaco"></span><span class="sutil">${quando(a.criado_em)}</span></li>`).join('') || '<li class="sutil">Nada ainda.</li>'}</ul></div>`;
  }
}

$('#ficha-abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (!b) return; E.aba = b.dataset.aba; document.querySelectorAll('#ficha-abas button').forEach((x) => x.classList.toggle('ativa', x === b)); pintarAba(); });
$('#ficha-corpo').addEventListener('change', tentar(async (ev) => {
  const el = ev.target.closest('[data-canal]');
  if (!el) return;
  await api(`/api/admin/empresas/${E.aberta}/canais/${el.dataset.canal}`, { method: 'POST', body: { [el.dataset.campo]: el.value } });
}));

// ---------- ações ----------
document.addEventListener('click', tentar(async (ev) => {
  const b = ev.target.closest('[data-acao]');
  if (!b) return;
  const a = b.dataset.acao; const id = E.aberta;
  const recarregar = async () => { await Promise.all([pintarFicha(), carregarEmpresas(), pintarResumo()]); };
  if (a === 'tema') tema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
  if (a === 'sair') { await fetch('/api/logout', { method: 'POST' }); location.reload(); }
  if (a === 'nova') novaEmpresa();
  if (a === 'planos') planos();
  if (a === 'fechar-modal') fecharModal();
  if (a === 'abrir-ficha') abrirFicha(b.dataset.id);
  if (a === 'fechar-ficha') { $('#ficha').hidden = true; E.aberta = null; }
  if (a === 'plano-ativo') { await api(`/api/admin/planos/${b.dataset.id}`, { method: 'PUT', body: { ativo: b.dataset.ativo === '1' } }); await carregarPlanos(); planos(); }
  if (a === 'rotina') { b.disabled = true; const r = await api('/api/admin/rotina-cobranca', { method: 'POST' }).finally(() => { b.disabled = false; }); alert(`${r.reavaliadas} empresa(s) reavaliada(s).`); await Promise.all([carregarEmpresas(), pintarResumo()]); }
  if (a === 'entrar-como') { await api(`/api/admin/empresas/${id}/entrar`, { method: 'POST' }); location.href = '/'; }
  if (a === 'contratar') { const r = await api(`/api/admin/empresas/${id}/contratar`, { method: 'POST', body: { cobrar_setup: true } }); if (r.setup?.link_fatura) prompt('Link do setup (já foi pro WhatsApp do dono):', r.setup.link_fatura); await recarregar(); }
  if (a === 'ativar-sem-setup' && confirm('Ativar sem cobrar o setup? A assinatura mensal é criada agora no Asaas.')) { await api(`/api/admin/empresas/${id}/contratar`, { method: 'POST', body: { cobrar_setup: false } }); await recarregar(); }
  if (a === 'suspender') { const motivo = prompt('Motivo da suspensão (vai no aviso pro cliente):'); if (motivo === null) return; await api(`/api/admin/empresas/${id}/suspender`, { method: 'POST', body: { motivo } }); await recarregar(); }
  if (a === 'reativar' && confirm('Reativar o acesso desta empresa agora?')) { await api(`/api/admin/empresas/${id}/reativar`, { method: 'POST' }); await recarregar(); }
  if (a === 'sincronizar') { const r = await api(`/api/admin/empresas/${id}/sincronizar`, { method: 'POST' }); alert(`${r.mensalidades} mensalidade(s) conferida(s) no Asaas.`); await recarregar(); }
  if (a === 'cancelar') {
    const nome = E.ficha.empresa.nome;
    if (prompt(`Cancelar a assinatura cancela a cobrança recorrente no Asaas e bloqueia o acesso. Os arquivos ficam guardados. Digite o nome da empresa pra confirmar:\n${nome}`) !== nome) return;
    await api(`/api/admin/empresas/${id}/cancelar`, { method: 'POST', body: { confirmar: true } }); await recarregar();
  }
  if (a === 'reprovisionar') { await api(`/api/admin/empresas/${id}/reprovisionar`, { method: 'POST' }); alert('Pasta conferida: skills novas do modelo entraram, nada foi sobrescrito.'); }
  if (a === 'reenviar') { const r = await api(`/api/admin/cobrancas/${b.dataset.id}/reenviar-aviso`, { method: 'POST' }); alert(`WhatsApp: ${r.resultado.whatsapp} · Telegram: ${r.resultado.telegram}`); await pintarFicha(); }
  if (a === 'var-remover' && confirm(`Remover ${b.dataset.chave}?`)) { await api(`/api/admin/empresas/${id}/variaveis/${encodeURIComponent(b.dataset.chave)}`, { method: 'DELETE' }); await pintarFicha(); }
  if (a === 'redefinir-senha' && confirm('Gerar uma senha nova? A atual deixa de valer e a pessoa sai de todas as sessões.')) { const r = await api(`/api/admin/usuarios/${b.dataset.id}/redefinir-senha`, { method: 'POST' }); prompt('Senha temporária (mande por um canal seguro):', r.senhaTemporaria); }
  if (a === 'usuario-ativo') { await api(`/api/admin/usuarios/${b.dataset.id}/ativo`, { method: 'POST', body: { ativo: b.dataset.ativo === '1' } }); await pintarFicha(); }
}));
document.addEventListener('keydown', (ev) => { if (ev.key !== 'Escape') return; if (!$('#modal').hidden) fecharModal(); else if (!$('#ficha').hidden) { $('#ficha').hidden = true; E.aberta = null; } });

iniciar().catch(() => mostrarLogin());
