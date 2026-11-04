#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
if (args.length > 1 || (args[0] && !/^--[a-z0-9][a-z0-9-]*$/.test(args[0]))) {
  fail('Cú pháp: maco init [--<game-slug>]')
}
const slug = args[0]?.slice(2)
const packagePath = slug ? resolve('games', slug, 'package.json') : 'package.json'
if (!existsSync(packagePath)) {
  fail(slug ? `Không tìm thấy games/${slug}/package.json.` : 'Không tìm thấy package.json ở root repository.')
}

const remote = getGitHubRemote()
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const packageSlug = slug ?? remote.repository.toLowerCase()
if (!/^[a-z0-9][a-z0-9._-]*$/.test(packageSlug)) {
  fail(`Tên repository ${remote.repository} không thể dùng làm package name.`)
}

const repositoryUrl = `git+https://github.com/${remote.owner}/${remote.repository}.git`
const nextPackage = {
  ...packageJson,
  name: `@${remote.owner.toLowerCase()}/${packageSlug}`,
  repository: slug
    ? { type: 'git', url: repositoryUrl, directory: `games/${slug}` }
    : { type: 'git', url: repositoryUrl },
  bugs: { url: `https://github.com/${remote.owner}/${remote.repository}/issues` },
  homepage: `https://github.com/${remote.owner}/${remote.repository}#readme`,
  publishConfig: {
    ...packageJson.publishConfig,
    access: 'public',
    registry: 'https://registry.npmjs.org/',
  },
}

writeFileSync(packagePath, `${JSON.stringify(nextPackage, null, 2)}\n`)
console.log(`\n✓ Đã đồng bộ metadata cho ${nextPackage.name}`)
