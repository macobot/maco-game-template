#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { gameKeyFromName, gameKeyProblem, nextVersion, versionProblem } from '../scripts/zip-maco.mjs'

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
  const source = readFileSync(packagePath, 'utf8')
  return { packagePath, source, packageJson: JSON.parse(source) }
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

/**
 * Replaces only the value of the top-level `version`, so the developer's indentation and key order survive and the
 * change to commit is one line. Refuses when the first `"version"` in the text is not the top-level one.
 */
function withVersion(source, packageJson, version) {
  const rewritten = source.replace(/("version"\s*:\s*)"[^"]*"/, `$1${JSON.stringify(version)}`)
  let parsed
  try {
    parsed = JSON.parse(rewritten)
  } catch {
    parsed = undefined
  }
  if (!isDeepStrictEqual(parsed, { ...packageJson, version })) {
    fail(`Không tự tăng được version: khóa "version" đầu tiên trong package.json không phải version của game. Đặt "version" thành ${version} rồi chạy lại.`)
  }
  return rewritten
}

/**
 * Moves `version` past every version that already has a zip in `maco-upload/`, because Maco accepts each version of
 * a key once. A version without a zip is the one the developer chose, so it is kept.
 */
function bumpPackagedVersion() {
  const { packagePath, source, packageJson } = readProjectManifest()
  const key = packageJson.maco?.key
  const current = packageJson.version
  // The zip step reports an invalid key or version, as before.
  if (gameKeyProblem(key) || versionProblem(current)) return
  const zipPath = (version) => path.join('maco-upload', `${key}-${version}.zip`)
  if (!existsSync(zipPath(current))) return

  let next = nextVersion(current)
  while (existsSync(zipPath(next))) next = nextVersion(next)
  writeFileSync(packagePath, withVersion(source, packageJson, next))
  console.log(`\n✓ Đã có ${zipPath(current)}; tăng version ${current} → ${next} trong package.json. Nhớ commit package.json.`)
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
  // Before the build, so a game that embeds its version at build time gets the new one.
  bumpPackagedVersion()
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
