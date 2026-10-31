---
name: thumbnail
description: Gera thumbnail de vídeo do YouTube a partir do roteiro e de uma referência de estilo, sempre em 3 caminhos pro teste A/B. Use quando o dono disser "faz a thumb do vídeo X", "cria thumbnails pra esse roteiro", "testa outra thumb".
---

# Thumbnail

## Fluxo
1. Pasta: `conteudo/thumbnails/<slug-do-video>/` com `pedido.md`.
2. Ler o roteiro e tirar o gancho (a promessa em até 4 palavras).
3. Montar 3 caminhos diferentes de promessa (não 3 cores da mesma ideia).
4. Gerar a cena com o gerador de imagem configurado (a chave fica em `/opt/core-os/.env`, nunca no cérebro). Foto de referência do dono em `assets/`.
5. Edição final na IA: ícones, texto curto, luz. Entregar em 1280x720 JPG.

## Nunca
- Cabeça cortada, mão segurando ícone, logo solto com seta apontando pro nada, fonte inventada.

Exemplo pronto: `conteudo/thumbnails/stack-ia-2026/`.
