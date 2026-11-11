# Prompts do Tripo para as 8 maravilhas do mapa-mundo

Feitos com a skill **prompt-master** (`.claude/skills/prompt-master`) a partir do que deu errado no primeiro teste. Em inglês, idioma em que o Tripo responde melhor. Cole um prompt por geração.

## O que aprendemos no teste do Cristo

O primeiro modelo (texto para 3D, 5,7 mil faces, textura 2K) saiu ruim por três motivos, e os prompts abaixo atacam cada um:

| Problema visto | Causa provável | O que mudou |
|---|---|---|
| Estátua pequena e morro enorme | o prompt descrevia o ambiente com o mesmo peso do monumento | o monumento ocupa ~85% do modelo, sobre uma base fina e pequena; o prompt negativo proíbe morro e terreno grande |
| Malha mole, braços "derretidos" | 6 mil faces é pouco para um monumento, e o prompt não pedia arestas vivas | limite de 15 a 25 mil faces; "hard-surface, crisp sharp edges, flat planar faces" |
| Textura em manchas borradas | a IA pinta o atlas e inventa detalhe | "flat solid pastel color, no painted detail, no baked shadows, no gradients" |

## Fluxo recomendado: imagem primeiro, depois imagem para 3D

O Tripo reproduz formas bem melhor a partir de uma imagem do que de um texto. Para cada monumento:

1. **Gere a imagem de referência** com o *prompt de imagem* (no gerador de imagens do próprio Tripo, se houver, ou no ChatGPT, Gemini ou Midjourney). Gere 3 a 4 e escolha a que tiver a silhueta mais nítida e centrada, de fundo branco.
2. **No Tripo, use imagem para 3D** com a imagem escolhida e os ajustes abaixo.
3. Se não quiser gerar imagem, use o *prompt de texto* (texto para 3D). Tende a render pior.

## Ajustes no Tripo (iguais para todos)

Painel "Geometria e texturas":

| Ajuste | Valor | Por quê |
|---|---|---|
| Qualidade de malha Ultra | **ligado** | monumento precisa de aresta viva; no teste do Cristo, com ele desligado, a malha saiu mole |
| Textura | ligada, **4K** | 8K não está disponível; o mapa reduz para 1024 px depois, mas 4K dá uma fonte mais limpa |
| Remover iluminação | ligado | tira luz e sombra pintadas; o mapa tem a própria luz |
| PBR | **desligado** (`pbr: false` na API) | o visual é pintado e fosco; o mapa desenha com material difuso e ignora metal e rugosidade |
| Topologia | **Triângulo** | com Quad a exportação sai em FBX, e o mapa carrega GLB |
| Contagem de polígonos (`face_limit` na API) | o limite de cada modelo (tabela abaixo) | o painel começa em 500 |
| Exportação | GLB | formato que o mapa carrega |

Não conferi quanto cada opção custa em créditos; o número aparece ao lado do botão de gerar.

## Limite de faces de cada modelo

Os oito modelos são os oito espaços de `src/world/worldSpaces.js`; não há outro monumento no mapa. Cada um tem o seu limite, que é o valor de `MAX_TRIANGLES` em `tools/check-world-models.mjs` (o verificador reprova o GLB que passar do seu). Conferido em 11/11/2026:

| Modelo | Arquivo | Limite de faces | GLB publicado |
|---|---|---|---|
| Ilha Inicial | `ilha-inicial.glb` | 6.000 | sim, 5.589 triângulos |
| Cristo Redentor | `cristo-redentor.glb` | 20.000 | sim, 9.597 |
| Machu Picchu | `machu-picchu.glb` | 25.000 | sim, 23.835 |
| Chichén Itzá | `chichen-itza.glb` | 15.000 | sim, 13.929 |
| Coliseu | `coliseu.glb` | 25.000 | sim, 23.226 |
| Petra | `petra.glb` | 20.000 | não: o mapa usa o monumento em código |
| Taj Mahal | `taj-mahal.glb` | 25.000 | sim, 22.525 |
| Grande Muralha | `grande-muralha.glb` | 25.000 | sim, 23.904 |

Os dois lugares mudam juntos: quem alterar um limite aqui altera o verificador no mesmo commit. Não existe limite único. Um valor igual para todos (22.000, por exemplo) passaria dos limites de Chichén Itzá e de Petra e ficaria abaixo dos triângulos de quatro GLB já publicados (Machu Picchu, Coliseu, Taj Mahal e Grande Muralha).

**Prompt negativo** (o mesmo nos sete, se o Tripo oferecer o campo):

```text
background, sky, clouds, people, animals, text, logos, landscape, large hill, large terrain, floating parts, thin wires, transparent glass, photorealistic texture, noisy detail, baked shadows, gradients, blurry
```

