"""Contract tests on temporary databases and a synthetic original workspace."""
from datetime import datetime, timezone
from tempfile import TemporaryDirectory
import json
import unittest
import httpx
from fastapi.testclient import TestClient
from backend.app import create_app

WRITE={'X-Fifones-City':'1'}
class PersonalTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory()
        self.requests=[]
        self.offline=False
        def handle(req):
            self.requests.append((req.method,req.url.path))
            if self.offline: raise httpx.ConnectError('offline',request=req)
            if req.url.path=='/api/tasks' and req.method=='POST':
                return httpx.Response(201,json={'id':'created','status':'open',**json.loads(req.content)})
            if req.url.path=='/api/documents/good/cover':return httpx.Response(200,content=b'cover-fixture',headers={'Content-Type':'image/jpeg'})
            if req.url.path=='/api/documents/wrong/cover':return httpx.Response(200,content=b'not-an-image',headers={'Content-Type':'text/html'})
            if req.url.path=='/api/fitness':return httpx.Response(200,json={'checkins':[],'weights':[]})
            if req.url.path in ['/api/tasks','/api/projects','/api/documents','/api/memories','/api/events']:
                return httpx.Response(200,json=[])
            return httpx.Response(404,json={})
        self.app=create_app(data_dir=self.temp.name,transport=httpx.MockTransport(handle),clock=lambda:datetime(2026,11,3,1,30,tzinfo=timezone.utc))
        self.ctx=TestClient(self.app,base_url='http://127.0.0.1:8766')
        self.client=self.ctx.__enter__()
    def tearDown(self):self.ctx.__exit__(None,None,None);self.temp.cleanup()
    def entry(self,**changes):
        body={'kind':'habit','title':'Ler dois minutos','day':'2026-11-02'};body.update(changes)
        return self.client.post('/api/personal/entries',headers=WRITE,json=body)
    def test_sources_are_read_only_and_partial_failure_is_explicit(self):
        data=self.client.get('/api/personal').json()
        self.assertEqual(data['today'],'2026-11-02')
        self.assertTrue(all(s['connected'] for s in data['sources'].values()))
        self.assertTrue(all(method=='GET' for method,_ in self.requests))
        self.offline=True
        data=self.client.get('/api/personal').json()
        self.assertFalse(any(s['connected'] for s in data['sources'].values()))
    def test_habit_survives_reopen_and_does_not_change_city(self):
        before=self.client.get('/api/city').json()
        result=self.entry();self.assertEqual(result.status_code,201)
        after=self.client.get('/api/city').json()
        self.assertEqual(before['credits'],after['credits']);self.assertEqual(before['revision'],after['revision'])
        self.assertEqual(self.client.get('/api/personal').json()['entries'][0]['title'],'Ler dois minutos')
    def test_daily_checkin_is_idempotent_and_reversible(self):
        ident=self.entry().json()['created_id'];path=f'/api/personal/entries/{ident}/checkin'
        for _ in range(2):self.assertEqual(self.client.put(path,headers=WRITE,json={'done':True}).status_code,200)
        saved=self.client.get('/api/personal').json()['checkins'];self.assertEqual(len(saved),1)
        self.assertEqual(saved[0]['day'],'2026-11-02')
        self.client.put(path,headers=WRITE,json={'done':False})
        self.assertEqual(self.client.get('/api/personal').json()['checkins'][0]['done'],0)
    def test_money_uses_integer_cents_and_rejects_invalid_values(self):
        self.assertEqual(self.entry(kind='transaction',amount_cents=12345).status_code,201)
        for amount in [-1,0,2.45]:self.assertEqual(self.entry(kind='transaction',amount_cents=amount).status_code,422)
    def test_bad_entry_never_adds_a_record(self):
        for changes in [{'title':'  '},{'kind':'script'},{'day':'invalid'},{'kind':'meal','day':'2026-11-03'},{'unexpected':True}]:
            self.assertEqual(self.entry(**changes).status_code,422)
        self.assertEqual(self.client.get('/api/personal').json()['entries'],[])
    def test_only_habits_and_goals_accept_checkins(self):
        ident=self.entry(kind='note').json()['created_id']
        self.assertEqual(self.client.put(f'/api/personal/entries/{ident}/checkin',headers=WRITE,json={'done':True}).status_code,422)
        self.assertEqual(self.client.put('/api/personal/entries/missing/checkin',headers=WRITE,json={'done':True}).status_code,404)
    def test_local_guard_blocks_cross_origin_writes(self):
        self.assertEqual(self.client.post('/api/personal/entries',headers={**WRITE,'Origin':'https://example.com'},json={'kind':'note','title':'bad','day':'2026-11-02'}).status_code,403)
        self.assertEqual(self.client.post('/api/personal/entries',json={'kind':'note','title':'bad','day':'2026-11-02'}).status_code,403)
    def test_new_task_goes_to_existing_workspace_not_a_duplicate_store(self):
        result=self.client.post('/api/personal/tasks',headers=WRITE,json={'title':'Preparar reunião','due_date':'2026-11-04'})
        self.assertEqual(result.status_code,201);self.assertEqual(result.json()['id'],'created')
        self.assertIn(('POST','/api/tasks'),self.requests)
        self.assertEqual(self.client.get('/api/personal').json()['entries'],[])
    def test_failed_task_is_not_reported_as_saved(self):
        self.offline=True
        self.assertEqual(self.client.post('/api/personal/tasks',headers=WRITE,json={'title':'Tarefa'}).status_code,503)
    def test_goal_target_is_kept(self):
        ident=self.entry(kind='goal',target=7).json()['created_id']
        found=next(i for i in self.client.get('/api/personal').json()['entries'] if i['id']==ident)
        self.assertEqual(found['target'],7)

    def test_cover_proxy_is_fixed_local_image_only_and_private(self):
        result=self.client.get('/api/personal/documents/good/cover')
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.headers['content-type'],'image/jpeg')
        self.assertTrue(any(policy in result.headers['cache-control'] for policy in ('private','no-store')))
        self.assertEqual(self.client.get('/api/personal/documents/wrong/cover').status_code,404)
    def test_cover_proxy_does_not_allow_arbitrary_source_paths(self):
        self.assertEqual(self.client.get('/api/personal/documents/bad%3Aid/cover').status_code,404)
        self.assertNotIn(('GET','/api/documents/bad:id/cover'),self.requests)
