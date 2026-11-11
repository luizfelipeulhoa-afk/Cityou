import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { writeWorldManifest } from './tools/world-models-manifest.mjs'

// Mantém public-fifones/models/world/manifest.json em dia com os GLB da pasta.
const worldModelsManifest = () => ({
  name: 'world-models-manifest',
  buildStart() { writeWorldManifest() },
  configureServer(server) {
    server.watcher.on('all', (event, file) => {
      if ((event === 'add' || event === 'unlink') && file.endsWith('.glb') && file.replaceAll('\\', '/').includes('/models/world/')) writeWorldManifest()
    })
  },
})
export default defineConfig({
 plugins: [vue(), worldModelsManifest()],
 publicDir: 'public-fifones',
 resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
 server: { host: '127.0.0.1', port: 5177, strictPort: true, proxy: { '/api': process.env.CITYOU_API || 'http://127.0.0.1:8766' } },
 build: { chunkSizeWarningLimit: 1000, rollupOptions: { input: { app: fileURLToPath(new URL('./index.html', import.meta.url)), city: fileURLToPath(new URL('./city.html', import.meta.url)), world: fileURLToPath(new URL('./world.html', import.meta.url)) } } }
})