## Trava de qualidade: faça o Cristo primeiro

Gere **só o Cristo**, duas vezes (imagem para 3D, 20 mil faces), antes dos demais. Para cada resultado:

```bash
node tools/check-world-models.mjs
```

e compare, no mapa com `?debug=1`, com o monumento em código. Se o do Tripo não for **visivelmente melhor**, não o publique: o monumento em código continua valendo, porque o GLB só entra quando o arquivo existe em `public-fifones/models/world/`. Assim a qualidade nunca cai abaixo do que já está no ar. Só depois de aprovar o Cristo gere os outros.

Depois de gerar cada um:

1. Salve com o nome indicado em `public-fifones/models/world/`.
2. Se vier de costas, ajuste `rotacaoY` (180) em `src/world/worldSpaces.js`.
3. Se o arquivo passar de 2 MB ou a textura de 1024 px: `node tools/optimize-world-models.mjs <arquivo.glb> <id> --ratio 1 --error 0` (mantém a malha, só comprime e reduz a textura).

> A **Ilha Inicial** já está pronta (`ilha-inicial.glb`, gerada por você) e não precisa de novo prompt.


## 1. Cristo Redentor — `cristo-redentor.glb` (até 20.000 faces)

**Prompt de imagem** (referência):

```text
A low-poly stylized 3D model of Christ the Redeemer: a tall white robed figure with both arms stretched straight out sideways, the arm span about as wide as the figure is tall, a long robe down to the feet, a plain square stone pedestal, standing on a small steep rounded green peak with a few grey rocks, the statue about two thirds of the total height. Hard-surface faceted geometry with crisp sharp edges and flat planar faces, large simple regions of flat solid pastel color, matte, no painted texture detail, no baked shadows, no gradients. The monument fills about 85 percent of the frame and stands on a thin small flat hexagonal base. Front three-quarter view from slightly above, centered, whole object visible, single object on a plain white background, soft even studio lighting, no text, no people.
```

**Prompt de texto** (texto para 3D):

```text
Low-poly stylized 3D model of Christ the Redeemer: a tall white robed figure with both arms stretched straight out sideways, the arm span about as wide as the figure is tall, a long robe down to the feet, a plain square stone pedestal, standing on a small steep rounded green peak with a few grey rocks, the statue about two thirds of the total height. Hard-surface faceted geometry, crisp sharp edges, flat planar faces, large simple regions of flat solid pastel color, matte, toy-like miniature proportions. The monument is the whole model and fills about 85 percent of it, standing on a thin small flat hexagonal base. Single fused solid mesh, symmetrical, front facing the viewer, no tiny details, no floating parts, no thin wires.
```

🎯 Alvo: Tripo · 💡 A estátua tem de ser o protagonista. No teste anterior ela saiu pequena e o morro ocupou o modelo: por isso o prompt fixa 'dois terços da altura' e 'morro pequeno'.


## 2. Machu Picchu — `machu-picchu.glb` (até 25.000 faces)

**Prompt de imagem** (referência):

```text
A low-poly stylized 3D model of Machu Picchu: a small Inca citadel of stepped green farming terraces with low grey stone walls, many small stone houses with thatched roofs and a central plaza, and one steep pointed green mountain rising directly behind it, as tall as the citadel is wide. Hard-surface faceted geometry with crisp sharp edges and flat planar faces, large simple regions of flat solid pastel color, matte, no painted texture detail, no baked shadows, no gradients. The monument fills about 85 percent of the frame and stands on a thin small flat hexagonal base. Front three-quarter view from slightly above, centered, whole object visible, single object on a plain white background, soft even studio lighting, no text, no people.
```

**Prompt de texto** (texto para 3D):

```text
Low-poly stylized 3D model of Machu Picchu: a small Inca citadel of stepped green farming terraces with low grey stone walls, many small stone houses with thatched roofs and a central plaza, and one steep pointed green mountain rising directly behind it, as tall as the citadel is wide. Hard-surface faceted geometry, crisp sharp edges, flat planar faces, large simple regions of flat solid pastel color, matte, toy-like miniature proportions. The monument is the whole model and fills about 85 percent of it, standing on a thin small flat hexagonal base. Single fused solid mesh, symmetrical, front facing the viewer, no tiny details, no floating parts, no thin wires.
```

🎯 Alvo: Tripo · 💡 Os degraus dos terraços e o pico atrás são as duas formas que identificam o lugar; o resto é detalhe que o limite de faces não sustenta.


## 3. Chichén Itzá — `chichen-itza.glb` (até 15.000 faces)

**Prompt de imagem** (referência):

