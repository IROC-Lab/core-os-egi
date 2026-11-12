// EGI Brand · catálogo do que dá pra acrescentar ao cérebro de uma empresa: aplicações (programas no espaço dela),
// conexões MCP (ferramentas que o Claude Code ganha) e os primeiros testes de um clique.
// Cada item vira um botão que abre uma conversa já com o pedido escrito; quem instala é o agente, SEM root:
// tudo vai pro HOME da empresa (~/.local), então uma empresa nunca mexe no que a outra instalou.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let casa = os.homedir();
const pastas = () => [...new Set([path.join(casa, '.local', 'bin'), '/home/coreos/.local/bin', '/usr/local/bin', '/usr/bin'])];
const temBin = (...nomes) => nomes.some((n) => pastas().some((p) => { try { fs.accessSync(path.join(p, n), fs.constants.X_OK); return true; } catch { return false; } }));
const existe = (...caminhos) => caminhos.some((c) => fs.existsSync(c));
const npmGlobal = (pacote) => existe(`/usr/lib/node_modules/${pacote}`, `/usr/local/lib/node_modules/${pacote}`, path.join(casa, '.local', 'lib', 'node_modules', pacote));

const REGRA = 'Sem sudo: instale só no meu espaço (~/.local, npm com prefixo ~/.local, pipx ou binário oficial em ~/.local/bin). Se precisar de chave, me peça pra cadastrar no painel (Configurações › Variáveis) e leia de $CORE_OS_ENV; nunca grave chave dentro do cérebro. No fim, teste e me diga em uma frase o que eu ganhei.';

export const APLICACOES = [
  { id: 'ffmpeg', nome: 'FFmpeg', logo: 'ffmpeg.svg', faz: 'Corta, junta e converte vídeo e áudio', instalado: () => temBin('ffmpeg'),
    pedido: 'Confere se o FFmpeg está disponível (ffmpeg -version); ele já vem no servidor do EGI Brand.' },
  { id: 'yt-dlp', nome: 'yt-dlp', logo: 'yt-dlp.png', faz: 'Baixa vídeo do YouTube, Instagram e TikTok', instalado: () => temBin('yt-dlp'),
    pedido: 'Instala o yt-dlp neste servidor (versão mais nova, pelo binário oficial ou pipx) e confere com yt-dlp --version.' },
  { id: 'whisper', nome: 'Whisper', logo: 'openai.svg', faz: 'Transcreve áudio e vídeo, aqui mesmo no servidor', instalado: () => temBin('whisper-cli', 'whisper', 'faster-whisper', 'whisper-ctranslate2'),
    pedido: 'Instala um transcritor Whisper que rode bem nesta VPS sem placa de vídeo (whisper.cpp ou faster-whisper, modelo small em português), testa transcrevendo um áudio curto e cria uma skill "transcrever" no cérebro explicando como usar.' },
  { id: 'hyperframes', nome: 'HyperFrames', logo: 'hyperframes-color.svg', faz: 'Motion design em código, renderizado em vídeo', instalado: () => temBin('hyperframes') || npmGlobal('hyperframes'),
    pedido: 'Instala o HyperFrames neste servidor (npm, com o Chromium que ele precisa pra renderizar), renderiza um teste de 3 segundos em conteudo/ e confere que o vídeo abriu.' },
  { id: 'playwright', nome: 'Playwright', logo: 'playwright.svg', faz: 'Navegador que o Claude controla: lê sites, tira print, preenche formulário', instalado: () => existe(path.join(casa, '.cache', 'ms-playwright')),
    pedido: 'Instala o Playwright com o Chromium no meu espaço (npm com prefixo ~/.local; as bibliotecas do sistema já vêm no servidor), tira um print de https://example.com e salva em conteudo/.' },
  { id: 'vercel', nome: 'Vercel CLI', logo: 'vercel.svg', faz: 'Publica site e landing page com link na hora', instalado: () => temBin('vercel'),
    pedido: 'Instala o Vercel CLI neste servidor (npm i -g vercel) e me guia no login com a minha conta (vercel login, pelo link).' },
  { id: 'gh', nome: 'GitHub CLI', logo: 'github.svg', faz: 'Guarda e versiona os seus projetos no GitHub', instalado: () => temBin('gh'),
    pedido: 'Instala o GitHub CLI no meu espaço (binário oficial do GitHub Releases em ~/.local/bin) e me guia no login (gh auth login, pelo navegador com código).' },
];

