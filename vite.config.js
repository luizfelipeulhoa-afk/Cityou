import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
// TresJS: trata <TresMesh>, <primitive> etc. como elementos do renderizador 3D, não como componentes Vue.
import tresTemplateOptions from '@tresjs/core/template-compiler-options'
import { publishWorldModels, worldModelsIndex, writeWorldManifest } from './tools/world-models-manifest.mjs'

// Mantém public-fifones/models/world/manifest.json em dia com os GLB da pasta e publica os modelos:
// no build, cópias com o hash no nome e o models.json que aponta para elas (cache imutável no servidor);
// no dev server, o mesmo models.json apontando para os arquivos de origem.
const worldModelsManifest = () => ({
  name: 'world-models-manifest',
  buildStart() { writeWorldManifest() },
  writeBundle(options) { publishWorldModels(options.dir) },
  configureServer(server) {
    server.watcher.on('all', (event, file) => {
      if ((event === 'add' || event === 'unlink') && file.endsWith('.glb') && file.replaceAll('\\', '/').includes('/models/world/')) writeWorldManifest()
    })
    server.middlewares.use('/models/world/models.json', (request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('Cache-Control', 'no-cache')
      response.end(JSON.stringify(worldModelsIndex()))
    })
  },
})
const devHost = '127.0.0.1'
const devPort = 5177
const devOrigin = `http://${devHost}:${devPort}`
const apiTarget = new URL(process.env.CITYOU_API || 'http://127.0.0.1:8787')

export default defineConfig({
 plugins: [vue(tresTemplateOptions), worldModelsManifest()],
 publicDir: 'public-fifones',
 resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
 server: {
   host: devHost,
   port: devPort,
   strictPort: true,
   proxy: {
     '/api': {
       target: apiTarget.href,
       changeOrigin: true,
       configure(proxy) {
         proxy.on('proxyReq', (forwarded, incoming) => {
           // Só a origem do Vite local pode ser traduzida para a origem do Worker.
           if (incoming.headers.origin === devOrigin) forwarded.setHeader('Origin', apiTarget.origin)
           else forwarded.removeHeader('Origin')
         })
       },
     },
   },
 },
 build: { chunkSizeWarningLimit: 1000, rollupOptions: { input: { app: fileURLToPath(new URL('./app.html', import.meta.url)), city: fileURLToPath(new URL('./city.html', import.meta.url)), world: fileURLToPath(new URL('./world.html', import.meta.url)) } } }
})
