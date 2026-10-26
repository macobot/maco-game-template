import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// A standalone build stays portable: one HTML file with all game assets inlined.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2019',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
})
