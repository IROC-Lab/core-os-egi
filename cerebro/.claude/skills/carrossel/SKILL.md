---
name: carrossel
description: Cria ou clona carrossel de Instagram (slides 1080x1350). Use quando o dono disser "cria um carrossel sobre X", "clona esse carrossel", "adapta esse carrossel pro português", "bota esse carrossel na minha marca" ou mandar um link de post de carrossel.
---

# Carrossel

## Modos
- **CRIAR:** tema ou roteiro vira carrossel novo na marca do dono.
- **CLONE:** link de carrossel vira réplica fiel em português (mesmo layout, cores e hierarquia).

## Fluxo
1. Pasta da entrega: `conteudo/carrosseis/YYYY-MM-DD-tema/` com `pedido.md`.
2. **CLONE:** baixar os slides originais em `original/`. Amostrar as cores reais dos pixels (Pillow), achar a Google Font mais próxima, medir o layout em proporção do quadro.
3. Um `build/slide_NN.html` por slide. **Texto sempre em HTML/CSS, nunca dentro de imagem gerada.** Ilustração ou foto entra como `<img>`.
4. Renderizar cada slide em PNG 1080x1350 @2x com o Chromium headless (`chromium --headless --screenshot`).
5. Comparar com o original (ou com a ideia) slide a slide. Corrigir e renderizar de novo até bater.
6. Entregar em `entrega/` + legenda em `legenda.md`. Exemplo pronto: `conteudo/carrosseis/2026-07-30-guia-notebooklm/`.

## Regras
- Capa com promessa clara, um passo por slide, último slide com CTA de uma palavra.
- Handle de terceiro no clone vira o handle do dono.
