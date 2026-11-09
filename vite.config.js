import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
 plugins: [vue()],
 publicDir: 'public-fifones',
 resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
 server: { host: '127.0.0.1', port: 5177, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8766' } },
 build: { chunkSizeWarningLimit: 1000, rollupOptions: { input: { app: fileURLToPath(new URL('./index.html', import.meta.url)), city: fileURLToPath(new URL('./city.html', import.meta.url)), world: fileURLToPath(new URL('./world.html', import.meta.url)) } } }
})
