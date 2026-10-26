#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function getGitHubRemote() {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: 'pipe' })
  if (result.error || result.status !== 0) fail('Không thể đọc remote origin.')
  const remote = result.stdout.trim()
  const match = remote.match(/^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+)\/([^/#]+?)(?:\.git)?$/)
  if (!match) fail('origin phải là remote GitHub dạng git@github.com:owner/repo.git hoặc https://github.com/owner/repo.git.')
  return { owner: match[1], repository: match[2] }
}

const args = process.argv.slice(2).filter((argument) => argument !== '--')
if (args.length) fail('Cú pháp: pnpm maco:init')
if (!existsSync('package.json')) fail('Không tìm thấy package.json ở root repository.')

const remote = getGitHubRemote()
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const packageSlug = remote.repository.toLowerCase()
if (!/^[a-z0-9][a-z0-9._-]*$/.test(packageSlug)) {
  fail(`Tên repository ${remote.repository} không thể dùng làm package name.`)
}

const repositoryUrl = `git+https://github.com/${remote.owner}/${remote.repository}.git`
const nextPackage = {
  ...packageJson,
  name: `@${remote.owner.toLowerCase()}/${packageSlug}`,
  repository: { type: 'git', url: repositoryUrl },
  bugs: { url: `https://github.com/${remote.owner}/${remote.repository}/issues` },
  homepage: `https://github.com/${remote.owner}/${remote.repository}#readme`,
  publishConfig: { ...packageJson.publishConfig, registry: 'https://npm.pkg.github.com' },
}

writeFileSync('package.json', `${JSON.stringify(nextPackage, null, 2)}\n`)
console.log(`\n✓ Đã đồng bộ metadata cho ${nextPackage.name}`)
