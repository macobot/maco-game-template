import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('prints usage without an action', () => {
  const result = spawnSync(process.execPath, ['bin/maco.mjs'], {
    cwd: packageRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /maco <setup\|validate\|zip\|publish>/)
})
