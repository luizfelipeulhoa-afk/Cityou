import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium, python, browserOptions } from './runtime.mjs'
const py = python
fs.mkdirSync('.verification', {recursive:true})
const temp=fs.mkdtempSync(path.resolve('.verification/browser-'))
const upstream=spawn(py,['-m','uvicorn','tests.browser_source:app','--host','127.0.0.1','--port','8875','--log-level','warning'],{stdio:'ignore',windowsHide:true})
const server=spawn(py,['-m','uvicorn','backend.app:app','--host','127.0.0.1','--port','8876','--log-level','warning'],{env:{...process.env,CITY_DATA_DIR:temp,FIFONES_UPSTREAM:'http://127.0.0.1:8875'},stdio:'ignore',windowsHide:true})
let browser
async function ready(url){for(let i=0;i<80;i++){try{if((await fetch(url)).ok)return}catch{}await new Promise(r=>setTimeout(r,200))}throw Error('server not ready: '+url)}
const results=[]
try{
 await ready('http://127.0.0.1:8875/api/tasks');await ready('http://127.0.0.1:8876/api/health')
 browser=await chromium.launch({...browserOptions,args:['--no-first-run']})
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1})
 const failedRequests=[];page.on('response',r=>{if(r.status()>=400)failedRequests.push({status:r.status(),url:r.url()})});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto('http://127.0.0.1:8876/city.html',{waitUntil:'networkidle'})
 await page.waitForFunction(()=>window.__fifonesCity?.state?.placements.length===7)
 const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__fifonesCity.state)))
 const act=async action=>{let current=await (await page.request.get('http://127.0.0.1:8876/api/city')).json();const res=await page.request.post('http://127.0.0.1:8876/api/city/actions',{headers:{'X-Fifones-City':'1'},data:{...action,expected_revision:current.revision,request_id:crypto.randomUUID()}});return res}
 const screenTile=async(x,y)=>page.evaluate(([x,y])=>{const a=window.__fifonesCity.engine.projectTile(x,y);const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+a.x,y:r.top+a.y}},[x,y])
 const clickTile=async(x,y)=>{const p=await screenTile(x,y);await page.mouse.click(p.x,p.y)}
 const select=async kind=>{const p=await page.evaluate(kind=>{const e=window.__fifonesCity.engine;const r=[...e.records.values()].find(r=>r.placement.kind===kind);const v=r.proxy.position.clone().project(e.camera);const b=e.canvas.getBoundingClientRect();return{x:b.left+(v.x+1)*b.width/2,y:b.top+(1-v.y)*b.height/2}},kind);await page.mouse.click(p.x,p.y)}
 assert.equal((await state()).credits,50);results.push('Welcome50; seed7; tasks source connected')
 assert.equal(await page.getByRole('progressbar',{name:'Progresso para o próximo nível'}).getAttribute('aria-valuenow'),'0')
 await page.getByRole('button',{name:'Construir StuntSync, 80 moedas',exact:true}).click()
 assert.equal((await state()).credits,50);assert.equal((await state()).revision,0)
 await page.getByRole('combobox',{name:'Escolher próxima construção'}).selectOption('chatgpt')
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__fifonesCity?.state?.placements.length===7)
 assert.equal(await page.getByRole('combobox',{name:'Escolher próxima construção'}).inputValue(),'chatgpt')
 await page.getByRole('button',{name:'Conquistas 0/3',exact:true}).click()
 assert.equal(await page.locator('.milestone.achieved').count(),0)
 await page.getByRole('button',{name:'Missões',exact:true}).click()
 results.push('Building goal persists without spending; historical tasks do not grant badges')

 // Drag is camera movement, never a construction click.
 await page.getByRole('button',{name:'Construir Árvore, 3 moedas',exact:true}).click()
 const origin=await screenTile(5,5);await page.mouse.move(origin.x,origin.y);await page.mouse.down();await page.mouse.move(origin.x+50,origin.y+25,{steps:8});await page.mouse.up();assert.equal((await state()).placements.length,7);await page.keyboard.press('Escape');await page.getByRole('button',{name:'Voltar à vista inicial',exact:true}).click();await page.waitForTimeout(400);results.push('Camera drag does not build')
 await page.getByRole('button',{name:'Concluir Entrega de teste 1',exact:true}).click()
 await page.waitForFunction(()=>window.__fifonesCity.state.credits===60)
 await page.locator('.reward-burst').waitFor()
 assert.equal(await page.getByRole('progressbar',{name:'Progresso para o próximo nível'}).getAttribute('aria-valuenow'),'1')
 results.push('Verified reward animates and advances level progress')

 await page.request.post('http://127.0.0.1:8876/api/workspace/tasks/fixture-0/complete',{headers:{'X-Fifones-City':'1'},data:{}})
 const check=await page.request.get('http://127.0.0.1:8876/api/city');assert.equal((await check.json()).credits,60);results.push('Task completion gives10 once')
 await page.getByRole('button',{name:'Construir Tarefas, 30 moedas',exact:true}).click();await clickTile(5,7)
 await page.waitForFunction(()=>window.__fifonesCity.state.placements.some(p=>p.kind==='tasks'))
 await page.waitForFunction(()=>window.__fifonesCity.engine.stats().modelsLoaded===1,{timeout:45000})
 assert.equal((await state()).credits,30);results.push('Build actual textured GLB and debit30')
 await page.waitForFunction(()=>{const e=window.__fifonesCity.engine;const r=[...e.records.values()].find(r=>r.placement.kind==='tasks');return r && !r.constructionPending && Math.abs(r.sim.scale.y-1)<0.0001})
 await page.getByRole('button',{name:'Conquistas 2/3',exact:true}).click();assert.equal(await page.locator('.milestone.achieved').count(),2)
 await page.getByRole('button',{name:'Missões',exact:true}).click()
 results.push('Construction animation settles; functional building earns its milestone')

 await page.keyboard.press('Escape');await select('tasks');await page.getByRole('button',{name:'Mover',exact:true}).click();await clickTile(10,6)
 await page.waitForFunction(()=>window.__fifonesCity.state.placements.some(p=>p.kind==='tasks'&&p.x===10&&p.y===6))
 await page.keyboard.press('Escape');await select('tasks');await page.getByRole('button',{name:'Girar',exact:true}).click()
 await page.waitForFunction(()=>window.__fifonesCity.state.placements.find(p=>p.kind==='tasks').rotation===1);results.push('Move and rotate persist')
 const invalid=await act({type:'build',kind:'tree',x:10,y:6,rotation:0});assert.equal(invalid.status(),409);assert.equal((await invalid.json()).city.credits,30);results.push('Collision rejects without debit')
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__fifonesCity?.engine?.stats().modelsLoaded===1)
 assert.equal((await state()).placements.find(p=>p.kind==='tasks').x,10);results.push('Reload restores placement and material')
 assert.equal(await page.locator('.reward-burst').count(),0);results.push('Reload does not replay rewards')
 await select('tasks');await page.getByRole('button',{name:'Demolir',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Demolir',exact:true}).click();await page.waitForFunction(()=>!window.__fifonesCity.state.placements.some(p=>p.kind==='tasks'));assert.equal((await state()).credits,45);results.push('Demolish refunds15 after confirmation')
 // Complete synthetic tasks to exercise the exact reward path; never personal tasks.
 for(let i=1;i<24;i++){const res=await page.request.post(`http://127.0.0.1:8876/api/workspace/tasks/fixture-${i}/complete`,{headers:{'X-Fifones-City':'1'},data:{}});assert.equal(res.status(),200)}
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__fifonesCity?.state?.credits===275)
 for(const a of [{kind:'stunt',x:5,y:5},{kind:'chatgpt',x:9,y:5},{kind:'claude',x:11,y:8},{kind:'tree',x:7,y:8}]){const res=await act({type:'build',...a,rotation:0});assert.equal(res.status(),200)}
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__fifonesCity?.engine?.stats().modelsLoaded===3,{timeout:60000})
 const tree=(await state()).placements.find(p=>p.kind==='tree'); assert.equal((await act({type:'upgrade',placement_id:tree.id})).status(),200); await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>window.__fifonesCity?.engine?.stats().modelsLoaded===3); const stats=await page.evaluate(()=>window.__fifonesCity.engine.stats());assert.deepEqual(stats.modelErrors,[]);assert.ok(stats.upgrades.some(p=>p.id===tree.id&&p.level===2&&p.detailMeshes===4));results.push('3 user landmark GLBs load textured; expansion earned');results.push('Upgrade creates visible level2 border, preserves GLBs')
 await page.getByRole('button',{name:'Recolher missões',exact:true}).click();await page.screenshot({path:'.verification/city-playtest-day.png',fullPage:true})
 await select('stunt');await page.getByRole('button',{name:'Entrar',exact:false}).click();assert.equal(await page.locator('iframe').count(),1);const logoTest=await page.evaluate(()=>{const e=window.__fifonesCity.engine;const r=[...e.records.values()].find(r=>r.placement.kind==='stunt');const p=r.logos[0]?.object;if(!p)return{hasLogo:false};const v=new e.floorHit.constructor();const before=p.getWorldPosition(v.clone());p.rotation.y=Math.PI/2;p.updateMatrixWorld(true);const after=p.getWorldPosition(v.clone());return{hasLogo:true,centerDrift:before.distanceTo(after),inUse:e.inUseId===r.placement.id}});assert.ok(logoTest.hasLogo&&logoTest.inUse);assert.ok(logoTest.centerDrift<0.00001);results.push('Separate logo spins on centered pivot while office is in use')
 await page.getByRole('button',{name:'Fechar espaço e voltar à cidade',exact:true}).click();results.push('Office opens within app and returns to saved city')
 const beforeActivity=(await state()).credits
 await page.request.post('http://127.0.0.1:8875/fixture/activity/working')
 await page.waitForFunction(()=>Object.values(window.__fifonesCity.engine.stats().activityStates).some(s=>s.kind==='chatgpt'&&s.signalState==='working'&&s.rotating&&s.lightOn),null,{timeout:18000})
 await select('chatgpt');await page.getByText('Codex trabalhando',{exact:true}).first().waitFor();results.push('Official work signal lights the actual office and rotates its logo')
 await page.request.post('http://127.0.0.1:8875/fixture/activity/waiting')
 await page.waitForFunction(()=>Object.values(window.__fifonesCity.engine.stats().activityStates).some(s=>s.kind==='chatgpt'&&s.signalState==='waiting'&&!s.rotating&&s.lightOn),null,{timeout:18000});results.push('Waiting shows static amber, without pretending to work')
 await page.request.post('http://127.0.0.1:8875/fixture/activity/idle')
 await page.waitForFunction(()=>Object.values(window.__fifonesCity.engine.stats().activityStates).some(s=>s.kind==='chatgpt'&&s.signalState==='idle'&&!s.rotating&&!s.lightOn),null,{timeout:18000});results.push('End signal stops the logo and restores building materials')
 assert.equal((await state()).credits,beforeActivity);results.push('AI activity never creates reward coins')
 await page.getByRole('button',{name:'Entardecer',exact:true}).click();await page.waitForTimeout(500);await page.screenshot({path:'.verification/city-playtest-dusk.png',fullPage:true})
 await page.mouse.move(700,500);await page.mouse.wheel(0,450);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>scrollY),0);assert.ok(await page.evaluate(()=>window.__fifonesCity.engine.camera.position.y>0));results.push('Wheel zoom; camera stays above ground')

 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390)
 await page.screenshot({path:'.verification/city-ux-mobile.png',fullPage:true})
 const goalBounds=await page.locator('.next-build').boundingBox();const missionBounds=await page.locator('.missions').boundingBox()
 assert.ok(goalBounds.y+goalBounds.height < missionBounds.y)
 const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:900}})
 const rp=await reduced.newPage();await rp.goto('http://127.0.0.1:8876/city.html',{waitUntil:'networkidle'});await rp.waitForFunction(()=>window.__fifonesCity?.engine?.records.size>0)
 assert.equal(await rp.evaluate(()=>window.__fifonesCity.engine.reducedMotion),true)
 assert.equal(await rp.locator('.reward-burst').count(),0);await reduced.close()
 results.push('Mobile goals do not overlap missions; reduced motion is respected')
 if(errors.length)console.log(JSON.stringify({errors,failedRequests}));assert.deepEqual(errors,[])
 fs.writeFileSync('.verification/browser-results.json',JSON.stringify({passed:results,stats,consoleErrors:errors,isolatedData:temp},null,2));console.log(JSON.stringify({passed:results,stats,consoleErrors:errors},null,2))
}finally{await browser?.close();server.kill();upstream.kill()}
