# Prompts dos prédios da cidade (Nano Banana 2 Pro)

Seguem `docs/DESIGN-SYSTEM.md`: bloco de estilo (com a base de grama, ou de areia nos carrinhos de praia), assunto e vista final. Vista principal 1:1 em 2K; depois a folha de 4 vistas com o template do design system e o recorte. Tripo H3.1 Multiview com pbr desligado e o `face_limit` da tabela; depois `node tools/optimize-city-models.mjs <entrada> public-fifones/models/rio/<id>.glb --tris 6000` e o item no catálogo do Rio (`shared/game/city-layout.js`, guia em `docs/PREDIOS-RIO.md`). Ids e tamanhos são propostas.

| Item | Id sugerido | Lotes | face_limit |
|---|---|---|---|
| Carrinho de picolé | `rio-picole` | 1x1 | 3000 |
| Carrinho de milho | `rio-milho` | 1x1 | 3000 |
| Academia grande | `rio-academia-grande` | 3x3 | 6000 |
| Prefeitura | `rio-prefeitura` | 3x3 | 6000 |
| Casa térrea | `rio-casa` | 2x2 | 4000 |
| Sobrado colorido | `rio-sobradinho` | 2x2 | 4000 |
| Prédio residencial | `rio-predio` | 2x2 | 5000 |
| Prédio comercial | `rio-predio-comercial` | 2x2 | 5000 |
| Hospital | `rio-hospital` | 3x3 | 6000 |

## Carrinho de picolé — `rio-picole` (1x1)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The object stands on a thin round 10-sided low-poly base disk, flat sand top with brown earth sides, diameter just larger than the object footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: a Rio beach popsicle cart: a small boxy cooler cart on two chunky wheels with a push handle, the cooler body in cream with a wide sunny yellow band and coral lid, a short striped beach umbrella in coral and cream on a single pole, three oversized popsicles on top as decoration (coral, sunny yellow, grass green), standing on the sand.

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

## Carrinho de milho — `rio-milho` (1x1)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The object stands on a thin round 10-sided low-poly base disk, flat sand top with brown earth sides, diameter just larger than the object footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: a Rio street corn cart: a small wheeled metal-free wooden cart in warm wood brown with a cream counter, a big round steaming pot shape on top in stone gray with a lid, a few chunky yellow corn cobs in a tray, a small sunny yellow and terracotta umbrella, a tiny stool beside it. The steam is three solid soft cream puffs, not a glow.

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

## Academia grande — `rio-academia-grande` (3x3)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, slightly oversized roof and doorway, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The building stands on a thin round 10-sided low-poly base disk, flat grass-green top with brown earth sides, diameter just larger than the building footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: a large modern neighborhood gym building, two floors, wide and low: big framed window blocks in sky blue on the ground floor, deep navy and cream walls, a flat roof with a rooftop running track in terracotta and a small green planter, chunky dumbbell and kettlebell shapes visible through the big windows, an entrance canopy in coral, a few simple outdoor bars on the side lawn.

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

## Prefeitura — `rio-prefeitura` (3x3)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, slightly oversized roof and doorway, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The building stands on a thin round 10-sided low-poly base disk, flat grass-green top with brown earth sides, diameter just larger than the building footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: a city hall in Rio colonial-civic style: symmetrical two-story building in cream with terracotta roof tiles, a central entrance block with four chunky columns, wide steps, a small clock-tower dome on top in sunny yellow, tall arched windows framed in deep navy, a flagpole with a plain coral flag (no symbols), a small square in front with two round trees.

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

## Casa térrea — `rio-casa` (2x2)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, slightly oversized roof and doorway, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The building stands on a thin round 10-sided low-poly base disk, flat grass-green top with brown earth sides, diameter just larger than the building footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: a small single-story Rio house: cream walls with a coral door, a terracotta tiled roof, a little front porch with a wooden bench, two square windows with sky blue shutters, a low garden wall and a potted plant, a tiny side yard with a clothesline post (no thin wires: one chunky rope bar).

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

## Sobrado colorido — `rio-sobradinho` (2x2)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, slightly oversized roof and doorway, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The building stands on a thin round 10-sided low-poly base disk, flat grass-green top with brown earth sides, diameter just larger than the building footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: a narrow two-story colorful Rio townhouse: sunny yellow facade with cream trims, a small balcony on the upper floor with a chunky railing in deep navy, a terracotta roof, an arched front door in warm wood brown, two potted plants by the door.

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

## Prédio residencial — `rio-predio` (2x2)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, slightly oversized roof and doorway, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The building stands on a thin round 10-sided low-poly base disk, flat grass-green top with brown earth sides, diameter just larger than the building footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: a six-story Rio residential apartment building in the 1960s Copacabana style: cream and sky blue facade, wide horizontal balcony bands on every floor, a simple flat roof with a small water tank block, a ground floor lobby with a glass-free open entrance and a coral awning, a couple of plants on balconies. Tall but chunky, readable as a block.

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

## Prédio comercial — `rio-predio-comercial` (2x2)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, slightly oversized roof and doorway, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The building stands on a thin round 10-sided low-poly base disk, flat grass-green top with brown earth sides, diameter just larger than the building footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: an eight-story office building: deep navy and stone gray facade with tall vertical window strips in sky blue, a cream ground floor with shop fronts and coral awnings, a flat roof with a small antenna block, simple and bold.

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

## Hospital — `rio-hospital` (3x3)

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, slightly oversized roof and doorway, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. The building stands on a thin round 10-sided low-poly base disk, flat grass-green top with brown earth sides, diameter just larger than the building footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.

Subject: a city hospital: a clean three-story building in cream with sky blue window bands, a big plain coral cross shape on the facade (no letters), a covered ambulance entrance with a small white ambulance parked in front (coral stripe, no text), a second lower wing to the side, a flat roof with a helipad circle in sunny yellow, a strip of lawn and two round trees.

Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

