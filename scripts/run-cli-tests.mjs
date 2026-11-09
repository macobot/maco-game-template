import { existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const testDir = 'test'

// A project made from the template may delete the CLI tests; keep `pnpm verify` successful then.
const testFiles = existsSync(testDir)
  ? readdirSync(testDir).filter(name => name.endsWith('.test.mjs')).sort().map(name => path.join(testDir, name))
  : []

if (testFiles.length === 0) {
  process.exit(0)
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
