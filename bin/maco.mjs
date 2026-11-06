#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gameKeyFromName, gameKeyProblem } from '../scripts/zip-maco.mjs'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// The template ships this key; a project made from it has not chosen its own key yet.
const TEMPLATE_GAME_KEY = 'my-game'

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function command(name, args) {
  const result = spawnSync(name, args, { cwd: process.cwd(), stdio: 'inherit' })
  if (result.error) fail(`Không thể chạy ${name}: ${result.error.message}`)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function readProjectManifest() {
  const packagePath = path.resolve('package.json')
  if (!existsSync(packagePath)) fail('Không tìm thấy package.json ở root project.')
  return { packagePath, packageJson: JSON.parse(readFileSync(packagePath, 'utf8')) }
}

function runProjectScript(name) {
  const usesNpm = process.env.npm_config_user_agent?.startsWith('npm/')
  command(usesNpm ? 'npm' : 'pnpm', ['run', name])
}

function zipScript() {
  const script = path.join(packageRoot, 'scripts/zip-maco.mjs')
  if (!existsSync(script)) fail('Bản cài đặt @macobot/maco-cli không đầy đủ: thiếu scripts/zip-maco.mjs. Cài lại package.')
  return script
}

function handoffScript() {
  const script = path.join(packageRoot, 'scripts/handoff-maco.mjs')
  if (!existsSync(script)) fail('Bản cài đặt @macobot/maco-cli không đầy đủ: thiếu scripts/handoff-maco.mjs. Cài lại package.')
  return script
}

/**
 * Keeps a key the developer already chose, because a key is permanent on Maco after the first upload and a rename
 * of `name` must not move the game to a new key. Only a missing, invalid or template key is derived from `name`.
 */
function resolveGameKey(packageJson, currentKey) {
  if (typeof currentKey === 'string' && currentKey !== TEMPLATE_GAME_KEY && !gameKeyProblem(currentKey)) {
    return { key: currentKey, kept: true }
  }
  if (typeof packageJson.name !== 'string' || !packageJson.name) {
    fail('package.json cần có trường "name" là tên game, hoặc đặt sẵn "maco": { "key": "..." }.')
  }
  const key = gameKeyFromName(packageJson.name)
  const problem = gameKeyProblem(key)
  if (problem) {
    fail(`Không tạo được game key từ name "${packageJson.name}": ${problem}. Đặt "maco": { "key": "..." } trong package.json rồi chạy lại.`)
  }
  return { key, kept: false }
}

function setup() {
  const { packagePath, packageJson } = readProjectManifest()
  const aliases = {
    'maco:validate': 'maco validate',
    'maco:zip': 'maco zip',
    'maco:publish': 'maco publish',
  }
  const maco = packageJson.maco && typeof packageJson.maco === 'object' && !Array.isArray(packageJson.maco)
    ? packageJson.maco
    : {}
  const { key, kept } = resolveGameKey(packageJson, maco.key)
  writeFileSync(packagePath, `${JSON.stringify({
    ...packageJson,
    maco: { ...maco, key },
    scripts: { ...packageJson.scripts, ...aliases },
  }, null, 2)}\n`)
  console.log('\n✓ Đã ghi đè maco:validate, maco:zip, maco:publish trong package.json.')
  console.log(kept
    ? `✓ Giữ nguyên maco.key: ${key}.`
    : `✓ Đặt maco.key thành ${key}. Key là vĩnh viễn sau lần upload đầu tiên; sửa trong package.json nếu muốn key khác.`)
}

function publish() {
  const { packageJson } = readProjectManifest()
  const scripts = packageJson.scripts ?? {}
  if (!scripts.build) fail('package.json cần có script "build" tạo bản build web trong dist/.')
  // Checks are optional: a plain HTML or engine-exported project may have no type checker or tests.
  for (const name of ['typecheck', 'test']) {
    if (scripts[name]) runProjectScript(name)
    else console.log(`Bỏ qua "${name}": package.json không có script này.`)
  }
  runProjectScript('build')
  command(process.execPath, [zipScript()])
  command(process.execPath, [handoffScript()])
}

const [action, ...args] = process.argv.slice(2)
if (!action || !['setup', 'validate', 'zip', 'publish'].includes(action)) {
  fail('Cú pháp: maco <setup|validate|zip|publish>')
}
if (args.length) fail(`maco ${action} không nhận tham số.`)

if (action === 'setup') setup()
if (action === 'validate') command(process.execPath, [zipScript(), '--validate'])
if (action === 'zip') command(process.execPath, [zipScript()])
if (action === 'publish') publish()
