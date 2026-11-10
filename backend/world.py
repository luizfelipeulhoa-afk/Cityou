"""Progresso do mapa-mundo BuildU: a cópia durável do que o navegador guarda em localStorage.

O progresso só avança, então juntar dois estados é uma união. Um reset aumenta a
"época"; quando as épocas diferem, vence a mais nova inteira, para um navegador
desatualizado não ressuscitar progresso apagado.
"""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Mesma ordem de src/world/worldSpaces.js (um teste confere a paridade).
SPACE_IDS = ('ilha-inicial', 'cristo-redentor', 'machu-picchu', 'chichen-itza',
             'coliseu', 'petra', 'taj-mahal', 'grande-muralha')
SpaceId = Literal[*SPACE_IDS]


class ProgressIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    versao: int = 1
    epoca: int = Field(default=0, ge=0, le=1_000_000)
    desbloqueados: list[SpaceId] = Field(default_factory=list, max_length=len(SPACE_IDS))
    concluidos: list[SpaceId] = Field(default_factory=list, max_length=len(SPACE_IDS))


class Progress(BaseModel):
    versao: int = 1
    epoca: int
    desbloqueados: list[str]
    concluidos: list[str]
    atualizado_em: str | None = None


def normalize(unlocked: set[str], completed: set[str]) -> tuple[list[str], list[str]]:
    """Regras do mapa: o primeiro espaço está sempre aberto; concluir N abre N e N+1."""
    done = [space for space in SPACE_IDS if space in completed]
    opened = {SPACE_IDS[0], *unlocked, *done}
    for space in done:
        index = SPACE_IDS.index(space)
        if index + 1 < len(SPACE_IDS):
            opened.add(SPACE_IDS[index + 1])
    return [space for space in SPACE_IDS if space in opened], done


def register(application, root: Path, clock) -> None:
    db = root / 'world.sqlite3'

    @contextmanager
    def connect():
        root.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(db, timeout=10)
        connection.execute('CREATE TABLE IF NOT EXISTS world_progress('
                           'space_id TEXT PRIMARY KEY, unlocked INTEGER NOT NULL, completed INTEGER NOT NULL)')
        connection.execute('CREATE TABLE IF NOT EXISTS world_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def read(connection: sqlite3.Connection) -> Progress:
        rows = connection.execute('SELECT space_id, unlocked, completed FROM world_progress').fetchall()
        meta = dict(connection.execute('SELECT key, value FROM world_meta').fetchall())
        unlocked, completed = normalize({r[0] for r in rows if r[1]}, {r[0] for r in rows if r[2]})
        return Progress(epoca=int(meta.get('epoch', 0)), desbloqueados=unlocked, concluidos=completed,
                        atualizado_em=meta.get('updated_at'))

    def write(connection: sqlite3.Connection, epoch: int, unlocked: list[str], completed: list[str]) -> None:
        connection.execute('DELETE FROM world_progress')
        connection.executemany('INSERT INTO world_progress VALUES(?,?,?)',
                               [(space, 1, int(space in completed)) for space in unlocked])
        stamp = clock().isoformat()
        connection.executemany('INSERT INTO world_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                               [('epoch', str(epoch)), ('updated_at', stamp)])

    @application.get('/api/world/progress')
    def world_progress() -> Progress:
        with connect() as connection:
            return read(connection)

    @application.put('/api/world/progress')
    def merge_world_progress(body: ProgressIn) -> Progress:
        """Junta o progresso do navegador ao guardado e devolve o resultado. Idempotente."""
        with connect() as connection:
            current = read(connection)
            if body.epoca < current.epoca:
                return current  # navegador de uma época antiga: fica com o estado do servidor
            if body.epoca > current.epoca:  # reset feito no navegador (ou banco novo): o corpo substitui tudo
                unlocked, completed = normalize(set(body.desbloqueados), set(body.concluidos))
            else:
                unlocked, completed = normalize({*current.desbloqueados, *body.desbloqueados},
                                                {*current.concluidos, *body.concluidos})
            if (body.epoca, unlocked, completed) != (current.epoca, current.desbloqueados, current.concluidos):
                write(connection, body.epoca, unlocked, completed)
            return read(connection)
