# 3D com qualidade e sem pesar — guia de arquitetura, orçamentos e pipeline

**Contexto:** city builder mobile estilo Megapolis / City Island 6 / SimCity BuildIt, com câmera angular travada.
**Objetivo:** parecer "AAA de celular" rodando em Android de 2019 e com download inicial pequeno.

> **A tese em uma frase:** em city builder, qualidade percebida vem de **arte baked + paleta coesa + silhueta + telhados detalhados**, não de polígonos nem de luz em tempo real. E como a **câmera é travada**, você pode pré-computar quase tudo — essa é a sua maior alavanca, de graça.

---

## 0. Separe "pesar" em 3 orçamentos independentes

Muita gente otimiza o errado. São três problemas distintos, com soluções distintas:

| Orçamento | Sintoma quando estoura | Métrica que importa | Onde se resolve |
|---|---|---|---|
| **A. Download / instalado** | usuário não instala, uninstall em aparelho com 2 GB livres | MB do download inicial e MB instalado | compressão de textura, stripping, asset packs |
| **B. RAM / VRAM** | crash silencioso (iOS jetsam), reload de cena, texturas sumindo | pico de memória residente | atlas, mips, LOD, streaming, descarregar tema |
| **C. Frame time (CPU + GPU) e térmica** | 20 FPS, aparelho quente, throttling aos 10 min | ms de main thread / render thread / GPU | instancing, LOD, luz baked, resolução |

Um jogo pode ter 60 FPS e ainda "pesar" (2 GB de download). Ou ter 90 MB e travar (5.000 draw calls). **Ataque os três, com números.**

---

## 1. Orçamento por tier de aparelho (defina isto antes de modelar)

Valores-alvo recomendados 🔍 (não são limites de engine, são metas de projeto):

| | **Tier C — low** (Adreno 610 / Mali-G52, 3–4 GB RAM) | **Tier B — mid** (Adreno 640 / Mali-G76, 6 GB) | **Tier A — high** (Adreno 730+ / A15+) |
|---|---|---|---|
| FPS alvo | **30** (cap) | 60 (ou 30 com qualidade alta) | 60–120 |
| Frame budget | 33 ms | 16,6 ms | 16,6 ms |
| Main thread | ≤ 10 ms | ≤ 7 ms | ≤ 6 ms |
| GPU | ≤ 26 ms | ≤ 12 ms | ≤ 11 ms |
| **Draw calls / SetPass** | **≤ 150 / ≤ 60** | ≤ 300 / ≤ 100 | ≤ 500 / ≤ 150 |
| **Triângulos/frame** | **≤ 250 k** | ≤ 600 k | ≤ 1,2 M |
| **VRAM (texturas+meshes)** | **≤ 250 MB** | ≤ 450 MB | ≤ 800 MB |
| RAM total residente | ≤ 700 MB | ≤ 1,1 GB | ≤ 1,5 GB |
| Render scale | **0,7 + upscaling** | 0,85–1,0 | 1,0 |
| Sombra em tempo real | **não** (blob/baked) | 1 cascata, 1024, dist. 60 m | 2 cascatas, 2048 |
| Pós-processo | LUT + FXAA | LUT + FXAA + bloom leve | + SSAO opcional |
| Agentes (carros/pedestres) | 40 / 0 | 120 / 60 | 250 / 150 |

**Regra de ouro:** o **Tier C é o que define a arquitetura**; A e B só ganham camadas por cima. Se você projetar para o Tier A, vai ter que reescrever o renderer depois.

**Térmica é parte do orçamento:** um jogo que roda 60 FPS por 3 minutos e cai para 22 depois de 10 é um jogo de 22 FPS. Use cap de 30 FPS como padrão em Tier C, `Application.targetFrameRate` + Adaptive Performance (Samsung/GameSDK) e **resolução dinâmica** quando o throttling chegar.

---

## 2. A arquitetura que resolve: **híbrido 3D perto + impostor isométrico longe**

Esta é a técnica que junta o melhor do Megapolis (arte baked linda, custo quase zero) com o melhor do BuildIt (3D de verdade quando importa):

```
zoom IN  (poucos prédios na tela)  -> malha 3D LOD0, materiais do atlas, sombra dinâmica curta
zoom MÉDIO                        -> LOD1/LOD2 instanciados, sombra baked, sem props
zoom OUT (cidade inteira na tela) -> IMPOSTOR: quad com o prédio pré-renderizado
                                     no ângulo EXATO da câmera, dentro de um atlas
```

