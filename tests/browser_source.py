"""Synthetic workspace for browser verification; never uses personal data."""
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.responses import JSONResponse
app = FastAPI()
activity_state = 'idle'
tasks=[dict(id=f'fixture-{i}', title=f'Entrega de teste {i+1}', status='open', completed_at=None) for i in range(24)]
@app.get('/api/tasks')
def get_tasks(): return tasks
@app.get('/api/projects')
def projects(): return []
@app.get('/api/fitness')
def fitness(): return {'checkins':[]}
@app.get('/api/assistant/city-activity')
def activity(): return {'jobs':[],'focus':None,'codex':[{'provider':'codex','state':activity_state,'source':'official-hook','observed_at':datetime.now(timezone.utc).isoformat()}]}
@app.post('/fixture/activity/{state}')
def update_activity(state:str):
 global activity_state
 activity_state = state if state in ('working','idle','waiting','unknown') else 'unknown'
 return {'state':activity_state}
@app.get('/api/browser-activity')
def browser(): return {'signals':[]}
@app.get('/api/bot-office/bots')
def bots(): return {'bots':[]}
@app.post('/api/tasks/{ident}/complete')
def complete(ident:str):
 t=next((t for t in tasks if t['id']==ident),None)
 if not t:return JSONResponse({'message':'missing'},404)
 if t['status']=='open':t.update(status='done',completed_at=datetime.now(timezone.utc).isoformat())
 return t
@app.get('/api/tasks/{ident}')
def task(ident:str):return next(t for t in tasks if t['id']==ident)



@app.post('/api/tasks')
async def new_task(body:dict):
 t={'id':f'new-{len(tasks)}','status':'open','completed_at':None,**body};tasks.append(t);return t
@app.get('/api/documents')
def docs():return [{'id':'doc-1','name':'Material de teste.pdf'}]
@app.get('/api/memories')
def memories():return [{'id':'memory-1','content':'Contexto sintético','category':'geral'}]
@app.get('/api/events')
def events():return []

@app.get('/')
def original_page():
 from fastapi.responses import HTMLResponse
 return HTMLResponse('<!doctype html><title>Ferramenta original de teste</title><h1>Ferramenta original de teste</h1>')

@app.get('/api/documents/{ident}/cover')
def cover(ident:str):
 import base64
 from fastapi.responses import Response
 return Response(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6gH8AAAAASUVORK5CYII='),media_type='image/png')
