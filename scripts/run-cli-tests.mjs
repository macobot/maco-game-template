import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const testFile = 'test/cli.test.mjs'

if (!existsSync(testFile)) {
  process.exit(0)
}

const result = spawnSync(process.execPath, ['--test', testFile], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
