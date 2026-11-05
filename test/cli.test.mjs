import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(args, cwd = packageRoot) {
  return spawnSync(process.execPath, [path.join(packageRoot, 'bin/maco.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
  })
}

test('prints usage without an action', () => {
  const result = run([])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /maco <setup\|validate\|zip\|publish>/)
})

test('setup adds the Maco package scripts without removing existing scripts', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'maco-cli-test-'))
  try {
    writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify({
      name: 'test-game',
      scripts: { build: 'vite build' },
    }, null, 2)}\n`)

    const result = run(['setup'], projectRoot)
    const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

    assert.equal(result.status, 0)
    assert.equal(manifest.scripts.build, 'vite build')
    assert.equal(manifest.scripts['maco:validate'], 'maco validate')
    assert.equal(manifest.scripts['maco:zip'], 'maco zip')
    assert.equal(manifest.scripts['maco:publish'], 'maco publish')
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})
