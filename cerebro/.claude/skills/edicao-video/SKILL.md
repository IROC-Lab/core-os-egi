---
name: edicao-video
description: Edita vídeo curto vertical (reels, shorts) a partir do bruto com fala e retakes e entrega o MP4 pronto. Use quando o dono disser "edita esse vídeo", "corta esse bruto", "escolhe os takes", "põe legenda e trilha".
---

# Edição de vídeo curto

## Fluxo
1. Pasta: `conteudo/reels/<numero-ou-slug>/` com `pedido.md` e o bruto.
2. Transcrever palavra por palavra (whisper) e marcar cada fala com início e fim.
3. **Último take de cada fala:** quando a mesma frase aparece mais de uma vez, fica a última.
4. Cortar silêncio e erro com ffmpeg, mantendo respiro de 0,1 s.
5. Pauta de motion: onde entra, quanto tempo, topo ou tela cheia. **Esperar o OK do dono antes de gerar.**
6. Legenda no estilo do dono, sons de interface nos motions, trilha baixa.
7. Renderizar 1080x1920 e entregar `depois-editado.mp4` ao lado do bruto.

Exemplo pronto (antes e depois): `conteudo/reels/73-logo-design-skill/`.
