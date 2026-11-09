# Verificação da primeira entrega — 3 de novembro de 2026

- Backend: 36 testes aprovados em bancos temporários e fontes mockadas (25 da
  cidade/recompensas e 11 de atividade/conectores). Incluem idempotência,
  concorrência, colisão, rotação ao mover, restauração, offline, limites de origem,
  datas de São Paulo, expiração, privacidade e ausência de recompensa por atividade.
- Navegador isolado: 17 cenários aprovados usando Chrome real, produção compilada,
  backend e fonte sintética nas portas 8876/8875. Zero erros de console. Casos:
  conclusão+10 uma vez, construção GLB, mover/girar, colisão, reabrir salvo,
  demolição confirmada, ampliação, melhoria visual, escritório interno, giro no
  pivô, trabalho/espera/término dos conectores e zoom acima do terreno.
- Cena: composição de material e atividade conferida em oito cenários Three.js,
  incluindo seleção, uso manual, movimento reduzido, expiração e remoção.
- Integração pessoal: fonte local conectada, 10 tarefas carregadas, cidade na
  revisão inicial com 50 moedas e 7 posições iniciais. Nenhuma tarefa real foi
  concluída pelos testes. Não foram criados habitantes/agentes de teste no banco.
- Aba do usuário: recarregada e conferida na própria janela do app; missões,
  catálogo e Conexões presentes, sem aviso de desconexão.
- Build Vite aprovado. npm audit reportou zero vulnerabilidades nesta verificação.
  Esse resultado não substitui uma revisão de segurança independente.

Resultados reproduzíveis: .verification/browser-results.json. Prévias dos cenários
com prédios construídos: .verification/city-playtest-day.png e
.verification/city-playtest-dusk.png. A cidade dessas imagens é de teste, separada
por completo da cidade pessoal. O código não contém API para inserir saldo livre.

Não foi consumida voz Gemini, validado áudio real, medido FPS em uma cidade grande,
configurado novo conector nem publicado o aplicativo. O funcionamento de cada IA
em uso real depende dos conectores existentes e da validade do sinal recebido.

Fonte original CubeCity, revisão e licenças: docs/PROVENANCE.md.


## UI e experiência de construção — 3 de novembro de 2026

- Skill oficial GSAP Core instalada no projeto em `.agents/skills/gsap-core`.
  Referências consultadas: frontend-design, threejs-animation, missões e expansão
  de City Mania (Gameloft), recompensas de SimCity BuildIt (EA).
- Objetivo de construção escolhido pelo usuário, salvo como preferência local.
  Saldo, recompensa e contagem de ações permanecem no ledger do servidor.
- Três marcos derivados de fatos: primeira recompensa, espaço funcional
  construído e dez ações recompensadas. Sem bônus por construir/demolir,
  sem perda por ausência e sem contagem de tarefas anteriores como novas.
- Catálogo com doze miniaturas PNG transparentes renderizadas dos modelos e
  geometrias reais, sem IA ou alterações no banco pessoal.
- Animação de construção única após confirmação; celebração apenas quando o
  total ganho aumenta. Carregar a página não repete o prêmio. Movimento reduzido
  respeitado e tweens removidos com a construção.
- 36 testes Python e 5 testes de progressão aprovados. Chrome real: 22 cenários
  em cidade sintética, incluindo metas persistentes sem gasto, conquistas,
  progresso do nível, construção, recarga, celular e movimento reduzido.
- Prévia pessoal apenas de leitura; o usuário evoluiu sua cidade durante a
  implementação. Nenhum teste concluiu tarefas pessoais.


## Novo app pessoal separado da cidade — 3 de novembro de 2026

- Referência confirmada: Néctar brasileiro. Novo shell, estilo, navegação,
  formulários e telas pessoais; nenhuma imagem/código do Néctar foi copiada.
- Treze abas: Seu dia, Tarefas, Agenda, Hábitos, Metas, Fitness, Alimentação,
  Autoconhecimento, Estudos, Finanças, Projetos, Biblioteca e Memórias.
- Entrada principal `/`; cidade independente `/city.html` ou aba Minha cidade.
  Conferido que o início não carrega bundle/canvas Three.js. CSS da cidade isolado.
- Fontes pessoais existentes preservadas; avaliação/voz, professor, mapas de
  projeto, Obsidian e edição completa de agenda continuam em painéis dos módulos
  anteriores. A nova UI não implica reimplementação dessas integrações.
- Registros novos em `data/personal.sqlite3`; cidade em `data/city.sqlite3`.
  Lançamentos só somam o novo ledger, sem inventar saldos das planilhas antigas.
- 36 testes anteriores aprovados, 12 contratos pessoais em bancos temporários,
  e 10 cenários de navegador pessoal aprovados: criação de hábito, marcar,
  desmarcar, recarga, metas, centavos, notas, refeição, tarefa original, recompensa
  da cidade, menu, celular e movimento reduzido. Os 22 cenários da cidade também
  passaram após separar o HTML. Nenhum dado de teste foi salvo no perfil pessoal.
- Conferência pessoal de leitura: 13 abas, fontes carregadas, zero erros de página
  ou requisições, sem overflow horizontal a 390px. Capturas em
  `.verification/personal-desktop.png` e `.verification/personal-mobile.png`.
- Build multi-entry aprovado. Relatórios reproduzíveis em
  `.verification/personal-results.json` e `.verification/browser-results.json`.
