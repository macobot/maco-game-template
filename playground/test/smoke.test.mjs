import assert from 'node:assert/strict'
import test from 'node:test'

test('playground smoke test', () => {
  assert.equal('maco-cli-playground'.startsWith('maco-'), true)
})
