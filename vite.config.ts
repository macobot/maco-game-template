/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// A normal multi-file build. `base: './'` keeps every asset URL relative, because Maco serves the
// upload from a versioned path (`<key>/<version>/index.html`), never from the origin root.
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
  },
  test: {
    environment: 'happy-dom',
  },
})
