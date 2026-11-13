# Prompts dos personagens (Nano Banana 2 Pro)

Seguem `docs/DESIGN-SYSTEM.md` (paleta e estilo). Diferenças em relação aos prédios: sem disco de base, pose em A (A-pose) para o rig do Tripo, olhos e boca simples, tom de pele e roupa em áreas planas separadas para poder trocar a cor no jogo. Primeiro personagem: Explorador; depois Tortuguinha. Os dois são propostas (o mascote e o visual podem mudar).

Passos: vista principal (1:1, 2K) até aprovar; depois folha de 4 vistas com o template do design system, trocando "building" por "character" e mantendo a A-pose nos quatro painéis; recorte em 4 imagens; Tripo H3.1 Multiview, pbr desligado, `face_limit` 2.500 (explorador) e 2.000 (mascote); rig automático do Tripo com animações "parado", "andando" e "comemorando". Variações de cor (pele, cabelo, roupa) ficam por material no jogo, não por modelo.

## Explorador (avatar base do jogador) — `character-explorer`

```
Stylized low-poly 3D game character for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy proportions (head about one third of the total height, short body, short limbs, big hands and feet), simple bold readable silhouette. Face with only two round dark eyes and a small simple smile, no nose detail, no eyebrows, no teeth. No text, no letters, no logos, no thin wires, no tiny details, no accessories smaller than a fist. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single character, full body fully visible and centered with generous margin, feet on an invisible floor (no base disk).

Subject: a friendly young island explorer, gender-neutral, medium warm skin tone (a flat tan close to sand and terracotta), short rounded dark-brown hair in one simple shape, a sunny yellow T-shirt, deep navy shorts, warm wood brown sandals, a small cream cloth bag across the chest, a thin coral cloth headband. Bare arms and legs so the skin color can be swapped later; keep skin, hair, shirt and shorts as separate flat color areas without gradients.

Neutral A-pose for rigging: standing straight, arms slightly away from the body at about 30 degrees, palms open facing down, legs slightly apart, relaxed face looking forward. Three-quarter front view, camera at chest height, front-right facing the viewer.
```

## Mascote guia: Tortuguinha — `character-mascot`

```
Stylized low-poly 3D game character for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy proportions (head about one third of the total height, short body, short limbs, big hands and feet), simple bold readable silhouette. Face with only two round dark eyes and a small simple smile, no nose detail, no eyebrows, no teeth. No text, no letters, no logos, no thin wires, no tiny details, no accessories smaller than a fist. Limited palette only: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single character, full body fully visible and centered with generous margin, feet on an invisible floor (no base disk).

Subject: a small friendly sea turtle mascot standing upright on two short back legs, as a guide character. Round faceted shell in grass green and dark green with a few big hexagon plates, a sand-colored belly, a rounded sea teal head with two big round dark eyes and a small smile, short stubby front flippers held slightly open, a tiny coral scarf around the neck. Same A-pose idea: front flippers slightly away from the body. Height about two thirds of a human character.

Neutral A-pose for rigging: standing straight, arms slightly away from the body at about 30 degrees, palms open facing down, legs slightly apart, relaxed face looking forward. Three-quarter front view, camera at chest height, front-right facing the viewer.
```

