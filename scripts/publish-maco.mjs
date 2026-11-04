#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const BUMPS = new Set(['patch', 'minor', 'major'])

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

function parseArgs() {
  const flags = new Set()
  const positionals = []
  let slug

  for (const argument of process.argv.slice(2)) {
    if (argument === '--') continue
    if (argument === '--dry-run') {
      flags.add(argument)
      continue
    }
    if (argument.startsWith('--')) {
      const requestedSlug = argument.slice(2)
      if (!/^[a-z0-9][a-z0-9-]*$/.test(requestedSlug) || slug) {
        fail('Cú pháp: maco publish [--<game-slug>] [patch|minor|major] [--dry-run]')
      }
      slug = requestedSlug
      continue
    }
    positionals.push(argument)
  }

  if (positionals.length > 1 || (positionals[0] && !BUMPS.has(positionals[0]))) {
    fail('Cú pháp: maco publish [--<game-slug>] [patch|minor|major] [--dry-run]')
  }
  return { slug, bump: positionals[0] ?? 'patch', dryRun: flags.has('--dry-run') }
}

function metadataErrors(packageJson, remote, slug) {
  const errors = []
  const nameMatch = packageJson.name?.match(/^@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)$/)
  if (!nameMatch) {
    errors.push('package.json:name phải là npm scoped package, ví dụ @macobot/my-game.')
  }
  if (!packageJson.description?.trim()) errors.push('package.json:description không được để trống.')

  const expectedRepository = `git+https://github.com/${remote.owner}/${remote.repository}.git`
  if (packageJson.repository?.url !== expectedRepository) {
    errors.push(`package.json:repository.url phải là ${expectedRepository}.`)
  }
  if (packageJson.publishConfig?.registry !== 'https://registry.npmjs.org/' || packageJson.publishConfig?.access !== 'public') {
    errors.push('package.json:publishConfig phải dùng npmjs registry và access public.')
  }
  if (slug && packageJson.repository?.directory !== `games/${slug}`) {
    errors.push(`package.json:repository.directory phải là games/${slug}.`)
  }
  return errors
}

function initializeMetadata(errors, slug) {
  console.error(`\n✖ Metadata chưa hợp lệ:\n${errors.map((error) => `  - ${error}`).join('\n')}`)
  const commandSuffix = slug ? ` --${slug}` : ''
  fail(`Chạy maco init${commandSuffix} để đồng bộ metadata, commit thay đổi, rồi chạy lại maco publish${commandSuffix}.`)
}

const { slug, bump, dryRun } = parseArgs()
const packageDir = slug ? resolve('games', slug) : process.cwd()
const packagePath = resolve(packageDir, 'package.json')
if (!existsSync(packagePath)) {
  fail(slug ? `Không tìm thấy games/${slug}/package.json.` : 'Không tìm thấy package.json ở root repository.')
}
if (!existsSync('pnpm-lock.yaml')) fail('Thiếu pnpm-lock.yaml ở root repository.')

const remote = getGitHubRemote()
let packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
let errors = metadataErrors(packageJson, remote, slug)
if (errors.length) {
  initializeMetadata(errors, slug)
}

if (dryRun) {
  console.log(`✓ Dry run hợp lệ. Sẽ publish npm package và tạo tag ${slug ? `${slug}/` : ''}v<next-version>.`)
  process.exit(0)
}

const branch = output('git', ['branch', '--show-current'])
if (!branch) fail('Không thể release từ detached HEAD.')
if (output('git', ['status', '--porcelain'])) {
  fail('Working tree phải sạch trước khi release. Hãy commit hoặc stash thay đổi, rồi chạy lại.')
}
if (!output('git', ['config', '--get', 'user.name']) || !output('git', ['config', '--get', 'user.email'])) {
  fail('Cần cấu hình git user.name và user.email trước khi tạo release commit.')
}

console.log(`\n→ Kiểm tra ${packageJson.name} trên nhánh ${branch}...`)
command('pnpm', ['install', '--frozen-lockfile'])
command('pnpm', ['typecheck'], { cwd: packageDir })
command('pnpm', ['build'], { cwd: packageDir })

command('pnpm', ['version', bump, '--no-git-tag-version'], { cwd: packageDir })
const releasedPackage = JSON.parse(readFileSync(packagePath, 'utf8'))
const tag = `${slug ? `${slug}/` : ''}v${releasedPackage.version}`
if (!/^(?:[a-z0-9-]+\/)?v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag)) {
  fail(`Version không hợp lệ sau khi bump: ${releasedPackage.version}`)
}

console.log(`→ Publish ${releasedPackage.name}@${releasedPackage.version} lên npmjs...`)
command('pnpm', ['publish', '--access', 'public', '--no-git-checks', '--ignore-scripts'], { cwd: packageDir })

const stagedFiles = slug ? [`games/${slug}/package.json`, 'pnpm-lock.yaml'] : ['package.json', 'pnpm-lock.yaml']
command('git', ['add', '--', ...stagedFiles])
command('git', ['commit', '-m', slug ? `chore(${slug}): release v${releasedPackage.version}` : `chore: release ${tag}`])
command('git', ['tag', '-a', tag, '-m', tag])
command('git', ['push', 'origin', 'HEAD', tag])

console.log(`\n✓ Đã phát hành ${releasedPackage.name}@${releasedPackage.version}.`)
console.log(`✓ Đã publish npm package và push commit/tag ${tag}.`)

const packageUrl = `https://www.npmjs.com/package/${releasedPackage.name}`
console.log(`Package URL: ${packageUrl}`)
console.log('Không cần tạo package hay cấu hình GitHub Packages.')
