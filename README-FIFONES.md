> Documento de referencia da instalacao original. Para instalar e executar a copia publica Cityou, siga o README.md da raiz. Os atalhos locais citados abaixo pertencem a instalacao original e nao fazem parte desta copia.

# Cityou — espaço pessoal e cidade

A página inicial agora é um app de organização pessoal com interface nova,
inspirada no Néctar brasileiro. A cidade continua independente e preservada.

## Abrir

- `Abrir Cityou.cmd`: novo espaço pessoal, http://127.0.0.1:8766/.
- `Abrir Cityou Cidade.cmd`: cidade diretamente, http://127.0.0.1:8766/city.html.
- A aba Minha cidade também abre a cidade dentro do novo app.

Ambos usam o servidor local. Nada foi publicado na internet. O iniciador preserva
os serviços originais e a ponte documentada anteriormente em `tools/source_bridge.py`.

## Abas e funções

Seu dia, Tarefas, Agenda, Hábitos, Metas, Fitness, Alimentação, Autoconhecimento,
Estudos, Finanças, Projetos, Biblioteca e Memórias. O menu pode recolher para
ícones e vira um menu móvel em telas pequenas.

Tarefas são consultadas/criadas/concluídas no Fifones original. A conclusão ainda
reconcilia o ledger da cidade, com proteção contra moedas duplicadas.
Agenda, pesagens, documentos e memórias são lidos das fontes existentes. Capas
são obtidas por um endpoint local fixo e possuem alternativa quando indisponíveis.

Hábitos diários, metas em passos, notas, refeições e lançamentos financeiros
são persistidos em `data/personal.sqlite3`. Valores financeiros usam centavos
inteiros. Os totais NÃO incluem automaticamente planilhas ou contas anteriores.
Hábitos novos não prometem moedas: a recompensa diária da cidade ainda usa o
check-in Fitness existente. Desmarcar um hábito não apaga sua anotação.

A cidade continua em `data/city.sqlite3`, sem alteração da economia existente.
Não carrega Three.js no início pessoal: possui documento, bundle e CSS próprios.
Modelos de prédios e créditos de licença CubeCity permanecem preservados.

## Recursos avançados preservados

A avaliação por voz/Gemini, professor, leitura detalhada, mapas de projeto,
Obsidian e edição completa de agenda continuam nos módulos anteriores,
acessíveis em um painel interno identificado como Fifones original. A nova UI
não afirma ter reimplementado essas integrações nem ativa microfone por conta própria.
Não há transcrição/IA nova ou análise nutricional por foto adicionada nesta entrega.

## Verificar

`npm run build`
`python -m pytest tests/test_backend.py tests/test_activity.py tests/test_personal.py -q`
`node tools/personal-playtest.mjs` — fonte sintética 8885 e banco temporário 8886.
`node tools/browser-playtest.mjs` — cidade sintética 8875/8876.
`node tools/personal-preview.mjs` — conferência visual pessoal apenas de leitura.

Os dados pessoais, capturas e bancos de teste são ignorados pelo Git.

Nome do aplicativo atualizado para **Cityou**. Fifones permanece como nome do
assistente e da integração anterior. Identificadores técnicos, caminhos e bancos
existentes foram mantidos para preservar a compatibilidade e os dados.
