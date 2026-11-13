# Prompts dos personagens (Nano Banana 2 Pro)

Seguem `docs/DESIGN-SYSTEM.md` (paleta, faceta, luz). Versão adulta (13/11/2026), menos infantil: proporção de cerca de 6 cabeças, rosto definido e calmo, nada de cabeça grande nem sorriso de desenho. Diferenças em relação aos prédios: sem disco de base, pose em A para o rig do Tripo, tom de pele e roupa em áreas planas separadas para trocar a cor no jogo.

Passos: vista principal (1:1, 2K) até aprovar; folha de 4 vistas com o template do design system, trocando "building" por "character" e mantendo a pose nos quatro painéis; recorte em 4 imagens; Tripo H3.1 Multiview, pbr desligado, `face_limit` 3.500 (explorador) e 2.500 (tartaruga); rig automático para o explorador, com "parado", "andando" e "comemorando". Variações de cor ficam por material no jogo, não por modelo.

## Explorador (avatar base do jogador) — `character-explorer`

```
Stylized low-poly 3D game character for a mobile game. Faceted, flat-shaded polygons with visible planar faces, matte and clean, mature stylized proportions (about 6 heads tall, narrow shoulders-to-waist ratio, natural limb length, normal-sized hands and feet), not chibi, not cartoonish, no oversized head. Calm, confident adult look with a simple defined face: a small angular nose, a straight neutral mouth, narrow almond eyes in dark brown, simple brow ridge, no teeth. Simple bold readable silhouette. No text, no letters, no logos, no thin wires, no tiny details. Limited palette only, muted and natural: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion. Pure white seamless background, single character, full body fully visible and centered with generous margin, feet on an invisible floor (no base disk).

Subject: a young adult island explorer, gender-neutral, medium warm skin tone (a flat tan between sand and terracotta), short tousled dark-brown hair in one simple shape, a fitted cream linen shirt with rolled sleeves, deep navy utility trousers rolled at the calf, warm wood brown leather boots, a stone gray cloth belt with one small pouch, a thin terracotta scarf at the neck. Keep skin, hair, shirt and trousers as separate flat color areas without gradients, so the colors can be swapped later.

Neutral A-pose for rigging: standing straight, arms slightly away from the body at about 30 degrees, hands relaxed and open, legs slightly apart, calm face looking forward. Three-quarter front view, camera at chest height, front-right facing the viewer.
```

## Mascote guia: Tartaruga-marinha — `character-mascot`

```
Stylized low-poly 3D game character for a mobile game. Faceted, flat-shaded polygons with visible planar faces, matte and clean, mature stylized proportions (about 6 heads tall, narrow shoulders-to-waist ratio, natural limb length, normal-sized hands and feet), not chibi, not cartoonish, no oversized head. Calm, confident adult look with a simple defined face: a small angular nose, a straight neutral mouth, narrow almond eyes in dark brown, simple brow ridge, no teeth. Simple bold readable silhouette. No text, no letters, no logos, no thin wires, no tiny details. Limited palette only, muted and natural: grass green #80d06e, dark green #4ea477, sand #f7e4ab, sea teal #56dad4, sky blue #a6dcff, cream #f6efdf, terracotta #D9644A, warm wood brown #B07A4F, stone gray #a99f98, sunny yellow #ffd166, coral #ea7651, deep navy #2E3A59. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion. Pure white seamless background, single character, full body fully visible and centered with generous margin, flippers on an invisible floor (no base disk).

Subject: a wise adult sea turtle as a guide character, realistic proportions, walking on four strong flippers (not upright, not humanoid). A large faceted shell in dark green and grass green with clear angular plates and a few worn stone gray edges, a sand-colored underside, a sea teal and stone gray head with calm half-closed dark eyes and a slightly pointed beak, no smile. One small rope-and-driftwood charm tied at the front of the shell. Length about the height of a human character's waist. Standing pose seen from the three-quarter front, flippers slightly spread.
```

