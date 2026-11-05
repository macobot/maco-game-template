#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const playgroundRoot = path.join(workspaceRoot, 'playground')
const action = process.argv[2]
const actions = new Set(['maco:validate', 'maco:zip', 'maco:publish'])

if (!actions.has(action) || process.argv.length !== 3) {
  console.error('Usage: node scripts/run-playground.mjs <maco:validate|maco:zip|maco:publish>')
  process.exit(1)
}

// The playground is a workspace test fixture, so its root command intentionally inherits this repository's local
// endpoint configuration. Explicit environment variables still take precedence over values in `.env`.
const envFile = path.join(workspaceRoot, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const result = spawnSync('pnpm', ['--dir', playgroundRoot, 'run', action], {
  cwd: workspaceRoot,
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error(`Could not run pnpm: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
