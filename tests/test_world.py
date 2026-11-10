"""Contrato da API de progresso do mapa-mundo, em bancos temporários."""
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import re
import unittest

import httpx
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.world import SPACE_IDS

WRITE = {'X-Fifones-City': '1'}
URL = '/api/world/progress'


class WorldProgressTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.contexts = []
        self.client = self.open()

    def open(self):
        app = create_app(data_dir=self.temp.name,
                         transport=httpx.MockTransport(lambda request: httpx.Response(404, json={})),
                         clock=lambda: datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc))
        context = TestClient(app, base_url='http://127.0.0.1:8766')
        self.contexts.append(context)
        return context.__enter__()

    def tearDown(self):
        for context in self.contexts:
            context.__exit__(None, None, None)
        self.temp.cleanup()

    def put(self, **body):
        return self.client.put(URL, headers=WRITE, json=body)

    def test_ids_match_the_frontend_spaces(self):
        source = (Path(__file__).resolve().parents[1] / 'src' / 'world' / 'worldSpaces.js').read_text(encoding='utf-8')
        self.assertEqual(tuple(re.findall(r"^\s+id: '([a-z-]+)'", source, re.M)), SPACE_IDS)

    def test_starts_with_only_the_island_unlocked(self):
        data = self.client.get(URL).json()
        self.assertEqual(data['desbloqueados'], ['ilha-inicial'])
        self.assertEqual(data['concluidos'], [])
        self.assertEqual(data['epoca'], 0)

    def test_completing_unlocks_the_next_space_and_never_regresses(self):
        data = self.put(desbloqueados=['ilha-inicial'], concluidos=['ilha-inicial']).json()
        self.assertEqual(data['concluidos'], ['ilha-inicial'])
        self.assertEqual(data['desbloqueados'], ['ilha-inicial', 'cristo-redentor'])
        # Outro navegador, atrasado, envia menos: a união mantém o que já havia.
        data = self.put(desbloqueados=['ilha-inicial'], concluidos=[]).json()
        self.assertEqual(data['concluidos'], ['ilha-inicial'])
        # E pode trazer avanço próprio, em qualquer ordem.
        data = self.put(desbloqueados=['petra'], concluidos=['cristo-redentor']).json()
        self.assertEqual(data['concluidos'], ['ilha-inicial', 'cristo-redentor'])
        self.assertEqual(data['desbloqueados'], ['ilha-inicial', 'cristo-redentor', 'machu-picchu', 'petra'])
        self.assertEqual(self.client.get(URL).json(), data)

    def test_merge_is_idempotent_and_survives_a_restart(self):
        first = self.put(concluidos=['ilha-inicial']).json()
        self.assertEqual(self.put(concluidos=['ilha-inicial']).json(), first)
        self.assertEqual(self.open().get(URL).json(), first)

    def test_newer_epoch_replaces_and_older_epoch_is_ignored(self):
        self.put(concluidos=['ilha-inicial', 'cristo-redentor'])
        reset = self.put(epoca=1, desbloqueados=['ilha-inicial'], concluidos=[]).json()
        self.assertEqual((reset['epoca'], reset['desbloqueados'], reset['concluidos']), (1, ['ilha-inicial'], []))
        # Um navegador que não viu o reset tenta devolver o progresso antigo.
        stale = self.put(epoca=0, concluidos=['ilha-inicial', 'cristo-redentor']).json()
        self.assertEqual((stale['epoca'], stale['concluidos']), (1, []))
        fresh = self.put(epoca=1, concluidos=['ilha-inicial']).json()
        self.assertEqual(fresh['concluidos'], ['ilha-inicial'])

    def test_rejects_unknown_spaces_extra_fields_and_missing_header(self):
        self.assertEqual(self.put(concluidos=['atlantida']).status_code, 422)
        self.assertEqual(self.put(concluidos=[], moedas=999).status_code, 422)
        self.assertEqual(self.put(epoca=-1).status_code, 422)
        self.assertEqual(self.client.put(URL, json={'concluidos': ['ilha-inicial']}).status_code, 403)
        self.assertEqual(self.client.get(URL).json()['concluidos'], [])


if __name__ == '__main__':
    unittest.main()