Por que funciona tão bem aqui:
- A câmera tem **ângulo fixo** → o impostor não precisa de octahedral/full-spherical mapping. **Um único render por prédio basta.** (Se você permitir rotação 360°, bake 8–16 ângulos e escolha pelo yaw; ainda é barato.)
- No zoom-out, 3.000 prédios viram **~30 draw calls** (um por tipo) e **6.000 triângulos**. A qualidade visual é a de um sprite pré-renderizado — ou seja, a do Megapolis.
- No zoom-in, onde o jogador realmente olha detalhe, você gasta polígonos em **20–40 prédios**, não em 3.000.

**LOD por zoom, não por distância.** Com câmera ortográfica/angular, todos os prédios estão quase à mesma distância; o que muda é o **tamanho em pixels**. Use `Camera.orthographicSize` (ou a altura do prédio projetada em pixels) para escolher o LOD:

```csharp
// pixels aproximados de altura do prédio na tela
float px = buildingWorldHeight / (2f * cam.orthographicSize) * Screen.height;
int lod = px > 90 ? 0 : px > 40 ? 1 : px > 14 ? 2 : 3; // 3 = impostor
```

Isso é mais estável que LOD por distância e evita o "popping" no meio da cidade.

**Bônus:** o mesmo atlas de impostores serve para: minimapa, cidade de vizinho/clube, preview de loja, ícone de missão e catálogo. Um asset, cinco usos.

> Código pronto: `unity/CityChunkRenderer.cs` (instancing + LOD por zoom + impostor + culling por chunk) e `unity/Editor/IsoImpostorBaker.cs` (bake automático do atlas no ângulo da câmera).

---

## 3. Orçamento de arte por prédio (o que o modelador precisa saber)

| Asset | LOD0 (tris) | LOD1 | LOD2 | Impostor | Materiais |
|---|---|---|---|---|---|
| Casa 1–2 andares | **400–900** | ~45% | ~18% | 2 tris | **1** |
| Comércio / comunidade | 1.200–2.500 | ~45% | ~18% | 2 tris | 1 |
| Indústria | 1.500–3.000 | ~45% | ~18% | 2 tris | 1–2 |
| Torre / landmark (1–3 na tela) | 4.000–8.000 | ~50% | ~20% | 2 tris | 2 |
| Árvore / prop | 60–200 | billboard | — | — | 1 (compartilhado) |
| Carro | 150–350 | 80 | — | — | 1 (compartilhado) |
| Pedestre | 200–400 (só de perto) | — | — | — | 1 (compartilhado) |

Regras que valem mais que qualquer otimização de engine:

1. **Gaste detalhe no TELHADO e na silhueta.** Numa câmera a 30–45°, o jogador vê 60% telhado, 35% duas fachadas, 5% o resto. Fachada nível rua é dinheiro jogado fora.
2. **1 material por prédio, todos apontando para o mesmo atlas do tema.** Isso é o que permite SRP Batcher + instancing agruparem. 3 materiais por prédio = 3× os draw calls.
3. **Modular kit + trim sheet**, não modelos únicos: 20 peças (parede, janela, porta, telhado, cornija, escada, AC, antena) combinadas geram 200 prédios com 1 atlas.
4. **Tiers e variantes por swap de mesh + material**, não por textura nova. 6 tiers × 3 variantes = 18 combinações, todas no mesmo atlas.
5. **Cor por vertex color + paleta/gradient texture** em vez de textura única: você recolora 30 casas com 1 textura de 256×64.
6. **AO e sujeira baked** em vertex color ou num canal do mask map. É o que dá "peso" e leitura de forma sem custo de GPU.
7. **Sem skinning, sem blendshapes, sem Animator em prédio.** Animação de props (bandeira, moinho, fumaça, água) = **vertex shader** com tempo, não Animator.
8. **Nada de colisor por prédio.** A lógica é o grid (ver estudo anterior). Colisor só no chão para o raycast do toque.

---

## 4. Texturas: onde o "peso" realmente está

Textura é 70–85% da VRAM e do download de um city builder. Compressão é a alavanca nº 1.

**Bits por pixel (ASTC) e custo de uma textura 1024²:**

