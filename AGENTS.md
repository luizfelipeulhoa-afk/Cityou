# Agentes de IA neste repositório

Antes de qualquer trabalho neste projeto, leia o `CLAUDE.md` inteiro, na versão da `main`
(`git fetch origin main && git show origin/main:CLAUDE.md`), e os três arquivos que ele manda ler:
`docs/CHECKPOINT.md` (estado e próximo passo), `docs/PLANO-PROXIMOS-PASSOS.md` (o plano) e
`docs/known-issues.md` (tropeços conhecidos).

As regras do `CLAUDE.md` valem para qualquer agente (Claude, Codex ou outro). Este arquivo existe só para
levar até lá quem não lê o `CLAUDE.md` por conta própria. Não repita as regras aqui.

Memória de longo prazo: o projeto usa o `ai-memory` (veja `docs/ai-memory.md`). O wiki de cada pessoa fica fora do
repositório; o que o time compartilha vai em `docs/memoria/` (por PR e revisado) ou no repositório privado `cityou-memoria`,
via `ai-memory-wikisync`. Nunca grave segredo, `.env` ou dado
pessoal ou de usuário na memória. O `docs/CHECKPOINT.md` continua sendo o estado oficial.
