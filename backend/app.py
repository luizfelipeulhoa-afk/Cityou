"""A separate, local city ledger. Never opens or changes the Fifones database.

Upstream writes are limited to task creation and fixed task completion endpoints. All currency is
calculated from verified upstream facts; city actions use a serial SQLite ledger.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
from typing import Annotated, Any, Callable, Literal
from urllib.parse import quote, urlsplit
import uuid
from zoneinfo import ZoneInfo

from .activity import normalize_activity, valid_primary

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints

ROOT = Path(__file__).resolve().parent.parent
LOCAL_HOSTS = frozenset({'localhost', '127.0.0.1', '::1'})
SOURCE_OFFLINE = 'Fifones indisponível. Suas construções e moedas estão salvas.'
CORE = frozenset({'headquarters', 'plaza'})
CITY_TIMEZONE = ZoneInfo('America/Sao_Paulo')


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def local_url(value: str) -> str:
    parsed = urlsplit(value)
    try:
        parsed.port
    except ValueError as exc:
        raise ValueError('FIFONES_UPSTREAM deve ser uma URL local válida.') from exc
    if (parsed.scheme != 'http' or parsed.hostname not in LOCAL_HOSTS
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ('', '/')):
        raise ValueError('FIFONES_UPSTREAM permite somente http em localhost, 127.0.0.1 ou ::1.')
    return value.rstrip('/')


CATALOG = json.loads((ROOT / 'shared/game/city-catalog.json').read_text(encoding='utf-8'))
KINDS = {entry['id']: entry for entry in CATALOG}


class Action(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    type: Literal['build', 'move', 'rotate', 'remove', 'upgrade']
    expected_revision: Annotated[StrictInt, Field(ge=0)]
    request_id: Annotated[str, StringConstraints(min_length=1, max_length=100, pattern=r'^[A-Za-z0-9_.:-]+$')]
    kind: Annotated[str, StringConstraints(max_length=40)] | None = None
    x: Annotated[StrictInt, Field(ge=0, le=16)] | None = None
    y: Annotated[StrictInt, Field(ge=0, le=16)] | None = None
    rotation: Annotated[StrictInt, Field(ge=0, le=3)] | None = None
    placement_id: Annotated[str, StringConstraints(min_length=1, max_length=100)] | None = None


class CityError(Exception):
    def __init__(self, code: int, message: str):
        self.code, self.message = code, message


class Store:
    def __init__(self, data_dir: Path, clock: Callable[[], datetime]):
        self.path = data_dir / 'city.sqlite3'
        self.clock = clock
        self.lock = threading.RLock()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=15000')
        return connection

    @contextmanager
    def transaction(self):
        with self.lock:
            connection = self.connect()
            try:
                connection.execute('BEGIN IMMEDIATE')
                yield connection
                connection.commit()
            except BaseException:
                connection.rollback()
                raise
            finally:
                connection.close()

    def initialize(self) -> None:
        # Disk writes happen at application startup, never at module import.
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = self.connect()
        try:
            connection.execute('PRAGMA journal_mode=WAL')
            connection.executescript('''
                CREATE TABLE IF NOT EXISTS city (
                    id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0,
                    credits INTEGER NOT NULL CHECK(credits>=0), earned INTEGER NOT NULL DEFAULT 0,
                    reward_count INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS placements (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, x INTEGER NOT NULL,
                    y INTEGER NOT NULL, rotation INTEGER NOT NULL, level INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS rewards (
                    source_key TEXT PRIMARY KEY, amount INTEGER NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL,
                    amount INTEGER NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS requests (
                    request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT NOT NULL);
            ''')
        finally:
            connection.close()
        with self.transaction() as connection:
            at = iso(self.clock())
            seeded = connection.execute(
                'INSERT OR IGNORE INTO city(id,credits,started_at) VALUES(1,50,?)', (at,)).rowcount
            if seeded:
                connection.execute('INSERT INTO history(label,amount,created_at) VALUES(?,?,?)',
                                   ('Boas-vindas à cidade', 50, at))
                entries = [('core-plaza', 'plaza', 8, 8), ('core-headquarters', 'headquarters', 8, 7)]
                entries += [(f'seed-road-{x}', 'road', x, 9) for x in range(6, 11)]
                connection.executemany('INSERT INTO placements VALUES(?,?,?,?,0,1)', entries)

    @staticmethod
    def snapshot_in(connection: sqlite3.Connection, source: dict, target: str | None = None) -> dict:
        state = dict(connection.execute('SELECT * FROM city WHERE id=1').fetchone())
        placements = [dict(row) for row in connection.execute('SELECT * FROM placements ORDER BY rowid')]
        for placement in placements:
            if placement['kind'] == 'stunt' and target:
                placement['target'] = target
        return dict(revision=state['revision'], credits=state['credits'], earned=state['earned'],
                    reward_count=state['reward_count'],
                    level=1 + state['reward_count'] // 10,
                    unlock_radius=min(8, 3 + state['reward_count'] // 10),
                    started_at=state['started_at'], placements=placements,
                    catalog=CATALOG,
                    history=[dict(row) for row in connection.execute(
                        'SELECT label,amount,created_at FROM history ORDER BY id DESC LIMIT 100')],
                    source=source)

    def snapshot(self, source: dict, target: str | None = None) -> dict:
        connection = self.connect()
        try:
            # Keep the metadata, placements and ledger in one consistent read snapshot.
            connection.execute('BEGIN')
            return self.snapshot_in(connection, source, target)
        finally:
            connection.close()

    @staticmethod
    def cells(placement: dict) -> set[tuple[int, int]]:
        kind = KINDS[placement['kind']]
        width, depth = kind['width'], kind['depth']
        if placement['rotation'] % 2:
            width, depth = depth, width
        return {(placement['x'] + dx, placement['y'] + dy)
                for dx in range(width) for dy in range(depth)}

    def validate_site(self, connection: sqlite3.Connection, candidate: dict, radius: int) -> None:
        cells = self.cells(candidate)
        if any(not (0 <= x <= 16 and 0 <= y <= 16 and abs(x - 8) <= radius and abs(y - 8) <= radius)
               for x, y in cells):
            raise CityError(422, 'A construção precisa caber inteiramente no terreno liberado.')
        for row in connection.execute('SELECT * FROM placements WHERE id<>?', (candidate['id'],)):
            if cells & self.cells(dict(row)):
                raise CityError(409, 'Esse espaço já está ocupado.')

    def action(self, action: Action, source: dict, target: str | None) -> dict:
        encoded = json.dumps(action.model_dump(), sort_keys=True, separators=(',', ':'))
        fingerprint = hashlib.sha256(encoded.encode()).hexdigest()
        with self.transaction() as connection:
            existing = connection.execute('SELECT * FROM requests WHERE request_id=?', (action.request_id,)).fetchone()
            if existing:
                if existing['fingerprint'] != fingerprint:
                    raise CityError(409, 'Esse request_id já foi usado para outra ação.')
                return json.loads(existing['response'])
            state = dict(connection.execute('SELECT * FROM city WHERE id=1').fetchone())
            if action.expected_revision != state['revision']:
                raise CityError(409, 'A cidade mudou. O estado mais recente foi recarregado.')
            radius = min(8, 3 + state['reward_count'] // 10)
            at, amount = iso(self.clock()), 0
            if action.type == 'build':
                if action.kind not in KINDS or action.kind in CORE:
                    raise CityError(422, 'Escolha uma construção disponível no catálogo.')
                if action.x is None or action.y is None or action.placement_id is not None:
                    raise CityError(422, 'Construir exige tipo e coordenadas válidos.')
                placement = dict(id=uuid.uuid4().hex, kind=action.kind, x=action.x, y=action.y,
                                 rotation=action.rotation if action.rotation is not None else 0, level=1)
                self.validate_site(connection, placement, radius)
                amount = -KINDS[action.kind]['cost']
                label = f"Construiu {KINDS[action.kind]['label']}"
            else:
                if not action.placement_id:
                    raise CityError(422, 'Escolha uma construção da cidade.')
                row = connection.execute('SELECT * FROM placements WHERE id=?', (action.placement_id,)).fetchone()
                if not row:
                    raise CityError(404, 'A construção não existe mais.')
                placement = dict(row)
                if placement['kind'] in CORE:
                    raise CityError(422, 'A praça e a sede são o centro permanente da cidade.')
                if action.kind is not None:
                    raise CityError(422, 'Essa ação não altera o tipo de construção.')
                catalog_item = KINDS[placement['kind']]
                if action.type == 'move':
                    if action.x is None or action.y is None:
                        raise CityError(422, 'Mover exige x e y válidos.')
                    placement.update(x=action.x, y=action.y)
                    if action.rotation is not None:
                        placement['rotation'] = action.rotation
                    self.validate_site(connection, placement, radius)
                    label = f"Moveu {catalog_item['label']}"
                elif action.type == 'rotate':
                    if action.rotation is None or action.x is not None or action.y is not None:
                        raise CityError(422, 'Girar exige uma orientação entre 0 e 3.')
                    placement['rotation'] = action.rotation
                    self.validate_site(connection, placement, radius)
                    label = f"Girou {catalog_item['label']}"
                elif action.type == 'remove':
                    if any(value is not None for value in (action.x, action.y, action.rotation)):
                        raise CityError(422, 'Remover exige apenas o identificador da construção.')
                    amount = catalog_item['cost'] // 2
                    label = f"Removeu {catalog_item['label']}"
                else:
                    if any(value is not None for value in (action.x, action.y, action.rotation)):
                        raise CityError(422, 'Melhorar exige apenas o identificador da construção.')
                    if placement['level'] >= 3:
                        raise CityError(422, 'A construção já alcançou o nível máximo.')
                    amount = -catalog_item['cost'] * placement['level']
                    placement['level'] += 1
                    label = f"Melhorou {catalog_item['label']} para nível {placement['level']}"
            if state['credits'] + amount < 0:
                raise CityError(422, 'Moedas insuficientes. Conclua tarefas ou hábitos reais para ganhar mais.')
            if action.type == 'remove':
                connection.execute('DELETE FROM placements WHERE id=?', (placement['id'],))
            else:
                connection.execute('''INSERT INTO placements VALUES(:id,:kind,:x,:y,:rotation,:level)
                    ON CONFLICT(id) DO UPDATE SET x=excluded.x,y=excluded.y,
                    rotation=excluded.rotation,level=excluded.level''', placement)
            connection.execute('UPDATE city SET credits=credits+?,revision=revision+1 WHERE id=1', (amount,))
            connection.execute('INSERT INTO history(label,amount,created_at) VALUES(?,?,?)', (label, amount, at))
            response = self.snapshot_in(connection, source, target)
            connection.execute('INSERT INTO requests VALUES(?,?,?)',
                               (action.request_id, fingerprint, json.dumps(response, ensure_ascii=False)))
            return response

    def ignore_historical(self, tasks: list[dict], fitness: dict | None = None) -> None:
        """Remember already completed tasks even if they are later reopened."""
        with self.transaction() as connection:
            start = timestamp(connection.execute('SELECT started_at FROM city WHERE id=1').fetchone()[0])
            for task in tasks:
                completed = timestamp(task.get('completed_at'))
                if task.get('id') and task.get('status') == 'done' and completed and completed < start:
                    connection.execute('INSERT OR IGNORE INTO rewards VALUES(?,0,?)',
                                       ('task:' + str(task['id']), iso(self.clock())))
            for checkin in (fitness or {}).get('checkins', []):
                if not isinstance(checkin, dict):
                    continue
                updated = timestamp(checkin.get('updated_at'))
                try:
                    day = date.fromisoformat(checkin.get('day', ''))
                except (ValueError, TypeError):
                    continue
                if checkin.get('status') == 'done' and updated and updated < start:
                    ident = str(checkin.get('habit_id') or 'fitness-first-habit')
                    connection.execute('INSERT OR IGNORE INTO rewards VALUES(?,0,?)',
                                       (f'habit:{ident}:{day.isoformat()}', iso(self.clock())))

    def reconcile(self, tasks: list[dict], fitness: dict) -> None:
        self.ignore_historical(tasks, fitness)
        with self.transaction() as connection:
            start = timestamp(connection.execute('SELECT started_at FROM city WHERE id=1').fetchone()[0])
            now = self.clock().astimezone(timezone.utc)
            local_day = now.astimezone(CITY_TIMEZONE).date()
            start_day = start.astimezone(CITY_TIMEZONE).date()
            earned, count = 0, 0
            candidates = []
            for task in tasks:
                completed = timestamp(task.get('completed_at'))
                if task.get('id') and task.get('status') == 'done' and completed and start <= completed <= now:
                    candidates.append(('task:' + str(task['id']), 10, f"Tarefa concluída: {str(task.get('title', 'Tarefa'))[:200]}"))
            for checkin in fitness.get('checkins', []):
                if not isinstance(checkin, dict):
                    continue
                updated = timestamp(checkin.get('updated_at'))
                try:
                    day = date.fromisoformat(checkin.get('day', ''))
                except (ValueError, TypeError):
                    continue
                if checkin.get('status') == 'done' and updated and start <= updated <= now and start_day <= day <= local_day:
                    # The real upstream has one first habit, with checkins keyed by day.
                    ident = str(checkin.get('habit_id') or 'fitness-first-habit')
                    candidates.append((f'habit:{ident}:{day.isoformat()}', 5, f'Hábito concluído: {day.isoformat()}'))
            for key, amount, label in candidates:
                if connection.execute('INSERT OR IGNORE INTO rewards VALUES(?,?,?)', (key, amount, iso(now))).rowcount:
                    earned += amount
                    count += 1
                    connection.execute('INSERT INTO history(label,amount,created_at) VALUES(?,?,?)', (label, amount, iso(now)))
            if count:
                connection.execute('''UPDATE city SET credits=credits+?,earned=earned+?,
                    reward_count=reward_count+?,revision=revision+1 WHERE id=1''', (earned, earned, count))


class UpstreamUnavailable(Exception):
    pass


class Upstream:
    def __init__(self, client: httpx.AsyncClient, url: str):
        self.client, self.url = client, url

    def source(self, connected: bool) -> dict:
        return dict(connected=connected, url=self.url,
                    message='Fifones conectado. Recompensas vêm de ações reais.' if connected else SOURCE_OFFLINE)

    async def get(self, path: str, *, params: dict | None = None, headers: dict | None = None) -> Any:
        try:
            response = await self.client.get(path, params=params, headers=headers)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise UpstreamUnavailable from exc

    async def tasks(self) -> list[dict]:
        data = await self.get('/api/tasks', params={'status': 'all'})
        if not isinstance(data, list) or any(not isinstance(row, dict) or not row.get('id') for row in data):
            raise UpstreamUnavailable
        return data

    async def projects(self) -> list[dict]:
        data = await self.get('/api/projects')
        if not isinstance(data, list) or any(not isinstance(row, dict) for row in data):
            raise UpstreamUnavailable
        return data

    async def fitness(self) -> dict:
        data = await self.get('/api/fitness')
        if not isinstance(data, dict) or not isinstance(data.get('checkins'), list):
            raise UpstreamUnavailable
        return data

    async def complete(self, task_id: str) -> dict:
        path = '/api/tasks/' + quote(task_id, safe='')
        try:
            response = await self.client.post(path + '/complete', headers={'X-Fifones': '1'})
            if response.status_code == 404:
                raise CityError(404, 'A tarefa não existe mais no Fifones.')
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise UpstreamUnavailable from exc
        task = await self.get(path)
        if not isinstance(task, dict) or str(task.get('id')) != task_id or task.get('status') != 'done':
            raise UpstreamUnavailable
        return task


def create_app(*, data_dir: str | Path | None = None, upstream_url: str | None = None,
               transport: httpx.AsyncBaseTransport | None = None,
               clock: Callable[[], datetime] = utc_now,
               static_dir: str | Path | None = None) -> FastAPI:
    url = local_url(upstream_url or os.environ.get('FIFONES_UPSTREAM', 'http://127.0.0.1:8765'))
    store = Store(Path(data_dir or os.environ.get('CITY_DATA_DIR', str(ROOT / 'data'))).resolve(), clock)
    dist = Path(static_dir).resolve() if static_dir else ROOT / 'dist'

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        store.initialize()
        async with httpx.AsyncClient(base_url=url, transport=transport, timeout=3,
                                     follow_redirects=False, trust_env=False) as client:
            application.state.upstream = Upstream(client, url)
            application.state.source = application.state.upstream.source(False)
            application.state.stunt_target = None
            application.state.stunt_project_id = None
            tasks, fitness = await asyncio.gather(application.state.upstream.tasks(),
                                                  application.state.upstream.fitness(), return_exceptions=True)
            if not isinstance(tasks, BaseException):
                store.ignore_historical(tasks, fitness if isinstance(fitness, dict) else None)
                application.state.source = application.state.upstream.source(True)
            yield

    application = FastAPI(title='Fifones City', docs_url=None, redoc_url=None,
                          openapi_url=None, lifespan=lifespan)
    application.state.store = store

    @application.middleware('http')
    async def local_guard(request: Request, call_next):
        host = request.headers.get('host', '')
        try:
            parsed_host = urlsplit('http://' + host)
            hostname = parsed_host.hostname
            parsed_host.port
            valid_host = (hostname in LOCAL_HOSTS and not parsed_host.username and not parsed_host.password
                          and not parsed_host.path and not parsed_host.query and not parsed_host.fragment)
        except ValueError:
            valid_host = False
        if not valid_host:
            return JSONResponse({'message': 'A cidade aceita somente acesso local.'}, status_code=403)
        origin = request.headers.get('origin')
        if origin:
            try:
                parsed = urlsplit(origin)
                valid_origin = (parsed.scheme == request.url.scheme and parsed.hostname in LOCAL_HOSTS
                                and parsed.port == urlsplit('http://' + host).port
                                and not parsed.username and not parsed.password and not parsed.path
                                and not parsed.query and not parsed.fragment)
            except ValueError:
                valid_origin = False
            if not valid_origin:
                return JSONResponse({'message': 'Origem local inválida.'}, status_code=403)
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.headers.get('X-Fifones-City') != '1':
            return JSONResponse({'message': 'A ação exige X-Fifones-City: 1.'}, status_code=403)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store' if request.url.path.startswith('/api/') else 'no-cache'
        return response

    @application.exception_handler(CityError)
    async def city_error(request: Request, exc: CityError):
        snapshot = store.snapshot(application.state.source, application.state.stunt_target)
        return JSONResponse({'message': exc.message, 'detail': exc.message, 'city': snapshot}, status_code=exc.code)

    @application.exception_handler(UpstreamUnavailable)
    async def source_error(request: Request, exc: UpstreamUnavailable):
        application.state.source = application.state.upstream.source(False)
        return JSONResponse({'message': SOURCE_OFFLINE, 'detail': SOURCE_OFFLINE,
                             'city': store.snapshot(application.state.source, application.state.stunt_target)}, status_code=503)

    async def refresh_source() -> dict:
        upstream = application.state.upstream
        try:
            tasks = await upstream.tasks()
            store.ignore_historical(tasks)
            application.state.source = upstream.source(True)
        except UpstreamUnavailable:
            application.state.source = upstream.source(False)
        return application.state.source

    async def refresh_target() -> None:
        try:
            projects = await application.state.upstream.projects()
            target = next((project for project in projects if
                           'stuntsync' in re.sub(r'[^a-z0-9]', '', str(project.get('name', '')).lower())), None)
            ident = str(target.get('id', '')) if target else ''
            application.state.stunt_project_id = ident if re.fullmatch(r'[A-Za-z0-9_-]{1,128}', ident) else None
            application.state.stunt_target = '/#/projetos/' + ident if application.state.stunt_project_id else None
        except UpstreamUnavailable:
            application.state.stunt_target = None
            application.state.stunt_project_id = None
            application.state.stunt_project_id = None

    @application.get('/api/health')
    async def health():
        return {'app': 'fifones-city', 'status': 'ok'}

    @application.get('/api/city')
    async def get_city():
        await asyncio.gather(refresh_source(), refresh_target())
        return store.snapshot(application.state.source, application.state.stunt_target)

    @application.post('/api/city/actions')
    async def city_action(action: Action):
        return store.action(action, application.state.source, application.state.stunt_target)

    @application.get('/api/workspace/tasks')
    async def workspace_tasks():
        try:
            tasks = await application.state.upstream.tasks()
            store.ignore_historical(tasks)
            application.state.source = application.state.upstream.source(True)
            return dict(connected=True, tasks=tasks, message='Tarefas reais do Fifones.')
        except UpstreamUnavailable:
            application.state.source = application.state.upstream.source(False)
            return dict(connected=False, tasks=[], message=SOURCE_OFFLINE)

    @application.get('/api/workspace/projects')
    async def workspace_projects():
        try:
            projects = await application.state.upstream.projects()
            return dict(connected=True, projects=projects, message='Projetos reais do Fifones.')
        except UpstreamUnavailable:
            return dict(connected=False, projects=[], message=SOURCE_OFFLINE)

    @application.get('/api/workspace/activity')
    async def workspace_activity():
        upstream = application.state.upstream
        primary, browser, bots, _ = await asyncio.gather(
            upstream.get('/api/assistant/city-activity'),
            upstream.get('/api/browser-activity', headers={'X-Fifones': '1'}),
            upstream.get('/api/bot-office/bots'),
            refresh_target(), return_exceptions=True)
        connected = valid_primary(primary)
        activity = normalize_activity(primary, browser, bots, now=clock(),
                                      place_ids=KINDS, stunt_project_id=application.state.stunt_project_id)
        return dict(connected=connected, activity=activity,
                    message='Sinais recentes dos conectores do Fifones.' if connected
                    else 'Fonte principal indisponível. Apenas sinais opcionais recentes são exibidos.')

    async def reconcile() -> dict:
        tasks, fitness = await asyncio.gather(application.state.upstream.tasks(), application.state.upstream.fitness())
        store.reconcile(tasks, fitness)
        application.state.source = application.state.upstream.source(True)
        return store.snapshot(application.state.source, application.state.stunt_target)

    @application.post('/api/rewards/sync')
    async def reward_sync(request: Request):
        # No client-supplied currency or fact payload is accepted.
        if (await request.body()).strip() not in (b'', b'{}'):
            raise HTTPException(422, 'A sincronização não aceita valores ou fatos do cliente.')
        return await reconcile()

    @application.post('/api/workspace/tasks/{task_id}/complete')
    async def complete_task(task_id: str, request: Request):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', task_id):
            raise HTTPException(422, 'Identificador de tarefa inválido.')
        if (await request.body()).strip() not in (b'', b'{}'):
            raise HTTPException(422, 'Concluir não aceita alterações ou valores do cliente.')
        await application.state.upstream.complete(task_id)
        return await reconcile()

    from .personal import register as register_personal
    register_personal(application, Path(data_dir or os.environ.get('CITY_DATA_DIR', str(ROOT / 'data'))).resolve(), clock)
    from .world import register as register_world
    register_world(application, Path(data_dir or os.environ.get('CITY_DATA_DIR', str(ROOT / 'data'))).resolve(), clock)

    # Keep APIs above mounts. A missing build never falls back to the old app.
    @application.get('/')
    async def index():
        page = dist / 'index.html'
        if page.is_file():
            return FileResponse(page)
        return JSONResponse({'message': 'Fifones City: execute npm run build para gerar a interface.'}, status_code=503)

    models = ROOT / 'public-fifones' / 'models'
    if models.is_dir():
        application.mount('/models', StaticFiles(directory=models), name='models')
    if dist.is_dir():
        application.mount('/', StaticFiles(directory=dist, html=True), name='city-static')
    return application


app = create_app()
