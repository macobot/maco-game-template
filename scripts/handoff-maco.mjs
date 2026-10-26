#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const SUBMISSION_FORM_URL = 'https://macogame.com/developer/game-submissions'

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

const args = process.argv.slice(2).filter((argument) => argument !== '--')
if (args.length) fail('Cú pháp: pnpm maco:handoff')
if (!existsSync('package.json')) fail('Không tìm thấy package.json ở root repository.')

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const repositoryMatch = packageJson.repository?.url?.match(/^git\+https:\/\/github\.com\/([^/]+)\/([^/]+?)\.git$/)
if (!repositoryMatch) fail('package.json:repository.url phải có dạng git+https://github.com/owner/repo.git.')
if (!packageJson.name?.startsWith('@')) fail('package.json:name phải là scoped package name.')

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
console.log(`Form: ${formUrl}`)
openUrl(formUrl)
