#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import process from 'node:process'

const BUMPS = new Set(['patch', 'minor', 'major'])
const args = process.argv.slice(2).filter((argument) => argument !== '--')

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

function parseArgs() {
  const flags = new Set(args.filter((argument) => argument.startsWith('--')))
  const unknownFlags = [...flags].filter((flag) => !['--dry-run', '--no-open-settings', '--no-handoff'].includes(flag))
  const positionals = args.filter((argument) => !argument.startsWith('--'))

  if (unknownFlags.length || positionals.length < 1 || positionals.length > 2 || (positionals[1] && !BUMPS.has(positionals[1]))) {
    fail('Cú pháp: pnpm maco:publish -- <slug> [patch|minor|major] [--dry-run] [--no-open-settings] [--no-handoff]\nVí dụ chạy thử: pnpm maco:publish -- memory-bloom --dry-run')
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(positionals[0])) fail('slug phải là kebab-case chữ thường, ví dụ memory-bloom.')
  return {
    slug: positionals[0],
    bump: positionals[1] ?? 'patch',
    dryRun: flags.has('--dry-run'),
    openSettings: !flags.has('--no-open-settings'),
    handoff: !flags.has('--no-handoff'),
  }
}

function getGitHubRemote() {
  const remote = output('git', ['remote', 'get-url', 'origin'])
  const match = remote.match(/^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+)\/([^/#]+?)(?:\.git)?$/)
  if (!match) fail('origin phải là remote GitHub dạng git@github.com:owner/repo.git hoặc https://github.com/owner/repo.git.')
  return { owner: match[1], repository: match[2] }
}

function validatePackage(packageJson, slug, remote) {
  if (packageJson.maco?.initialized !== true || packageJson.maco?.slug !== slug) {
    fail(`Package games/${slug} chưa được khởi tạo. Chạy pnpm maco:init -- ${slug} trước khi publish.`)
  }
  const nameMatch = packageJson.name?.match(/^@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)$/)
  if (!nameMatch || nameMatch[1] !== remote.owner.toLowerCase()) {
    fail(`games/${slug}/package.json:name phải bắt đầu bằng @${remote.owner.toLowerCase()}/.`)
  }
  if (!packageJson.description?.trim()) fail(`games/${slug}/package.json:description không được để trống.`)
  const expectedRepository = `git+https://github.com/${remote.owner}/${remote.repository}.git`
  if (packageJson.repository?.url !== expectedRepository || packageJson.repository?.directory !== `games/${slug}`) {
    fail(`repository phải là ${expectedRepository} với directory games/${slug}. Chạy pnpm maco:init -- ${slug}.`)
  }
  if (packageJson.publishConfig?.registry !== 'https://npm.pkg.github.com') {
    fail(`games/${slug}/package.json:publishConfig.registry phải là https://npm.pkg.github.com.`)
  }
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

const { slug, bump, dryRun, openSettings, handoff } = parseArgs()
const packageDir = resolve('games', slug)
const packagePath = resolve(packageDir, 'package.json')
if (!existsSync(packagePath)) fail(`Không tìm thấy games/${slug}/package.json.`)
if (!existsSync('pnpm-lock.yaml')) fail('Thiếu pnpm-lock.yaml ở root workspace.')

const remote = getGitHubRemote()
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
validatePackage(packageJson, slug, remote)
const packageName = packageJson.name.slice(packageJson.name.indexOf('/') + 1)
const packageUrl = `https://github.com/${remote.owner}/${remote.repository}/pkgs/npm/${packageName}`
const settingsUrl = `${packageUrl}/settings`

console.log(`\n✓ Metadata hợp lệ: ${packageJson.name}`)
if (dryRun) {
  console.log(`✓ Dry run hoàn tất. Package settings: ${settingsUrl}`)
  process.exit(0)
}

const branch = output('git', ['branch', '--show-current'])
if (!branch) fail('Không thể release từ detached HEAD.')
if (output('git', ['status', '--porcelain']).trim()) {
  fail(`Working tree phải sạch trước khi release. Hãy commit hoặc stash thay đổi, rồi chạy lại pnpm maco:publish -- ${slug} ${bump}.`)
}
if (!output('git', ['config', '--get', 'user.name']) || !output('git', ['config', '--get', 'user.email'])) {
  fail('Cần cấu hình git user.name và user.email trước khi tạo release commit.')
}

command('pnpm', ['install', '--frozen-lockfile'])
for (const script of ['typecheck', 'test', 'check:locales', 'build']) {
  command('pnpm', ['--filter', `./games/${slug}`, 'run', script])
}
command('pnpm', ['version', bump, '--no-git-tag-version'], { cwd: packageDir })

const releasedPackage = JSON.parse(readFileSync(packagePath, 'utf8'))
const tag = `${slug}/v${releasedPackage.version}`
if (!/^[a-z0-9-]+\/v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag)) {
  fail(`Version không hợp lệ sau khi bump: ${releasedPackage.version}`)
}

command('git', ['add', '--', `games/${slug}/package.json`, 'pnpm-lock.yaml'])
command('git', ['commit', '-m', `chore(${slug}): release v${releasedPackage.version}`])
command('git', ['tag', '-a', tag, '-m', `${slug} v${releasedPackage.version}`])
command('git', ['push', 'origin', 'HEAD', tag])

console.log(`\n✓ Đã push ${tag}. GitHub Actions đang publish private package.`)
console.log(`Settings: ${settingsUrl}`)
if (openSettings) {
  openUrl(settingsUrl)
  console.log('Trình duyệt đã được mở. Nếu package chưa xuất hiện, đợi workflow thành công rồi tải lại trang.')
}
console.log('Trong Package settings: (1) bỏ chọn “Inherit access from source repository (recommended)” nếu có; (2) rồi mới mời macobot với role Read.')

if (handoff && openSettings && process.stdin.isTTY && process.stdout.isTTY) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  await prompt.question('Sau khi đã tắt inheritance và mời macobot với role Read, nhấn Enter để mở form Maco Games... ')
  prompt.close()
  command('node', ['scripts/handoff-maco.mjs', slug])
} else if (handoff) {
  console.log(`Sau khi mời xong, chạy: pnpm maco:handoff -- ${slug}`)
}
