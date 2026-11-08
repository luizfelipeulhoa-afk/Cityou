"""Activity fixtures are synthetic; no live connector, content or city data is read."""
from datetime import datetime, timedelta, timezone
import json
from tempfile import TemporaryDirectory
import unittest

from fastapi.testclient import TestClient
import httpx

from backend.activity import MEMORY_JOB, normalize_activity
from backend.app import KINDS, create_app, iso

NOW = datetime(2026, 11, 3, 15, 0, tzinfo=timezone.utc)
BASE = 'http://127.0.0.1:8766'


def primary(**kwargs):
    return {'jobs': [], 'focus': None, 'codex': [], **kwargs}


def codex(state='working', age=0, **kwargs):
    return {'provider': 'codex', 'source': 'official-hook', 'state': state,
            'observed_at': iso(NOW - timedelta(seconds=age)), **kwargs}


def browser(provider='claude', state='working', age=0, **kwargs):
    return {'provider': provider, 'source': 'browser', 'state': state,
            'observed_at': iso(NOW - timedelta(seconds=age)), **kwargs}


def bot(state='running', age=0, **kwargs):
    return {'source': 'bot-report', 'sharing': True, 'archived': False,
            'state': state, 'received_at': iso(NOW - timedelta(seconds=age)), **kwargs}


def normalize(main=None, tabs=None, bots=None, project=None):
    return normalize_activity(main or primary(), tabs, bots, now=NOW,
                              place_ids=KINDS, stunt_project_id=project)


