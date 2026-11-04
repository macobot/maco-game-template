#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import process from 'node:process'

const command = process.argv[2]
const commands = {
  init: '../scripts/init-maco.mjs',
  publish: '../scripts/publish-maco.mjs',
  setup: '../scripts/setup-maco.mjs',
}

if (!command || !commands[command]) {
  console.error('Cú pháp: maco <setup|init|publish> [options]')
  process.exit(1)
}

const target = new URL(commands[command], import.meta.url)
process.argv = [process.execPath, fileURLToPath(target), ...process.argv.slice(3)]
await import(target.href)