```text
A low-poly stylized 3D model of El Castillo pyramid at Chichen Itza: a square stepped Maya pyramid with nine tiers of pale limestone, one wide central staircase with low side rails on each of the four sides, and a small square temple with a dark doorway on the flat top. Hard-surface faceted geometry with crisp sharp edges and flat planar faces, large simple regions of flat solid pastel color, matte, no painted texture detail, no baked shadows, no gradients. The monument fills about 85 percent of the frame and stands on a thin small flat hexagonal base. Front three-quarter view from slightly above, centered, whole object visible, single object on a plain white background, soft even studio lighting, no text, no people.
```

**Prompt de texto** (texto para 3D):

```text
Low-poly stylized 3D model of El Castillo pyramid at Chichen Itza: a square stepped Maya pyramid with nine tiers of pale limestone, one wide central staircase with low side rails on each of the four sides, and a small square temple with a dark doorway on the flat top. Hard-surface faceted geometry, crisp sharp edges, flat planar faces, large simple regions of flat solid pastel color, matte, toy-like miniature proportions. The monument is the whole model and fills about 85 percent of it, standing on a thin small flat hexagonal base. Single fused solid mesh, symmetrical, front facing the viewer, no tiny details, no floating parts, no thin wires.
```

🎯 Alvo: Tripo · 💡 Forma simétrica e de faces planas: é o que o Tripo faz melhor. por isso o limite menor basta.


## 4. Coliseu — `coliseu.glb` (até 25.000 faces)

**Prompt de imagem** (referência):

```text
A low-poly stylized 3D model of the Roman Colosseum: an oval amphitheatre with three stacked rows of arched openings in warm beige travertine and a flat top ring, the outer wall broken away along one side to show the inner tiers, a sandy oval arena floor in the middle. Hard-surface faceted geometry with crisp sharp edges and flat planar faces, large simple regions of flat solid pastel color, matte, no painted texture detail, no baked shadows, no gradients. The monument fills about 85 percent of the frame and stands on a thin small flat hexagonal base. Front three-quarter view from slightly above, centered, whole object visible, single object on a plain white background, soft even studio lighting, no text, no people.
```

**Prompt de texto** (texto para 3D):

```text
Low-poly stylized 3D model of the Roman Colosseum: an oval amphitheatre with three stacked rows of arched openings in warm beige travertine and a flat top ring, the outer wall broken away along one side to show the inner tiers, a sandy oval arena floor in the middle. Hard-surface faceted geometry, crisp sharp edges, flat planar faces, large simple regions of flat solid pastel color, matte, toy-like miniature proportions. The monument is the whole model and fills about 85 percent of it, standing on a thin small flat hexagonal base. Single fused solid mesh, symmetrical, front facing the viewer, no tiny details, no floating parts, no thin wires.
```

🎯 Alvo: Tripo · 💡 O anel externo quebrado de um lado distingue o Coliseu de um estádio qualquer; os arcos repetidos pedem faces suficientes. por isso 25 mil.


## 5. Petra — `petra.glb` (até 20.000 faces)

**Prompt de imagem** (referência):

```text
A low-poly stylized 3D model of Petra Treasury (Al-Khazneh): a tall classical facade carved into a rose-red sandstone cliff, six columns on the lower level under a triangular pediment, an upper level with a round tholos with a conical roof flanked by two half pediments, one dark central doorway, plain rock walls on both sides. Hard-surface faceted geometry with crisp sharp edges and flat planar faces, large simple regions of flat solid pastel color, matte, no painted texture detail, no baked shadows, no gradients. The monument fills about 85 percent of the frame and stands on a thin small flat hexagonal base. Front three-quarter view from slightly above, centered, whole object visible, single object on a plain white background, soft even studio lighting, no text, no people.
```

**Prompt de texto** (texto para 3D):

```text
Low-poly stylized 3D model of Petra Treasury (Al-Khazneh): a tall classical facade carved into a rose-red sandstone cliff, six columns on the lower level under a triangular pediment, an upper level with a round tholos with a conical roof flanked by two half pediments, one dark central doorway, plain rock walls on both sides. Hard-surface faceted geometry, crisp sharp edges, flat planar faces, large simple regions of flat solid pastel color, matte, toy-like miniature proportions. The monument is the whole model and fills about 85 percent of it, standing on a thin small flat hexagonal base. Single fused solid mesh, symmetrical, front facing the viewer, no tiny details, no floating parts, no thin wires.
```

🎯 Alvo: Tripo · 💡 A fachada tem de ocupar a frente toda: sem 'plain rock walls' a IA tende a fazer um paredão alto que esconde o prédio.


### Petra, segunda tentativa (o primeiro modelo não passou na redução)

