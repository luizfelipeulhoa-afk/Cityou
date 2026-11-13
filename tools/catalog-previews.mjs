// Render catalog artwork from the actual local models. No ledger API writes.
// Uso: node tools/catalog-previews.mjs [url-base] [prefixo-de-id]
//   sem argumentos: o FastAPI local (porta 8766). Para os prédios do Rio: node tools/catalog-previews.mjs http://127.0.0.1:8787 rio-
//   (o Worker local, npm run dev:worker, serve o catálogo regional do Rio).
import fs from 'node:fs'
import { chromium, python, browserOptions } from './runtime.mjs'
const base = process.argv[2] || 'http://127.0.0.1:8766'
const prefix = process.argv[3] || ''
const browser = await chromium.launch({...browserOptions, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']})
try {
  const page = await browser.newPage({viewport:{width:1000,height:800}})
  await page.goto(`${base}/city.html`, {waitUntil:'networkidle'})
  await page.waitForFunction(() => window.__fifonesCity?.state?.catalog?.length)
  const catalog = await page.evaluate(() => window.__fifonesCity.state.catalog.filter(i => i.cost > 0))
    .then(items => items.filter(i => i.id.startsWith(prefix) && (!prefix || i.model || i.preview)))
  fs.mkdirSync('public-fifones/previews', {recursive:true})
  for (const item of catalog) {
    await page.evaluate(item => {
      const e = window.__fifonesCity.engine
      cancelAnimationFrame(e.raf)
      e.hydrated = false
      e.setState({...window.__fifonesCity.state, placements:[{id:'art-preview',kind:item.id,x:8,y:8,rotation:0,level:1}]})
    }, item)
    await page.waitForFunction(() => {
      const e=window.__fifonesCity.engine, r=e.records.get('art-preview')
      return r && !e.pendingModels && (!e.definitions.get(r.placement.kind).model || r.loaded)
    }, null, {timeout:60000})
    const url = await page.evaluate(item => {
      const e=window.__fifonesCity.engine, r=e.records.get('art-preview')
      const scene=new e.scene.constructor()
      scene.add(e.ambient.clone(), e.sun.clone())
      const body=r.sim.mesh.clone(true);scene.add(body)
      const camera=e.camera.clone();camera.aspect=320/288;camera.fov=32
      const extent=Math.max(r.height, item.width*0.9, item.depth*0.9, 0.7)
      camera.position.set(extent*1.65, extent*1.25+r.height*.35, extent*1.9)
      camera.lookAt(0,r.height*.43,0);camera.updateProjectionMatrix()
      const renderer=new e.renderer.constructor({alpha:true,antialias:true,preserveDrawingBuffer:true})
      renderer.setSize(320,288);renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0)
      renderer.outputColorSpace=e.renderer.outputColorSpace;renderer.toneMapping=e.renderer.toneMapping;renderer.toneMappingExposure=1.1
      renderer.render(scene,camera)
      const url=renderer.domElement.toDataURL('image/png');renderer.dispose();return url
    }, item)
    fs.writeFileSync(`public-fifones/previews/${item.id}.png`,Buffer.from(url.split(',')[1],'base64'))
    console.log(`Rendered ${item.id}`)
  }
} finally { await browser.close() }
