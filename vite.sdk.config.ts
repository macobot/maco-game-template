import { defineConfig } from 'vite'

/** Browser-only ESM entry published as `@macobot/maco-cli/sdk`. */
export default defineConfig({
  build: {
    target: 'es2019',
    outDir: 'sdk-dist',
    emptyOutDir: true,
    lib: {
      entry: 'sdk/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
  },
})