| Formato | bpp | 1024² | 2048² | Quando usar |
|---|---|---|---|---|
| RGBA32 (sem compressão) | 32 | 4,0 MB | 16,0 MB | **nunca em build** |
| ASTC 4×4 | 8,0 | 1,0 MB | 4,0 MB | UI hero, normais críticos |
| ASTC 5×5 | 5,12 | 0,64 MB | 2,56 MB | atlas principal em Tier A |
| **ASTC 6×6** | **3,56** | **0,45 MB** | **1,78 MB** | **padrão do atlas de tema** |
| ASTC 8×8 | 2,0 | 0,25 MB | 1,0 MB | terreno, máscaras, lightmap |
| ASTC 10×10 | 1,28 | 0,16 MB | 0,64 MB | gradientes, LUT, ruído |
| ETC2 RGBA8 | 8,0 | 1,0 MB | 4,0 MB | fallback GLES3 antigo |

*(mips somam ~33%; conte sempre com ×1,33)*

Estratégia recomendada 🔍:
- **1 atlas 2048² por tema/região** (ASTC 6×6 ≈ 1,8 MB + mips ≈ 2,4 MB). 6 temas = **~15 MB de VRAM** para a cidade inteira. Sim, é isso mesmo.
- **Paleta/gradient** 256×64 e **mask map packed** (R=AO, G=roughness, B=metal, A=emissive mask) — 1 textura em vez de 4.
- **Nunca** uma textura por prédio. Se o modelador entregar assim, o pipeline rejeita.
- **Mipmaps ON** + **Texture Streaming ON** (URP) com budget por tier: 128 MB (C) / 256 MB (B) / 384 MB (A). Streaming derruba o pico de VRAM drasticamente em cidade grande.
- **Read/Write Enabled OFF** em tudo (dobra a memória: cópia na CPU + GPU).
- **Max Size override por tier**: 2048 no A, 1024 no C, via `TextureImporter` platform override + quality tier no boot.
- **Lightmaps**: ASTC 8×8 (ou formato de lightmap próprio), 1024² por chunk, orçamento de 8–16 por região. Não deixe o Unity gerar 20 lightmaps 4096² "no automático".
- **UI**: atlas separado (TMP + sprites), ASTC 5×5, e **só os glyphs usados** no font asset. UI é frequentemente o maior consumidor de textura em F2P — audite.

---

## 5. Iluminação: 90% baked, 10% real

Com câmera travada você não precisa de GI dinâmica. Receita:

1. **Bake de luz** (Progressive GPU Lightmapper) com **1 direcional** dourada + céu. Cena estática → lightmaps por chunk.
2. **Adaptive Probe Volumes (APV)** ou Light Probes para os objetos que se movem/instanciam (prédios colocados em runtime não têm lightmap próprio — precisam de probes). APV no Unity 6 URP é o caminho moderno e barato.
3. **AO baked** (no lightmap e/ou vertex color). **Não use SSAO** em Tier C — é um dos efeitos mais caros por pixel em mobile.
4. **Sombra em tempo real só onde vende**: 1 direcional, **1 cascata**, distância 40–60 m, resolução 1024, só prédios grandes/hero como casters. Todo o resto: **blob shadow** (quad com gradiente) ou sombra baked no chão.
5. **Dia/noite**: se quiser, **não** faça luz dinâmica. Bake 2–3 estados (dia/pôr-do-sol/noite) e faça blend de lightmap + LUT + janelas emissivas. Custa quase nada e parece caro.
6. **Água**: shader simples com 2 normais rolando + fresnel + cor por profundidade. Sem reflexão real, sem SSR. Planar reflection só se for 1 lago e no Tier A.
7. **Emissive nas janelas à noite** é o truque de "cidade viva" mais barato que existe.

**Rendering path:** Forward+ se você for usar **GPU Resident Drawer**; Forward clássico se precisar de GLES. Atenção aos requisitos oficiais: o GPU Resident Drawer exige **Forward+**, **API com compute shader (não OpenGL ES)** e **MeshRenderer**; ele aumenta o tempo de build (compila variantes de BatchRendererGroup) e recomenda **desligar Static Batching**. Ou seja: **não é bala de prata em Android low-end** — muitos aparelhos Tier C ainda caem em GLES. Planeje o fallback (instancing clássico) desde o início.

---

## 6. Meshes e geometria

