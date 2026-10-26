#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import process from 'node:process'

const args = process.argv.slice(2).filter((argument) => argument !== '--')

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function output(commandName, commandArgs) {
  const result = spawnSync(commandName, commandArgs, { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' })
  return result.error || result.status !== 0 ? null : result.stdout.trim()
}

function parseArgs() {
  const options = {}
  const positionals = []

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) {
      positionals.push(argument)
      continue
    }
    if (!['--package', '--description'].includes(argument)) fail(`Tham số không hợp lệ: ${argument}.`)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) fail(`${argument} cần một giá trị.`)
    if (options[argument]) fail(`${argument} chỉ được dùng một lần.`)
    options[argument] = value.trim()
    index += 1
  }

  if (positionals.length !== 1) {
    fail('Cú pháp: pnpm maco:init -- <slug> [--package package-slug] [--description "Mô tả game"]')
  }
  return { slug: positionals[0], packageSlug: options['--package'], description: options['--description'] }
}

function requireSlug(value, label = 'slug') {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) fail(`${label} phải là kebab-case chữ thường, ví dụ memory-bloom.`)
  return value
}

function getGitHubRemote() {
  const remote = output('git', ['remote', 'get-url', 'origin'])
  const match = remote?.match(/^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+)\/([^/#]+?)(?:\.git)?$/)
  if (!match) fail('origin phải là remote GitHub dạng git@github.com:owner/repo.git hoặc https://github.com/owner/repo.git.')
  return { owner: match[1], repository: match[2] }
}

async function askForDescription() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail('Thiếu description. Chạy lại với --description "Mô tả game".')
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const description = (await prompt.question('Description của game: ')).trim()
  prompt.close()
  if (!description) fail('Description không được để trống.')
  return description
}

const { slug: rawSlug, packageSlug: requestedPackageSlug, description: requestedDescription } = parseArgs()
const slug = requireSlug(rawSlug)
const packageSlug = requireSlug(requestedPackageSlug ?? slug, '--package')
const packagePath = resolve('games', slug, 'package.json')
if (!existsSync(packagePath)) fail(`Không tìm thấy games/${slug}/package.json.`)

const remote = getGitHubRemote()
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const description = requestedDescription || packageJson.description?.trim() || await askForDescription()
if (!description) fail('Description không được để trống.')

const repositoryUrl = `git+https://github.com/${remote.owner}/${remote.repository}.git`
const nextPackage = {
  ...packageJson,
  name: `@${remote.owner.toLowerCase()}/${packageSlug}`,
  description,
  repository: { type: 'git', url: repositoryUrl, directory: `games/${slug}` },
  bugs: { url: `https://github.com/${remote.owner}/${remote.repository}/issues` },
  homepage: `https://github.com/${remote.owner}/${remote.repository}#readme`,
  maco: { ...packageJson.maco, initialized: true, slug },
}

writeFileSync(packagePath, `${JSON.stringify(nextPackage, null, 2)}\n`)

console.log(`\n✓ Đã khởi tạo ${nextPackage.name}`)
console.log(`✓ repository: ${repositoryUrl} (games/${slug})`)
console.log('✓ Kiểm tra thay đổi, commit, rồi chạy pnpm maco:publish -- ' + `${slug} --dry-run.`)
