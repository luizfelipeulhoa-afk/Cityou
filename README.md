# Cityou

Organize sua vida e transforme progresso real em uma cidade sua, inspirada no Rio de Janeiro.

O app usa páginas Vue/Vite e um backend Cloudflare Worker com Durable Objects. A API local também roda pelo Wrangler e usa bancos locais isolados. O FastAPI legado foi removido.

## Requisitos

- Node.js 22.12+
- Git

## Executar localmente

```powershell
git clone https://github.com/CityouApp/Cityou.git
cd Cityou
npm ci
npx wrangler dev --port 8787 --ip 127.0.0.1
```

Em outro terminal, sirva o frontend pelo proxy local:

```powershell
npm run dev
```

Para HMR, abra primeiro `http://127.0.0.1:8787/` uma vez para receber o cookie da sessão local. Depois abra `http://127.0.0.1:5177/`. O Vite encaminha `/api` para o Worker em `127.0.0.1:8787`. Para rodar o site e a API juntos pelo Wrangler, use `npm run dev:worker` e abra `http://127.0.0.1:8787/`.

O banco local do Wrangler fica em `.wrangler/`. Nunca use `--remote` para este fluxo de desenvolvimento.

## Testes

```powershell
npm test
npm run test:worker
npm run test:map
npm run build
```

Os testes de navegador que precisam de conta ou de cidades em modo de teste usam `wrangler.test-session.jsonc` e dados locais sintéticos. Consulte `docs/CHECKPOINT.md` para os comandos de sessão, mapa e desempenho. Instale Chromium com `npx playwright install chromium` quando a rodada pedir navegador.

Os scripts de geração da base de alimentos continuam em Python e não fazem parte do servidor do app.

## Estado e limites

Este repositório publica o código e não um serviço hospedado. A API de produção usa Cloudflare Workers, D1 para contas e Durable Objects para os dados do jogo. Desenvolvimento e testes locais usam as bindings simuladas pelo Wrangler.

A planta interativa de 64 lotes é um estudo independente e ainda não substitui o terreno da cidade 3D. Veja [docs/CITYOU-MAP-STUDY.md](docs/CITYOU-MAP-STUDY.md), [docs/WORLD-MAP.md](docs/WORLD-MAP.md) e [docs/PLANO-PROXIMOS-PASSOS.md](docs/PLANO-PROXIMOS-PASSOS.md).

## Créditos e licenças

Cityou reutiliza partes do CubeCity (MIT), revisão `0191f5170872382954c15b7316f2e34d020d6d49`. O aviso original está preservado em [LICENSE](LICENSE). Fontes Figtree e Newsreader usam SIL Open Font License, com avisos em `public-fifones/fonts/licenses/`. Veja [proveniência](docs/PROVENANCE.md) e [licenças dos assets](ASSETS.md).
