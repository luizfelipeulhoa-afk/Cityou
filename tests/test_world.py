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


class WorldModelsCacheTests(unittest.TestCase):
    """Os modelos publicados pelo build (hash no nome) saem com cache imutável; as listas, sempre em dia."""

    def setUp(self):
        self.temp = TemporaryDirectory()
        self.dist = Path(self.temp.name) / 'dist'
        versioned = self.dist / 'models' / 'world' / 'v'
        versioned.mkdir(parents=True)
        (self.dist / 'index.html').write_text('<!doctype html>', encoding='utf-8')
        (versioned / 'coliseu.0123456789.glb').write_bytes(b'glTF-teste')
        (self.dist / 'models' / 'world' / 'models.json').write_text(
            '{"coliseu": {"arquivo": "v/coliseu.0123456789.glb", "kb": 1, "triangulos": 12}}', encoding='utf-8')
        self.contexts = []

    def open(self, static_dir):
        app = create_app(data_dir=Path(self.temp.name) / 'data', static_dir=static_dir,
                         transport=httpx.MockTransport(lambda request: httpx.Response(404, json={})),
                         clock=lambda: datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc))
        context = TestClient(app, base_url='http://127.0.0.1:8766')
        self.contexts.append(context)
        return context.__enter__()

    def tearDown(self):
        for context in self.contexts:
            context.__exit__(None, None, None)
        self.temp.cleanup()

    def test_versioned_models_are_immutable_and_lists_stay_fresh(self):
        client = self.open(self.dist)
        model = client.get('/models/world/v/coliseu.0123456789.glb')
        self.assertEqual(model.status_code, 200)
        self.assertEqual(model.content, b'glTF-teste')
        self.assertEqual(model.headers['cache-control'], 'public, max-age=31536000, immutable')
        index = client.get('/models/world/models.json')
        self.assertEqual(index.json()['coliseu']['arquivo'], 'v/coliseu.0123456789.glb')
        self.assertEqual(index.headers['cache-control'], 'no-cache')
        # Um endereço versionado que não existe não pode ficar guardado como se existisse.
        missing = client.get('/models/world/v/coliseu.ffffffffff.glb')
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.headers['cache-control'], 'no-cache')
        # O caminho de sempre e a API mantêm a política que já tinham.
        self.assertEqual(client.get('/models/world/manifest.json').headers['cache-control'], 'no-cache')
        self.assertEqual(client.get(URL).headers['cache-control'], 'no-store')

    def test_without_a_build_the_index_is_a_plain_404(self):
        empty = Path(self.temp.name) / 'vazio'
        empty.mkdir()
        client = self.open(empty)
        self.assertEqual(client.get('/models/world/models.json').status_code, 404)
        self.assertEqual(client.get('/models/world/v/coliseu.0123456789.glb').status_code, 404)


if __name__ == '__main__':
    unittest.main()
