import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('..', import.meta.url)

test('maco CLI prints usage without a command', () => {
  const result = spawnSync(process.execPath, ['bin/maco.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /maco <setup\|init\|publish>/)
})

test('maco publish supports a non-mutating dry run', () => {
  const result = spawnSync(process.execPath, ['bin/maco.mjs', 'publish', '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Dry run hợp lệ/)
})
