#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
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

function metadataErrors(packageJson, remote) {
  const errors = []
  const expectedScope = remote.owner.toLowerCase()
  const nameMatch = packageJson.name?.match(/^@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)$/)
  if (!nameMatch || nameMatch[1] !== expectedScope) {
    errors.push(`package.json:name phải bắt đầu bằng @${expectedScope}/.`)
  }
  if (!packageJson.description?.trim()) errors.push('package.json:description không được để trống.')

  const expectedRepository = `git+https://github.com/${remote.owner}/${remote.repository}.git`
  if (packageJson.repository?.url !== expectedRepository) {
    errors.push(`package.json:repository.url phải là ${expectedRepository}.`)
  }
  if (packageJson.publishConfig?.registry !== 'https://npm.pkg.github.com') {
    errors.push('package.json:publishConfig.registry phải là https://npm.pkg.github.com.')
  }
  return errors
}

function openUrl(url) {
  const [opener, openerArgs] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]]
  const result = spawnSync(opener, openerArgs, { stdio: 'ignore', detached: true })
  if (result.error || result.status !== 0) console.warn(`Không thể tự mở trình duyệt. Mở URL này sau khi workflow publish xong:\n${url}`)
}

async function initializeMetadata(errors) {
  console.error(`\n✖ Metadata chưa hợp lệ:\n${errors.map((error) => `  - ${error}`).join('\n')}`)
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail('Chạy pnpm maco:init để đồng bộ metadata, rồi chạy lại pnpm maco:publish.')
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await prompt.question('Chạy pnpm maco:init để tự động cập nhật metadata? (Y/n) ')).trim().toLowerCase()
  prompt.close()
  if (answer === 'n' || answer === 'no') fail('Đã hủy publish.')
  command('node', ['scripts/init-maco.mjs'])
}

const args = process.argv.slice(2).filter((argument) => argument !== '--')
if (args.length) fail('Cú pháp: pnpm maco:publish')
if (!existsSync('package.json')) fail('Không tìm thấy package.json ở root repository.')
if (!existsSync('pnpm-lock.yaml')) fail('Thiếu pnpm-lock.yaml ở root repository.')

const remote = getGitHubRemote()
let packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
let errors = metadataErrors(packageJson, remote)
if (errors.length) {
  await initializeMetadata(errors)
  packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  errors = metadataErrors(packageJson, remote)
  if (errors.length) fail(`Metadata vẫn chưa hợp lệ:\n${errors.map((error) => `  - ${error}`).join('\n')}`)
}

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

const packageName = releasedPackage.name.slice(releasedPackage.name.indexOf('/') + 1)
const packageUrl = `https://github.com/${remote.owner}/${remote.repository}/pkgs/npm/${packageName}`
const settingsUrl = `${packageUrl}/settings`
console.log(`Settings: ${settingsUrl}`)
openUrl(settingsUrl)
console.log('Trình duyệt đã được mở. Nếu package chưa xuất hiện, đợi workflow thành công rồi tải lại trang.')
console.log('Trong Package settings: (1) bỏ chọn “Inherit access from source repository (recommended)” nếu có; (2) rồi mới mời macobot với role Read.')

if (process.stdin.isTTY && process.stdout.isTTY) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  await prompt.question('Sau khi đã tắt inheritance và mời macobot với role Read, nhấn Enter để mở form Maco Games... ')
  prompt.close()
  command('node', ['scripts/handoff-maco.mjs'])
} else {
  console.log('Sau khi mời xong, chạy: pnpm maco:handoff')
}
