// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const TEMPLATE_ROOT = resolve(import.meta.dirname, '..')
const TEMPLATE_CONFIG = join(TEMPLATE_ROOT, 'vite.config.ts')

// A small multi-file game using the patterns that obfuscation must not break: a URL-referenced asset, a worker, a
// dynamic import, and the bridge's protocol string and host origin.
const FIXTURE = {
  'index.html': '<!doctype html><html><head></head><body><script type="module" src="./main.js"></script></body></html>',
  'main.js': [
    'export const PROTOCOL = \'maco-game/v1\'',
    'export const HOST = \'https://macogame.com\'',
    'export const sprite = new URL(\'./sprite.bin\', import.meta.url).href',
    'export const worker = new Worker(new URL(\'./worker.js\', import.meta.url), { type: \'module\' })',
    'void import(\'./lazy.js\').then(({ lazy }) => lazy(PROTOCOL, HOST, sprite))',
  ].join('\n'),
  'lazy.js': 'export function lazy(...values) { return values.join(\' \') }',
  'worker.js': 'self.onmessage = (event) => self.postMessage(event.data)',
  // Loaded by the Vite CLI with the template's own obfuscator plugin. A relative base, as Maco serves
  // multi-file builds from a versioned path, makes Vite rewrite `new URL` placeholders into string concatenation.
  'vite.config.mjs': [
    `import { obfuscatorPlugin } from ${JSON.stringify(TEMPLATE_CONFIG)}`,
    `export default { logLevel: 'error', base: './', plugins: [obfuscatorPlugin()], build: { outDir: 'out', emptyOutDir: true, target: 'es2019' } }`,
  ].join('\n'),
}

describe('opt-in obfuscation', () => {
  let root
  let files

  beforeAll(() => {
    // Inside the template, so the bundled config resolves its packages from the template's node_modules, but outside
    // node_modules itself, which the obfuscator skips.
    root = mkdtempSync(join(TEMPLATE_ROOT, '.maco-obfuscation-'))
    for (const [name, content] of Object.entries(FIXTURE)) writeFileSync(join(root, name), content)
    // Larger than Vite's inline limit, so it stays a separate file referenced through `new URL`.
    writeFileSync(join(root, 'sprite.bin'), Buffer.alloc(8_192, 7))
    const viteBin = join(dirname(createRequire(join(TEMPLATE_ROOT, 'package.json')).resolve('vite/package.json')), 'bin/vite.js')
    const result = spawnSync(process.execPath, [viteBin, 'build', '--config', 'vite.config.mjs'], { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`vite build failed:\n${result.stdout}\n${result.stderr}`)
    const assets = join(root, 'out', 'assets')
    files = Object.fromEntries(readdirSync(assets).map(name => [name, readFileSync(join(assets, name), 'utf8')]))
  }, 120_000)

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('keeps every module, worker and asset in the build', () => {
    const names = Object.keys(files)
    expect(names.some(name => name.startsWith('lazy-') && name.endsWith('.js'))).toBe(true)
    expect(names.some(name => name.startsWith('worker-') && name.endsWith('.js'))).toBe(true)
    expect(names.some(name => name.startsWith('sprite-') && name.endsWith('.bin'))).toBe(true)
    const code = Object.entries(files).filter(([name]) => name.endsWith('.js')).map(([, content]) => content).join('\n')
    expect(code).toMatch(/sprite-[\w-]+\.bin/)
    // Vite replaced every placeholder, which needs them double-quoted after obfuscation.
    expect(code).not.toContain('__VITE_')
  })

  it('hides the host origin but keeps the protocol string the upload check looks for', () => {
    const code = Object.values(files).join('\n')
    expect(code).toContain('maco-game/v1')
    expect(code).not.toContain('macogame.com')
  })
})

