"""Isolated city tests: no real Fifones endpoint, database, or browser is used."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import unittest
import uuid
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
import httpx

from backend.app import KINDS, create_app, iso

# Prédio 3 x 2 só de teste: o catálogo não tem mais peça retangular (a de StuntSync saiu na etapa 3).
KINDS.setdefault('wide-test', {'id': 'wide-test', 'label': 'Teste largo', 'cost': 80, 'model': None, 'width': 3, 'depth': 2, 'height': 2, 'color': '#888888', 'destination': None})

BASE = 'http://127.0.0.1:8766'
WRITE = {'X-Fifones-City': '1'}
LOCAL_ZONE = ZoneInfo('America/Sao_Paulo')


class FakeWorkspace:
    def __init__(self):
        self.now = datetime(2026, 11, 3, 15, 0, tzinfo=timezone.utc)
        self.tasks = []
        self.projects = [{'id': 'stunt-project', 'name': 'StuntSync'}]
        self.checkins = []
        self.offline = False
        self.confirm_completion = True
        self.requests = []
        self.lock = threading.Lock()

    def handle(self, request):
        with self.lock:
            self.requests.append((request.method, request.url.path, dict(request.headers)))
            if self.offline:
                raise httpx.ConnectError('test offline', request=request)
            path = request.url.path
            if request.method == 'GET' and path == '/api/tasks':
                assert request.url.params['status'] == 'all'
                return httpx.Response(200, json=self.tasks)
            if request.method == 'GET' and path == '/api/projects':
                return httpx.Response(200, json=self.projects)
            if request.method == 'GET' and path == '/api/fitness':
                return httpx.Response(200, json={'checkins': self.checkins})
            if request.method == 'GET' and path == '/api/assistant/city-activity':
                return httpx.Response(200, json={'jobs': [], 'focus': None, 'codex': []})
            if request.method == 'GET' and path in ('/api/browser-activity', '/api/bot-office/bots'):
                return httpx.Response(404, json={})
            if path.startswith('/api/tasks/'):
                ident = path.split('/')[3]
                task = next((item for item in self.tasks if item['id'] == ident), None)
                if not task:
                    return httpx.Response(404, json={'message': 'missing'})
                if request.method == 'POST' and path.endswith('/complete'):
                    assert request.headers['X-Fifones'] == '1'
                    if self.confirm_completion and task['status'] != 'done':
                        task.update(status='done', completed_at=iso(self.now))
                    return httpx.Response(200, json=task)
                if request.method == 'GET':
                    return httpx.Response(200, json=task)
            raise AssertionError(f'Unexpected upstream call: {request.method} {request.url}')

    def completed(self, ident='task-new', *, old=False):
        task = {'id': ident, 'title': ident, 'status': 'done',
                'completed_at': iso(self.now - timedelta(days=2) if old else self.now)}
        self.tasks.append(task)
        return task


class CityTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix='fifones-city-test-')
        self.workspace = FakeWorkspace()
        self.app = self.make_app()
        self.context = TestClient(self.app, base_url=BASE)
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.temp.cleanup()

    def make_app(self, **kwargs):
        return create_app(data_dir=self.temp.name,
                          transport=httpx.MockTransport(self.workspace.handle),
                          clock=lambda: self.workspace.now, **kwargs)

    def city(self):
        response = self.client.get('/api/city')
        self.assertEqual(response.status_code, 200)
        return response.json()

    def action(self, kind='tree', x=5, y=5, *, revision=None, request_id=None, **kwargs):
        payload = dict(type='build', kind=kind, x=x, y=y, rotation=0,
                       expected_revision=self.city()['revision'] if revision is None else revision,
                       request_id=request_id or uuid.uuid4().hex)
        payload.update(kwargs)
        return self.client.post('/api/city/actions', json=payload, headers=WRITE)

    def placement_action(self, ident, action, **kwargs):
        return self.client.post('/api/city/actions', json={
            'type': action, 'placement_id': ident, 'expected_revision': self.city()['revision'],
            'request_id': uuid.uuid4().hex, **kwargs}, headers=WRITE)

    def sync(self):
        return self.client.post('/api/rewards/sync', headers=WRITE)

    def grant_tasks(self, count):
        self.workspace.now += timedelta(seconds=1)
        for index in range(count):
            self.workspace.completed(f'grant-{len(self.workspace.tasks)}-{index}')
        response = self.sync()
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_initial_seed_is_unique_and_persists_on_reload(self):
        initial = self.city()
        self.assertEqual((initial['credits'], initial['earned'], initial['level'], initial['unlock_radius']), (50, 0, 1, 3))
        self.assertEqual(initial['revision'], 0)
        self.assertEqual(len(initial['placements']), 7)
        self.assertEqual(sum(item['amount'] for item in initial['history']), 50)
        self.assertTrue(initial['source']['connected'])
        with TestClient(self.make_app(), base_url=BASE) as other:
            persisted = other.get('/api/city').json()
        self.assertEqual(initial, persisted)
        self.assertEqual(len([row for row in persisted['history'] if row['amount'] == 50]), 1)

    def test_factory_does_not_create_database_until_startup(self):
        missing = Path(self.temp.name) / 'not-started'
        create_app(data_dir=missing)
        self.assertFalse(missing.exists())

    def test_build_and_retry_are_idempotent_even_after_reload(self):
        response = self.action(request_id='one-build', revision=0)
        self.assertEqual(response.status_code, 200)
        first = response.json()
        self.assertEqual((first['credits'], first['revision']), (47, 1))
        self.assertEqual(self.action(request_id='one-build', revision=0).json(), first)
        with TestClient(self.make_app(), base_url=BASE) as other:
            replay = other.post('/api/city/actions', json={
                'type': 'build', 'kind': 'tree', 'x': 5, 'y': 5, 'rotation': 0,
                'expected_revision': 0, 'request_id': 'one-build'}, headers=WRITE)
        self.assertEqual(replay.json(), first)
        reused = self.action(x=6, request_id='one-build', revision=0)
        self.assertEqual(reused.status_code, 409)
        self.assertEqual(self.city()['credits'], 47)

    def test_stale_revision_returns_latest_snapshot_without_mutating(self):
        self.action()
        response = self.action(x=6, revision=0)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['city']['revision'], 1)
        self.assertEqual(response.json()['city']['credits'], 47)

    def test_concurrent_duplicate_requests_spend_once(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(lambda _: self.action(revision=0, request_id='parallel'), range(8)))
        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertTrue(all(response.json() == responses[0].json() for response in responses))
        self.assertEqual((self.city()['credits'], self.city()['revision']), (47, 1))

    def test_concurrent_distinct_requests_cannot_overspend(self):
        # Each project costs the full initial balance. Exactly one revision may win.
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(lambda index: self.action(
                kind='projects', x=5 + (index % 3) * 2, y=5, revision=0), range(8)))
        self.assertEqual(sum(response.status_code == 200 for response in responses), 1)
        city = self.city()
        self.assertEqual(city['credits'], 0)
        self.assertEqual(city['revision'], 1)
        rejected = self.action(x=5, y=10)
        self.assertEqual(rejected.status_code, 422)
        self.assertEqual(self.city()['credits'], 0)

    def test_collision_including_multicell_footprints_never_debits(self):
        built = self.action(kind='tasks').json()
        self.assertEqual(built['credits'], 20)
        for x, y in [(5, 5), (6, 5), (5, 6), (6, 6)]:
            rejected = self.action(x=x, y=y)
            self.assertEqual(rejected.status_code, 409)
            self.assertEqual(rejected.json()['city']['credits'], 20)
        self.assertEqual(self.city()['revision'], 1)

    def test_locked_footprint_and_invalid_inputs_never_debit(self):
        for payload in [dict(kind='tasks', x=11, y=11), dict(kind='home', x=4, y=5),
                        dict(kind='invented'), dict(kind='headquarters'), dict(kind='plaza'),
                        dict(rotation=4), dict(x=5.5), dict(x=True), dict(credits=9999)]:
            response = self.action(**payload)
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual((self.city()['credits'], self.city()['revision']), (50, 0))

    def test_rotation_swaps_footprint_and_checks_collision_and_unlocks(self):
        self.grant_tasks(4)
        first = self.action(kind='wide-test').json()
        building = next(item for item in first['placements'] if item['kind'] == 'wide-test')
        self.action(x=5, y=7)
        collision = self.placement_action(building['id'], 'rotate', rotation=1)
        self.assertEqual(collision.status_code, 409)
        moved = self.placement_action(building['id'], 'move', x=9, y=10)
        self.assertEqual(moved.status_code, 200)
        locked = self.placement_action(building['id'], 'rotate', rotation=1)
        self.assertEqual(locked.status_code, 422)
        moved = self.placement_action(building['id'], 'move', x=9, y=5)
        self.assertEqual(moved.status_code, 200)
        rotated = self.placement_action(building['id'], 'rotate', rotation=1)
        self.assertEqual(rotated.status_code, 200)
        final = next(item for item in rotated.json()['placements'] if item['kind'] == 'wide-test')
        self.assertEqual(final['rotation'], 1)

    def test_move_with_rotation_is_atomic_and_rejects_collision_without_mutation(self):
        self.grant_tasks(4)
        built = self.action(kind='wide-test').json()
        ident = next(item['id'] for item in built['placements'] if item['kind'] == 'wide-test')
        # This tree blocks rotation at the old site, but must not block a combined
        # move+rotation whose final footprint is free.
        self.action(x=5, y=7)
        moved = self.placement_action(ident, 'move', x=9, y=5, rotation=1)
        self.assertEqual(moved.status_code, 200)
        confirmed = moved.json()
        placement = next(item for item in confirmed['placements'] if item['id'] == ident)
        self.assertEqual((placement['x'], placement['y'], placement['rotation']), (9, 5, 1))
        # At x7,y5 rotation0 is clear, but rotation1 intersects headquarters8,7.
        # Reject the complete operation, retaining both prior position and angle.
        rejected = self.placement_action(ident, 'move', x=7, y=5, rotation=1)
        self.assertEqual(rejected.status_code, 409)
        current = self.city()
        unchanged = next(item for item in current['placements'] if item['id'] == ident)
        self.assertEqual(unchanged, placement)
        self.assertEqual((current['credits'], current['revision']), (confirmed['credits'], confirmed['revision']))
    def test_core_is_protected(self):
        for ident in ['core-headquarters', 'core-plaza']:
            for action in ['remove', 'move', 'rotate', 'upgrade']:
                response = self.placement_action(ident, action, x=5, y=5)
                self.assertEqual(response.status_code, 422)
        self.assertEqual(self.city()['credits'], 50)

    def test_upgrade_cost_levels_and_half_base_refund(self):
        built = self.action().json()
        ident = next(row['id'] for row in built['placements'] if row['kind'] == 'tree')
        upgraded = self.placement_action(ident, 'upgrade').json()
        self.assertEqual(upgraded['credits'], 44)
        upgraded = self.placement_action(ident, 'upgrade').json()
        self.assertEqual(upgraded['credits'], 38)
        self.assertEqual(self.placement_action(ident, 'upgrade').status_code, 422)
        removed = self.placement_action(ident, 'remove').json()
        self.assertEqual(removed['credits'], 39)
        self.assertEqual(removed['earned'], 0)
        self.assertFalse(any(row['id'] == ident for row in removed['placements']))

    def test_old_tasks_and_recompleted_tasks_do_not_multiply(self):
        old = self.workspace.completed('historical', old=True)
        self.city()  # Observe and durably exclude a historical completion.
        self.workspace.now += timedelta(seconds=1)
        self.workspace.completed('recent')
        first = self.sync().json()
        self.assertEqual((first['credits'], first['earned']), (60, 10))
        self.assertEqual(self.sync().json(), first)
        old.update(status='open', completed_at=None)
        self.workspace.tasks[1].update(status='open', completed_at=None)
        self.sync()
        self.workspace.now += timedelta(seconds=1)
        old.update(status='done', completed_at=iso(self.workspace.now))
        self.workspace.tasks[1].update(status='done', completed_at=iso(self.workspace.now))
        with TestClient(self.make_app(), base_url=BASE) as other:
            replay = other.post('/api/rewards/sync', headers=WRITE).json()
        self.assertEqual((replay['credits'], replay['earned']), (60, 10))

    def test_rewards_are_verified_unique_and_unlock_territory(self):
        city = self.grant_tasks(10)
        self.assertEqual((city['credits'], city['earned'], city['level'], city['unlock_radius']), (150, 100, 2, 4))
        city = self.grant_tasks(50)
        self.assertEqual((city['credits'], city['earned'], city['level'], city['unlock_radius']), (650, 600, 7, 8))
        self.assertEqual(self.action(kind='wide-test', x=15, y=15).status_code, 422)
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(lambda _: self.sync(), range(8)))
        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual((self.city()['credits'], self.city()['earned']), (650, 600))

    def test_habits_require_current_verified_done_and_reward_once_per_day(self):
        self.workspace.now += timedelta(seconds=1)
        today = self.workspace.now.astimezone(LOCAL_ZONE).date().isoformat()
        yesterday = (self.workspace.now.astimezone(LOCAL_ZONE).date() - timedelta(days=1)).isoformat()
        self.workspace.checkins = [
            dict(day=today, status='done', updated_at=iso(self.workspace.now)),
            dict(day=yesterday, status='done', updated_at=iso(self.workspace.now)),
            dict(day='2099-01-01', status='done', updated_at=iso(self.workspace.now)),
            dict(day=today, status='paused', habit_id='another', updated_at=iso(self.workspace.now)),
        ]
        city = self.sync().json()
        self.assertEqual((city['credits'], city['earned']), (55, 5))
        self.workspace.checkins[0]['status'] = 'paused'
        self.sync()
        self.workspace.now += timedelta(seconds=1)
        self.workspace.checkins[0].update(status='done', updated_at=iso(self.workspace.now))
        city = self.sync().json()
        self.assertEqual((city['credits'], city['earned']), (55, 5))

    def test_concurrent_sync_claims_each_reward_only_once(self):
        self.workspace.now += timedelta(seconds=1)
        self.workspace.completed()
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(lambda _: self.sync(), range(8)))
        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual((self.city()['credits'], self.city()['earned'], self.city()['revision']), (60, 10, 1))

    def test_complete_only_forwards_allowed_endpoint_and_verifies_get(self):
        self.workspace.tasks.append({'id': 'open', 'title': 'Real task', 'status': 'open', 'completed_at': None})
        self.workspace.now += timedelta(seconds=1)
        response = self.client.post('/api/workspace/tasks/open/complete', headers=WRITE)
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()['credits'], response.json()['earned']), (60, 10))
        writes = [row for row in self.workspace.requests if row[0] != 'GET']
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0][1], '/api/tasks/open/complete')
        self.assertEqual(writes[0][2]['x-fifones'], '1')
        self.assertTrue(any(row[:2] == ('GET', '/api/tasks/open') for row in self.workspace.requests))
        again = self.client.post('/api/workspace/tasks/open/complete', headers=WRITE)
        self.assertEqual(again.json()['credits'], 60)
        rejected = self.client.post('/api/workspace/tasks/open/complete', json={'credits': 1000}, headers=WRITE)
        self.assertEqual(rejected.status_code, 422)

    def test_unverified_completion_does_not_issue_reward(self):
        self.workspace.tasks.append({'id': 'open', 'title': 'Real task', 'status': 'open', 'completed_at': None})
        self.workspace.confirm_completion = False
        response = self.client.post('/api/workspace/tasks/open/complete', headers=WRITE)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.city()['credits'], 50)

    def test_offline_keeps_saved_city_and_allows_local_actions(self):
        self.workspace.offline = True
        city = self.city()
        self.assertFalse(city['source']['connected'])
        tasks = self.client.get('/api/workspace/tasks').json()
        self.assertEqual((tasks['connected'], tasks['tasks']), (False, []))
        self.assertEqual(self.client.get('/api/workspace/projects').json()['connected'], False)
        self.assertEqual(self.client.get('/api/workspace/activity').json()['connected'], False)
        self.assertEqual(self.sync().status_code, 503)
        self.assertEqual(self.client.post('/api/workspace/tasks/open/complete', headers=WRITE).status_code, 503)
        built = self.action().json()
        self.assertEqual(built['credits'], 47)
        self.assertFalse(built['source']['connected'])
        self.assertEqual(built['earned'], 0)

    def test_sync_never_accepts_client_currency(self):
        for payload in [{'credits': 1000}, {'tasks': [{'id': 'fake', 'status': 'done'}]}, {'amount': 10}]:
            response = self.client.post('/api/rewards/sync', json=payload, headers=WRITE)
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.city()['credits'], 50)

    def test_local_host_origin_and_write_header_guards(self):
        for host in ['evil.example:8766', 'evil@localhost:8766', 'localhost:8766/path', 'localhost:invalid']:
            self.assertEqual(self.client.get('/api/city', headers={'Host': host}).status_code, 403)
        self.assertEqual(self.client.get('/api/city', headers={'Origin': 'https://evil.example'}).status_code, 403)
        self.assertEqual(self.client.post('/api/rewards/sync').status_code, 403)
        self.assertEqual(self.client.post('/api/rewards/sync', headers={**WRITE, 'Origin': 'null'}).status_code, 403)
        self.assertEqual(self.client.post('/api/rewards/sync', headers={**WRITE, 'Origin': BASE}).status_code, 200)
        self.assertEqual(self.client.post('/api/rewards/sync', headers={**WRITE, 'Origin': 'http://127.0.0.1:9999'}).status_code, 403)
        for upstream in ['https://127.0.0.1:8765', 'http://evil.example', 'http://127.0.0.1.evil.example',
                         'http://user:pass@localhost:8765', 'http://localhost:8765/proxy']:
            with self.assertRaises(ValueError):
                self.make_app(upstream_url=upstream)

    def test_habit_day_uses_sao_paulo_even_when_clock_defaults_to_utc(self):
        class UtcHostDateTime(datetime):
            def astimezone(self, tz=None):
                # Simulate a host whose implicit local timezone is UTC.
                return super().astimezone(tz if tz is not None else timezone.utc)

        self.workspace.now = UtcHostDateTime(2026, 11, 4, 2, 59, tzinfo=timezone.utc)
        self.assertEqual(self.workspace.now.astimezone(LOCAL_ZONE).isoformat(),
                         '2026-11-03T23:59:00-03:00')
        self.workspace.checkins = [dict(day='2026-11-04', status='done',
                                       updated_at=iso(self.workspace.now))]
        self.assertEqual(self.sync().json()['earned'], 0)
        self.workspace.checkins.append(dict(day='2026-11-03', status='done',
                                           updated_at=iso(self.workspace.now)))
        verified = self.sync().json()
        self.assertEqual((verified['credits'], verified['earned']), (55, 5))
    def test_historical_habit_day_cannot_be_reclaimed_after_status_edits(self):
        today = self.workspace.now.astimezone(LOCAL_ZONE).date().isoformat()
        checkin = dict(day=today, status='done', updated_at=iso(self.workspace.now - timedelta(seconds=1)))
        self.workspace.checkins.append(checkin)
        self.assertEqual(self.sync().json()['earned'], 0)
        checkin['status'] = 'paused'
        self.sync()
        self.workspace.now += timedelta(seconds=1)
        checkin.update(status='done', updated_at=iso(self.workspace.now))
        self.assertEqual(self.sync().json()['earned'], 0)

    def test_malformed_and_future_completion_facts_do_not_reward(self):
        self.workspace.tasks += [
            dict(id='future', title='future', status='done', completed_at=iso(self.workspace.now + timedelta(days=1))),
            dict(id='naive', title='naive', status='done', completed_at='2026-11-03T15:00:00'),
            dict(id='invalid', title='invalid', status='done', completed_at='not-a-date'),
            dict(id='open', title='open', status='open', completed_at=iso(self.workspace.now)),
        ]
        self.assertEqual(self.sync().json()['earned'], 0)
    def test_project_and_activity_are_real_and_not_fabricated(self):
        projects = self.client.get('/api/workspace/projects').json()
        activity = self.client.get('/api/workspace/activity').json()
        self.assertEqual(projects['projects'], self.workspace.projects)
        self.assertTrue(activity['connected'])
        self.assertEqual(set(activity['activity']), {'places', 'checked_at'})
        self.assertTrue(all(signal == {'state': 'unknown', 'label': 'Sem sinal recente'} for signal in activity['activity']['places'].values()))


if __name__ == '__main__':
    unittest.main()