- **Mesh Compression: Medium/High** (na maioria dos casos sem perda visual perceptível em mobile).
- **Read/Write Enabled OFF**, **Optimize Mesh Data ON** (remove canais não usados pelo shader).
- **Index Format 16-bit** sempre que a malha tiver < 65k vértices (metade da memória de índice).
- **Sem tangentes** se você não usa normal map (o shader de cidade estilizada muitas vezes não usa).
- **UV2 só** se o objeto vai receber lightmap. Prédio instanciado usa probes → não precisa de UV2.
- **LOD chain** automática (Simplygon / Unity LOD / ferramenta do DCC) + **impostor** como último nível.
- **Combine por chunk** apenas o que é **único e estático** (terreno, calçada, cliff). O que é **repetido** vai por **instancing** — combinar repetido mata o instancing e infla a memória.

---

## 7. CPU: o inimigo silencioso em city builder

Cidade grande = muitos objetos. O erro clássico é `MonoBehaviour.Update()` por prédio.

**Faça:**
- **Um manager** com arrays nativos + **Jobs/Burst** para o que precisa atualizar (accrual de lucro, agentes, animação de props).
- **`Graphics.DrawMeshInstanced`** (funciona em GLES) agrupado por (mesh LOD, material) — batches de 1023. Upgrade path: `RenderMeshInstanced` / **BatchRendererGroup / GPU Resident Drawer** em Vulkan/Metal.
- **Culling por chunk** (`GeometryUtility.TestPlanesAABB` no AABB do chunk) antes de montar os batches.
- **Zero GameObjects por prédio** no estado de jogo: o prédio é um registro em array; o visual é um batch. Só instancie GameObject para o prédio **selecionado** (o que tem UI/balão).
- **Agentes cosméticos**: pool fixo, spline/grafo de ruas, sem física, sem NavMesh, densidade por zoom.
- **Eventos, não polling**: nada de `Update` checando timer; um heap de timers ordenado por `finishAt`.
- **Animação por shader** (vertex offset com `_Time`) para árvores, bandeiras, fumaça, água, hélices.

**Não faça:** `Instantiate`/`Destroy` em loop, `GetComponent` por frame, LINQ em hot path, `Camera.main` dentro de loop, `Animator` em prop, `Update` em 3.000 objetos, física para colisão de prédio.

**Matemática dos draw calls (por que instancing é decisivo):**

```
Sem instancing:  3.000 prédios × 1 material = 3.000 draw calls  -> Tier C morre em ~150
Com instancing:  30 tipos × 3 LODs visíveis  =    90 draw calls  -> cabe em qualquer tier
Zoom-out impostor: 30 tipos × 1 quad         =    30 draw calls  -> 6.000 triângulos
```

---

## 8. Resolução e pós-processo (qualidade por pixel, não por polígono)

- **Render Scale 0,7–0,85 + upscaling** é o melhor negócio em mobile: 0,7² = **49% dos pixels**. Com **STP (Spatial-Temporal Post-processing)** do Unity 6 ou FSR-like, a perda visual é pequena em arte estilizada.
- **Dynamic resolution**: baixe o scale quando o GPU time passar do orçamento; suba quando sobrar.
- **Pós mínimo**: color grading com **LUT** (praticamente grátis, e é o que dá "look caro"), FXAA/SMAA, vinheta sutil. **Bloom** só Tier B+ com intensidade baixa. **Nunca** SSAO/DOF/motion blur em Tier C.
- **MSAA off** (caro em mobile com muitos pixels); use FXAA + render scale.
- **Overdraw é o vilão invisível**: transparência empilhada (fumaça, folhas, água, UI) custa mais que geometria. Use alpha-test em vez de alpha-blend onde der; folhas em quad com poucos pixels vazios; partículas pequenas e poucas.
- **UI**: 1–3 canvas no máximo, separe estático de dinâmico (canvas rebuild é CPU), nada de `Layout Group` em lista grande, use scroll virtualizado.

---

## 9. Tamanho do app: limites oficiais e como ficar abaixo

**Limites atuais (verificados):**

| Google Play (AAB) | Limite |
|---|---|
| Base module | **500 MB** (compressed download) |
| Feature module individual | 500 MB |
| Asset pack individual | **1,5 GB** |
| Soma de modules + packs install-time | **4 GB** |
| Soma de packs fast-follow + on-demand | **30 GB** |
| Total do app | 34 GB · máx. 100 asset packs |
| ⚠️ Acima de **200 MB** | usuário em rede móvel vê **aviso de app grande** |
| APK legacy (sem bundle) | 100 MB |

