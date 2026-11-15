# Backend local da Fifones City

Execute a partir da raiz com `python -m backend`. O servidor escuta somente
`127.0.0.1:8766`; depende de `fastapi`, `uvicorn`, `httpx` e `tzdata`. O banco é exclusivo,
`data/city.sqlite3`, criado somente no startup. `CITY_DATA_DIR` pode mudar essa
pasta. Nenhum arquivo ou banco do Fifones original é aberto pelo backend.
`FIFONES_UPSTREAM` aceita somente uma origem HTTP de loopback, por padrão
`http://127.0.0.1:8765`; redirects e proxies de ambiente estão desativados.

- `GET /api/health`: `{app: 'fifones-city', status: 'ok'}`.
- `GET /api/city`: snapshot completo com revision, credits, earned, level,
  unlock_radius, started_at, placements, catalog, history e source.
- `POST /api/city/actions`: type build/move/rotate/remove/upgrade,
  expected_revision, request_id e campos específicos da ação. Retorna snapshot.
- `POST /api/rewards/sync`: corpo vazio ou `{}`; retorna snapshot.
- `GET /api/workspace/tasks`: `{connected,tasks,message}`. Tarefas preservam
  id/title/status/completed_at do Fifones real.
- `POST /api/workspace/tasks/{id}/complete`: corpo vazio ou `{}`; encaminha
  exclusivamente POST /api/tasks/{id}/complete com X-Fifones:1, confirma o
  resultado em GET /api/tasks/{id}, sincroniza e retorna snapshot.
- `GET /api/workspace/projects`: `{connected,projects,message}`.
- `GET /api/workspace/activity`: `{connected,activity,message}`; activity vem
  exclusivamente de GET /api/assistant/city-activity.

Writes aceitam `X-Cityou-Request: 1` ou `X-Fifones-City: 1` durante a transição. Host e Origin precisam ser locais; Origin,
quando presente, precisa usar a mesma porta do Host. Os erros de domínio têm
`{message,detail,city}`; `city` é o snapshot atual, inclusive em conflito 409.
A validação de schema usa o formato 422 padrão do FastAPI. Sync e conclusão
retornam 503 quando os fatos necessários não podem ser confirmados. Ações de
construção continuam disponíveis offline com o saldo já salvo.

A grade é 17x17. x/y ancoram o canto superior esquerdo; rotações ímpares trocam
width/depth. Move aceita rotation opcional; posição e orientação são validadas e salvas atomicamente. Todos os quadrados precisam caber no raio e não colidir. Core
plaza/headquarters tem 1x1 e é protegido. As ruas iniciais são construções
normais. Melhorias custam custo-base * nível atual, no máximo até nível 3;
remoção devolve floor(custo-base/2). Melhorias não produzem renda.

O grant de boas-vindas é 50, uma única vez, sem aumentar earned. Cada tarefa
concluída após o início ganha 10 uma única vez por id vitalício; cada hábito
verificado ganha 5 uma vez por id/dia. O Fifones atual possui um hábito inicial
único, identificado internamente como fitness-first-habit. Conclusões antigas
observadas são registradas como excluídas, para que reabrir/reconcluir não as
converta em novas recompensas. Datas futuras ou sem timezone são ignoradas. Dias de hábito usam explicitamente America/Sao_Paulo, independentemente do timezone do host.
Earned é a soma de moedas verificadas; a cada dez recompensas, level aumenta 1
e unlock_radius aumenta de 3 até 8. Não existe recompensa por tempo ou punição.

O ledger, as alterações, revisões e deduplicação de request_id usam transações
SQLite BEGIN IMMEDIATE. A repetição de um request_id com o mesmo payload
normalizado retorna a resposta original, mesmo depois de reiniciar. Reusar o id
para outro payload retorna 409. O frontend deve gerar ids novos para novas ações.

Testes: `python -m pytest tests/test_backend.py -q -p no:cacheprovider`.
Todos usam diretórios temporários e httpx.MockTransport, sem dados reais.
