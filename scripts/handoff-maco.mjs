#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { gameKeyProblem, submissionFormUrl, versionProblem } from './zip-maco.mjs'

const args = process.argv.slice(2).filter((argument) => argument !== '--')

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function openUrl(url) {
  // On Windows, `cmd /c start` would read the `&` between query parameters as a command separator and drop the
  // version; the URL protocol handler receives the URL as one argument without a shell.
  const [opener, openerArgs] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : ['xdg-open', [url]]
  const result = spawnSync(opener, openerArgs, { stdio: 'ignore', detached: true })
  if (result.error || result.status !== 0) console.warn(`Không thể tự mở trình duyệt. Mở URL này:\n${url}`)
}

const dryRun = args.includes('--dry-run')
const unknownArgs = args.filter((argument) => argument !== '--dry-run')
if (unknownArgs.length) {
  fail('Cú pháp: maco handoff [--dry-run]')
}

const packagePath = 'package.json'
if (!existsSync(packagePath)) fail('Không tìm thấy package.json ở root project game.')
const readmePath = 'README.md'
if (!existsSync(readmePath)) fail('Không tìm thấy README.md ở root project game.')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const readme = readFileSync(readmePath, 'utf8')
const gameKey = packageJson.maco?.key
const gameKeyError = gameKeyProblem(gameKey)
if (gameKeyError) fail(gameKeyError)
const versionError = versionProblem(packageJson.version)
if (versionError) fail(versionError)

let formUrl
try {
  formUrl = new URL(submissionFormUrl())
} catch (error) {
  fail(error.message)
}
formUrl.search = new URLSearchParams({
  game_key: gameKey,
  version: packageJson.version,
}).toString()
// Keep README content in the fragment: the submission page can read it client-side without sending it in HTTP logs.
formUrl.hash = new URLSearchParams({ readme }).toString()

console.log(`\nGame key: ${gameKey}`)
console.log(`Version: ${packageJson.version}`)
console.log(`README: ${readmePath}`)
console.log(`Form: ${formUrl.toString()}`)

if (dryRun) {
  console.log('✓ Dry run hoàn tất; chưa mở trình duyệt.')
  process.exit(0)
}

console.log('Chọn file ZIP vừa tạo trong maco-upload rồi gửi form.')
openUrl(formUrl.toString())
