# Brief do globo do topo (sequência de frames)

Status (15/11/2026): **pendente com o artista.** O topo da landing usa hoje o diagrama vivo (`index.html` e `src/landing/loop.js`), não uma sequência de frames. O componente de frames do kit (React, `frames={[]}`) não foi portado: a landing é Vue/Vite em HTML e JS puro. Quando os frames chegarem, a integração na landing é decisão à parte. Paleta deste brief: Horizonte Dourado, `docs/DESIGN-SYSTEM.md`.

## 0. Resumo do que entregar

- 120 frames PNG em 1920×1080 (desktop) e 60 frames em 1080×1350 (mobile), nomeados `globe-000.png` … `globe-119.png`. Nós convertemos para WebP/AVIF.
- 1 poster estático `globe-poster.png`, igual ao frame 000.
- Estilo low-poly / voxel, faces planas, sem texturas fotográficas, sombras duras suaves. Igual ao globo e ao diorama que já existem no app.
- Duração de cerca de 6 s a 24 fps (120 frames). Não precisa de loop: é um scrub de scroll, não um vídeo.

## 1. Referência visual

- Globo atual do app: voxel esférico, continentes verde e areia, oceanos teal, nuvens brancas soltas, marcadores de cidade. Manter exatamente essa linguagem.
- Diorama do Rio: morros low-poly, Cristo Redentor, praia de areia, mar teal, palmeiras, prédios coloridos. O mergulho termina nessa estética.
- Paleta Horizonte Dourado, usada como luz e ambiente, não para pintar o globo:
  areia `#F6EFDD` · oceano `#1E5B6B` · noite `#123842` · coral/pôr do sol `#FF6B35` · dourado `#FFB627` · tinta `#15202A`.

## 2. Cena e câmera

- Globo centralizado, ocupando cerca de 70% da altura no frame 0.
- Câmera com perspectiva suave (FOV perto de 35°). O movimento sempre tem easing (ease-in-out), nunca linear. Sem tremor e sem roll.
- Fundo: gradiente radial de céu para espaço. Começa em azul-teal claro (`#BFE3E0` → `#1E5B6B`) e escurece até `#123842` no mergulho. Estrelas sutis só no início, que somem ao aproximar.
- Iluminação: sol dourado (`#FFB627`) vindo de cima à esquerda, a 45°. Luz ambiente teal suave. Reflexo especular discreto nos oceanos.

## 3. Linha do tempo por beat

| Frames | Beat | O que acontece |
|---|---|---|
| 000–029 | Globo gira | Gira cerca de 40° no eixo Y. 8 marcadores de maravilha pulsam (escala 1,0 → 1,15 → 1,0, em laço suave, dourado `#FFB627`). As nuvens derivam devagar. O marcador do Rio fica um pouco maior e mais brilhante (é o destino). |
| 030–071 | Mergulho | A câmera avança para o marcador do Rio (zoom contínuo, ease-in-out). O globo cresce até sair do enquadramento pelas bordas. O céu passa de teal para pôr do sol dourado, com `#FF6B35` suave no horizonte. |
| 072–101 | Revela o diorama | A superfície vira o diorama do Rio: morros, Cristo, praia e mar teal. Os prédios coloridos brotam do chão em sequência (escala 0 → 1, elástico leve, 1 a 2 por frame, da frente para o fundo). As palmeiras, idem. |
| 102–119 | Assenta | A câmera estabiliza no ângulo isométrico do jogo (inclinação de cerca de 55°). Tudo parado, com luz dourada de fim de tarde. O último frame é o estado final limpo e vira a base do poster de reserva. |

## 4. Os 8 marcadores de maravilha (beat 1)

Posicionar nos locais reais aproximados. Ícone: pino low-poly dourado com halo. Os nomes não vão no render (são overlay HTML). Ordem:
1 Rio (Cristo) · 2 Petra · 3 Machu Picchu · 4 Chichén Itzá · 5 Coliseu · 6 Taj Mahal · 7 Grande Muralha · 8 Ilha Inicial (o ponto de partida do jogo).

Só o Rio pulsa mais forte. Os outros pulsam suave e igual entre si.

## 5. Regras técnicas de exportação

- Renderizar em PNG de 32 bits, com o fundo já com o gradiente (não transparente).
- 24 fps. Resolução final 1920×1080 (16:9). Mobile: re-render ou recorte seguro de 1080×1350 (4:5), com o globo centralizado. Entregar as duas séries.
- Nomeação com zeros à esquerda: `globe-000.png`. Sem camadas e sem canal alfa separado.
- O globo fica centralizado e com raio constante nos beats 1 e 2: o zoom é da câmera, não do objeto crescendo. Isso evita tremor no scrub.
- Antialiasing ligado; arestas do low-poly nítidas, não borradas.
- Entregar também `globe-poster.png`, igual ao frame 000.

## 6. Orçamento de peso

- Meta: até 45 KB por frame em WebP desktop (até 5,5 MB no total dos 120) e até 30 KB no mobile (até 2 MB dos 60).
- Se estourar: reduzir a contagem de polígonos das nuvens e simplificar o terreno distante antes de cortar resolução. Não entregar acima de 1920×1080.

## 7. Checklist de aceite (antes de enviar)

- [ ] 120 frames desktop, 60 mobile e poster, com a nomeação correta.
- [ ] Estilo low-poly igual ao app atual (comparar com print do globo e do diorama).
- [ ] Beats conferem com a tabela: marcadores em 000–029, mergulho em 030–071, diorama em 072–101, assenta em 102–119.
- [ ] Só o Rio pulsa forte; câmera com easing, sem tremor, globo centralizado.
- [ ] A luz usa os hex do Horizonte Dourado.
- [ ] O poster é o frame 000, exatamente.

## 8. O que não fazer

- Nada de texto ou tipografia renderizados na imagem (tudo é overlay HTML).
- Nada de glow ou neon excessivo, lens flare forte, motion blur pesado ou profundidade de campo que borre o low-poly.
- Não mudar para realista ou PBR. É low-poly ou nada.
- Não entregar vídeo (.mp4). São frames individuais.
