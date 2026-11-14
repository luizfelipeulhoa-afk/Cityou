"""Etapa 2 do plano: /api/personal/tasks também funciona no servidor local, com a fonte Fifones simulada."""
from datetime import datetime, timezone
from tempfile import TemporaryDirectory
import unittest
import httpx
from fastapi.testclient import TestClient
from backend.app import create_app

WRITE = {'X-Fifones-City': '1'}
NOW = datetime(2026, 11, 3, 15, 0, tzinfo=timezone.utc)


class TaskRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.tasks = [{'id': 't1', 'title': 'Pagar a conta de luz', 'status': 'open'}]

        def handle(req):
            path = req.url.path
            if path == '/api/tasks' and req.method == 'GET':
                return httpx.Response(200, json=self.tasks)
            if path == '/api/tasks/t1/complete' and req.method == 'POST':
                self.tasks[0].update(status='done', completed_at='2026-11-03T15:00:00Z')
                return httpx.Response(200, json=self.tasks[0])
            if path == '/api/tasks/t1':
                return httpx.Response(200, json=self.tasks[0])
            if path == '/api/fitness':
                return httpx.Response(200, json={'checkins': [], 'weights': []})
            if path == '/api/projects':
                return httpx.Response(200, json=[])
            return httpx.Response(404, json={})

        self.app = create_app(data_dir=self.temp.name, transport=httpx.MockTransport(handle), clock=lambda: NOW)
        self.ctx = TestClient(self.app, base_url='http://127.0.0.1:8766')
        self.client = self.ctx.__enter__()

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        self.temp.cleanup()

    def test_new_path_lists_the_same_tasks_as_the_old_one(self):
        new = self.client.get('/api/personal/tasks')
        self.assertEqual(new.status_code, 200)
        self.assertEqual(new.json()['tasks'], self.client.get('/api/workspace/tasks').json()['tasks'])
        self.assertEqual([task['id'] for task in new.json()['tasks']], ['t1'])

    def test_complete_by_new_path_pays_once(self):
        before = self.client.get('/api/city').json()['credits']
        first = self.client.post('/api/personal/tasks/t1/complete', headers=WRITE, json={})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()['credits'], before + 10)
        again = self.client.post('/api/personal/tasks/t1/complete', headers=WRITE, json={})
        self.assertEqual(again.json()['credits'], before + 10)

    def test_complete_by_new_path_keeps_the_same_checks(self):
        self.assertEqual(self.client.post('/api/personal/tasks/bad%3Aid/complete', headers=WRITE, json={}).status_code, 422)
        self.assertEqual(self.client.post('/api/personal/tasks/t1/complete', headers=WRITE, json={'credits': 99}).status_code, 422)
        self.assertEqual(self.client.post('/api/personal/tasks/t1/complete', json={}).status_code, 403)
