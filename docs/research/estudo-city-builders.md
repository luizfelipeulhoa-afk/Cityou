# Estudo técnico — Megapolis · City Island 6: Building Town · SimCity BuildIt

**Foco:** front-end de mapa/topografia (2D vs 2.5D vs 3D), divisão do espaço em células, áreas proibidas de construção, processo de construção/upgrade de prédios — e backend de dinheiro, personagens, missões e XP.

> **Legenda de confiança**
> ✅ = confirmado por fonte pública (documentação oficial do jogo, FAQ do estúdio, portfólio de dev, vaga de emprego, talk/GDC, wiki da comunidade)
> 🔍 = inferência técnica minha (padrão de mercado para o gênero). Não é engenharia reversa dos jogos; é o "como se faz" que reproduz o comportamento observado.
> Os três jogos são closed-source. Ninguém fora dos estúdios tem o código. Então este documento separa **o que se sabe** do **como implementar igual**.

---

## 0. Sumário executivo

| | **Megapolis** (Social Quantum) | **City Island 6** (Sparkling Society) | **SimCity BuildIt** (EA / Tracktwenty) |
|---|---|---|---|
| **Engine** | Engine própria, in-house, feita para o projeto ✅ | Unity / C# (linha City Island) ✅ | Engine própria em C++ (vaga "Graphics Programmer (C++)" no estúdio); não é Unity ✅🔍 |
| **Renderização** | **2D isométrico** com sprites pré-renderizados a partir de modelos 3D → "2.5D" visual ✅🔍 | **3D real** com câmera angular travada (look isométrico) 🔍 | **3D real**, luz/sombra dinâmica, câmera com **rotação 360° + pinch zoom** ✅ |
| **Mapa** | Grid isométrico; várias *game zones* separadas, ligadas por um mapa de navegação; cada zona tem limites de recursos próprios ✅ | Grid; várias ilhas ligadas por *world map*/portos; cada ilha tem superfícies diferentes ✅ | Grid; capital + regiões (Green Valley, Sunny Isles, Frosty Fjords…); expansão por *dozer items* / *Expansion Deeds* ✅ |
| **Terreno** | Arte fixa do mapa (mar, deserto, montanha, rio); não há terraformação livre ✅🔍 | Superfícies por ilha + decoração pintável (rios, lagos, florestas) ✅ | Planície construível + praia/montanha decorativas que exigem expansão específica ✅ |
| **Estradas** | Modo de edição de estradas: swipe para traçar, bandeiras de início/fim, Save/Undo ✅ | Tap-hold-drag para pintar/demolir; mão-única rotacionável; precisa "apply changes" ✅ | Zona residencial precisa de ~2 segmentos de rua conectados ✅ |
| **Fila de obra** | Materiais, tokens, *Building Coupons* para concluir ✅ | **Cranes (guindastes)** = nº de obras simultâneas; aluguel temporário ✅ | Materiais craftados + tempo; sem crane, com *speed-up* ✅ |
| **Moedas** | Coins + Megabucks + materiais/coupons/tokens ✅ | Cash + Gold + Keys + tokens/event currencies ✅ | Simoleons + SimCash + Golden/Platinum Keys + materiais ✅ |
| **Backend** | Online (vizinhos, contests, rankings) ✅ | **Offline-first** ("no internet needed") + eventos/leaderboard online ✅ | Online, economia no servidor 🔍 (jogo exige conexão; sem cheat de moeda que funcione) |
| **XP** | XP por tarefas/atividade diária ✅ | Nível de XP gateia a loja; em ilha de evento o nível não vale ✅ | Curva de XP com thresholds crescendo mais rápido que a renda de XP ✅ (estudo de balanceamento) |

**A conclusão de arquitetura em uma frase:** os três são **city builders de grid lógico quadrado**, com *footprints* retangulares, máscara de terreno por célula e validação por regras; o que muda é o **renderer** (sprite iso vs 3D) e o **grau de autoridade do servidor** (offline-first vs online-only).

> ### 🧪 Protótipo que acompanha este estudo: `demo-city-builder.html`
> Arquivo único, abre no navegador, sem dependências. Implementa de verdade as partes 2–6 em escala reduzida:
> - **Grid iso 22×22** com superfície, altura discreta, água/montanha/floresta e **área reservada de evento** (Parte 2)
> - **Footprints** 1×1 / 2×2 / 3×2 com rotação (**R**), ghost verde/vermelho **com o motivo do bloqueio** e **heatmap de locais válidos** (**H**) (Parte 3)
> - **13 tipos de bloqueio**: território não comprado, terreno proibido, sobreposição, falta de rua, porto sem água, NIMBY fábrica↔casa, altura irregular, nível, guindaste, saldo (Parte 4)
> - **Estradas pintadas por drag** com bitmask de vizinhos e **apply transacional** (um lote = uma transação) (3.3)
> - **Obra com guindastes**, estágios visuais, timer, speed-up em gold, balde de lucro com teto (Parte 5)
> - **"Servidor" autoritativo**: o cliente só envia intenções; há **ledger append-only**, **idempotência por txnId**, XP com `while`, missões **event-driven** com claim, e um botão **"😈 Hackear coins"** que mostra o saldo falsificado ser **rejeitado** (Parte 6)
> - Painel lateral com **log do servidor** e **extrato** — dá para ver cada validação, débito e evento de missão acontecendo.
>
> O código foi verificado com 28 testes de regra (validação, ledger, idempotência, timers, missões, hack) e smoke test do renderer.

---

# PARTE 1 — Front-end: 2D, 2.5D ou 3D?

## 1.1 Os três termos, sem ambiguidade

- **2D puro:** o mundo é um plano de pixels. Câmera top-down ou lateral. Não existe profundidade.
- **2.5D (duas implementações diferentes!):**
  1. **Sprites isométricos pré-renderizados:** você modela em 3D, renderiza offline com câmera ortográfica a ~30°/45°, exporta PNG. Em runtime é **só 2D** (blit de sprites ordenados). É o caso do Megapolis.
  2. **3D com câmera travada:** geometria 3D de verdade, mas a câmera não gira (ou gira pouco), dando "cara de isométrico". É o caso do City Island.
- **3D real:** malhas 3D, iluminação/sombra em tempo real, câmera livre. É o caso do SimCity BuildIt — o guia oficial descreve "pinch, zoom, and rotate 360 degrees", algo **impossível** com sprites pré-renderizados (você precisaria de 1 render por ângulo).

> Regra prática de identificação: **se a câmera gira livremente, é 3D. Se o prédio só tem 1–2 "lados" e a luz é sempre igual, é sprite pré-renderizado.**

## 1.2 Megapolis — 2D isométrico (sprites baked)

- ✅ A iLogos, que fez co-produção do jogo, diz explicitamente que trabalhou "**no motor próprio do estúdio, criado especificamente para este projeto**" — ou seja, engine custom, não Unity/Unreal.
- ✅ Estúdios de arte que produzem para esse estilo (RetroStyle Games, Sunstrike) descrevem o pipeline: **cenas 3DS Max + Corona Renderer → sprites PNG prontos para o engine + FBX**, com "**quatro níveis de complexidade**" por prédio (um por upgrade).
- 🔍 Consequências técnicas desse caminho:
  - Iluminação, sombra, oclusão e reflexo são **baked no PNG**. Custo de GPU quase zero, qualidade visual altíssima em celular fraco.
  - Rotação de prédio = trocar para outro sprite (normalmente 2 orientações, espelhando). Pedidos de comunidade por "rotacionar para os 4 lados" existem justamente porque **cada lado é uma imagem nova**.
  - Zoom = reamostrar sprite (borra) ou ter mip/atlas por nível de zoom. Por isso o zoom máximo desses jogos é limitado.
  - Custo real vai para **memória e download**: milhares de sprites grandes → atlas + compressão ASTC/ETC2 + streaming por zona. É por isso que o mapa é dividido em **zonas separadas** (cada zona carrega só o seu pacote de arte).

## 1.3 City Island 6 — 3D com câmera angular fixa

- ✅ A stack da série é **Unity/C#**, com backend em **JavaScript (GameSparks) + PHP** — documentado pelo team lead de City Island 5 no portfólio dele. CI6 é a mesma linhagem de produto/estúdio.
- ✅ O FAQ oficial descreve mecânicas que denunciam grid + 3D: estradas pintadas por drag, **mão-única que gira 90° ao tocar de novo**, variantes visuais do mesmo prédio, "dead end → o carro desaparece e reaparece em outro lugar".
- 🔍 Leitura técnica: modelos low-poly estilizados, câmera em ângulo fixo (perspectiva com FOV baixo ou ortográfica), sem rotação livre → dá para usar **iluminação baked + uma luz direcional**, sombras simples, e **GPU instancing** para as centenas de casas repetidas. O "look" é 3D, mas o *design de câmera* é o do isométrico clássico: legibilidade em tela pequena.

## 1.4 SimCity BuildIt — 3D real