| Apple | Limite |
|---|---|
| App iOS (uncompressed) | **4 GB** |
| Seções `__TEXT` do binário | **500 MB** |
| Conteúdo extra | **On-Demand Resources** (packs de até 8 GB após thinning em iOS 18+) e **Background Assets** (iOS 16+) para conteúdo grande |

**Metas de projeto 🔍 (não os limites):**
- **Download inicial ≤ 150 MB** (abaixo do aviso de 200 MB, folga para update).
- **First-run jogável ≤ 80 MB** — o jogador entra na cidade antes de baixar o resto.
- **Instalado ≤ 600 MB** com tudo, e permitir descarregar temas não usados.

**Como conseguir:**
1. **1 tema no build base** (a cidade inicial). Cada região/tema/evento = **asset pack** (Play Asset Delivery) / **ODR ou Background Assets** (iOS), carregado por **Addressables**. É exatamente por isso que Megapolis/BuildIt dividem o mundo em zonas/regiões: **é uma decisão de streaming, não só de design**.
2. **IL2CPP + Managed Stripping Level High** + `link.xml` só para o que reflete.
3. **Shader variant stripping agressivo**: URP → desligue features não usadas (Decals, SSAO, Light Cookies, Additional Lights por objeto…), remova keywords, use `IPreprocessShaders`. Variantes de shader são frequentemente **dezenas de MB** e centenas de MB de RAM de shader compilado. Se for usar GPU Resident Drawer, lembre que ele exige `BatchRendererGroup Variants = Keep All` (custo de build/tamanho).
4. **Remova pacotes não usados** (Analytics duplicado, XR, Timeline, Physics 2D se não usa…). Cada pacote traz código + assets.
5. **Áudio**: música em **Vorbis streaming** (não decompressed), SFX curtos em **ADPCM/compressed in memory**, mono em SFX, 22–32 kHz para SFX. Áudio é facilmente 30–60 MB descuidados.
6. **Fontes**: TMP com atlas dinâmico e **só o conjunto de glyphs** do idioma (CJK é o caso crítico — subset).
7. **Sem pasta `Resources/`** com duplicatas; tudo em Addressables com grupos por tema e **sem duplicação de dependência** (rode o Analyze do Addressables).
8. **Compressão de textura por plataforma** (ASTC em iOS/Android moderno; ETC2 fallback), e **nada de PNG/RGBA32 em build**.
9. **Meça, não ache**: `bundletool get-size total` no AAB; App Store Connect → tamanho por device; Unity Build Report (Editor.log) para o breakdown.

---

## 10. Pipeline de produção (para a qualidade não degradar em 6 meses)

```
DCC (Blender/Max)
  └─ modular kit + trim sheet, budget de tris por peça
      └─ export FBX (escala 1, sem câmeras/luzes)
          └─ Unity import preset por categoria (casa/prop/veículo)
              ├─ LOD chain (0/1/2) automática
              ├─ material do atlas do tema (1 por prédio)
              ├─ bake de impostor no ângulo da câmera  [IsoImpostorBaker]
              └─ Addressables group = tema/região
                  └─ CI: AssetBudgetAudit  [gate que FALHA o build]
                      ├─ tris > budget? material > 1? textura > 1024 sem override?
                      ├─ read/write ligado? mips off? formato não comprimido?
                      └─ relatório em Markdown + CSV
```

**Gate de CI é o que mantém o jogo leve.** Sem ele, cada sprint adiciona 5 MB e 20 draw calls, e ninguém percebe até o lançamento.

**QA de performance (mínimo):**
- Matriz de 3 aparelhos: um Tier C real (ex.: Galaxy A-series com Mali-G52), um Tier B, um iPhone.
- **Cena de stress**: cidade máxima (todos os plots comprados, ~3.000 prédios, todos os temas) — não teste só o tutorial.
- Ferramentas: Unity Profiler (CPU/GPU/Memory), **Frame Debugger** (contar SetPass), **Memory Profiler** (snapshots e duplicatas), **Android GPU Inspector / Snapdragon Profiler**, **Xcode GPU Frame Capture**, visor de **overdraw**.
- Meça **10 minutos seguidos** (térmica) e **pico de RAM** ao trocar de região.

---

