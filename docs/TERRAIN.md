# Terreno de cenário (Rio / Copacabana)

Módulo de terreno com relevo real e estilizado, configurado por região. Primeiro uso: Copacabana, com o Pão de Açúcar, o Morro da Urca e o Corcovado ao fundo. Só a área central é jogável; o resto é cenário.

## Plano (12/11/2026)

O que o repositório tem hoje, e que o plano respeita:

- three 0.172 fixado, Vite 5, Vue 3. O mundo esférico existe só no mapa-mundo (`src/world/`). A cidade (`src/fifones/CityWorld.js`) é plana: lotes de 1 unidade, `OrbitControls`, câmera de 35°, névoa linear.
- O cenário do Rio de hoje é feito à mão em `src/fifones/sceneEnvironment.js` (mar na frente, encosta atrás). Este módulo não o substitui ainda: a cidade de produção, o Worker e os dados salvos não mudam nesta entrega.
- GLB: `GLTFLoader` + Meshopt (`src/tres/glbLoader.js`), com a regra de `applyGlbStyle`. Não há KTX2 no projeto.
- Os scripts do projeto ficam em `tools/`, não em `scripts/`, e os guias em `docs/` têm nome em maiúsculas: por isso `tools/terrain-data.mjs` e `docs/TERRAIN.md`.

Decisões:

1. **Dados.** Tiles públicos Terrarium (Mapzen/Tilezen, bucket `elevation-tiles-prod`), zoom 12, baixados uma vez pelo script e guardados fora do git (`data/terrain-tiles/`). Em tempo de execução o terreno vem de um arquivo do próprio site: nenhum serviço externo.
2. **Terra e água.** Junto à costa o mar chega com valores positivos (até 20 m), então a altura não separa os dois. Nos tiles, a terra (SRTM) tem valor inteiro e a água (preenchimento batimétrico) tem valor fracionário: o script usa isso.
3. **Enquadramento.** O mapa é girado: o fundo (−Z) aponta para o noroeste (315°). A praia fica na horizontal, com o mar na frente e os morros atrás, como no cenário atual do Rio. 1 unidade = 1 lote = 50 m. A grade de alturas tem 513 × 513 amostras (25,6 km), deslocada para o lado da terra.
4. **Arquivo gerado.** PNG de 16 bits em tons de cinza (`valor = metros × 20`; 0 = água) em `src/terrain/regions/`. O formato aceita mapas pintados à mão, o que serve à Ilha Inicial depois.
5. **Estilo.** Malha de triângulos retângulos por bisseção (RTIN), em código próprio: a tolerância cresce com a distância da zona jogável, o que dá a malha densa perto e grossa ao longe dentro de 60 mil triângulos. Um material fosco, faces planas, cor por face na paleta fixa, mar na mesma malha. Altura exagerada (começa em 1,6).
6. **Zona jogável.** Um arquivo de máscara editável (`rio.lots.json`, uma letra por lote: livre, bloqueado, decorativo). Os lotes livres e decorativos formam o platô em y = 0, exatamente plano; a mistura com o relevo real acontece nos lotes vizinhos. API: `isBuildable`, `snapToLot`, `getHeightAt`, `getBlockedAreas`.
7. **Câmera e borda.** `OrbitControls` com o alvo preso à zona jogável e limites de distância e inclinação. A borda nunca aparece porque a névoa, na cor do céu, chega a 100% antes dela: a distância final da névoa é calculada a cada quadro como a menor profundidade da borda dentro do campo de visão. Um teste varre os limites da câmera e confirma.
8. **Vegetação.** Dois `InstancedMesh` (palmeiras na orla, árvores nas encostas), com o mesmo material.
9. **Prédios.** Uma função assenta o prédio no lote, sobre um disco de 10 lados, usando `getHeightAt`.
10. **Página de teste.** `/terrain.html`, com TresJS. Só entra no build se os pacotes das páginas de produção não mudarem (medido).

Etapas, um commit cada:

