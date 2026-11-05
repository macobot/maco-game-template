/// <reference types="vitest/config" />
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import javascriptObfuscator from 'javascript-obfuscator'
import obfuscator from 'rollup-plugin-obfuscator'
import { defineConfig } from 'vite'

interface MacoPackageJson {
  maco?: {
    obfuscate?: boolean
  }
}

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as MacoPackageJson

/**
 * Opt-in with `"maco": { "obfuscate": true }`. Uses the same options as the minigames kit (`scripts/maco-game-vite.ts`):
 * it hides strings such as the bridge's host origin list so removing the Maco lock from a copy takes real effort.
 * Each module is obfuscated separately and `node_modules` is skipped, so engines and libraries stay untouched.
 */
export function obfuscatorPlugin(): Plugin {
  const base = obfuscator({
    global: false,
    // Regular expressions, not globs, so the filter does not depend on the working directory.
    include: [/\.[cm]?[jt]s$/],
    exclude: [/[\\/]node_modules[\\/]/],
    obfuscator: javascriptObfuscator,
    options: {
      compact: true,
      identifierNamesGenerator: 'hexadecimal',
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 1,
      // Must stay literal: Rollup still reads relative `import('./x')` specifiers after this step, Vite replaces its
      // `__VITE_*` placeholders when rendering chunks, and Maco's upload check looks for the protocol string.
      reservedStrings: ['^\\.{1,2}/', '__VITE_', '^maco-game/v1$'],
      // Off to keep frame time; `selfDefending` is off because Vite minifies after this step.
      controlFlowFlattening: false,
      deadCodeInjection: false,
      selfDefending: false,
      sourceMap: false,
    },
  })
  const obfuscate = base.transform as ObfuscatorTransform
  return {
    ...base,
    apply: 'build',
    // After Vite has resolved `import.meta.glob`, `new URL(..., import.meta.url)` and dynamic imports in each module.
    enforce: 'post',
    async transform(code, id) {
      const result = await obfuscate.call(this, code, id)
      return result ? { ...result, code: requoteVitePlaceholders(result.code) } : result
    },
  }
}

type ObfuscatorTransform = (this: unknown, code: string, id: string) => Promise<{ code: string, map?: unknown } | null | undefined> | { code: string, map?: unknown } | null | undefined

/**
 * The obfuscator prints every string in single quotes, but Vite later swaps an asset placeholder such as
 * `"__VITE_ASSET__…__"` for `"+new URL(…).href+"`, which is only valid inside double quotes. Put them back.
 */
function requoteVitePlaceholders(code: string): string {
  return code.replace(/'(__VITE_[\w$-]+)'/g, '"$1"')
}

// A normal multi-file build. `base: './'` keeps every asset URL relative, because Maco serves the
// upload from a versioned path (`<key>/<version>/index.html`), never from the origin root.
export default defineConfig({
  base: './',
  plugins: [packageJson.maco?.obfuscate === true ? obfuscatorPlugin() : null],
  build: {
    target: 'es2019',
  },
  test: {
    environment: 'happy-dom',
  },
})
