#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const args = process.argv.slice(2)
if (args.length) {
  console.error('\n✖ Cú pháp: maco setup')
  process.exit(1)
}

if (!existsSync('package.json')) {
  console.error('\n✖ Không tìm thấy package.json ở root project.')
  process.exit(1)
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const aliases = {
  'maco:init': 'maco init',
  'maco:publish': 'maco publish',
}
const scripts = { ...packageJson.scripts }

for (const [name, command] of Object.entries(aliases)) {
  if (scripts[name] && scripts[name] !== command) {
    console.error(`\n✖ package.json đã có scripts.${name} khác (${scripts[name]}). Không tự ghi đè.`)
    process.exit(1)
  }
  scripts[name] = command
}

writeFileSync('package.json', `${JSON.stringify({ ...packageJson, scripts }, null, 2)}\n`)
console.log('\n✓ Đã thêm scripts.maco:init và scripts.maco:publish.')
console.log('✓ Tiếp theo chạy: pnpm maco:init, rồi pnpm maco:publish.')
