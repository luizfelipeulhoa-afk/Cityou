#!/bin/bash
# Início de sessão do Cityou.
# 1. Lembra de ler o CLAUDE.md, o checkpoint, o plano e os tropeços antes de qualquer trabalho, e avisa quando
#    o CLAUDE.md do branch difere do da main (o arquivo carregado na sessão é o do branch).
# 2. Nas sessões na nuvem, instala as dependências do npm quando o que decide a instalação mudou.
# O que este script escreve na saída entra no contexto da sessão. Ele nunca derruba a sessão.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

echo "ANTES DE QUALQUER TRABALHO NESTE PROJETO: leia o CLAUDE.md inteiro (na versão da main), docs/CHECKPOINT.md, docs/PLANO-PROXIMOS-PASSOS.md e docs/known-issues.md."

if timeout 20 git fetch --quiet origin main 2>/dev/null; then
  if ! git diff --quiet HEAD origin/main -- CLAUDE.md 2>/dev/null; then
    echo "ATENÇÃO: o CLAUDE.md deste branch difere do da main. Leia a versão da main antes de continuar: git show origin/main:CLAUDE.md"
  fi
  behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
  if [ "${behind:-0}" -gt 0 ]; then
    echo "A main tem ${behind} commit(s) que este branch não tem. Os mais recentes:"
    git log --oneline HEAD..origin/main 2>/dev/null | head -15
  fi
else
  echo "Não consegui buscar a main agora. Confira à mão: git fetch origin main"
fi

# Dependências do npm: só na nuvem, e só quando package.json, package-lock.json ou este script mudaram
# desde a última instalação que deu certo. O arquivo de hashes fica dentro de node_modules (fora do git).
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  hashes=node_modules/.session-start.sha256
  if ! sha256sum --check --status "$hashes" 2>/dev/null; then
    rm -f "$hashes"
    if npm install --ignore-scripts --no-audit --no-fund >/dev/null 2>&1; then
      sha256sum .claude/hooks/session-start.sh package.json package-lock.json > "$hashes" 2>/dev/null || rm -f "$hashes"
    else
      echo "A instalação das dependências falhou. Rode npm install à mão antes dos testes."
    fi
  fi
fi

exit 0
