# Skills de terceiros neste repositório

Kit montado em 10/11/2026 para o trabalho no BuildU (mapa-mundo, UI, backend e desempenho). Cada skill é uma cópia fixada por commit, para ser revisável e não mudar sozinha.

## Origem

| Skills | Origem | Commit | Licença |
|---|---|---|---|
| prompt-master | [nidhinjs/prompt-master](https://github.com/nidhinjs/prompt-master) | `49b3a72` (22/10/2026) | MIT |
| gsap-core, gsap-timeline, gsap-performance, gsap-frameworks | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) (oficial) | `aed9cfd` (21/04/2026) | MIT |
| threejs-performance, threejs-shaders, threejs-loaders, threejs-asset-pipeline, threejs-interaction, threejs-geometry | [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) | `0e18186` (19/10/2026) | MIT |
| threejs-game-ui-designer, threejs-debug-profiler, threejs-qa-release, threejs-3d-generator | [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) | `8286774` (27/09/2026) | MIT |
| vue-best-practices | [vuejs-ai/skills](https://github.com/vuejs-ai/skills) | `198f0cd` (23/10/2026) | MIT |
| performance, core-web-vitals, accessibility, web-quality-audit | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | `afa8da9` (24/08/2026) | MIT |
| emil-design-eng, animation-performance | [emilkowalski/skills](https://github.com/emilkowalski/skills) | `715c180` (09/11/2026) | MIT |
| workers-best-practices, wrangler, web-perf | [cloudflare/skills](https://github.com/cloudflare/skills) | `6eb6c78` (06/11/2026) | Apache-2.0 |
| async-python-patterns, api-design-principles | [wshobson/agents](https://github.com/wshobson/agents) | `9c61ab2` (08/11/2026) | MIT |
| durable-objects, cloudflare-email-service | [cloudflare/skills](https://github.com/cloudflare/skills) | `cbf893b` (10/11/2026) | Apache-2.0 |
| threejs-gameplay-systems (só `SKILL.md` e `references/`) | [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) | `8286774` (27/09/2026) | MIT |
| ux-heuristics | [wondelai/skills](https://github.com/wondelai/skills) | `d8d5d75` (02/11/2026) | MIT |
| form-design | [owl-listener/designer-skills](https://github.com/owl-listener/designer-skills) | `9a6930c` (05/09/2026) | MIT |
| find-skills | [vercel-labs/skills](https://github.com/vercel-labs/skills) | `e781cb4` (10/11/2026) | MIT |
| council-review (só `SKILL.md`) | [ngmeyer/council-review](https://github.com/ngmeyer/council-review) | `e9a9ee3` (30/05/2026) | MIT |
| owasp-security | [agamm/claude-code-owasp](https://github.com/agamm/claude-code-owasp) | `1ae29cb` (03/11/2026) | MIT |
| threejs-lighting, threejs-materials, threejs-textures, threejs-postprocessing | [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) | `0e18186` (19/10/2026) | MIT |
| ui-ux-pro-max, design-system, ui-styling, design | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `6ae86f6` (10/11/2026) | MIT |
| impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `c1e0e54` (10/11/2026) | Apache-2.0 |
| gsap-plugins, gsap-utils, gsap-scrolltrigger | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) (oficial) | `aed9cfd` (21/04/2026) | MIT |
| frontend-design | `SKILL.md` da pesquisa de skills feita no Gemini (11/11/2026), baseada na skill frontend-design da Anthropic | sem commit | conforme o `LICENSE.txt` citado no frontmatter |
| fastapi | pacote `fastapi==0.141.1` do PyPI (`fastapi/.agents/skills/fastapi`) | wheel 0.141.1 | MIT |

Os textos de licença estão em `LICENSES/`.

## O que foi copiado

Só arquivos `.md` (o `SKILL.md` e as referências de cada skill). Ficaram de fora, de propósito:

- `threejs-3d-generator/scripts/threejs_3d_asset.py` (cliente da API do Tripo, 1.522 linhas) e `threejs-qa-release/scripts/inspect-threejs-canvas.mjs` (601 linhas). Sem o script, a `threejs-3d-generator` serve como referência, mas não gera modelos. O script só entra depois de lido por inteiro.
- `web-quality-audit/scripts/analyze.sh`, `api-design-principles/assets/rest-api-template.py` e os `agents/openai.yaml` das skills de jogo.
- `vue-debug-guides` (140 arquivos, 585 KB): peso demais para o repositório.
- Configurações de plugin, hooks e servidores MCP dos repositórios de origem. Do Cloudflare vieram só as skills, sem o servidor MCP remoto.

## Revisão feita

- 13/11/2026: entraram 6 skills (10 arquivos `.md`): `council-review`, `owasp-security` e quatro de Three.js. Varredura automática igual às anteriores (instruções para ignorar regras, esconder algo, burlar permissões, comandos perigosos, segredos, caracteres invisíveis), sem achados; as ocorrências de `token`, `eval` e `.env` na `owasp-security` são o próprio assunto da skill. Sem leitura linha a linha. A `council-review` tem 17 estrelas, o README diz que o repositório foi arquivado, e ela lança de 11 a 14 subagentes por rodada: use em decisão de risco, não em rotina. Avaliadas e não instaladas (motivo em `docs/PLANO-PROXIMOS-PASSOS.md`): Agent Reach, llm-council, Deep-Research-skills, agent-council, threejs-aaa-graphics-builder, security-review da Sentry, playwright-best-practices.

- 11/11/2026: entraram 9 skills (88 arquivos `.md`). Varredura automática igual à anterior, sem achados relevantes. Só os `.md` foram copiados; os scripts Python, CSVs, fontes e o CLI da `impeccable` ficaram de fora. As menções a `GEMINI_API_KEY` e similares na `design` são exemplos de configuração, nada foi configurado.

- Varredura automática em todos os 85 arquivos antes da cópia, procurando: instruções para ignorar regras, esconder algo do usuário, burlar permissões, comandos de shell perigosos, leitura de segredos, ativação forçada e caracteres invisíveis. Nenhum achado relevante. Os hosts citados são de documentação (`developers.cloudflare.com`, `web.dev`, `gsap.com`, `api.tripo3d.ai` e similares).
- Conferido o frontmatter (`name` e `description`) das 28 skills.
- **Não** houve leitura linha a linha de todos os arquivos nesta etapa. Cada skill é lida ao ser usada.

Observações:

- A descrição da `vue-best-practices` diz "MUST be used for Vue.js tasks". É o texto original e faz a skill carregar em qualquer tarefa de Vue.
- As skills de Three.js da CloudAI-X miram a r186. Este projeto fixa `three@0.172.0`: confira cada API em `node_modules/three` antes de aplicar.
- O próprio `vuejs-ai/skills` avisa que é um projeto experimental e pode ter imprecisões.

## Atualizar

1. Clone a origem, compare com a pasta daqui (`diff -r`) e leia o que mudou.
2. Copie de novo só os `.md` e atualize o commit na tabela.
3. Para a `fastapi`, extraia a pasta do wheel da versão em `backend/requirements.txt`.

## Skills próprias (sem origem externa)

| Skill | De onde veio | Data |
|---|---|---|
| `reflect` | Escrita neste repositório, para fechar cada sessão de trabalho | 13/11/2026 |
| `council-especialistas`, `ponytail`, `behavior-design-etico`, `gamificacao-saude-etica`, `project-timeline-synthesizer`, `test-suite-generator` | Cópia das skills da conta do responsável, a pedido dele, para o repositório funcionar em qualquer conta ou IA. Só o `SKILL.md` de cada uma | 13/11/2026 |

- A `test-suite-generator` gera testes em Python (pytest): só serve ao `backend/`, que sai na etapa 6.
- A `council-especialistas` e a `council-review` fazem o mesmo papel. A primeira é a do responsável e usa de 3 a 4 especialistas quando o escopo é estreito.
- A `supply-chain-risk-auditor` da mesma conta **não** foi copiada: o arquivo não traz origem nem licença.