## 11. Checklist final (cole no seu board)

**Arquitetura**
- [ ] Câmera angular travada (ortográfica ou FOV baixo) — decisão de design que paga a otimização
- [ ] LOD por **zoom/pixels**, não por distância
- [ ] Impostor iso baked como último LOD (+ reuso em minimapa/loja/vizinhos)
- [ ] Grid lógico = colisão; zero colisor por prédio
- [ ] Zero GameObject/MonoBehaviour por prédio; manager + batches
- [ ] Culling por chunk antes de montar draw calls

**Arte**
- [ ] 1 material por prédio, 1 atlas 2048² por tema
- [ ] Detalhe no telhado/silhueta; AO e sujeira baked
- [ ] Tiers/variantes por mesh+material swap, não por textura nova
- [ ] Props animados por vertex shader

**Luz/pós**
- [ ] Luz baked + APV/probes; 1 direcional; sombra curta ou blob
- [ ] LUT + FXAA; render scale 0,7–0,85 + upscaling; dynamic resolution
- [ ] Sem SSAO/DOF/motion blur no Tier C

**Memória/tamanho**
- [ ] ASTC 6×6 padrão, mips ON, streaming ON, read/write OFF
- [ ] Addressables por tema + PAD/ODR/Background Assets
- [ ] Shader stripping + managed stripping High
- [ ] Base ≤ 150 MB; first-run ≤ 80 MB

**Processo**
- [ ] Budget por tier escrito e acordado com o time de arte
- [ ] Auditoria automática no CI que **falha** o build
- [ ] Cena de stress com cidade máxima
- [ ] Teste de 10 min (térmica) em aparelho Tier C real

---

## 12. Ferramentas que acompanham este guia

| Arquivo | O que faz |
|---|---|
| **`orcamento-3d.html`** | Calculadora interativa: você move sliders (prédios na tela, tris, atlas, formato, render scale, tier) e vê **VRAM, draw calls, triângulos/frame e download** com semáforo por tier. Use para decidir *antes* de modelar. |
| **`unity/CityChunkRenderer.cs`** | Runtime: agrupamento por (mesh, material), **LOD por zoom**, **impostor**, culling por chunk, `DrawMeshInstanced` em batches de 1023. Sem GameObject por prédio. |
| **`unity/Editor/IsoImpostorBaker.cs`** | Editor: bake automático de cada prefab no **ângulo exato da câmera** para um atlas de impostores + JSON de rects. |
| **`unity/Editor/AssetBudgetAudit.cs`** | Editor/CI: varre o projeto e reporta tris, materiais, texturas, formatos, read/write, mips, memória estimada — e **falha** se estourar o budget. |

---

## Fontes

- Google Play — *Optimize your app's size and stay within Google Play app size limits* (base 500 MB, pack 1,5 GB, 4 GB install-time, 30 GB on-demand, aviso >200 MB) — https://support.google.com/googleplay/android-developer/answer/9859372
- Android — *Play Asset Delivery* — https://developer.android.com/guide/playcore/asset-delivery
- Apple — *Maximum build file sizes* (iOS 4 GB uncompressed, `__TEXT` 500 MB, Background Assets) — https://developer.apple.com/help/app-store-connect/reference/app-uploads/maximum-build-file-sizes/
- Apple — *On-demand resources size limits* — https://developer.apple.com/help/app-store-connect/reference/app-uploads/on-demand-resources-size-limits/
- Unity 6.2 — *Enable the GPU Resident Drawer in URP* (Forward+, compute, sem GLES, Keep All variants, desligar Static Batching) — https://docs.unity3d.com/6000.2/Documentation/Manual/urp/gpu-resident-drawer.html
- Unity — *Introduction to URP for advanced creators (Unity 6)* — https://unity.com/resources/introduction-to-urp-advanced-creators-unity-6
- Unity — *Recommended, default and supported texture formats by platform* (tabela ASTC/bpp) — https://docs.unity3d.com/2022.1/Documentation/Manual/class-TextureImporterOverride.html
- Unity — *Delivering to Google Play* (restrições de base module + asset packs) — https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/android/building-and-delivering/distribution/google-play

> 🔍 Todos os números de **budget** (tris, draw calls, MB por tier) são metas de projeto minhas, calibradas para o gênero — não são limites oficiais de engine ou loja. Os limites oficiais estão nas tabelas da seção 9, com fonte.
