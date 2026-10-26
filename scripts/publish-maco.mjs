#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function command(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    stdio: options.stdio ?? 'inherit',
  })
  if (result.error) fail(`Không thể chạy ${commandName}: ${result.error.message}`)
  if (result.status !== 0) fail(`Lệnh thất bại: ${commandName} ${commandArgs.join(' ')}`)
  return result.stdout?.trim() ?? ''
}

function output(commandName, commandArgs) {
  return command(commandName, commandArgs, { stdio: 'pipe' })
}

function getGitHubRemote() {
  const remote = output('git', ['remote', 'get-url', 'origin'])
  const match = remote.match(/^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+)\/([^/#]+?)(?:\.git)?$/)
  if (!match) fail('origin phải là remote GitHub dạng git@github.com:owner/repo.git hoặc https://github.com/owner/repo.git.')
  return { owner: match[1], repository: match[2] }
}

function validatePackage(packageJson, remote) {
  const expectedScope = remote.owner.toLowerCase()
  const nameMatch = packageJson.name?.match(/^@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)$/)
  if (!nameMatch || nameMatch[1] !== expectedScope) {
    fail(`package.json:name phải bắt đầu bằng @${expectedScope}/.`)
  }
  if (!packageJson.description?.trim()) fail('package.json:description không được để trống.')

  const expectedRepository = `git+https://github.com/${remote.owner}/${remote.repository}.git`
  if (packageJson.repository?.url !== expectedRepository) {
    fail(`package.json:repository.url phải là ${expectedRepository}.`)
  }
  if (packageJson.publishConfig?.registry !== 'https://npm.pkg.github.com') {
    fail('package.json:publishConfig.registry phải là https://npm.pkg.github.com.')
  }
}

const args = process.argv.slice(2).filter((argument) => argument !== '--')
if (args.length) fail('Cú pháp: pnpm maco:publish')
if (!existsSync('package.json')) fail('Không tìm thấy package.json ở root repository.')
if (!existsSync('pnpm-lock.yaml')) fail('Thiếu pnpm-lock.yaml ở root repository.')

const remote = getGitHubRemote()
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
validatePackage(packageJson, remote)

const branch = output('git', ['branch', '--show-current'])
if (!branch) fail('Không thể release từ detached HEAD.')
if (!output('git', ['config', '--get', 'user.name']) || !output('git', ['config', '--get', 'user.email'])) {
  fail('Cần cấu hình git user.name và user.email trước khi tạo release commit.')
}

console.log(`\n→ Kiểm tra ${packageJson.name} trên nhánh ${branch}...`)
command('pnpm', ['install', '--frozen-lockfile'])
command('pnpm', ['typecheck'])
command('pnpm', ['build'])

command('pnpm', ['version', 'patch', '--no-git-tag-version'])
const releasedPackage = JSON.parse(readFileSync('package.json', 'utf8'))
const tag = `v${releasedPackage.version}`
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag)) {
  fail(`Version không hợp lệ sau khi bump: ${releasedPackage.version}`)
}

command('git', ['add', '--all'])
command('git', ['commit', '-m', `chore: release ${tag}`])
command('git', ['tag', '-a', tag, '-m', tag])
command('git', ['push', 'origin', 'HEAD', tag])

console.log(`\n✓ Đã phát hành ${releasedPackage.name}@${releasedPackage.version}.`)
console.log(`✓ Đã push commit và tag ${tag}; GitHub Actions sẽ publish package private.`)
