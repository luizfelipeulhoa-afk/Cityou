"""Independent personal workspace. Existing city ledger and source data are preserved."""
from __future__ import annotations
import asyncio
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path
import sqlite3
import re
import uuid
from typing import Literal
from fastapi import HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

class Entry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['habit', 'goal', 'note', 'transaction', 'meal']
    title: str = Field(min_length=1, max_length=180)
    body: str = Field(default='', max_length=4000)
    category: str = Field(default='pessoal', max_length=50)
    amount_cents: int = Field(default=0, ge=0, le=100_000_000)
    direction: Literal['expense', 'income'] = 'expense'
    day: date
    target: int = Field(default=1, ge=1, le=10000)

    @field_validator('title')
    @classmethod
    def title_present(cls, value):
        if not value.strip(): raise ValueError('Escreva um título.')
        return value.strip()

class Toggle(BaseModel):
    model_config = ConfigDict(extra='forbid')
    done: bool

class NewTask(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=180)
    due_date: date | None = None


def register(application, root: Path, clock):
    db = root / 'personal.sqlite3'
    @contextmanager
    def connect():
        root.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(db, timeout=10)
        c.row_factory = sqlite3.Row
        c.execute("CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,kind TEXT,title TEXT,body TEXT,category TEXT,amount_cents INTEGER,direction TEXT,day TEXT,target INTEGER,created_at TEXT)")
        c.execute("CREATE TABLE IF NOT EXISTS checkins(entry_id TEXT,day TEXT,done INTEGER,PRIMARY KEY(entry_id,day),FOREIGN KEY(entry_id) REFERENCES entries(id))")
        try:
            with c:
                yield c
        finally:
            c.close()

    def today(): return clock().astimezone(__import__('zoneinfo').ZoneInfo('America/Sao_Paulo')).date()

    def local_data():
        with connect() as c:
            entries = [dict(r) for r in c.execute('SELECT * FROM entries ORDER BY created_at DESC')]
            checkins = [dict(r) for r in c.execute('SELECT * FROM checkins ORDER BY day DESC LIMIT 5000')]
        return dict(entries=entries, checkins=checkins, today=today().isoformat())

    @application.get('/api/personal')
    async def overview():
        start = today().replace(day=1)
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        paths = {'fitness':'/api/fitness', 'documents':'/api/documents', 'memories':'/api/memories', 'events':'/api/events'}
        async def read(key, path):
            try:
                data = await application.state.upstream.get(path, params={'start':start.isoformat(),'end':end.isoformat()} if key == 'events' else None)
                if not isinstance(data, dict if key == 'fitness' else list): raise ValueError()
                return key, dict(connected=True,data=data)
            except Exception:
                return key, dict(connected=False,data={} if key == 'fitness' else [])
        sources = dict(await asyncio.gather(*(read(k,p) for k,p in paths.items())))
        return {**local_data(), 'sources':sources}

    @application.get('/api/personal/documents/{ident}/cover')
    async def document_cover(ident: str):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', ident): raise HTTPException(404)
        try:
            result = await application.state.upstream.client.get('/api/documents/' + ident + '/cover')
            result.raise_for_status()
            mime = result.headers.get('content-type', '').split(';')[0]
            if mime not in ('image/jpeg','image/png','image/webp') or len(result.content) > 4_000_000:
                raise ValueError()
            return Response(result.content,media_type=mime,headers={'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'})
        except Exception:
            raise HTTPException(404, 'Capa indisponível.')

    @application.post('/api/personal/entries', status_code=201)
    async def create_entry(body: Entry):
        if body.kind == 'transaction' and body.amount_cents < 1:
            raise HTTPException(422, 'Informe um valor maior que zero.')
        if body.kind == 'meal' and body.day > today():
            raise HTTPException(422, 'Registre uma refeição já realizada.')
        ident = uuid.uuid4().hex
        with connect() as c:
            c.execute('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?,?,?)',(ident,body.kind,body.title,body.body,body.category,body.amount_cents,body.direction,body.day.isoformat(),body.target,clock().isoformat()))
        return {**local_data(), 'created_id':ident}

    @application.put('/api/personal/entries/{ident}/checkin')
    async def checkin(ident: str, body: Toggle):
        with connect() as c:
            row = c.execute('SELECT * FROM entries WHERE id=?',(ident,)).fetchone()
            if not row: raise HTTPException(404, 'Este item não existe.')
            if row['kind'] not in ('habit','goal'): raise HTTPException(422, 'Este item não tem conclusão diária.')
            c.execute('INSERT INTO checkins VALUES(?,?,?) ON CONFLICT(entry_id,day) DO UPDATE SET done=excluded.done',(ident,today().isoformat(),int(body.done)))
        return local_data()

    @application.post('/api/personal/tasks', status_code=201)
    async def create_task(body: NewTask):
        if not body.title.strip(): raise HTTPException(422, 'Escreva o nome da tarefa.')
        try:
            result = await application.state.upstream.client.post('/api/tasks', json={'title':body.title.strip(), 'due_date':body.due_date.isoformat() if body.due_date else None},headers={'X-Fifones':'1'})
            result.raise_for_status()
            return result.json()
        except Exception:
            raise HTTPException(503, 'Não foi possível salvar no Fifones original. Tente novamente; sua tarefa não foi confirmada.')
