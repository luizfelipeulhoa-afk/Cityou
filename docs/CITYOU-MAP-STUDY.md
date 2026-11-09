# Cityou: auditoria do estudo de mapa — 6/11/2026

Objetivo: pesquisar três jogos e construir uma proposta própria de mapa com espaços para casas e prédios, usando as três imagens do usuário.

- Imagens 1/2/3 inspecionadas. Reserva natural, baía e implantação compacta identificadas. Imagens 2/3 usadas como referências da geração aérea; a 1 orienta a reserva e o marco distante, sem transportar seu abandono para o projeto.
- Referências oficiais abertas e lidas: SimCity BuildIt (EA), City Mania (Gameloft), Cities: Skylines II (Paradox, ruas e zonas). URLs e adaptação de cada mecanismo em pesquisa-e-proposta.md.
- Proposta própria: seis bairros, 64 lotes, ruas, parque, orla, marina e ponte de pedestres. Lotes e caminhos exatos em planta.json/SVG. Atmosfera em conceito.png.
- Escala de 4m, dimensões, recuos e hierarquia de alturas explicitados. Alturas são envelopes de estudo; os GLBs ainda precisam ser medidos na migração.
- Geometria verificada por tools/verify-map-plan.mjs: contagens, IDs, fronteiras, sobreposição, recuos, acesso e rede viária conectada.
- Oito grupos de interações verificados em Chrome por tools/map-plan-playtest.mjs: fases, tamanho, reserva, recarga, rotação, desfazer, exportar, zoom, filtros, teclado, celular e abertura offline. Nenhum erro de página. Nenhuma chamada de API.
- Arquivos finais e ZIP copiados para Cityou - Mapa/Baia do Amanha - v1. Arquivo ZIP íntegro.
- A aplicação da nova malha à cidade 3D não integra esta entrega de estudo. Layout/ledger/posições existentes não foram modificados. Isso está explícito na proposta.
