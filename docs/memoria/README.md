# Memória compartilhada do projeto (páginas revisadas)

Aqui ficam as páginas da memória do projeto que o time decidiu compartilhar. **Não é o wiki do ai-memory**: o wiki automático de cada pessoa fica no diretório de dados dela, fora do repositório, porque esse diretório também guarda o token de autenticação (motivo e instalação em [`docs/ai-memory.md`](../ai-memory.md)).

## Diferença para o repositório privado da memória
- **Aqui:** só páginas **revisadas**, visíveis a quem vê o repositório do app.
- **No repositório privado** (`cityou-memoria`, um ramo por pessoa; roteiro em [`docs/ai-memory.md`](../ai-memory.md)): o caderno **completo e bruto** de cada pessoa, para backup e leitura entre pessoas. Ele **não funde** as memórias.

## O que entra aqui
Só texto que ajude a próxima sessão a não repetir trabalho e que **alguém revisou**:
- abordagens que já falharam, e por quê;
- causas de bugs difíceis e como foram achadas;
- contexto de longo prazo que não é decisão do dono (decisões ficam em `docs/CHECKPOINT.md`).

## Como uma página entra
1. Ache a página no wiki local (`ai-memory status` mostra o diretório de dados; as páginas ficam em `wiki/`).
2. Copie para `docs/memoria/<assunto>.md` e **leia inteira**: tire segredo, token, e-mail, telefone ou qualquer dado pessoal ou de usuário, e tudo o que for só conversa da sessão.
3. Abra um PR. O que entra fica visível a quem vê o repositório.

## O que nunca entra
Segredos, `.env`, `.dev.vars`, o valor de `CITYOU_ADMIN_TOKEN`, dados de contas, dados pessoais do dono ou de usuários, e os arquivos `raw/`, `db/`, `models/` e `logs/` do ai-memory.

Ainda não há páginas aqui.
