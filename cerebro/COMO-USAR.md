# Como usar o seu segundo cérebro

Três portas de entrada, o mesmo cérebro:

1. **Painel** (no navegador): árvore de arquivos à esquerda, canvas no meio, conversas à direita. Cada conversa nova é um Claude Code de verdade rodando aqui no servidor.
2. **WhatsApp**: manda mensagem pro número conectado. O n8n recebe, chama o Claude Code e responde. Só o número do dono é atendido.
3. **Terminal**: `ssh` no servidor e `claude` dentro da pasta do cérebro. No celular, use o Claude Code Remote.

## O que pedir
- "Cria um carrossel sobre X" → sai em `conteudo/carrosseis/`.
- "Faz a thumb do vídeo Y" → sai em `conteudo/thumbnails/`.
- "Edita esse vídeo" → sai em `conteudo/reels/`.
- "Me manda isso no zap" → chega no seu WhatsApp.

## Regra de ouro
Fala normal. Tudo que você disser de importante o cérebro grava no lugar certo sozinho (`CLAUDE.md`, seção 2).
