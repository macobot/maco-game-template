#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const SUBMISSION_FORM_URL = 'https://macogame.com/developer/game-submissions'
const args = process.argv.slice(2).filter((argument) => argument !== '--')

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function openUrl(url) {
  const [opener, openerArgs] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]]
  const result = spawnSync(opener, openerArgs, { stdio: 'ignore', detached: true })
  if (result.error || result.status !== 0) console.warn(`Không thể tự mở trình duyệt. Mở URL này:\n${url}`)
}

const dryRun = args.includes('--dry-run')
const slug = args.find((argument) => !argument.startsWith('--'))
const unknownArgs = args.filter((argument) => argument !== slug && argument !== '--dry-run')
if (!slug || unknownArgs.length || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  fail('Cú pháp: pnpm maco:handoff -- <slug> [--dry-run]')
}

const packagePath = resolve('games', slug, 'package.json')
if (!existsSync(packagePath)) fail(`Không tìm thấy games/${slug}/package.json.`)
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
if (packageJson.maco?.initialized !== true || packageJson.maco?.slug !== slug) {
  fail(`Package games/${slug} chưa được khởi tạo. Chạy pnpm maco:init -- ${slug}.`)
}

const repositoryMatch = packageJson.repository?.url?.match(/^git\+https:\/\/github\.com\/([^/]+)\/([^/]+?)\.git$/)
if (!repositoryMatch) fail('repository.url phải có dạng git+https://github.com/owner/repo.git.')

const [, owner, repository] = repositoryMatch
const packageName = packageJson.name
const packageUrl = `https://github.com/${owner}/${repository}/pkgs/npm/${packageName.slice(packageName.indexOf('/') + 1)}`
const formUrl = new URL(SUBMISSION_FORM_URL)
formUrl.search = new URLSearchParams({
  package_url: packageUrl,
  package_name: packageName,
  package_version: packageJson.version,
}).toString()

console.log(`\nPackage: ${packageName}`)
console.log(`Version: ${packageJson.version}`)
console.log(`Package URL: ${packageUrl}`)
console.log(`Form: ${formUrl.toString()}`)

if (dryRun) {
  console.log('✓ Dry run hoàn tất; chưa mở trình duyệt.')
  process.exit(0)
}

console.log('Chỉ submit form sau khi đã tắt Inherit access và mời macobot với role Read trên GitHub Package settings.')
openUrl(formUrl.toString())