- ✅ Guia oficial/IGN: "Pinch, zoom, and **rotate 360 degrees**".
- ✅ Discussão técnica no r/Unity3D descreve "**milhares de modelos 3D ao mesmo tempo, com iluminação dinâmica e sombras completas**" — e o consenso lá é que **não foi feito em Unity**.
- ✅ A EA/Tracktwenty contrata "**Software Engineer – Graphics Programmer (C++)**" para "o desenvolvimento e o design técnico do SimCity BuildIt" → engine/renderer próprio em C++.
- 🔍 O que isso implica: LOD agressivo, batching/instancing por material, atlas de texturas, sombras em cascata curta ou blob shadows para prédios pequenos, culling por setor, e um *streaming* de assets por região. É o mais caro dos três em engenharia — e é o que permite rotação livre, ciclo dia/noite e clima.

## 1.5 Tabela de decisão (para o seu projeto)

| Critério | Sprites iso (Megapolis) | 3D câmera travada (CI6) | 3D livre (BuildIt) |
|---|---|---|---|
| Custo de arte por prédio | Alto (render por tier/orientação) | Médio (1 modelo + variações) | Médio-alto (modelo + LODs) |
| Custo de engine | **Baixo** (blit + sort) | Médio (Unity resolve) | **Alto** |
| RAM/VRAM | Alta (atlas) | Média | Média |
| Download inicial | Alto | Médio | Médio-alto |
| Rotação livre / dia-noite | ❌ | ⚠️ limitado | ✅ |
| Rodar em Android low-end | ✅✅ | ✅ | ⚠️ exige LOD/instancing |
| Iteração de balanceamento visual | Lenta (re-render) | Rápida | Rápida |
| Nº de variantes/tiers baratos | ❌ | ✅ | ✅ |

**Recomendação 🔍:** se o objetivo é shipping rápido com equipe pequena, vá de **3D com câmera travada (Unity/URP)**. Você ganha tiers, variantes, rotação de prédio e eventos sazonais sem re-renderizar arte — que é exatamente onde esses jogos gastam o orçamento de LiveOps.

---

# PARTE 2 — Topografia: como o mapa é representado

## 2.1 O modelo mental correto: **camadas**, não "um mapa"

Todo city builder de grid separa o mapa em camadas independentes 🔍:

```
L7  OVERLAYS      (cobertura de serviço, poluição, valor do terreno, felicidade)  -> derivados, recalculáveis
L6  LÓGICA        (flags: locked, no-build, requer água, reservado p/ evento)     -> bitmask por célula
L5  OCUPAÇÃO      (buildingId por célula, roadMask)                              -> autoritativo
L4  OBJETOS       (prédios, decoração, props)                                    -> lista de entidades
L3  VIAS          (grafo de ruas/trilhos, mão-única)                             -> grafo + autotiling
L2  HIDROGRAFIA   (água, costa, rio)                                             -> terreno
L1  ALTURA        (platô/degrau por célula)                                      -> heightmap discreto
L0  SUPERFÍCIE    (grama, areia, rocha, neve, asfalto)                           -> tile/splatmap
```

**Por que separar:** L0–L2 são *arte + regra de terreno*; L5 é *estado do jogador*; L7 é *cache derivado*. Só L4/L5/L6 precisam ir para o save e para o servidor. Isso mantém o save pequeno (dezenas de KB) mesmo com cidade enorme.

## 2.2 Três formas de topografia

1. **Array 2D de tiles (Megapolis 🔍).** Terreno é arte fixa do mapa; altura é *degrau por tile* (platôs). Não há terraformação. Barato, previsível, e permite proibir construção simplesmente marcando células.
2. **Heightmap + splatmap (jogos 3D de terreno contínuo).** Mapa de alturas em textura + mapa de mistura de superfícies. Bom para montanha suave, ruim para "célula construível sim/não" — você acaba discretizando de volta em grid.
3. **Híbrido: grid quadrado + altura discreta por célula (o mais usado no gênero 🔍).** Cada célula tem `height ∈ {0,1,2,3}`; o renderer gera degraus/cliff meshes entre células de alturas diferentes. Construção exige **footprint todo na mesma altura** (regra de planicidade). É assim que você consegue "praia / montanha / planície" sem simulação de terreno.

**Evidência de que os jogos tratam terreno como categoria, não como geometria livre:**
- ✅ BuildIt: expansões de **praia** e **montanha** são *itens separados* (Green Valley: 708 expansões + 81 de praia; Frosty Fjords: 882 + 396 de montanha). Ou seja, "tipo de terreno" é um **dado por região de mapa**, comprado em lotes.
- ✅ Megapolis: "o jogo é subdividido em **regiões e localizações**", cada uma expandida separadamente; zonas têm **limites de recursos próprios** e **prédios que só existem naquela zona**; depois de colocado, o prédio **não pode mudar de zona**.
- ✅ CI6: "cada ilha tem **superfícies diferentes**"; portos destravam ilhas; rios/lagos/florestas são **decoração colocável**.

## 2.3 Estrutura de dados recomendada 🔍

```csharp
// Uma célula = 8 bytes. Grid 256x256 = 512 KB. Cabe na RAM de qualquer celular.
[Flags]
public enum CellFlags : ushort {
    None        = 0,
    Locked      = 1 << 0,  // território não comprado
    NoBuild     = 1 << 1,  // decorativo/reservado (rio, cliff, spawn de evento)
    Water       = 1 << 2,
    Beach       = 1 << 3,
    Mountain    = 1 << 4,
    Forest      = 1 << 5,
    Road        = 1 << 6,
    Rail        = 1 << 7,
    Reserved    = 1 << 8,  // área de evento/landmark/script
    NeedsBridge = 1 << 9,
}

public struct Cell {
    public Surface surface;   // byte: grama, areia, rocha, neve...
    public byte    height;    // 0..3 (platôs)
    public CellFlags flags;   // ushort
    public int     buildingId;// 0 = livre; índice na lista de entidades
    public byte    roadMask;  // bitmask de vizinhos (autotiling)
}

public class MapGrid {
    public readonly int W, H;
    Cell[] cells;                       // layout row-major: idx = y * W + x
    public ref Cell At(int x, int y) => ref cells[y * W + x];
    public bool InBounds(int x, int y) => (uint)x < (uint)W && (uint)y < (uint)H;
}
```

- **Chunks de 16×16 ou 32×32** para: culling, rebuild parcial de mesh, streaming de arte, e recálculo incremental de overlays.
- **Mapa esparso** (`Dictionary<(int,int),Cell>`) só se o mundo for gigantesco e majoritariamente vazio — nos três jogos o mapa é finito e denso, então **array plano ganha**.
- **Overlays de serviço** (polícia/bombeiro/parque): pré-compute um **campo de distância** (BFS multi-source no grid) por tipo de serviço, guarde `byte coverage[]`, invalide só os chunks tocados quando um prédio entra/sai. Consulta de "essa casa tem cobertura?" vira O(1).

## 2.4 Matemática do isométrico (só se você for 2D)

Se o renderer é 2D, o **estado do jogo continua sendo um grid quadrado**. Você só projeta na hora de desenhar e desprojeta na hora do toque:

```
// mapa -> tela (tile 128x64, iso 2:1)
screen.x = (map.x - map.y) * (TILE_W / 2)
screen.y = (map.x + map.y) * (TILE_H / 2)

// tela -> mapa (inverso; usar floor)
map.x = (screen.x / (TILE_W/2) + screen.y / (TILE_H/2)) / 2
map.y = (screen.y / (TILE_H/2) - screen.x / (TILE_W/2)) / 2
```

Fonte: *Isometric Tiles Math*, Clint Bellanger (o mesmo método do editor Tiled). Regra de ouro do artigo: **toda a lógica em coordenadas de mapa; tela só na entrada (toque) e na saída (render)**.

