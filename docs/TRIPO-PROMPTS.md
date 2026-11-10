# Prompts do Tripo para os 8 modelos do mapa-mundo

Escritos com a skill **prompt-master** (`.claude/skills/prompt-master`), na rota de texto para 3D. Cada prompt segue a mesma ordem: estilo, assunto, traços que identificam o monumento, material, textura e especificação técnica. As palavras de estilo são idênticas nos oito, para os modelos combinarem entre si e com o globo.

Estão em inglês, o idioma em que essas ferramentas costumam responder melhor. Cole um prompt por geração.

## Ajustes no Tripo (iguais para todos)

| Ajuste | Valor | Por quê |
|---|---|---|
| Limite de faces | o da tabela de cada modelo | a redução feita depois não chega ao orçamento (veja `docs/WORLD-MAP.md`) |
| Low poly inteligente | ligado, se a sua conta oferecer | malha mais limpa com poucas faces |
| Textura | ligada, qualidade padrão | o mapa reduz para 1024 px de qualquer forma |
| Quads | desligado | com quads a exportação sai em FBX, não em GLB |
| Exportação | GLB | é o formato que o mapa carrega |

Os nomes vêm das notas da API do Tripo (`face_limit`, `smart_low_poly`, `texture`, `quad`); na interface web os rótulos podem ser outros, e não conferi a tela.

**Prompt negativo** (o mesmo nos oito):

```text
background, sky, people, animals, text, logos, floating parts, thin wires, transparent glass, photorealistic textures, noisy detail, gradients
```

Depois de gerar:

1. A direção do modelo não é garantida pelo prompt. Abra o mapa com `?debug=1`, foque o espaço e confira se a frente está voltada para a câmera. Se não estiver, ajuste `rotacaoY` em `src/world/worldSpaces.js` (180 se vier de costas).
2. Rode `node tools/check-world-models.mjs`. Se o arquivo passar de 2 MB ou a textura de 1024 px, rode `node tools/optimize-world-models.mjs <arquivo.glb> <id>`.

## 1. Ilha Inicial — `ilha-inicial.glb` (até 6.000 faces)

```text
Low-poly stylized tropical islet diorama, flat-shaded faceted surfaces, clean hard edges, soft vivid pastel colors in solid regions. A small round island of pale cream sand with two leaning coconut palm trees, three grey rocks and a tiny wooden signpost, sitting on a thin disc of shallow turquoise water. Matte painted look, toy-like miniature proportions. Single fused mesh, compact square footprint, game-ready web asset.
```

🎯 Alvo: Tripo (texto para 3D) · 💡 O disco de água turquesa entra no próprio modelo, para a ilha se fundir à lagoa clara que o globo já desenha ali.

## 2. Cristo Redentor — `cristo-redentor.glb` (até 8.000 faces)

```text
Low-poly stylized monument diorama, flat-shaded faceted surfaces, clean hard edges, soft vivid pastel colors in solid regions. A white soapstone statue of a robed figure with both arms stretched wide and straight, standing on a square stone pedestal on top of a steep rounded green hill with a few grey rock faces. Matte painted look, toy-like miniature proportions. Single fused mesh on a small square ground tile, game-ready web asset.
```

🎯 Alvo: Tripo (texto para 3D) · 💡 Os braços retos e abertos e o morro íngreme são o que torna a silhueta reconhecível de longe, então vêm antes de qualquer detalhe.

## 3. Machu Picchu — `machu-picchu.glb` (até 10.000 faces)

```text
Low-poly stylized mountain citadel diorama, flat-shaded faceted surfaces, clean hard edges, soft vivid pastel colors in solid regions. Stepped green farming terraces with low grey stone walls and a cluster of small roofless stone houses, and one tall pointed green peak rising directly behind them. Matte painted look, toy-like miniature proportions. Single fused mesh on a small square ground tile, game-ready web asset.
```

🎯 Alvo: Tripo (texto para 3D) · 💡 Terraços em degraus mais o pico pontudo atrás resumem o lugar em duas formas grandes, que sobrevivem ao limite de faces.

## 4. Chichén Itzá — `chichen-itza.glb` (até 6.000 faces)

```text
Low-poly stylized step pyramid diorama, flat-shaded faceted surfaces, clean hard edges, soft vivid pastel colors in solid regions. A square Maya pyramid with nine stacked tiers of pale limestone, one wide staircase centered on each of the four sides, and a small square temple block on the flat top. Flat bright green lawn around it. Matte painted look, toy-like miniature proportions. Single fused mesh on a small square ground tile, game-ready web asset.
```

🎯 Alvo: Tripo (texto para 3D) · 💡 Forma simétrica e de faces planas: é o modelo mais barato dos oito, por isso o limite menor.

## 5. Coliseu — `coliseu.glb` (até 10.000 faces)

```text
Low-poly stylized Roman amphitheatre diorama, flat-shaded faceted surfaces, clean hard edges, soft vivid pastel colors in solid regions. An oval arena building with three stacked rings of arched openings in warm beige travertine, the tallest outer ring broken away along one side to show the lower ring, and a sandy oval floor in the middle. Matte painted look, toy-like miniature proportions. Single fused mesh on a small square ground tile, game-ready web asset.
```

🎯 Alvo: Tripo (texto para 3D) · 💡 O anel externo quebrado de um lado é o traço que distingue o Coliseu de um estádio qualquer.

## 6. Petra — `petra.glb` (até 8.000 faces)

```text
Low-poly stylized rock-cut temple diorama, flat-shaded faceted surfaces, clean hard edges, soft vivid pastel colors in solid regions. A tall classical facade carved directly into a rose-red sandstone cliff: six columns on the lower level, a triangular pediment above them, a round pavilion with a conical roof on the upper level, and one dark doorway in the center. Rough cliff rock on both sides and above. Matte painted look, toy-like miniature proportions. Single fused mesh on a small square ground tile, game-ready web asset.
```

🎯 Alvo: Tripo (texto para 3D) · 💡 A fachada fica toda de um lado só: é o modelo em que mais vale conferir a direção antes de publicar.

## 7. Taj Mahal — `taj-mahal.glb` (até 10.000 faces)

```text
Low-poly stylized mausoleum diorama, flat-shaded faceted surfaces, clean hard edges, soft vivid pastel colors in solid regions. A white marble building with one large onion dome in the center, four small domes around it, a tall pointed arch on the front, and four slender towers at the corners of a square white platform. A narrow turquoise reflecting pool in front. Matte painted look, toy-like miniature proportions. Single fused mesh on a small square ground tile, game-ready web asset.
```

🎯 Alvo: Tripo (texto para 3D) · 💡 Os quatro minaretes ficam "slender", não "thin": torres finas demais somem ou quebram com poucas faces.

## 8. Grande Muralha — `grande-muralha.glb` (até 10.000 faces)

```text
Low-poly stylized fortified wall diorama, flat-shaded faceted surfaces, clean hard edges, soft vivid pastel colors in solid regions. A short winding stretch of a crenellated grey-beige stone wall climbing in a zigzag over two rounded green hills, with three square watchtowers along it. The whole wall stays inside the tile. Matte painted look, toy-like miniature proportions. Single fused mesh on a small square ground tile, game-ready web asset.
```

🎯 Alvo: Tripo (texto para 3D) · 💡 "Zigzag" e "stays inside the tile" seguram a muralha numa base quadrada; uma muralha reta ficaria fina demais depois que o mapa ajusta a escala pelo maior lado.
