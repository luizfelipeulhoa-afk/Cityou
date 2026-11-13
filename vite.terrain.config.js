// Build da página de teste do terreno (/terrain.html), separado do build principal de propósito.
// Como entrada do mesmo build, ela redistribui os pacotes compartilhados e as páginas de produção passam a pedir
// mais arquivos (medido: início de 2 para 3, cidade de 4 para 7, mapa-mundo de 3 para 6). Aqui a página leva a sua
// própria cópia do three e do Vue, e o que o build principal gerou não é tocado.
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import tresTemplateOptions from '@tresjs/core/template-compiler-options'

export default defineConfig({
  plugins: [vue(tresTemplateOptions)],
  publicDir: false, // a pasta pública já foi copiada pelo build principal
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    emptyOutDir: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: { input: { terrain: fileURLToPath(new URL('./terrain.html', import.meta.url)) } },
  },
})
