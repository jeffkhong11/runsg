import { defineConfig } from 'vite'

export default defineConfig({
  base: '/runsg/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
})
