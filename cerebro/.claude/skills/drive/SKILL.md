---
name: drive
description: Busca, lê, organiza e salva arquivos no Drive do dono (drive.appegi.com.br), montado em /drive. Use quando o dono disser "pega no drive", "está no drive, pasta X", "usa as fotos do drive", "o brand book está no drive", "salva no drive" ou citar uma pasta/arquivo que não está no cérebro.
---

# Drive

O Drive é a pasta de arquivos do dono: brand books, fotos, logos, vídeos, documentos de clientes.
Ele sobe os arquivos pelo navegador em **https://drive.appegi.com.br** e eles aparecem aqui em **`/drive`**
(a mesma pasta, ao vivo, nos dois Core OS). Variável: `$CORE_OS_DRIVE` (padrão `/drive`).

## Achar o que ele pediu
1. Comece listando, sem adivinhar caminho: `ls -la /drive` e depois a pasta citada.
2. Nome aproximado ("a foto da fachada", "brand book da Renove"): `find /drive -iname '*fachada*'` ou
   `find /drive -ipath '*renove*' -iname '*brand*'`. Acentos e maiúsculas variam: use `-iname` e pedaços da palavra.
3. Achou mais de um candidato plausível: mostre a lista curta (caminho + tamanho + data) e pergunte qual.
4. Não achou: diga onde procurou e peça o caminho. Nunca invente um arquivo.

## Ler e usar
- Imagem: abra com a ferramenta de leitura de arquivo pra ver de verdade antes de usar.
- PDF/DOCX/XLSX: extraia o texto (pdftotext, python) e trabalhe sobre o conteúdo.
- Pra usar num entregável (carrossel, thumbnail, site), **copie** o arquivo pra pasta da entrega no cérebro;
  não referencie direto o /drive (o original pode mudar de lugar).

## Salvar e organizar
- Só grava no /drive quando o dono pedir ("salva no drive", "organiza a pasta X"). O padrão de entrega continua sendo o cérebro.
- Ao organizar: proponha a estrutura antes de mover; mova, não apague. Nunca apague nada do Drive sem pedido explícito.
- Nomes de pasta em minúsculas com hífen (`clientes/renove/brand-book/`). Fotos: mantenha o nome original.

## Se /drive não existir
O container foi criado antes do Drive. Avise o dono: precisa fazer Redeploy do Core OS no Coolify depois de criar o recurso EGI Drive.