O export de 239 mil triângulos tinha a fachada nítida, mas ao reduzir para 20 a 27 mil as colunas finas e os ornamentos derreteram. A correção é gerar já com poucas faces e uma fachada que sobreviva a isso. No painel do Tripo, ponha o limite de faces em 20.000 (e não em Ultra com malha densa); o resto das configurações é o mesmo dos outros modelos.

**Prompt de imagem** (referência):

```text
A low-poly stylized 3D model of Petra Treasury (Al-Khazneh) in toy-like miniature proportions: a chunky rose-red sandstone cliff block with a simplified classical facade carved into its front. Only four thick, round columns on the lower level under one wide triangular pediment, a single upper level with a stout round tholos topped by a low cone, one dark rectangular doorway. No tiny ornaments, no thin details, every shape bold and simple. Flat planar faces, sharp edges, large regions of solid pastel rose color, matte, no painted detail, no baked shadows. The monument fills about 85 percent of the frame on a thin flat hexagonal base. Front three-quarter view from slightly above, centered, single object on a plain white background, soft even studio lighting, no text, no people.
```

**Prompt de texto** (se não usar a imagem):

```text
Low-poly stylized 3D model of Petra Treasury, toy-like chunky proportions: a rose-red sandstone cliff block with a simplified facade, four thick round columns under one wide triangular pediment, one stout round tholos with a low cone roof above, one dark doorway. Bold simple shapes only, no tiny ornaments, no thin parts, flat planar faces, sharp edges, solid pastel colors, matte. Single fused solid mesh, symmetrical, front facing the viewer, standing on a thin flat hexagonal base.
```

🎯 Alvo: Tripo · 💡 Quatro colunas grossas no lugar de seis finas e nenhum ornamento: a redução de faces preserva volumes grandes e apaga detalhes finos.

## 6. Taj Mahal — `taj-mahal.glb` (até 25.000 faces)

**Prompt de imagem** (referência):

```text
A low-poly stylized 3D model of the Taj Mahal: a white marble mausoleum with one large onion dome and four small domed pavilions around it, a tall pointed arch on each face, four slender minarets at the corners of a square white platform, a narrow turquoise reflecting pool in front. Hard-surface faceted geometry with crisp sharp edges and flat planar faces, large simple regions of flat solid pastel color, matte, no painted texture detail, no baked shadows, no gradients. The monument fills about 85 percent of the frame and stands on a thin small flat hexagonal base. Front three-quarter view from slightly above, centered, whole object visible, single object on a plain white background, soft even studio lighting, no text, no people.
```

**Prompt de texto** (texto para 3D):

```text
Low-poly stylized 3D model of the Taj Mahal: a white marble mausoleum with one large onion dome and four small domed pavilions around it, a tall pointed arch on each face, four slender minarets at the corners of a square white platform, a narrow turquoise reflecting pool in front. Hard-surface faceted geometry, crisp sharp edges, flat planar faces, large simple regions of flat solid pastel color, matte, toy-like miniature proportions. The monument is the whole model and fills about 85 percent of it, standing on a thin small flat hexagonal base. Single fused solid mesh, symmetrical, front facing the viewer, no tiny details, no floating parts, no thin wires.
```

🎯 Alvo: Tripo · 💡 Minaretes 'slender'. não 'thin': torres finas demais somem ou quebram com poucas faces.


## 7. Grande Muralha — `grande-muralha.glb` (até 25.000 faces)

**Prompt de imagem** (referência):

```text
A low-poly stylized 3D model of the Great Wall of China: a crenellated stone wall climbing in a zigzag over two rounded green hills with three square watchtowers with red tiled roofs, the whole wall kept inside a compact square footprint. Hard-surface faceted geometry with crisp sharp edges and flat planar faces, large simple regions of flat solid pastel color, matte, no painted texture detail, no baked shadows, no gradients. The monument fills about 85 percent of the frame and stands on a thin small flat hexagonal base. Front three-quarter view from slightly above, centered, whole object visible, single object on a plain white background, soft even studio lighting, no text, no people.
```

**Prompt de texto** (texto para 3D):

```text
Low-poly stylized 3D model of the Great Wall of China: a crenellated stone wall climbing in a zigzag over two rounded green hills with three square watchtowers with red tiled roofs, the whole wall kept inside a compact square footprint. Hard-surface faceted geometry, crisp sharp edges, flat planar faces, large simple regions of flat solid pastel color, matte, toy-like miniature proportions. The monument is the whole model and fills about 85 percent of it, standing on a thin small flat hexagonal base. Single fused solid mesh, symmetrical, front facing the viewer, no tiny details, no floating parts, no thin wires.
```

🎯 Alvo: Tripo · 💡 Zigue-zague dentro de um quadrado: uma muralha reta ficaria fina demais quando o mapa ajusta a escala pelo maior lado.
