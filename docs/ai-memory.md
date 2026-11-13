# ai-memory: memória de longo prazo do projeto

Decisão do dono (13/11/2026): adotar o [`akitaonrails/ai-memory`](https://github.com/akitaonrails/ai-memory) como a memória de longo prazo das sessões de IA deste projeto, compartilhada entre quem trabalha nele. Este arquivo diz o que ele é, o que há no repositório, como instalar com versão fixada, o que ele captura e o que **nunca** deve entrar. **Nada é instalado nem ligado sozinho:** cada pessoa instala o programa no próprio computador.

## O que é
Um único binário em Rust (CLI, servidor MCP/HTTP local e hooks de ciclo de vida) que guarda o que aconteceu nas sessões dos agentes (Claude Code, Codex, Cursor, Gemini CLI e outros) como **páginas de wiki em Markdown**, e devolve esse contexto na sessão seguinte, mesmo trocando de ferramenta. A fonte da verdade são arquivos `.md` num repositório git próprio; o banco SQLite é só índice derivado. No caminho padrão **não há chamada a modelo de linguagem**.

## Procedência e varredura (13/11/2026)
| | |
|---|---|
| Repositório | `akitaonrails/ai-memory` |
| Versão e commit | v3.4.6, `a11eff2` (12/11/2026) |
| Licença | MIT |
| O que foi lido | `README.md`, `DATA_HANDLING.md`, `INSTALL_FOR_AGENTS.md`, `SECURITY.md`, `docs/marker-file.md`, `docs/backup.md`, `install.sh`, a pasta `hooks/`; busca por padrões perigosos em `hooks/`, `install.sh`, `install.ps1` e `scripts/` |
| Não foi lido | O código Rust (13 crates) linha a linha. **O binário não foi executado.** |

Achados, sem nada grave:
- **Local por padrão, sem telemetria**, sem verificação automática de atualização. Os hooks falam só com o servidor local (`127.0.0.1:49374`).
- O `install.sh` confere o SHA-256 publicado, não usa `sudo`, mexe só em `~/.local/lib/ai-memory` e `~/.local/bin` e só aceita https. O `install.sh` publicado na release `v3.4.6` é **idêntico** ao do commit lido (SHA-256 `bac95bc26ed8ab5751117283a3568fa52c341b38294440cd1bb808056d0f0395`).
- Os "padrões perigosos" que apareceram são scripts de teste do próprio projeto e comentários. O único caractere invisível encontrado é um BOM dentro de uma regex de um hook do PowerShell, que serve para ignorá-lo.
- **Um download por padrão:** na primeira partida o servidor baixa um modelo de embeddings (~87 MB, `huggingface.co`, SHA-256 fixado no código). Nenhum conteúdo vai junto. Para evitar, `embedding_provider = "none"` na configuração do ai-memory.
- **Caminhos que mandam conteúdo para fora, todos desligados por padrão:** `embedding_provider` de nuvem (o texto de todas as páginas), `llm_provider` (observações e páginas), `capture_assistant` (texto final do assistente, com opt-in duplo), reranker por modelo e webhooks de admissão. **Não ligue nenhum deles** sem decisão do dono.
- Não há criptografia em repouso: vale a permissão do sistema de arquivos.

## O que há no repositório
- [`.ai-memory.toml`](../.ai-memory.toml): marcador que faz toda cópia e todo worktree do projeto cair no mesmo workspace e projeto (`cityou`), e lista caminhos que o hook **não** captura.
- [`docs/memoria/`](memoria/README.md): onde entram, por PR e revisadas, as páginas da memória que o time quer compartilhar.
- Regras curtas em `CLAUDE.md` e `AGENTS.md`.
- Proteções em `.gitignore` para o caso de alguém apontar o diretório de dados para dentro do repositório.

## Onde fica a memória de verdade (e por que não dentro do repositório)
A decisão original era guardar o wiki em `docs/memoria/`. A leitura do ai-memory mostrou que **isso não é seguro nem prático**:
- O diretório de dados (`data_dir`, padrão `~/.local/share/ai-memory`) guarda também **o token de autenticação** (`auth-tokens/default`), o banco e os registros brutos. Apontá-lo para dentro do repositório poria um segredo na árvore do projeto.
- O `wiki/` é **um repositório git próprio** (o ai-memory faz commit nele a cada consolidação). Aninhá-lo no repositório do projeto cria um repositório dentro de outro.
- O ai-memory compartilha com o time por **um servidor único** (todos apontam para ele). O `git remote` do wiki é **backup de um wiki só** (`docs/backup.md` do ai-memory), não sincronização entre pessoas: dois wikis empurrados para o mesmo ramo têm históricos sem relação e o push é recusado.

Arranjo adotado (13/11/2026): **A + B + C agora, e D como objetivo.** O dono quer a memória **junta** entre pessoas e IAs, para evitar problemas de comunicação; isso só o servidor único (D) entrega. A, B e C valem enquanto não houver servidor.

| | O que é | O que faz | O que não faz |
|---|---|---|---|
| **A. Caderno individual** | O wiki no diretório de dados de cada pessoa, fora do repositório | Memória automática da pessoa: o contexto volta na sessão seguinte, mesmo em outra IA | Ninguém mais vê |
| **B. Páginas revisadas** | [`docs/memoria/`](memoria/README.md), por PR | Compartilha com quem vê o repositório o que importa, já revisado | É manual: só entra o que alguém copia e revisa |
| **C. Repositório privado da memória** | Um repositório privado só para os cadernos, **um ramo por pessoa** | Backup do caderno de cada um; os outros podem **ler** | **Não funde** os cadernos numa busca só |
| **D. Servidor único** | Um servidor do ai-memory que todos usam | Memória realmente fundida e compartilhada | **Objetivo do dono.** Exige um servidor sempre ligado (Docker), autenticação por token ou contas e TLS fora do loopback (`SECURITY.md` e `docs/deploy.md` do ai-memory). **Falta decidir onde hospedar** |

### Repositório privado da memória (backup e leitura entre pessoas)
**O dono cria** (a sessão que escreveu isto só alcança o repositório do projeto): um repositório **privado**, sem README, nome sugerido `CityouApp/cityou-memoria`, com acesso só para quem vai usar. Se o nome for outro, troque a linha do `git remote add`.

Por pessoa, depois de instalar o ai-memory e de ele ter gerado alguma página:

```bash
data_dir=$(ai-memory status --json | jq -r .data_dir)
cd "$data_dir/wiki"
git remote add memoria git@github.com:CityouApp/cityou-memoria.git
git push memoria HEAD:refs/heads/<seu-nome>          # um ramo por pessoa; repita de tempos em tempos

# ler o caderno de um colega (só leitura)
git fetch memoria <ramo-do-colega>
git log FETCH_HEAD --oneline                          # ou: git show FETCH_HEAD:<caminho-da-pagina>
```

- **Um ramo por pessoa:** é o que evita o push recusado. Nunca empurre para o ramo de outra pessoa.
- **Só `push` e leitura.** Não rode `merge`, `rebase` nem `force-push` dentro do `wiki/` com o servidor ligado (o ai-memory escreve nele por libgit2 e avisa para não fazer isso).
- **Olhe o `wiki/` antes do primeiro push.** As páginas guardam o texto ao pé da letra: procure segredo, token, e-mail e dado pessoal ou de usuário. Repositório **privado** não é desculpa para deixar passar.
- Os registros `log.md` não vão no git do wiki, e é melhor que não vão mesmo (são eventos brutos). O exemplo de backup agendado do ai-memory (`docs/examples/backup/`, com cópia do SQLite) é opcional e pode conter segredos: só use depois de ler.
- O que um colega escreveu e vale para todos vira página em [`docs/memoria/`](memoria/README.md), por PR e revisada.
- **Não verificado:** estes comandos vêm da documentação do ai-memory (`docs/backup.md`); o binário não foi executado e nenhum `git push memoria` foi feito. Quem rodar primeiro registre em `docs/known-issues.md` o que tropeçar.

## Instalar (por pessoa, versão fixada, sem `curl | sh`)
Pré-requisito: `git`. Leia antes `INSTALL_FOR_AGENTS.md` e `docs/install.md` do ai-memory se quiser.

```bash
# 1) baixe o instalador DA VERSÃO FIXADA (não o "latest") e confira o hash
curl -fsSLo /tmp/ai-memory-install.sh https://github.com/akitaonrails/ai-memory/releases/download/v3.4.6/install.sh
sha256sum /tmp/ai-memory-install.sh        # no macOS: shasum -a 256
# tem de ser: bac95bc26ed8ab5751117283a3568fa52c341b38294440cd1bb808056d0f0395

# 2) leia o arquivo e só então rode (ele confere o SHA-256 do binário e só toca ~/.local)
less /tmp/ai-memory-install.sh
AI_MEMORY_VERSION=3.4.6 sh /tmp/ai-memory-install.sh
```

SHA-256 publicados na release `v3.4.6` para cada pacote (o instalador já os confere; ficam aqui para detectar troca depois):

| Plataforma | `ai-memory-<plataforma>.tar.gz` |
|---|---|
| `linux-x86_64` | `cde3c286bd81854a6b724746b86fe5def5ffd0c9a46ee7abccfa00796561b791` |
| `linux-aarch64` | `635d537b2ea0118f30c54f0bff813ce187d6664993766d69965447fe1d3253af` |
| `macos-x86_64` | `b5eec84356cc3d165e94b6a65f9163634ab4fcf6faa59e4e7da0fa3e743bb781` |
| `macos-aarch64` | `130d85f7b9084d3518a3b4b63adff17b521c482e4fb5f64067a7287ee9704c8b` |

Depois, **veja o que o `setup` faria antes de aplicar** (os comandos de instalação só gravam com `--apply`; sem a flag mostram o plano):

```bash
ai-memory install-hooks --agent claude-code          # mostra o que gravaria
ai-memory install-mcp --client claude-code           # idem
```

Ligar de fato (cria o diretório de dados com o token em arquivo só do dono, sobe um serviço por usuário, registra o MCP e os hooks do harness):

```bash
ai-memory setup --agent claude-code     # acrescente --no-service se o servidor rodar de outro jeito
```

Reinicie o Claude Code depois. Em projeto com muito histórico, `ai-memory bootstrap` uma vez. Para evitar o download do modelo, ponha `embedding_provider = "none"` na configuração antes da primeira partida.

**Desinstalar:** `ai-memory uninstall --apply` remove o que o `setup` ligou, serviço incluído.

## O que o hook captura (e o que nunca deve entrar)
Os hooks mandam ao servidor local os eventos da sessão (prompts, chamadas de ferramenta, início e fim) como observações sanitizadas; no fim viram páginas de wiki. **Tudo o que você digita e tudo o que uma ferramenta lê numa sessão pode virar memória.** Por isso:
- **Nunca** cole segredos, chaves, tokens, cookies, `.env`, `.dev.vars`, o valor de `CITYOU_ADMIN_TOKEN` ou dados de contas de usuário numa sessão com o ai-memory ligado.
- **Nunca** guarde dados pessoais do dono ou de usuários (e-mail, telefone, endereço). O `.ai-memory.toml` do repositório já manda ignorar `.env*`, `.dev.vars`, `data/`, chaves e bancos, mas o `ignore_paths` é filtro de melhor esforço: não enxerga comandos de shell e ferramentas que ele não conhece.
- O texto final do assistente **não** é capturado (exige opt-in duplo). Deixe assim.
- O wiki é texto de verdade: **revise antes de copiar qualquer página para `docs/memoria/`**, porque o que entra no repositório fica visível a quem vê o repositório.

## Como usamos junto com o resto do projeto
- **`docs/CHECKPOINT.md` continua sendo o estado oficial:** etapas, decisões do dono, próximo passo. A memória guarda contexto de longo prazo e o que já deu errado (abordagens descartadas, causas de bugs), não decisões.
- No começo de uma sessão, depois da leitura obrigatória do `CLAUDE.md`, vale consultar a memória (`memory_query` pelo MCP) sobre o assunto antes de refazer uma investigação.
- Nada aqui é verificado de ponta a ponta: o binário não foi executado e nenhuma sessão real usou os hooks ou o MCP. Quem instalar primeiro registre em `docs/known-issues.md` o que tropeçar.