class ActivityNormalizationTests(unittest.TestCase):
    def test_real_active_signals_are_classified_without_content(self):
        secret = 'SYNTHETIC_PRIVATE_CONTENT_8742'
        main = primary(
            codex=[codex(prompt=secret, id=secret, agents=3)],
            focus={'status': 'running', 'project_id': secret, 'title': secret},
            jobs=[{'state': 'running', 'label': MEMORY_JOB, 'project_id': 'canonical-stunt'},
                  {'state': 'running', 'label': secret, 'project_id': 'other-project'}],
            conversation=secret)
        result = normalize(main, {'signals': [browser(excerpt={'text': secret}, tab_id=secret)]},
                           {'bots': [bot(name=secret, role=secret, task=secret, detail=secret,
                                         capture={'url': secret}, token=secret)]}, 'canonical-stunt')
        states = {kind: signal['state'] for kind, signal in result['places'].items()}
        self.assertEqual({kind: states[kind] for kind in ['chatgpt', 'claude', 'grok', 'tasks', 'projects', 'stunt', 'memory']},
                         {'chatgpt': 'working', 'claude': 'observed', 'grok': 'observed', 'tasks': 'focus',
                          'projects': 'working', 'stunt': 'working', 'memory': 'working'})
        encoded = json.dumps(result, ensure_ascii=False)
        self.assertNotIn(secret, encoded)
        self.assertNotIn('canonical-stunt', encoded)
        self.assertNotIn(MEMORY_JOB, encoded)
        self.assertEqual(set(result), {'places', 'checked_at'})
        self.assertEqual(set(result['places']), set(KINDS))
        for signal in result['places'].values():
            self.assertEqual(set(signal), {'state', 'label'})
        self.assertEqual(result['checked_at'], iso(NOW))

    def test_ttls_match_connector_boundaries_and_ignore_expired(self):
        result = normalize(primary(codex=[codex(age=900)]),
                           {'signals': [browser(age=45)]}, {'bots': [bot(age=119.999)]})
        self.assertEqual(result['places']['chatgpt']['state'], 'working')
        self.assertEqual(result['places']['claude']['state'], 'observed')
        self.assertEqual(result['places']['grok']['state'], 'observed')
        expired = normalize(primary(codex=[codex(age=900.001)]),
                            {'signals': [browser(age=45.001)]}, {'bots': [bot(age=120)]})
        self.assertTrue(all(signal['state'] == 'unknown' for signal in expired['places'].values()))

    def test_unknown_is_not_inferred_from_open_apps_connections_or_stale_idle(self):
        result = normalize(primary(codex=[codex('unknown'), codex('idle', age=901)]),
                           {'connections': [{'connected': True}],
                            'signals': [browser(state='unknown'), browser('gemini', 'idle', age=46)]},
                           {'bots': [bot('unknown'), bot('error'), bot('running', sharing=False),
                                     bot('running', archived=True), bot('idle', age=121)]})
        self.assertTrue(all(signal == {'state': 'unknown', 'label': 'Sem sinal recente'}
                            for signal in result['places'].values()))

    def test_explicit_recent_idle_and_waiting_only(self):
        result = normalize(primary(codex=[codex('waiting')]),
                           {'signals': [browser('gemini', state='idle')]}, {'bots': [bot('waiting')]})
        self.assertEqual(result['places']['chatgpt']['state'], 'waiting')
        self.assertEqual(result['places']['gemini']['state'], 'idle')
        self.assertEqual(result['places']['grok']['state'], 'waiting')
        idle = normalize(primary(codex=[codex('idle')]), bots={'bots': [bot('idle')]})
        self.assertEqual(idle['places']['chatgpt']['state'], 'idle')
        self.assertEqual(idle['places']['grok']['state'], 'idle')

    def test_official_work_and_permission_waiting_outrank_browser_observation(self):
        tabs = {'signals': [browser('chatgpt')]}
        self.assertEqual(normalize(primary(codex=[codex('working')]), tabs)['places']['chatgpt']['state'], 'working')
        self.assertEqual(normalize(primary(codex=[codex('waiting')]), tabs)['places']['chatgpt']['state'], 'waiting')
        self.assertEqual(normalize(primary(codex=[codex('idle')]), tabs)['places']['chatgpt']['state'], 'observed')

    def test_project_focus_and_memory_require_exact_live_facts(self):
        result = normalize(primary(jobs=[
            {'state': 'done', 'label': MEMORY_JOB, 'project_id': 'canonical'},
            {'state': 'error', 'label': MEMORY_JOB, 'project_id': 'canonical'},
            {'state': 'running', 'label': MEMORY_JOB.lower(), 'project_id': 'other'},
        ], focus={'status': 'paused', 'project_id': 'canonical'}), project='canonical')
        self.assertEqual(result['places']['projects']['state'], 'working')
        for kind in ['stunt', 'memory', 'tasks']:
            self.assertEqual(result['places'][kind]['state'], 'unknown')
        no_canonical = normalize(primary(jobs=[{'state': 'running', 'project_id': 'canonical'}]))
        self.assertEqual(no_canonical['places']['stunt']['state'], 'unknown')

    def test_malformed_future_and_untrusted_provenance_signals_are_unknown(self):
        result = normalize(primary(codex=[codex(age=-1), codex(observed_at='2026-11-03T15:00:00'),
                                          codex(source='browser'), None]),
                           {'signals': [browser(age=-1), browser(observed_at='invalid'),
                                        browser('not-a-provider'), browser(source='other'), 2]},
                           {'bots': [bot(age=-1), bot(received_at=None), bot(source='other'), []]})
        self.assertTrue(all(signal['state'] == 'unknown' for signal in result['places'].values()))
        malformed = normalize_activity({'jobs': {}, 'codex': [codex()]}, {'signals': {}}, {'bots': {}},
                                       now=NOW, place_ids=KINDS)
        self.assertTrue(all(signal['state'] == 'unknown' for signal in malformed['places'].values()))


class ActivityEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix='fifones-city-activity-test-')
        self.main = primary()
        self.tabs = {'signals': []}
        self.bots = {'bots': []}
        self.projects = [{'id': 'canonical-stunt', 'name': 'StuntSync'}]
        self.failures = {}
        self.calls = []
        self.context = TestClient(create_app(data_dir=self.temp.name,
                                             transport=httpx.MockTransport(self.handle), clock=lambda: NOW),
                                  base_url=BASE)
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.temp.cleanup()

    def handle(self, request):
        self.calls.append((request.method, request.url.path, dict(request.headers)))
        path = request.url.path
        if path in self.failures:
            return httpx.Response(self.failures[path], json={'private': 'SYNTHETIC_SERVER_ERROR'})
        fixtures = {'/api/tasks': [], '/api/fitness': {'checkins': []},
                    '/api/projects': self.projects, '/api/assistant/city-activity': self.main,
                    '/api/browser-activity': self.tabs, '/api/bot-office/bots': self.bots}
        self.assertEqual(request.method, 'GET')
        return httpx.Response(200, json=fixtures[path])

    def activity(self):
        response = self.client.get('/api/workspace/activity')
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_privacy_headers_real_canonical_project_and_no_ledger_effects(self):
        before = self.client.get('/api/city').json()
        self.main = primary(codex=[codex()], jobs=[{'state': 'running', 'project_id': 'canonical-stunt'}])
        self.tabs = {'signals': [browser('claude', excerpt={'text': 'SYNTHETIC_PRIVATE_EXCERPT'})]}
        self.bots = {'bots': [bot(task='SYNTHETIC_PRIVATE_TASK', capture={'url': '/private-screen'})]}
        for _ in range(3):
            result = self.activity()
            self.assertTrue(result['connected'])
            self.assertEqual(result['activity']['places']['stunt']['state'], 'working')
            self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(result))
            self.assertNotIn('/private-screen', json.dumps(result))
        after = self.client.get('/api/city').json()
        self.assertEqual((before['credits'], before['earned'], before['revision'], before['history']),
                         (after['credits'], after['earned'], after['revision'], after['history']))
        browser_calls = [call for call in self.calls if call[1] == '/api/browser-activity']
        self.assertTrue(browser_calls)
        self.assertTrue(all(call[2].get('x-fifones') == '1' for call in browser_calls))
        self.assertTrue(all(call[0] == 'GET' and '/screen' not in call[1] for call in self.calls))

    def test_optional_failures_do_not_block_primary_or_other_sources(self):
        self.main = primary(codex=[codex()])
        self.bots = {'bots': [bot()]}
        self.failures['/api/browser-activity'] = 403
        result = self.activity()
        self.assertTrue(result['connected'])
        self.assertEqual(result['activity']['places']['chatgpt']['state'], 'working')
        self.assertEqual(result['activity']['places']['grok']['state'], 'observed')
        self.assertEqual(result['activity']['places']['claude']['state'], 'unknown')
        self.failures['/api/bot-office/bots'] = 404
        self.assertTrue(self.activity()['connected'])

    def test_required_failure_retains_valid_optional_and_does_not_leak_error(self):
        self.failures['/api/assistant/city-activity'] = 503
        self.tabs = {'signals': [browser('gemini')]}
        result = self.activity()
        self.assertFalse(result['connected'])
        self.assertEqual(result['activity']['places']['gemini']['state'], 'observed')
        self.assertEqual(result['activity']['places']['chatgpt']['state'], 'unknown')
        self.assertNotIn('SYNTHETIC_SERVER_ERROR', json.dumps(result))

    def test_source_unknowns_and_missing_project_never_light_stunt(self):
        self.main = primary(jobs=[{'state': 'running', 'project_id': 'canonical-stunt'}])
        self.failures['/api/projects'] = 503
        result = self.activity()
        self.assertTrue(result['connected'])
        self.assertEqual(result['activity']['places']['projects']['state'], 'working')
        self.assertEqual(result['activity']['places']['stunt']['state'], 'unknown')
        self.main = {'jobs': None, 'focus': 'bad', 'codex': [codex()]}
        result = self.activity()
        self.assertFalse(result['connected'])
        self.assertTrue(all(signal['state'] == 'unknown' for signal in result['activity']['places'].values()))


if __name__ == '__main__':
    unittest.main()