| Etapa | Entrega |
|---|---|
| 0 | Este plano |
| 1 | Script de dados, PNG de alturas, atribuição e teste dos pontos de controle |
| 2 | Núcleo sem three: alturas, platô, máscara, API, malha RTIN e cores, com testes |
| 3 | Cena three: malha, mar, vegetação, sobreposição das zonas bloqueadas, prédios, câmera e névoa, com o teste de cobertura |
| 4 | Página de teste, verificação no navegador e medições |
| 5 | Este guia completo (decisões, atribuição, como regenerar, como criar outra região) e `CLAUDE.md` |

Fica para depois, porque mexe no que já existe: trocar o cenário do Rio em `CityWorld.js` por este terreno e fazer `worker/city.js` validar pela máscara. Cidades já salvas podem ter prédios em lotes que a máscara real bloqueia.

## Dados de elevação

- **Fonte.** Terrain Tiles (Mapzen/Tilezen, projeto `joerd`), formato Terrarium, no bucket público `elevation-tiles-prod` da AWS: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Tiles de 256 px, sem credencial. Altura em metros: `R × 256 + G + B / 256 − 32768`.
- **Conferência (12/11/2026).** Endereço, fórmula, fontes por zoom e atribuição vêm dos documentos do projeto (`tilezen/joerd`: `use-service.md`, `formats.md`, `data-sources.md`, `attribution.md`). A licença vem do registro de dados abertos da AWS (`awslabs/open-data-registry`, `datasets/terrain-tiles.yaml`): o campo de licença aponta para o `attribution.md`, e o registro não traz cobrança por requisição nem exigência de conta.
- **Um aviso dos documentos.** O `use-service.md` diz que os endereços no S3 "are meant for efficient networking with EC2 resources only". O script baixa 25 tiles (1,1 MB) uma única vez e guarda em `data/terrain-tiles/`; o app nunca acessa esse endereço.
- **O que cobre o Rio.** SRTM em terra (30 m nominais; os documentos dizem que acima do zoom 12 o dado só é reamostrado) e ETOPO1 no mar. Os dois são de domínio público.
- **Atribuição** (texto dos documentos, também em `ASSETS.md`): "SRTM data courtesy of the U.S. Geological Survey" e "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration". O ETOPO1 traz o aviso "Not to be used for navigation".

O que `tools/terrain-data.mjs` faz com os tiles:

1. Monta o mosaico e separa terra de água pelo tipo do valor (inteiro = SRTM = terra; fracionário = preenchimento do mar). Junto à costa de Copacabana esse preenchimento começa em +21 m e só cruza o zero a uns 400 m da praia.
2. Amostra a grade girada da região (513 × 513, uma amostra a cada 50 m).
3. Limpa o que é ruído: amostras de terra soltas no mar, furos de água de até 6 amostras, pontas de uma amostra só (havia uma de 99 m na beira d'água de Copacabana) e calombos de prédio alto no meio da planície.
4. Corrige os picos. O SRTM achata picos estreitos: o Pão de Açúcar vem com 306 m e o Corcovado com 639 m. Um fator local (1,29 num raio de 450 m; 1,11 num raio de 700 m) leva cada um à altura real, 396 m e 710 m. O topo do Pão de Açúcar é arredondado num raio de 120 m, para a malha mostrar um domo e não uma ponta. Os picos e os raios estão em `regions/rio.js`.
5. Alisa e rebaixa as planícies. O SRTM mede o topo dos prédios (Copacabana aparece com 20 a 30 m). Abaixo de 27 m a altura é alisada e reduzida a 40%, e a orla desce até o mar; acima de 45 m nada muda.
6. Grava o PNG de 16 bits (`valor = metros × 20`; 0 = água): `src/terrain/regions/rio.height.png`, 166 KB.
7. Confere os pontos de controle de `regions/rio.js` no arquivo gravado e falha se algum não bater.

Como regenerar: `npm run terrain:data -- rio`. Com `--preview`, grava uma imagem de conferência em `.verification/terrain-rio.png`. Com `--mask`, recria a máscara dos lotes a partir do relevo (a planície ligada à origem; os lotes livres que encostam na água viram decorativos); com `--mask=x0,z0,colunas,linhas`, muda também o retângulo da grade. Sem `--mask`, a máscara não é tocada: ela é um arquivo editado à mão.
