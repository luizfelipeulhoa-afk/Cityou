// Build da página de apresentação (/, index.html), separado do build principal de propósito.
// Como entrada do mesmo build, cada página do app passava a pedir um arquivo a mais (medido: painel de 3 para 4,
// cidade de 5 para 6, mapa-mundo de 4 para 5). A página não usa Vue nem three: só o seu CSS e o seu script.
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  publicDir: false, // a pasta pública já foi copiada pelo build principal
  build: {
    emptyOutDir: false,
    rollupOptions: { input: { landing: fileURLToPath(new URL('./index.html', import.meta.url)) } },
  },
})
