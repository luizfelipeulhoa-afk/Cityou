# Ideia: animação "enxame de agentes" (proposta, 13/11/2026)

**Só informativo.** Não decide nada; o `CLAUDE.md` e o `docs/CHECKPOINT.md` mandam. Origem: prompt do dono para uma página-demonstração.

## O pedido original, resumido
Uma página única (HTML, CSS e JS puros, sem biblioteca, só fontes do Google Fonts) em que 12 cursores com etiqueta de nome (Claude, Codex, Layout, Copy, Pixel, Motion, Tipo, Ícone, Grid, Cor, Revisor, Deploy; cores #E5484D, #2F6BFF, #FFC53D, #111111) constroem sozinhos, ao mesmo tempo, três telas de um app de celular fictício ("Fôlego", respiração e caminhada: Boas-vindas, Início, Perfil), 30 blocos no total.

- Cada cursor: contorno tracejado com a medida em px, depois preenche (digita, ilustração, botão, anel de progresso) e solta; anda em curva suave, às vezes para para "pensar", e pula de uma tela para outra.
- Painel "LOG DOS AGENTES" (tempo + o que cada um fez), contador "CONSTRUÍDO n / 30", botões "PULAR" e "Ver de novo".
- Fundo #F4F3EF, títulos em Instrument Serif, etiquetas em JetBrains Mono, uns 14 s, cabe em 1440 × 900 e em 390 de largura sem rolagem lateral.
- Nada de pessoa, marca ou logo reais.

## Como serve ao Cityou
1. **Página de apresentação (`index.html`, `src/landing/`):** trocar a demonstração do ciclo do jogo por "a cidade se constrói sozinha": os cursores constroem os prédios do Rio (os GLB já existentes) e o painel de log conta o que cada um fez. Mostra o produto sem texto longo.
2. **Painel e cidade:** o log com tempo e autor serve de modelo para o histórico de ações da Fita do Tempo (etapa 8): "00:02.4 · você construiu o Quiosque de coco".
3. **Nosso próprio fluxo:** o painel "log dos agentes + construído n/N" é um bom desenho para acompanhar os workflows de agentes (orquestrador e executores do `CLAUDE.md`).

## Cuidados
- O pedido original grava em `index.html`: aqui isso **sobrescreveria a página de apresentação**. Se for virar código, faça num arquivo à parte (por exemplo `demo-enxame.html` ou dentro de `src/landing/`) e passe pelo build da landing (`vite.landing.config.js`).
- Respeitar `prefers-reduced-motion` e a acessibilidade (conteúdo final legível, botão PULAR por teclado).
- Fora do escopo das etapas 5 a 8; entra como etapa própria só com decisão do dono.
