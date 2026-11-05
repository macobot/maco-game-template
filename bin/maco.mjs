#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function command(name, args) {
  const result = spawnSync(name, args, { cwd: process.cwd(), stdio: 'inherit' })
  if (result.error) fail(`Không thể chạy ${name}: ${result.error.message}`)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function runProjectScript(name) {
  const usesNpm = process.env.npm_config_user_agent?.startsWith('npm/')
  command(usesNpm ? 'npm' : 'pnpm', usesNpm ? ['run', name] : [name])
}

function zipScript() {
  const script = path.resolve('scripts/zip-maco.mjs')
  if (!existsSync(script)) fail('Không tìm thấy scripts/zip-maco.mjs. Dùng Maco upload template hoặc thêm zip script vào project.')
  return script
}

function setup() {
  const packagePath = path.resolve('package.json')
  if (!existsSync(packagePath)) fail('Không tìm thấy package.json ở root project.')

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  const aliases = {
    'maco:validate': 'maco validate',
    'maco:zip': 'maco zip',
    'maco:publish': 'maco publish',
  }
  const scripts = { ...packageJson.scripts }
  for (const [name, value] of Object.entries(aliases)) {
    if (scripts[name] && scripts[name] !== value) fail(`package.json đã có scripts.${name} khác (${scripts[name]}). Không tự ghi đè.`)
    scripts[name] = value
  }
  writeFileSync(packagePath, `${JSON.stringify({ ...packageJson, scripts }, null, 2)}\n`)
  console.log('\n✓ Đã thêm maco:validate, maco:zip và maco:publish vào package.json.')
}

const [action, ...args] = process.argv.slice(2)
if (!action || !['setup', 'validate', 'zip', 'publish'].includes(action)) {
  fail('Cú pháp: maco <setup|validate|zip|publish>')
}
if (args.length) fail(`maco ${action} không nhận tham số.`)

if (action === 'setup') setup()
if (action === 'validate') command(process.execPath, [zipScript(), '--validate'])
if (action === 'zip') command(process.execPath, [zipScript()])
if (action === 'publish') {
  runProjectScript('typecheck')
  runProjectScript('test')
  runProjectScript('build')
  command(process.execPath, [zipScript()])
}
