#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { MAX_README_CHARS, gameKeyProblem, submissionFormUrl, versionProblem } from './zip-maco.mjs'

const args = process.argv.slice(2).filter((argument) => argument !== '--')

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

// CreateProcess refuses a longer command line, so a Windows browser could not be opened with the URL at all.
const WINDOWS_MAX_URL_CHARS = 32_000

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
const readmeSource = readFileSync(readmePath, 'utf8')
// A UTF-16 file (PowerShell 5 writes one by default) reads as text with a NUL between characters.
if (readmeSource.includes('\u0000')) fail('README.md phải được lưu dưới dạng UTF-8.')
// The form keeps no more than this; cutting here also bounds the URL. Never split an emoji in half.
const readme = readmeSource.length > MAX_README_CHARS
  ? readmeSource.slice(0, MAX_README_CHARS).replace(/[\uD800-\uDBFF]$/, '')
  : readmeSource
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
// Percent-encode it as one value rather than form-encode it: the page's router decodes and rewrites the fragment on
// load, and a form-encoded `&` or `+` would then split the README or turn into a space.
formUrl.hash = `readme=${encodeURIComponent(readme)}`
if (process.platform === 'win32' && formUrl.toString().length > WINDOWS_MAX_URL_CHARS) {
  formUrl.hash = ''
  console.warn('README quá dài để Windows mở trong một đường link; hãy dán README vào form.')
}

console.log(`\nGame key: ${gameKey}`)
console.log(`Version: ${packageJson.version}`)
console.log(`README: ${readmePath}`)
if (readme !== readmeSource) console.warn(`README dài hơn ${MAX_README_CHARS} ký tự; form chỉ nhận phần đầu.`)
console.log(`Form: ${formUrl.toString()}`)

if (dryRun) {
  console.log('✓ Dry run hoàn tất; chưa mở trình duyệt.')
  process.exit(0)
}

console.log('Chọn file ZIP vừa tạo trong maco-upload rồi gửi form.')
openUrl(formUrl.toString())
