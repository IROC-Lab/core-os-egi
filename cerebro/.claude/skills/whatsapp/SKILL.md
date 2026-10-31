---
name: whatsapp
description: WhatsApp do cérebro em mão dupla, pela Evolution API da EGI (evo.appegi.com.br, credenciais em /opt/core-os/.env). Lê conversas ("varre a conversa com o João", "o que a Maria me mandou hoje?", "quem me chamou hoje?"), acha contato pelo nome e manda mensagem, imagem, documento ou áudio pra qualquer pessoa ("manda pro João que a reunião mudou", "envia essa thumb pra Ana") ou pro próprio dono ("me manda no zap", "me avisa quando terminar"). Use sempre que o pedido envolver WhatsApp.
---

# WhatsApp (mão dupla, Evolution API da EGI)

As credenciais ficam em `/opt/core-os/.env` (fora do cérebro, nunca copiar pra cá). Quem pode dar ordens pelo WhatsApp fica em Configurações › WhatsApp no painel. 

## Comandos
```bash
W="bash .claude/skills/whatsapp/motor/whatsapp.sh"
$W conversas 20                    # últimas conversas: hora | nome | número | última mensagem
$W ler "João" 30                   # últimas 30 mensagens com o João (nome ou número)
$W contato "Ana"                   # acha o número pelo nome
$W text "Mensagem"                 # pro dono (quem está falando com você pelo WhatsApp)
$W text "Mensagem" 5527999999999   # pra outra pessoa (55 + DDD + número)
$W image conteudo/thumbnails/x/thumb.jpg "Legenda" [numero]
$W doc arquivo.pdf "Legenda" [numero]
$W status                          # conexão: state open = conectado
```
Se `ler` ou `contato` acharem mais de uma pessoa com o nome, ele lista os números. Escolha pelo contexto ou pergunte ao dono qual é.

## Regras de envio pra outra pessoa
- **Pedido claro do dono = envia direto** ("manda pro João que a reunião mudou pra 15h"). Depois confirma pra ele o que foi, pra quem, e o texto exato.
- **Pergunta antes** quando: a ideia de mandar foi sua, o destinatário ficou ambíguo (dois "João"), ou o texto não foi ditado e pode mudar o sentido (cobrança, preço, desculpa, algo delicado).
- Escreva na voz do dono, curto, como ele escreve no WhatsApp. Nunca se apresente como IA.
- Grupo: só envia se o dono citou o grupo pelo nome.

## Ler conversa
- Resuma o que importa (quem pediu o quê, o que ficou pendente, prazo), não cole a conversa inteira.
- Tarefa que aparecer na conversa vira item em `tasks/todo.md` se o dono pedir pra acompanhar.

## Quando der erro
Rode `status`. Desconectado: o dono reconecta lendo o QR no painel (Configurações › WhatsApp).

## Trocar quem pode dar ordens
Fica num arquivo só, lido a cada mensagem (não precisa reiniciar nada): `/opt/core-os/dados/whatsapp-acesso.json`
```json
{ "numeros": ["5527999999999"], "chatVoce": true }
```
- `numeros`: quem pode mandar ordem pro número conectado (55 + DDD + número). Mensagem de qualquer outro número é ignorada.
- `chatVoce`: `true` deixa o dono do número conectado mandar ordem no chat "Você" (consigo mesmo).
- O dono também troca isso no painel, em Configurações › WhatsApp.
- **Nunca** edite o fluxo do n8n, o `server.js` ou o `.env` pra trocar número: foi isso que quebrava a conexão.