**Ordenação de desenho (painter's algorithm):** `sortKey = (x + y) * 1000 + layer`. Para prédios com footprint > 1, use como chave o canto **mais próximo da câmera** (`maxX + maxY`), senão um arranha-céu 3×3 "vaza" por trás de casas vizinhas. Sprites muito altos com sobreposição são o problema clássico do 2.5D — as saídas são: (a) fatiar o prédio em tiles, (b) escrever Z no shader com alpha-test, (c) aceitar e ajustar o pivot por prédio.

**Se você for Unity/3D:** esqueça essa matemática. Grid quadrado no plano XZ, câmera ortográfica em `rotation = (30, 45, 0)`, e o *depth sorting* é resolvido pelo Z-buffer. Para pegar a célula: `Raycast` num plano `y=0` → `floor(hit.x / cellSize)`, `floor(hit.z / cellSize)`.

## 2.5 Performance (o que faz esses jogos rodarem em celular barato) 🔍

- **Terreno:** uma mesh combinada por chunk (não 1 GameObject por tile). Em 2D, um tilemap com batches por atlas.
- **Prédios repetidos:** GPU instancing (3D) ou atlas único + batch dinâmico (2D). Casas repetidas são 80% dos objetos.
- **LOD por zoom:** no zoom-out, troca para mesh/sprite simplificado, desliga props, carros e pedestres.
- **Agentes (carros/pedestres):** pooling, limite por tela,spawn só perto da câmera, sem física — só spline/grafo de ruas.
- **Sombras:** baked no terreno + blob shadow para props; sombra dinâmica só para prédios grandes (BuildIt é o outlier aqui).
- **Culling:** por chunk + frustum; overlays só desenhados quando o modo está ativo.

---

# PARTE 3 — Como separar o espaço do mapa para montar um prédio

## 3.1 Grid lógico + footprint

O espaço é dividido em **células quadradas uniformes** (ex.: 1 célula ≈ 8 m de "mundo"). Um prédio declara um **footprint** `w × h` em células, e ocupa **todas** as células do retângulo a partir de uma **âncora** (canto inferior-esquerdo lógico).

Tabela típica de footprints (valores de referência 🔍, calibrados pelo que se observa nos jogos):

| Tipo | Footprint | Observação |
|---|---|---|
| Decoração pequena (árvore, banco, fonte) | 1×1 | sem exigência de rua |
| Casa / residencial | 2×2 | ✅ no BuildIt a *Residential Zone* é 2×2 e exige ~2 segmentos de rua |
| Comércio / comunidade | 2×2 ou 3×3 | exige rua adjacente |
| Indústria | 3×2 / 3×3 | regra de distância mínima de residencial |
| Serviço (bombeiro, hospital) | 3×3 | tem raio de cobertura |
| Landmark / epic | 4×4 / 4×6 | área frequentemente **reservada** no mapa |
| Estrada / trilho | 1×1 (com máscara de vizinhos) | pintável em drag |

**Rotação:** girar 90° = trocar `w↔h` e girar a malha/sprite. Guarde `orientation ∈ {0,1,2,3}` no estado.
**Orientação automática:** ✅ no BuildIt os jogadores "movem o prédio para outra rua para ele virar" — ou seja, **a fachada é derivada da rua adjacente**, não é um botão de rotação livre. Implemente assim: ao validar o placement, escolha a orientação cuja frente encosta numa célula `Road`. É elegante e evita um controle a mais na UI.

## 3.2 Ocupação e consultas

```csharp
// Ocupação: buildingId por célula -> teste de colisão O(w*h), sem física, sem raycast.
public bool AreaFree(int x, int y, int w, int h) {
    for (int j = y; j < y + h; j++)
    for (int i = x; i < x + w; i++) {
        if (!grid.InBounds(i, j)) return false;
        ref var c = ref grid.At(i, j);
        if (c.buildingId != 0 || c.flags.HasFlag(CellFlags.Road)) return false;
    }
    return true;
}
```

- **Nada de colisor por prédio.** Colisor físico é caro, impreciso no iso e não responde "qual célula está ocupada". O grid **é** o sistema de colisão.
- **Consultas espaciais por raio** (NIMBY, cobertura, "prédios afetados"): BFS/anel no grid, ou um quadtree/R-tree de footprints se o mapa for grande.
- **Índice reverso** `buildingId -> {x,y,w,h,orient}` para mover/remover em O(1).
- **"Onde posso colocar isso?"** (heatmap de lugares válidos): varra o grid uma vez por seleção de prédio, escreva um `BitArray valid`, e **invalide por versão do grid** (`gridVersion++` a cada mudança). Cache enquanto o jogador arrasta o ghost — isso é o que deixa o preview instantâneo.

## 3.3 Estradas: grafo + autotiling + edição transacional

- Cada célula de estrada guarda uma **bitmask de vizinhos** (N=1, E=2, S=4, W=8) → 16 combinações (reta, curva, T, cruzamento). Com cantos diagonais, o conjunto "blob" de 47 tiles. É assim que a arte da rua se encaixa sozinha.
- ✅ **Pintura por drag** existe nos três: Megapolis ("swipe where you want to place it", com bandeiras de início/fim e setas verdes de direção), CI6 ("tap, hold and drag… funciona para todos os tipos de caminho", inclusive para demolir).
- ✅ **Edição transacional:** CI6 avisa "when you edit roads, don't forget to **apply your changes**"; Megapolis tem **Save / Undo** no modo de edição. Implemente como *command buffer*: as mudanças vão para um overlay temporário; `Apply` envia **um lote** ao servidor (uma transação, um custo total), `Undo` descarta. Isso evita 200 requests para pintar uma avenida e evita estado inconsistente.
- **Mão-única:** ✅ CI6 tem seta por segmento e toque gira 90°. Guarde `dir` no dado da via; o pathfinding dos carros respeita `dir`.
- **Beco sem saída:** ✅ CI6 só faz o carro desaparecer e reaparecer — prova de que **trânsito é cosmético**, não simulação de fluxo. Não construa um simulador de tráfego se o seu design não depende dele.

## 3.4 "Zona" vs "prédio pronto" — duas filosofias de construção

| | Colocar **prédio** (Megapolis, CI6) | Colocar **zona** (BuildIt) |
|---|---|---|
| O jogador escolhe | o prédio exato da loja | só o tipo de zona (residencial/comércio/indústria) |
| O que aparece | o modelo escolhido | ✅ um prédio gerado, com *tier* 1–6 e "wealth forecast" (Luxurious/Premium/Standard) |
| Progressão | upgrade manual (custa moeda/tempo) | upgrade com materiais; ✅ no tier 6 pode virar **Epic Project** |
| Vantagem | controle estético total | sorpresa/colecionismo; ✅ o "wealth" **só muda a aparência**, não a renda |

🔍 Implementação da zona: a zona é uma entidade com `zoneType`, `tier`, `wealthClass`, `seed`. O modelo é escolhido por `hash(seed) % variantes[tier][wealthClass]`. Isso dá **colecionismo barato** (92 prédios residenciais no BuildIt) sem 92 entradas de loja.

## 3.5 Pipeline de placement (a ordem que funciona) 🔍

```
1. Toque/arrasto → desprojetar para célula (x,y)
2. Snap: âncora = célula - floor(footprint/2)  (centraliza o ghost no dedo)
3. Magnetismo: se houver rua a 1 célula, encaixa a frente na rua
4. Validar (pipeline de regras, do mais barato ao mais caro)  -> Parte 4
5. Feedback: ghost verde/vermelho + células marcadas + TEXTO do motivo
6. Confirmar -> envia INTENÇÃO ao servidor (não aplica local!)
7. Servidor valida de novo, cobra, cria entidade, devolve estado
8. Cliente instancia visual + animação de construção + inicia timer
```

O passo 5 é onde 90% dos clones erram: **vermelho sem motivo gera frustração**. Mostre sempre a razão ("Precisa de rua", "Terreno não comprado", "Sobreposto a outro prédio", "Sem energia").

---

# PARTE 4 — Como proibir áreas de construção

## 4.1 Taxonomia dos bloqueios (com evidência de cada jogo)

| # | Bloqueio | Como aparece nos jogos | Como implementar 🔍 |
|---|---|---|---|
| 1 | **Território não comprado** | ✅ BuildIt: expansão exige *dozer wheel/blade/exhaust* (872 sets p/ capital inteira) ou *Expansion Deed*; começa no nível 10. ✅ Megapolis: *Acts of Territorial Expansion*. ✅ CI6: "buy more land", portos abrem ilhas | flag `Locked` por célula, agrupada em **plotId**; compra libera o plot inteiro |
| 2 | **Terreno incompatível** | ✅ BuildIt: praia/montanha são expansões próprias; ✅ Megapolis: zonas de deserto/montanha/mar | `terrainMask` exigido pelo prédio vs `flags` da célula |
| 3 | **Terreno obrigatório** | marina/píer precisa de água; estação de esqui precisa de montanha | regra `RequiresAdjacent(Water)` / `RequiresTerrain(Beach)` |
| 4 | **Sobreposição** | todos | `buildingId != 0` ou `Road` em qualquer célula do footprint |
| 5 | **Falta de rua** | ✅ CI6: "buildings have to be built next to a road"; ✅ BuildIt: zona residencial precisa de 2 segmentos | `AnyPerimeterCellHasFlag(Road)` (e conte ≥ N) |
| 6 | **Recursos insuficientes** | ✅ Megapolis: "se não houver água/eletricidade suficiente, **você não poderá construir novos prédios**"; alguns prédios exigem **população mínima** | checagem de capacidade agregada antes de aceitar |
| 7 | **Nível / pré-requisito** | ✅ CI6: nível de XP gateia a loja; ✅ Megapolis: prédios liberam por nível | `playerLevel >= def.unlockLevel` + `prereqBuilding` |
| 8 | **Vaga de obra** | ✅ CI6: "**cada prédio em construção precisa de um guindaste**"; acabou crane → espera ou aluga | `activeConstructions < craneSlots` |
| 9 | **Zona reservada / evento** | ✅ CI6: ilha de evento tem prédios/presentes que só ativam **depois de comprar a expansão**; ✅ Megapolis: localizações de evento | flag `Reserved` + `eventId` |
| 10 | **Vizinhança (NIMBY)** | indústria longe de casa; ✅ BuildIt: serviços **aumentam a população** da zona vizinha | raio mínimo/máximo por tag; BFS no grid |
| 11 | **Planicidade / altura** | terreno em degraus | `height` igual em todo o footprint |
| 12 | **Estado do objeto** | ✅ Megapolis: prédio colocado **não muda de zona**; ✅ CI6: storage/warehouse com slots limitados | regras de mover/armazenar, não de placement |
| 13 | **Soft block (aviso, não proíbe)** | felicidade/poluição | valida como `Warning`, deixa construir |

## 4.2 Regras data-driven (o prédio declara, o motor valida)

```json
{
  "id": "house_small",
  "footprint": [2, 2],
  "cost": { "coins": 120 },
  "buildSeconds": 30,
  "xp": 8,
  "unlockLevel": 1,
  "tags": ["residential"],
  "placement": {
    "allowedTerrain": ["grass", "sand"],
    "forbiddenFlags": ["Water", "Mountain", "NoBuild", "Reserved"],
    "requireUnlocked": true,
    "requireFlat": true,
    "minRoadAdjacent": 1,
    "minDistanceFrom": [{ "tag": "industry", "cells": 3 }],
    "requiresResource": { "power": 2, "water": 2 }
  },
  "visuals": { "tiers": ["house_s_t1", "house_s_t2", "house_s_t3"], "variants": 3 }
}
```

Vantagem: designer adiciona prédio/regra **sem tocar em código**, e a mesma definição roda **no cliente (preview) e no servidor (autoridade)**.

## 4.3 Validador em pipeline (C#)

```csharp
public enum PlaceError {
    Ok, OutOfBounds, Locked, TerrainBlocked, NotFlat, Occupied,
    NoRoad, NeedsWater, TooCloseToIndustry, NoPower, NoWater,
    LevelTooLow, NoCraneSlot, NotEnoughCoins, ReservedForEvent
}

public readonly struct PlaceResult {
    public readonly PlaceError Error; public readonly string Message; public readonly bool IsWarning;
    // ... ctor
}

public PlaceResult Validate(in BuildingDef def, int x, int y, int rot, PlayerState p) {
    var (w, h) = rot % 2 == 0 ? (def.W, def.H) : (def.H, def.W);

    // 1) bounds + terreno + ocupação (O(w*h), barato, roda a cada frame do drag)
    byte height0 = 0; bool first = true; int roadCount = 0;
    for (int j = y; j < y + h; j++)
    for (int i = x; i < x + w; i++) {
        if (!grid.InBounds(i, j)) return Err(PlaceError.OutOfBounds, "Fora do mapa");
        ref var c = ref grid.At(i, j);
        if (c.flags.HasFlag(CellFlags.Locked))   return Err(PlaceError.Locked, "Compre esta expansão");
        if (c.buildingId != 0)                   return Err(PlaceError.Occupied, "Já ocupado");
        if ((c.flags & def.ForbiddenFlags) != 0) return Err(PlaceError.TerrainBlocked, "Terreno inválido");
        if (!def.AllowedSurfaces.Contains(c.surface)) return Err(PlaceError.TerrainBlocked, "Superfície inválida");
        if (first) { height0 = c.height; first = false; }
        else if (def.RequireFlat && c.height != height0) return Err(PlaceError.NotFlat, "Terreno irregular");
    }

    // 2) perímetro: rua / água
    foreach (var (i, j) in Perimeter(x, y, w, h)) {
        if (grid.InBounds(i, j) && grid.At(i, j).flags.HasFlag(CellFlags.Road)) roadCount++;
    }
    if (roadCount < def.MinRoadAdjacent) return Err(PlaceError.NoRoad, "Precisa de rua ao lado");
    if (def.NeedsWaterAdjacent && !PerimeterHas(CellFlags.Water)) return Err(PlaceError.NeedsWater, "Precisa encostar na água");

    // 3) regras globais (mais caras: só roda no confirmar, não no drag)
    if (p.Level < def.UnlockLevel)                 return Err(PlaceError.LevelTooLow, $"Nível {def.UnlockLevel} necessário");
    if (p.Power.Free < def.Power)                  return Err(PlaceError.NoPower, "Energia insuficiente");
    if (p.Water.Free < def.Water)                  return Err(PlaceError.NoWater, "Água insuficiente");
    if (def.MinDistanceFrom.Count > 0 && ViolatesDistance(def, x, y, w, h)) return Err(PlaceError.TooCloseToIndustry, "Longe demais das casas");
    if (p.ActiveConstructions >= p.CraneSlots)     return Err(PlaceError.NoCraneSlot, "Nenhum guindaste livre");
    if (p.Wallet.Coins < def.Cost.Coins)           return Err(PlaceError.NotEnoughCoins, "Moedas insuficientes");

    return PlaceResult.Success;
}
```

**Duas velocidades de validação:** `ValidateFast` (células/terreno/rua) roda a cada movimento do dedo; `ValidateFull` (economia, nível, crane, distância) roda no confirmar **e obrigatoriamente no servidor**.

## 4.4 UX do bloqueio (o que os jogos fazem bem) 🔍

- Células do footprint pintadas de verde/vermelho **no chão**, não só o modelo.
- **Motivo em texto** + botão de ação direta ("Comprar expansão", "Construir rua", "Alugar guindaste").
- **Heatmap de posições válidas** ao selecionar um prédio (varredura única + cache).
- Mostrar **raio de cobertura** durante o placement de serviços — é o que transforma placement em decisão estratégica (BuildIt vive disso: serviço vizinho aumenta a população da zona).
- Modo edição com **ocultar objetos** (✅ Megapolis tem o botão da "casa transparente") para enxergar o grid embaixo da cidade densa.

---

# PARTE 5 — O processo de construção de prédios e casas

## 5.1 Máquina de estados canônica 🔍

```
        [Locked] --nivel/pre-requisito--> [InShop]
                                            |  selecionar
                                            v
                                        [Placing] --validar--> [GhostValid]
                                            | confirmar (INTENÇÃO -> servidor)
                                            v
                            [Paid/Reserved]  (cobra moeda+materiais, ocupa células, pega crane)
                                            |  buildSeconds (relógio do SERVIDOR)
                                            v
                                    [UnderConstruction]  estagios visuais 0..3
                                       |          \-- speedup (moeda premium) --\
                                       v                                        v
                                    [ReadyToFinish] -------------------> [Active lvl1]
                                       (✅ CI6: "tap to finish")                |
                                                                    upgrade (custo/tempo)
                                                                              v
                                                                        [Upgrading] -> [Active lvlN]
                                                                              |
                                              [Stored/warehouse] <--> mover / demolir (refund parcial)
```

Detalhes que valem dinheiro:
- **Cobrar na intenção, não na conclusão.** Senão o jogador gasta a moeda em outra coisa durante a obra e o servidor precisa lidar com saldo negativo.
- **Ocupar as células na intenção** (estado `Reserved`), senão dois toques colocam dois prédios no mesmo lugar.
- ✅ **Crane como recurso de fila** (CI6): nº de obras simultâneas = nº de guindastes; pode alugar temporariamente; recompensas dão guindaste temporário ("use before it runs out"). É o *soft gate* de ritmo mais elegante do gênero — melhor que energia.
- ✅ **BuildIt não usa energia**: o diretor de criação disse no GDC 2016 que "**quase todas as mecânicas F2P clássicas falharam**" porque deixavam o jogo lento; o jogo acabou centrado em **crafting**. Lição: o gate do seu jogo deve ser *material/fila*, não *espera pura*.
- ✅ **Megapolis**: *Building Coupons* concluem obra que exige materiais; *Tokens* constroem "project buildings"; materiais vêm de coleta/produção/vizinhos.

## 5.2 Estágios visuais da obra

| Estágio | Visual | Duração típica |
|---|---|---|
| 0 | terreno limpo + tapume + placa | 0–10% |
| 1 | fundação / alicerce | 10–35% |
| 2 | estrutura / esqueleto + **guindaste** animado | 35–70% |
| 3 | fachada quase pronta, sem andaime | 70–99% |
| 4 | prédio final + "pop" de partículas + balão de recompensa | 100% |

🔍 Implementação: `stage = floor(progress * 4)`; troca de mesh/sprite por estágio; **um único guindaste compartilhado** (prop instanciado) para não pagar 200 animações. Em 2D isso são 4 sprites a mais por prédio — motivo pelo qual muitos jogos 2D usam só 2 estágios (obra/pronto).

## 5.3 Upgrade, tiers e variantes

- ✅ **BuildIt:** 6 tiers por zona residencial, 3 "wealth forecasts" (Luxurious/Premium/Standard), total de **92 prédios residenciais**; wealth **não muda a receita**, só a aparência; tier 6 pode virar **Epic Project**.
- ✅ **CI6:** upgrade custa cash + tempo, ou **gold para instantâneo**; **cada upgrade dá keys** (moeda de baú); existem **variantes visuais** do mesmo prédio ("some buildings have more variations than others").
- ✅ **Megapolis/arte iso:** packs de arte são entregues com "**4 níveis de complexidade**", um por upgrade.
- 🔍 Modelo de dados:

```json
{
  "buildingId": 1042, "defId": "house_small",
  "x": 12, "y": 8, "rot": 1,
  "level": 3, "variantSeed": 918273,
  "state": "Active",
  "finishAt": 0,
  "lastCollectAt": 1731300000,
  "accrued": 240
}
```

`variantSeed` sorteia a variante uma vez e **nunca mais muda** — é isso que faz o jogador sentir "essa casa é minha" e querer colecionar.

## 5.4 Casas que "crescem" e registro de habitantes

- ✅ **Megapolis:** depois de construir a casa, "**espere o ícone aparecer sobre o prédio para registrar novos habitantes**". População máxima sobe com infraestrutura, expansão de território e objetos que boostam população.
- ✅ **CI6:** três barras no topo — **Citizens / Jobs / Happiness**; novos cidadãos só se mudam **se a felicidade estiver acima da moradia**; comércio cria empregos; comunidade cria felicidade.
- ✅ **BuildIt:** população da zona sobe com **cobertura de especializações** (parques, educação, etc.) além do teto base de 1.836.
- 🔍 Isso é um **modelo agregado**, não simulação de agentes:

```
capacity   = Σ residential.capacity(level) * (1 + coverageBonus)
jobs       = Σ commercial.jobs(level)
happiness  = f(community, pollution, services, taxes)
residents  = min(capacity, residents + inflow)   // inflow só se happiness > limiar
```

O "balão para registrar habitante" é **acúmulo preguiçoso + coleta manual** (idle game): guarda `pendingResidents` e um `readyAt`, e o toque só faz o *claim*. Não existe cidadão individual no servidor.

## 5.5 Coleta de lucro (idle accrual) — a fórmula que todos usam 🔍

```
dt      = clamp(serverNow - lastCollectAt, 0, MAX_OFFLINE)
accrued = min(capacity(level), accrued + rate(level) * dt)
```

- `capacity` = "balde" que enche (obriga voltar ao jogo). ✅ CI6 tem "**collect all**" desbloqueável, ✅ Megapolis tem bônus diário de login.
- **Nunca** simule enquanto o app está fechado. ✅ O diretor do BuildIt levantou exatamente isso no GDC ("o que acontece quando você fecha o app? e se voltar depois de 2 meses? tudo em ruínas?") e a decisão foi: "**você não pode punir o jogador demais**". Acúmulo com teto resolve.

---

# PARTE 6 — Backend: dinheiro, personagens, missões e XP

## 6.1 Primeiro decida a AUTORIDADE (é a decisão mais caras de mudar)

| Modelo | Quem manda | Exemplo | Prós | Contras |
|---|---|---|---|---|
| **Server-authoritative** | servidor roda a regra e é a verdade | BuildIt 🔍 (online-only, economia/clubes/trade/global market) | moeda/ranking não hackeáveis; log auditável; LiveOps e social reais | latência (50–200 ms), precisa prediction/reconcile, custo de compute |
| **Client-authoritative + cloud save** | cliente decide, servidor grava | CI6 ✅ (offline-first) | offline, barato, responsivo | economia editável (mod APK), ranking precisa validação extra |
| **Híbrido (recomendado)** | servidor: moeda, XP, compras, missões, ranking. Cliente: câmera, cosmético, agentes, tutorial | Megapolis/CI6 na prática 🔍 | melhor dos dois | duas fontes de estado, exige fronteira clara |

Referência de mercado: a comparação técnica da Metaplay resume bem — em server-authoritative "um cliente adulterado **não consegue mover a visão do servidor** sobre moedas, rank ou inventário"; em client-authoritative "o servidor grava o que lhe dizem", e "**retrofitar autoridade depois é um rewrite, não um patch**". Também lembra o limite: autoridade **não** resolve bots/automação/conluio.

**Fronteira prática 🔍:**
- **Servidor:** wallet, ledger, XP/nível, inventário/materiais, timers de obra, missões, compras IAP, expansões compradas, ranking, clubes, catálogo/config, eventos.
- **Cliente:** posição de câmera, qualidade gráfica, cache de arte, carros/pedestres, animações, flags de tutorial, layout de UI.
- **Zona cinzenta (posição dos prédios):** valide no servidor (footprint, terreno, expansão, custo) porque posição afeta economia (cobertura → população → imposto).

## 6.2 Arquitetura de referência 🔍

```
                 ┌────────────┐
  Unity/Cliente ─┤ API Gateway│  HTTPS + JSON/protobuf, JWT, versionamento de protocolo
                 └─────┬──────┘
                       v
        ┌──────────────────────────────┐        ┌────────────────────────┐
        │ Player Service (stateful)    │<------>│ Config/LiveOps Service │
        │ 1 ator por jogador, in-mem   │        │ catálogo, eventos, A/B │
        │ Load → Validate → Apply →    │        │ remote config versionado│
        │ Persist(delta) → Response    │        └────────────────────────┘
        └───┬───────────┬──────────────┘
            v           v
      Redis (cache/  Postgres (estado + ledger + wallet)
      leaderboards)   S3 (snapshots compactados do save)
            │
            v
   Event Bus (Kafka/SQS) ──> Telemetria / BI / antifraude / missões assíncronas
            │
            v
   IAP Validator (Apple App Store Server API / Google Play Developer API)
```

Pontos-chave:
- **Um ator/sessão por jogador** serializa os comandos → elimina race condition de "dois gastos ao mesmo tempo". É o padrão de jogos mobile (e o que engines como Metaplay fazem com lógica C# compartilhada cliente/servidor).
- **Estado em memória + snapshot**: save de cidade é um blob versionado (dezenas de KB) + deltas. Não modele cada prédio como uma linha SQL consultada a cada request.
- **Config é dado, não código**: catálogo de prédios, custos, curvas, missões e eventos vêm de JSON versionado com hash. Cliente baixa no boot; servidor usa a mesma versão. Isso permite rebalancear sem publicar build.

## 6.3 DINHEIRO

### 6.3.1 As moedas dos três jogos ✅

| Jogo | Soft (ganha jogando) | Hard (premium) | Chaves/especiais | Materiais/itens |
|---|---|---|---|---|
| Megapolis | **Coins** | **Megabucks** | Coupons, Tokens | materiais de construção/expansão, *Acts of Territorial Expansion* |
| City Island 6 | **Cash** | **Gold** | **Keys** (de upgrades → baús), tokens (Fortune Spinner), moedas de evento | — (troca de moeda em prédios comerciais) |
| SimCity BuildIt | **Simoleons** | **SimCash** | **Golden Keys**, **Platinum Keys** | materiais craftados, *dozer parts*, *Expansion Deeds* |

**Padrão universal 🔍:** 2 moedas principais + 1–3 "chaves" + N materiais. As chaves existem para **dar recompensa sem inflacionar a moeda principal** e para criar um loop secundário (baú/loja especial).

### 6.3.2 Regras de implementação (não negociáveis)

1. **Inteiro (`int64`), nunca float.** `0.1 + 0.2 != 0.3` destrói conciliação financeira.
2. **Carteira ≠ extrato.** `wallet` é o saldo atual (leitura rápida); `ledger` é o histórico imutável de lançamentos. Toda mudança de saldo tem lançamento com `reason`, `delta`, `balanceAfter`, `txnId`.
3. **Idempotência.** Cliente gera `txnId` (UUID) por intenção; servidor guarda o resultado. Retry de rede **não** pode cobrar duas vezes.
4. **Atomicidade.** Débito + criação do prédio + início do timer numa única transação. Falhou uma parte, rollback.
5. **Nunca confie em preço vindo do cliente.** Mande só `defId`; o preço vem do catálogo do servidor.
6. **Saldo nunca negativo**; cheque `balance >= cost` **dentro** da transação (`SELECT … FOR UPDATE` ou atomic `UPDATE … WHERE balance >= cost`).
7. **IAP validado no servidor** (receipt/store API), com dedupe por `purchaseToken`; crédito só depois da validação.
8. **Tudo tem `reason`** (`build:house_small`, `collect:shop`, `iap:pack_01`, `quest:daily_3`) → é isso que alimenta o dashboard de faucets/sinks.

### 6.3.3 Schema SQL mínimo

```sql
CREATE TABLE wallet (
  player_id  BIGINT NOT NULL,
  currency   TEXT   NOT NULL,          -- coins | gold | keys | simcash ...
  balance    BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0,
  lifetime_spent  BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, currency)
);

CREATE TABLE ledger (             -- append-only, nunca UPDATE/DELETE
  id          BIGSERIAL PRIMARY KEY,
  player_id   BIGINT NOT NULL,
  txn_id      UUID   NOT NULL,
  currency    TEXT   NOT NULL,
  delta       BIGINT NOT NULL,      -- +faucet / -sink
  balance_after BIGINT NOT NULL,
  reason      TEXT   NOT NULL,
  ref_id      TEXT,                 -- buildingId, questId, purchaseToken
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, txn_id, currency)   -- idempotência
);
CREATE INDEX ON ledger (player_id, created_at DESC);
CREATE INDEX ON ledger (reason, created_at DESC);   -- BI: faucets/sinks

CREATE TABLE iap_receipt (
  purchase_token TEXT PRIMARY KEY,
  player_id BIGINT, product_id TEXT, validated_at TIMESTAMPTZ, raw JSONB
);
```

### 6.3.4 Compra autoritativa (TypeScript, transação + idempotência)

```ts
async function placeBuilding(p: PlayerSession, cmd: PlaceCmd): Promise<Result> {
  const def = catalog.buildings[cmd.defId];              // preço vem do servidor
  if (!def) return err("UNKNOWN_DEF");

  // replays: mesma intenção, mesma resposta, sem cobrar de novo
  const cached = await txnCache.get(p.id, cmd.txnId);
  if (cached) return cached;

  return db.tx(async (t) => {
    // 1) validação de mundo (a MESMA regra do cliente, rodada de novo)
    const v = validator.validate(def, cmd.x, cmd.y, cmd.rot, p.state);
    if (!v.ok) return err(v.error);

    // 2) débito atômico
    const w = await t.one(
      `UPDATE wallet SET balance = balance - $1, lifetime_spent = lifetime_spent + $1,
              updated_at = now()
        WHERE player_id = $2 AND currency = 'coins' AND balance >= $1
        RETURNING balance`, [def.cost.coins, p.id]).catch(() => null);
    if (!w) return err("NOT_ENOUGH_COINS");

    // 3) lançamento no extrato
    await t.none(`INSERT INTO ledger(player_id,txn_id,currency,delta,balance_after,reason,ref_id)
                  VALUES($1,$2,'coins',$3,$4,$5,$6)`,
                 [p.id, cmd.txnId, -def.cost.coins, w.balance, `build:${def.id}`, String(cmd.buildingId)]);

    // 4) estado do mundo + timer com relógio do servidor
    const finishAt = Date.now() + def.buildSeconds * 1000;
    p.state.occupy(cmd.buildingId, def, cmd.x, cmd.y, cmd.rot, "UnderConstruction", finishAt);
    p.state.cranesInUse++;

    // 5) XP + progresso de missão derivam do MESMO evento
    const events = [evt("BuildingPlaced", { defId: def.id, tags: def.tags })];
    applyXp(p, def.xp, events);
    progressQuests(p, events, t);

    await t.none(`UPDATE player_snapshot SET state=$1, seq=seq+1 WHERE player_id=$2`,
                 [serialize(p.state), p.id]);

    const res = ok({ buildingId: cmd.buildingId, finishAt, balance: w.balance, level: p.state.level });
    await txnCache.set(p.id, cmd.txnId, res, ttl = 24h);
    return res;
  });
}
```

### 6.3.5 Faucets & sinks (o balanceamento em si)

| Faucets (entra) | Sinks (sai) |
|---|---|
| imposto/coleta de prédios, lucro de comércio | custo de construção e upgrade |
| recompensa de missão/achievement/daily | compra de expansão de terreno |
| baús, evento, login streak, ranking | speed-up de obra (gold) |
| venda/trade entre jogadores (BuildIt: Global Trade) | crafting, compra de material, decoração |
| IAP (gold/simcash/megabucks) | taxa de trade, reparos, taxas de clube |

🔍 Regras de saúde econômica:
- Meça **razão sink/faucet por faixa de nível** (alvo típico ~0,9–1,1 no mid-game; >1 no end-game para drenar estoque).
- **Hard currency nunca entra por faucet infinito** (senão o IAP morre).
- Tenha **sumidouros de estoque** para quem acumulou (decoração caríssima, itens de prestígio, expansão de armazém).
- ✅ O estudo de balanceamento do BuildIt mostra a intenção: **thresholds de XP crescem mais rápido que a renda de XP** → tempo por nível aumenta. A mesma lógica se aplica a moeda: custo cresce mais rápido que renda.

## 6.4 PERSONAGENS

### 6.4.1 A verdade que surpreende: **não existem personagens persistidos**

Nos três jogos, "cidadãos" são **números agregados**, não entidades:
- ✅ Megapolis: população é um total com **teto**, que sobe com infraestrutura/expansão; você "registra habitantes" tocando num balão.
- ✅ CI6: três barras — Citizens, Jobs, Happiness — com regras de fluxo ("novos cidadãos só chegam se a felicidade for maior que a moradia").
- ✅ BuildIt: população por zona, com teto base (1.836 na zona residencial) + bônus de cobertura.

**O que anda na rua é cenário.** ✅ CI6 diz que num beco sem saída "o veículo simplesmente desaparece e reaparece em outro lugar" — nenhum cidadão tem destino, emprego ou casa de verdade. 🔍 Portanto:

```
Servidor:  { residents: 12480, capacity: 15000, jobs: 11900, happiness: 0.92 }
Cliente:   spawna N agentes visuais (N ∝ residents, limitado por zoom/orçamento de CPU),
           cada um escolhe um nó aleatório do grafo de ruas, anda, some no fim.
           Pool de objetos, sem física, sem estado persistido, sem save.
```

Isso é **1 número no servidor** vs 12.480 entidades. É a decisão de arquitetura mais importante do gênero.

### 6.4.2 NPCs de verdade (guias/advisors)

- ✅ CI6 tem a **Jane**: apresenta o jogo, volta a cada feature desbloqueada, tutorial pode ser abandonado com confirmação.
- 🔍 Implementação: NPC é **config + máquina de estados de tutorial**, não um agente:

```json
{ "id": "jane_tut_roads", "trigger": { "event": "LevelUp", "level": 4 },
  "steps": [ {"say":"tut_roads_1","highlight":"road_button","waitFor":"RoadBuilt","count":3},
             {"say":"tut_roads_2","grant":{"coins":200}} ],
  "skippable": true, "oncePerAccount": true }
```

Estado salvo: `{ tutorialFlags: {...}, seenDialogues: [...] }` — alguns KB, e o servidor guarda para não repetir entre dispositivos.

### 6.4.3 "Personagens" sociais

Vizinhos (Megapolis), Mayor's Club (CI6), Club Wars/Global Trade (BuildIt) são **outros jogadores**, representados por um **snapshot público** (nome, nível, avatar, cidade em miniatura, lista de ofertas). 🔍 Nunca deixe o cliente consultar o estado completo de outro jogador: sirva um `PublicProfile` reduzido e cacheado.

### 6.4.4 Se você QUISER personagens persistentes (estilo Sims)

Aí é outro jogo, e o custo explode. Se for o caso 🔍: limite a N agentes nomeados (ex.: 20–50), guarde `{needs, job, homeId, schedule}`, rode **tick preguiçoso** (só avança quando o jogador abre a cidade, `dt` limitado), e mantenha os demais como agregado. Híbrido "elenco + massa" é o único jeito de caber no celular e no servidor.

## 6.5 MISSÕES / QUESTS

### 6.5.1 Estrutura data-driven

```json
{
  "id": "main_012",
  "kind": "main",                       // main | daily | weekly | event | achievement
  "title": "Bairro novo",
  "prereq": { "level": 6, "questCompleted": "main_011" },
  "objectives": [
    { "id": "a", "type": "BuildCount", "filter": { "tag": "residential" }, "target": 3 },
    { "id": "b", "type": "ReachPopulation", "target": 500 }
  ],
  "rewards": [ { "currency": "coins", "amount": 1500 }, { "xp": 120 }, { "item": "keys", "amount": 2 } ],
  "expiresAt": null,
  "resetPolicy": null                   // daily: "UTC_MIDNIGHT" | weekly: "MON_UTC"
}
```

Tipos de objetivo que cobrem 95% do gênero 🔍: `BuildCount`, `UpgradeToLevel`, `CollectCurrency`, `SpendCurrency`, `CraftItem`, `TradeWithPlayer`, `ReachPopulation`, `ReachHappiness`, `ExpandTerritory`, `LoginStreak`, `EarnEventPoints`, `OpenChest`.

### 6.5.2 Progresso por EVENTOS, não por polling

O erro clássico é recalcular missão varrendo a cidade a cada request. O certo:

```
comando do jogador -> regra aplicada -> emite evento interno -> bus de progresso
                                       (BuildingPlaced, CoinsCollected, LevelUp, ...)
                                                 |
                                                 v
                       para cada quest ativa cujo objetivo "casa" com o evento:
                         progress += delta   (idempotente por eventId)
                         se progress >= target -> objective.completed = true
                         se todos completos -> quest.state = "Claimable"
```

- **Idempotente por `eventId`**: replay de rede não pode contar 2 vezes.
- **Claim separado de Complete**: ✅ CI6 — "abra os achievements e toque no achievement completo para coletar". Recompensa só é creditada no claim (transação idempotente). Evita perda de recompensa e permite dobrar reward com anúncio/IAP.
- **Reset com relógio do servidor**: daily = meia-noite UTC (ou timezone fixa do jogador, declarada e imutável), com `periodKey` (`2026-11-11`) na chave de idempotência. Cliente nunca decide reset.
- ✅ BuildIt tem **milestone tasks que rotacionam** — implemente como pool de quests com sorteio semeado por período.
- **Anti-exploit:** demolir não pode contar como construir de novo (dedupe por `defId`+posição, ou contador de *lifetime* com teto); trade circular entre contas do mesmo device precisa de limite; `SpendCurrency` não conta compra reembolsada.

### 6.5.3 Schema

```sql
CREATE TABLE player_quest (
  player_id BIGINT, quest_id TEXT, period_key TEXT DEFAULT '',
  state TEXT,                       -- Active | Claimable | Claimed | Expired
  progress JSONB,                   -- {"a": 2, "b": 500}
  started_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ,
  PRIMARY KEY (player_id, quest_id, period_key)
);
CREATE TABLE quest_event_seen (      -- dedupe de progresso
  player_id BIGINT, quest_id TEXT, event_id UUID, PRIMARY KEY (player_id, quest_id, event_id)
);
```

## 6.6 XP E NÍVEIS

### 6.6.1 O que a evidência mostra

- ✅ BuildIt: análise de balanceamento (Philipp Zupke, com planilha aberta) conclui que "**os requisitos de XP crescem mais rápido que a renda de XP**", então o **tempo por nível aumenta**; e o autor explica os objetivos do controle de progressão: curva de aprendizado, longevidade, "hooking" e metas de longo prazo.
- ✅ CI6: nível gateia a loja; e em **ilha de evento o nível de XP não importa** (você recebe um set fixo de prédios) — ou seja, XP é *progressão da conta*, e o evento tem economia paralela.
- ✅ Megapolis: XP vem de tarefas e atividade; FAQ oficial basicamente diz "volte todo dia e complete tarefas".

### 6.6.2 Curva

```ts
// Tabela explícita é melhor que fórmula: designer controla cada degrau.
// Fórmula serve de ponto de partida:
xpToNext(level) = round(BASE * level ** EXPONENT / 10) * 10;   // BASE≈100, EXPONENT≈1.55

// Fontes de XP (crescem, mas menos que o threshold):
// construir (pequeno) | upgrade (médio) | coletar (pequeno) | missão (grande) | craft/trade (médio)
```

Regras 🔍:
- **XP não é moeda.** Nunca gaste XP; não existe "XP negativo". Só acumula.
- **Nível é gate, não poder.** O que o nível faz é **destravar** (`unlockTable: level → [buildings, features, regions, craneSlot, storageSlot]`).
- **Level-up é um evento do servidor**, e ele dispara: recompensa, unlock, oferta segmentada, progresso de missão, telemetria.
- **Cap de nível** + progressão de prestígio/temporada quando o conteúdo acaba (senão o topo do funil fica sem meta).
- **Catch-up**: acelerar XP nos primeiros níveis (FTUE) e em contas retornantes; ✅ BuildIt acredita-se que itens de expansão aparecem mais para cidades abaixo do nível 12 — mesmo espírito.

### 6.6.3 Implementação

```ts
function applyXp(p: PlayerSession, amount: number, events: GameEvent[]) {
  if (amount <= 0) return;
  p.state.xp += amount;                        // int64
  p.state.lifetimeXp += amount;
  let leveled = false;
  while (p.state.xp >= xpToNext(p.state.level) && p.state.level < LEVEL_CAP) {
    p.state.xp -= xpToNext(p.state.level);
    p.state.level++;
    leveled = true;
    const unlocks = config.unlocks[p.state.level] ?? [];
    p.state.unlocked.push(...unlocks);
    grantRewards(p, config.levelRewards[p.state.level]);   // mesma transação
    events.push(evt("LevelUp", { level: p.state.level, unlocks }));
  }
  if (leveled) events.push(evt("UnlocksChanged", {}));
}
```

⚠️ O `while` importa: um evento grande (missão épica) pode dar 2–3 níveis de uma vez. Se você usar `if`, o jogador "perde" XP e abre ticket.

## 6.7 Tempo, offline e simulação

- **O servidor é o relógio.** Cliente recebe `serverNow` e calcula `offset`; todo countdown usa `finishAt - (Date.now() + offset)`. Isso mata o cheat de adiantar o relógio do aparelho.
- **Timers absolutos (`finishAt`), nunca "tempo restante".** Restante corrompe com fuso/reboot.
- **Avaliação preguiçosa:** nada roda com o app fechado. No login: `resolveTimers(now)` (conclui obras vencidas), `accrueIncome(now)` (enche baldes com teto), `resetDailies(now)`, `expireEvents(now)`.
- ✅ Filosofia confirmada no GDC do BuildIt: punir o jogador ausente (cidade em ruínas) foi **descartado**. Ausência deve gerar *oportunidade de coleta*, não punição.
- **Offline-first (CI6)** 🔍: save local + fila de comandos com `seq`; ao reconectar, envia o lote; servidor revalida o que é econômico (moeda, IAP, ranking) e aceita o resto (layout). Divergência de moeda → **servidor vence** e o cliente reconcilia. Assine o save local (HMAC com chave derivada) só para elevar o custo do cheat casual — não é segurança real.

## 6.8 Save, sync e migração

```json
{
  "schemaVersion": 14,
  "seq": 9182,
  "playerId": 60123456,
  "level": 27, "xp": 4120,
  "wallet": { "coins": 184200, "gold": 312, "keys": 44 },
  "unlockedPlots": [0,1,2,5,9],
  "buildings": [ { "id":1, "def":"house_small", "x":12,"y":8,"rot":1,"lvl":3,"seed":918273,"state":"Active","accrued":240,"lastCollectAt":1731300000 } ],
  "roads": "base64(bitmask por célula)",
  "quests": { "main_012": { "state":"Active", "progress": {"a":2,"b":500} } },
  "tutorialFlags": ["tut_roads_done"]
}
```

- **`schemaVersion` + migrações** desde o dia 1. Você vai mudar o formato 30 vezes em produção.
- **`seq` monotônico** por jogador: cliente envia `seq` e o servidor rejeita comando velho (protege contra multi-device e replay).
- **Compressão** (gzip/brotli) do blob; estradas como bitmask, não como lista de objetos.
- **Multi-device:** ✅ CI6 dá um **player-id** (começando com 6) para suporte/restauração. Trate o dispositivo como *não confiável*: o login é por conta (Apple/Google/e-mail) e o device é só um cache.
- **Separe estado visual** (câmera, qualidade, cache de atlas) do estado lógico. Só o lógico sincroniza.

## 6.9 Anti-cheat (o que funciona e o que não)

| Medida | Resolve | Não resolve |
|---|---|---|
| Servidor autoritativo | memory editor, "unlimited money" APK, pacote forjado | bots, automação de input, conluio |
| Validação de recibo IAP no servidor | compra falsa, replay de recibo | chargeback (precisa de fluxo de estorno) |
| Relógio do servidor | time-travel para acelerar obra | — |
| Rate limit + sanity check | spam de coleta, valores absurdos | cheat lento e "plausível" |
| Detecção de anomalia no ledger | fazendas de conta, lavagem de moeda via trade | jogador que só joga muito |
| Assinatura de save local | cheat casual em jogo offline | reverse engineer dedicado |

✅ Nota de realidade: existem milhares de vídeos "SimCity BuildIt unlimited SimCash" — e nenhum funciona de verdade, porque a economia é server-side. Já jogos offline-first têm mod APK trivialmente. **Essa é a consequência direta da escolha da seção 6.1.**

## 6.10 LiveOps e telemetria (o que sustenta o negócio)

- **Eventos com economia própria:** ✅ CI6 tem *event islands* que **zeram a economia** (nível não vale, loja própria, prédios vindos do warehouse, expansão dá recompensa) e *Gold Pass* (passe). 🔍 Isso é um "sub-jogo" com wallet separada — modele `eventWallet` e `eventProgress` isolados do principal para não contaminar a economia da conta.
- **Leaderboards:** Redis `ZSET` por evento, com score vindo de **evento validado no servidor**, nunca do cliente. ✅ CI6: Builders Battle / Conversion Champions / Medal Mania; Megapolis: contests semanais.
- **Remote config versionado + A/B:** custos, curvas, drop rate, ofertas. Servidor decide o bucket; cliente só renderiza.
- **Dashboards obrigatórios:** faucet/sink por moeda e por nível, tempo médio por nível, funil FTUE, taxa de conclusão de missão, estoque de moeda por coorte, D1/D7/D30, ARPDAU.
- **Toda ação econômica gera evento de telemetria** com `reason` — é o mesmo dado do ledger, então é de graça.

---

# PARTE 7 — Blueprint enxuto para o seu jogo

## 7.1 Escolhas recomendadas 🔍

| Camada | Escolha | Por quê |
|---|---|---|
| Renderer | **Unity + URP, 3D, câmera ortográfica travada (30°, 45°)** | tiers/variantes/rotação baratos; Z-buffer resolve sorting; roda em low-end |
| Grid | array plano `Cell[256*256]`, chunks 32×32, altura discreta 0–3 | 512 KB, O(1) por célula, rebuild parcial |
| Regras de placement | JSON data-driven + validador compartilhado cliente/servidor | designer itera sem build; sem divergência de regra |
| Backend | C# compartilhado (Metaplay-style) **ou** Node/TS + Postgres + Redis **ou** Nakama/PlayFab com CloudScript autoritativo | escolha pelo time, não pela moda |
| Autoridade | **híbrido com servidor autoritativo na economia/progressão** | retrofit depois é rewrite |
| Save | blob versionado + `seq` + deltas | pequeno, migrável, multi-device |
| Moeda | int64 + wallet + ledger append-only + idempotency | auditável, sem float, sem duplo gasto |
| Personagens | agregado no servidor + agentes cosméticos no cliente | 1 número vs 10k entidades |
| Missões | event-driven + claim idempotente + reset UTC | sem polling, sem exploit |
| XP | tabela explícita + `while` de level-up + unlock table | controle de ritmo (lição do BuildIt) |

## 7.2 Ordem de implementação (MVP → vertical slice)

1. Grid + câmera + toque→célula + ghost verde/vermelho.
2. `Cell.flags` + `Locked`/`Water`/`NoBuild` + validador com **mensagens de erro**.
3. Estradas com bitmask + drag + apply/undo transacional.
4. Placement autoritativo (mesmo offline: escreva a função `validate+apply` como se fosse servidor).
5. Wallet + ledger + idempotency (sim, desde o MVP — é 200 linhas).
6. Timer de obra com relógio central + estágios visuais + crane slots.
7. Coleta com balde/teto + `collect all`.
8. XP + unlock table + level-up.
9. Missões event-driven + claim.
10. Expansão de território (plots) + heatmap de posições válidas.
11. Só então: agentes cosméticos, variantes, eventos, ranking.

## 7.3 Armadilhas que custam meses

- ❌ Colisor físico por prédio em vez de occupancy grid.
- ❌ Dinheiro em `float`/`double`.
- ❌ Timer e preço calculados no cliente.
- ❌ XP dado no cliente (ou `if` em vez de `while` no level-up).
- ❌ Missão recalculada por varredura da cidade a cada request.
- ❌ Save sem `schemaVersion`.
- ❌ Sprite iso alto sem regra de sorting (prédio "vaza" por trás do vizinho).
- ❌ Não separar terreno/ocupação/lógica em camadas (save gigante, overlay impossível).
- ❌ Escolher client-authoritative "por enquanto" num jogo com ranking e IAP.
- ❌ Simular cidadão individual para fazer número de população.

---

## Fontes consultadas

**Megapolis**
- iLogos — case de co-produção: engine custom do estúdio — https://ilogos.biz/case/megapolis/
- Megapolis Help Center (Social Quantum): mecânicas, estradas, recursos/população, expansão, coupons/tokens — https://social-quantum.helpshift.com/hc/en/11-megapolis/section/180-game-mechanics/
- Como construir estradas (swipe, bandeiras, Save/Undo, ocultar objetos) — https://social-quantum.helpshift.com/hc/en/11-megapolis/faq/1737-how-do-i-build-roads/
- Energia/água/população (bloqueio de construção por recurso) — https://social-quantum.helpshift.com/hc/en/11-megapolis/faq/1141-how-can-i-manage-my-city-s-resources-electricity-water-and-population/
- Megapolis Wiki — Territories (zonas separadas, limites próprios, sem mover entre zonas) — https://sqmegapolis.fandom.com/wiki/Expansions
- RetroStyle Games — pipeline de arte iso (3DS Max + Corona → sprites PNG, 4 níveis por prédio) — https://retrostylegames.com/portfolio/isometric-city-builder-pack/
- Sunstrike Studios — arte isométrica para city builder (cita Megapolis/Social Quantum) — https://sunstrikestudios.com/en/blog/isometric-city-builder-art/

**City Island 6 / Sparkling Society**
- FAQ oficial CI6 (cranes, estradas/one-way, armazém, keys, cash/gold, citizens/jobs/happiness, ilhas de evento, Gold Pass, Jane) — https://sparklingsociety.net/frequently-asked-questions-city-island-6/
- Suporte oficial CI6 (offline, player-id, regiões/superfícies, Mayor's Club) — https://sparklingsociety.net/support-city-island-6/
- Portfólio do team lead de City Island 5: **Unity/C# + JavaScript (GameSparks) + PHP** — https://www.nmeijer.nl/ci5.html

**SimCity BuildIt**
- GDC 2016 / PocketGamer.biz — Petri Ikonen: mecânicas F2P clássicas falharam, foco em crafting, tempo/offline, "não punir o jogador" — https://www.pocketgamer.biz/petri-ikonen-designing-simcity-buildit/
- Game Developer — *Progression Control in Sim City BuildIt* (curva de XP vs renda de XP, planilha aberta) — https://www.gamedeveloper.com/design/progression-control-in-sim-city-buildit
- EA / Tracktwenty (estúdio) — https://www.ea.com/ea-studios/tracktwenty
- Vaga EA/Tracktwenty — *Software Engineer, Graphics Programmer (C++)* para SimCity BuildIt — https://fi.linkedin.com/jobs/view/software-engineer-graphics-programmer-c%2B%2B-at-electronic-arts-ea-4169520862
- r/Unity3D — "milhares de modelos 3D, iluminação dinâmica e sombras"; não é Unity — https://www.reddit.com/r/Unity3D/comments/3r7l75/simcity_buildit_how_did_they_achieve_such/
- IGN Guide — "pinch, zoom and rotate 360 degrees" — https://www.ign.com/wikis/simcity-buildit
- Wiki: City Expansion (dozer wheel/blade/exhaust, 872 sets, Expansion Deeds, expansões de praia/montanha por região) — https://simcity-buildit.fandom.com/wiki/City_Expansion
- Wiki: Residential Zone (6 tiers, wealth forecast só visual, 92 prédios, Epic Projects, teto 1.836 + bônus) — https://simcity-buildit.fandom.com/wiki/Residential_Zone
- r/SCBuildIt — otimização de ruas (zona residencial 2×2, 2 segmentos de rua) — https://www.reddit.com/r/SCBuildIt/wiki/res-posts/roads-optimization/
- Fóruns EA — orientação do prédio vem da rua adjacente — https://forums.ea.com/discussions/simcity-buildit-en/re-is-it-possible-to-rotate-a-building-before-placing-it/10413779

**Técnica geral**
- Clint Bellanger — *Isometric Tiles Math* (projeção e inversa, lógica em coordenadas de mapa) — https://clintbellanger.net/articles/isometric_math/
- Unity — *Isometric 2D environments with Tilemap* — https://unity.com/blog/engine-platform/isometric-2d-environments-with-tilemap
- Metaplay — *Server-Authoritative vs Client-Authoritative Game Backend Architecture* — https://www.metaplay.io/comparisons/server-authoritative-vs-client-authoritative

---

## Anexo — Fato público vs inferência

| Afirmação | Status |
|---|---|
| Megapolis usa engine própria do estúdio | ✅ fonte (iLogos) |
| Megapolis é 2D iso com sprites pré-renderizados | 🔍 forte (arte baked visível + pipeline dos estúdios de arte + engine custom); não há documento técnico oficial dizendo "sprites" |
| City Island usa Unity/C# com backend JS/PHP | ✅ fonte (dev do estúdio, CI5); CI6 = mesma linhagem 🔍 |
| City Island 6 é 3D com câmera angular fixa | 🔍 (observação visual + mecânicas de grid do FAQ) |
| SimCity BuildIt é 3D real com rotação 360° | ✅ fontes (guia + discussão técnica) |
| SimCity BuildIt tem engine própria em C++ | 🔍 forte (vaga de graphics programmer C++ + consenso de que não é Unity) |
| BuildIt é server-authoritative na economia | 🔍 forte (online-only, trade global, clubes, ausência de cheat funcional) |
| CI6 é offline-first | ✅ fonte (FAQ/suporte oficial) |
| Cidadãos são agregados, agentes são cosméticos | ✅ parcial (FAQ: beco sem saída, barras agregadas) + 🔍 |
| Estruturas de dados, schemas SQL, código deste doc | 🔍 meu, para você implementar |