export const MCPS = [
  { id: 'n8n', nome: 'n8n', logo: 'n8n-color.svg', faz: 'Cria e edita automações do n8n deste servidor',
    pedido: 'Conecta o n8n deste servidor no Claude Code por MCP (o n8n tem MCP próprio nas configurações da instância), pra você criar e editar fluxos por aqui.' },
  { id: 'higgsfield', nome: 'Higgsfield', logo: 'higgsfield.png', faz: 'Gera imagem e vídeo com IA',
    pedido: 'Instala o MCP oficial do Higgsfield no Claude Code deste servidor (escopo do usuário, servidor remoto por HTTP; ache a URL na documentação oficial) e faz o login comigo.' },
  { id: 'openrouter', nome: 'OpenRouter', logo: 'openrouter.svg', faz: 'Acesso a centenas de modelos de IA com uma chave só',
    pedido: 'Instala o MCP do OpenRouter no Claude Code deste servidor (https://mcp.openrouter.ai/mcp, escopo do usuário) e me pede a chave de API.' },
  { id: 'notion', nome: 'Notion', logo: 'notion.svg', faz: 'Lê e escreve páginas e bancos do seu Notion',
    pedido: 'Instala o MCP oficial do Notion no Claude Code deste servidor (https://mcp.notion.com/mcp, escopo do usuário) e faz o login comigo.' },
  { id: 'supabase', nome: 'Supabase', logo: 'supabase.svg', faz: 'Banco de dados e login pros seus apps',
    pedido: 'Instala o MCP oficial do Supabase no Claude Code deste servidor (https://mcp.supabase.com/mcp, escopo do usuário) e faz o login comigo.' },
  { id: 'vercel', nome: 'Vercel', logo: 'vercel.svg', faz: 'Vê deploys, domínios e logs dos seus sites',
    pedido: 'Instala o MCP oficial da Vercel no Claude Code deste servidor (https://mcp.vercel.com, escopo do usuário) e faz o login comigo.' },
  { id: 'context7', nome: 'Context7', logo: 'context7.png', faz: 'Documentação atualizada de qualquer biblioteca',
    pedido: 'Instala o MCP do Context7 no Claude Code deste servidor (https://mcp.context7.com/mcp, escopo do usuário).' },
  { id: 'zernio', nome: 'Zernio', logo: 'zernio.png', faz: 'Publica e agenda posts no Instagram',
    pedido: 'Instala o MCP do Zernio no Claude Code deste servidor (ache a URL na documentação oficial do Zernio, escopo do usuário) e me pede a chave de API.' },
].map((m) => ({ ...m, pedido: `${m.pedido} ${REGRA}` }));

// MCPs já configurados no Claude Code (só os nomes, nada de chave sai daqui)
function mcpsInstalados(vault) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(casa, '.claude.json'), 'utf8')); } catch { /* sem config */ }
  const nomes = new Set(Object.keys(cfg.mcpServers || {}));
  for (const [p, v] of Object.entries(cfg.projects || {})) if (path.resolve(p) === vault) for (const n of Object.keys(v?.mcpServers || {})) nomes.add(n);
  try { for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(vault, '.mcp.json'), 'utf8')).mcpServers || {})) nomes.add(n); } catch { /* sem .mcp.json */ }
  return [...nomes].map((n) => n.toLowerCase());
}

export function catalogo(vault, casaEmpresa) {
  if (casaEmpresa) casa = casaEmpresa;
  const mcps = mcpsInstalados(vault);
  return {
    aplicacoes: APLICACOES.map(({ instalado, ...a }) => ({ ...a, pedido: `${a.pedido} ${REGRA}`, instalado: instalado() })),
    mcps: MCPS.map((m) => ({ ...m, instalado: mcps.some((n) => n.includes(m.id)) })),
  };
}

// primeiros testes: um clique, resultado em segundos, de preferência no WhatsApp
export const PRIMEIROS_TESTES = [
  { id: 'oi', titulo: 'Oi pelo WhatsApp', faz: 'Ele te manda uma mensagem agora', icone: 'zap',
    pedido: 'Me manda uma mensagem no WhatsApp dizendo que o meu segundo cérebro está no ar, com a hora de agora e 3 coisas que eu posso te pedir por lá.' },
  { id: 'link', titulo: 'Resumo de um link', faz: 'Cole um link: ele lê e te manda o resumo no WhatsApp', icone: 'globo',
    pedido: 'Lê esta página e me manda no WhatsApp um resumo em 5 tópicos curtos, com o link no final: ' },
  { id: 'esperando', titulo: 'Quem está esperando resposta', faz: 'Ele varre o seu WhatsApp e lista quem ficou sem resposta', icone: 'conversaNova',
    pedido: 'Varre as minhas últimas 20 conversas do WhatsApp e me diz quem está esperando resposta minha, com uma sugestão de resposta curta pra cada um. Não envia nada pra ninguém.' },
  { id: 'lembrete', titulo: 'Lembrete em 2 minutos', faz: 'Ele agenda e te avisa sozinho no WhatsApp', icone: 'relogio',
    pedido: 'Daqui a 2 minutos, me manda no WhatsApp o lembrete "Hora de gravar o vídeo". Agenda isso no servidor e me confirma o horário.' },
  { id: 'carrossel', titulo: 'Carrossel pronto', faz: 'Ele cria um carrossel e te manda as imagens', icone: 'grade',
    pedido: 'Usa a skill de carrossel e cria um carrossel de 5 slides sobre "3 tarefas que a IA faz por mim todo dia". Quando terminar, me manda as imagens no WhatsApp.' },
];
