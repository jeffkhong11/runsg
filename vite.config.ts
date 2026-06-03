import { defineConfig } from 'vite'

export default defineConfig({
  base: '/runsg/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('mapbox-gl')) return 'mapbox'
          if (id.includes('chart.js')) return 'charts'
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
