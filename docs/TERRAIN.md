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
