# Entrada Python do Cityou

O backend local inicia com `python -m backend`. O Python executa [backend/__main__.py](../backend/__main__.py), que sobe o Uvicorn em `127.0.0.1:8766` e carrega `backend.app:app`. [backend/app.py](../backend/app.py) expõe `create_app()` para criar instâncias de teste com dados e integrações isolados.

## Rodar localmente

Na raiz do checkout, em PowerShell:

```powershell
python -m venv .venv
& ./.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
& ./.venv/Scripts/python.exe -m backend
```

Confira `GET http://127.0.0.1:8766/api/health`. Para abrir a interface em desenvolvimento, execute `npm run dev` em outro terminal. O Vite encaminha `/api` para o backend local por padrão.

## Dados e testes

| Componente | Persistência |
|---|---|
| [Cidade](../backend/app.py) | `city.sqlite3` para construções, saldo e histórico |
| [Painel pessoal](../backend/personal.py) | `personal.sqlite3` para registros e check-ins |
| [Mapa-mundo](../backend/world.py) | `world.sqlite3` para progresso |

Os arquivos ficam em `data/` por padrão. Defina `CITY_DATA_DIR` para apontar o processo para uma pasta separada. O conector legado usa `FIFONES_UPSTREAM`, por padrão `http://127.0.0.1:8765`, com origem HTTP limitada a loopback. Veja o [README do backend](../backend/README.md) para o contrato das rotas.

```powershell
& ./.venv/Scripts/python.exe -m pytest tests -q
```

O backend usa `America/Sao_Paulo`. Instale os requisitos completos para que o Python encontre o fuso no Windows. Os testes existentes usam diretórios temporários e integrações simuladas.

## Aplicação publicada

No Cloudflare, a entrada é [worker/index.js](../worker/index.js), configurada em [wrangler.jsonc](../wrangler.jsonc). O Worker guarda dados em SQLite nos Durable Objects. O D1 para contas e sessões precisa de um binding. Na configuração deste checkout, esse binding está comentado. A remoção do FastAPI legado está planejada na etapa 6 do [checkpoint](CHECKPOINT.md). Veja também o [histórico de benchmarks](BENCHMARKS.md).
