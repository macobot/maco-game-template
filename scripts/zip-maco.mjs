#!/usr/bin/env node
// Packs `dist/` into `maco-upload/<key>-<version>.zip` for the upload form at
// https://macogame.com/developer/game-submissions, failing locally on every rule the server enforces.
import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yazl from 'yazl'

// The limits, the extension allow-list and the reserved keys are copies of server lists in maco-games:
// - limits: `shared/game-submissions/artifact-submission.ts`
// - extensions: `domains/game-submissions/server/services/artifact-content-types.ts`
// - key rules: `shared/game-submissions/game-key.ts`
// Any change to those lists must be copied here too.
export const MAX_ZIP_BYTES = 52_428_800
export const MAX_UNCOMPRESSED_BYTES = 157_286_400
export const MAX_FILES = 1000
export const MAX_PATH_BYTES = 512
// The upload form keeps at most this much README (`ARTIFACT_README_MAX_CHARS` in maco-games
// `shared/game-submissions/artifact-submission.ts`).
export const MAX_README_CHARS = 20_000

export const ARTIFACT_EXTENSIONS = [
  'html', 'htm', 'js', 'mjs', 'css', 'json', 'map', 'wasm', 'txt', 'xml', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'ktx2', 'basis',
  'mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac', 'opus', 'mp4', 'webm',
  'ttf', 'otf', 'woff', 'woff2', 'glb', 'gltf', 'bin', 'data', 'unityweb', 'pck', 'atlas', 'fnt',
]

export const RESERVED_GAME_KEYS = ['thumbs', 'www', 'review', 'api', 'games', 'assets', 'static']

const GAME_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const GAME_KEY_MAX_LENGTH = 40
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// Semver 2.0 core and pre-release; `+` build metadata is refused because play URLs and purge prefixes encode it differently.
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i

/** The protocol string the server's bridge check looks for in `.html`, `.js` and `.mjs` files. */
export const BRIDGE_PROTOCOL = 'maco-game/v1'
const BRIDGE_SCAN_EXTENSIONS = new Set(['html', 'htm', 'js', 'mjs'])
const DEFAULT_MACOGAME_DOMAIN = 'https://macogame.com'
const CLASSIC_BRIDGE_FILE = 'maco-bridge.js'
const CLASSIC_BRIDGE_TAG = '<script data-maco-bridge="classic" src="./maco-bridge.js"></script>'
const classicBridgePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bridge', CLASSIC_BRIDGE_FILE)

export class ArtifactCheckError extends Error {
  name = 'ArtifactCheckError'
}

/** Returns the configurable Maco submission form URL shown after creating an artifact. */
export function submissionFormUrl(domain = process.env.MACOGAME_DOMAIN ?? DEFAULT_MACOGAME_DOMAIN) {
  try {
    const url = new URL(domain)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol')
    if (url.pathname !== '/' || url.search || url.hash) throw new Error('must be an origin')
    return new URL('/developer/game-submissions', url).toString()
  } catch {
    throw new ArtifactCheckError('MACOGAME_DOMAIN must be an HTTP(S) origin, for example https://macogame.com')
  }
}

/**
 * Adds the engine-neutral bridge to an artefact that does not already include the Maco protocol.
 *
 * This intentionally happens after the game's build: the CLI cannot safely rewrite an arbitrary
 * TypeScript entry point or guess its `mountGame` API, but every web build has an `index.html` that
 * can load this small handshake bridge. It prevents the player from timing out while leaving games
 * that already use the source-level Vite bridge untouched.
 */
export async function ensureArtifactBridge(root) {
  const distDir = path.join(root, 'dist')
  const { files } = await collectArtifactFiles(distDir)
  if (await hasBridge(files)) return false

  const indexPath = path.join(distDir, 'index.html')
  const html = await readFile(indexPath, 'utf8')
  // Keep the bridge aligned with a local/staging MACOGAME_DOMAIN as well as production.
  const hostOrigin = new URL(submissionFormUrl()).origin
  const source = (await readFile(classicBridgePath, 'utf8')).replaceAll(DEFAULT_MACOGAME_DOMAIN, hostOrigin)
  await writeFile(path.join(distDir, CLASSIC_BRIDGE_FILE), source)

  // Loading this synchronously in <head> lets it hear the host handshake before the game starts.
  // Re-running `maco zip` does not duplicate the tag, even if a previous run was interrupted.
  if (!html.includes(CLASSIC_BRIDGE_FILE)) {
    const headClose = /<\/head\s*>/i
    const bodyClose = /<\/body\s*>/i
    const nextHtml = headClose.test(html)
      ? html.replace(headClose, `  ${CLASSIC_BRIDGE_TAG}\n$&`)
      : bodyClose.test(html)
        ? html.replace(bodyClose, `  ${CLASSIC_BRIDGE_TAG}\n$&`)
        : `${html}\n${CLASSIC_BRIDGE_TAG}\n`
    await writeFile(indexPath, nextHtml)
  }
  return true
}

/**
 * Turns a package `name` into a game key candidate: drops an npm `@scope/`, folds accents and case, and joins the
 * remaining letters and digits with single hyphens. The result can still be invalid (reserved, too short), so check
 * it with `gameKeyProblem`.
 */
export function gameKeyFromName(name) {
  return name
    .replace(/^@[^/]+\//, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, GAME_KEY_MAX_LENGTH)
    .replace(/^-+|-+$/g, '')
}

/** Returns why `key` cannot name an uploaded game, or `undefined` when it is valid. */
export function gameKeyProblem(key) {
  if (typeof key !== 'string' || key.length === 0) {
    return 'package.json "maco.key" is missing'
  }
  if (key.length > GAME_KEY_MAX_LENGTH || !GAME_KEY_PATTERN.test(key)) {
    return `game key "${key}" must be lowercase letters, digits and single hyphens, at most ${GAME_KEY_MAX_LENGTH} characters`
  }
  if (RESERVED_GAME_KEYS.includes(key)) {
    return `game key "${key}" is reserved (${RESERVED_GAME_KEYS.join(', ')})`
  }
  if (key.startsWith('r-')) {
    return `game key "${key}" must not start with "r-"`
  }
  if (UUID_SHAPE.test(key)) {
    return `game key "${key}" must not be shaped like a UUID`
  }
  return undefined
}

/** Returns why `version` cannot name an uploaded build, or `undefined` when it is valid. */
export function versionProblem(version) {
  if (typeof version !== 'string' || version.length === 0) {
    return 'package.json "version" is missing'
  }
  if (version.includes('+')) {
    return `version "${version}" must not contain "+" build metadata`
  }
  if (!VERSION_PATTERN.test(version)) {
    return `version "${version}" must be semver, for example 1.0.0 or 1.0.0-beta.1`
  }
  return undefined
}

const NUMERIC_IDENTIFIER = /^(?:0|[1-9]\d*)$/

/**
 * The version after a valid `version`, as `npm version patch` writes it for a release (`1.0.0` → `1.0.1`) and
 * `npm version prerelease` for a pre-release (`1.0.0-beta.1` → `1.0.0-beta.2`, `1.0.0-rc` → `1.0.0-rc.0`).
 */
export function nextVersion(version) {
  const dash = version.indexOf('-')
  if (dash === -1) {
    const [major, minor, patch] = version.split('.')
    return `${major}.${minor}.${BigInt(patch) + 1n}`
  }
  const identifiers = version.slice(dash + 1).split('.')
  const last = identifiers.length - 1
  if (NUMERIC_IDENTIFIER.test(identifiers[last])) identifiers[last] = String(BigInt(identifiers[last]) + 1n)
  else identifiers.push('0')
  return `${version.slice(0, dash)}-${identifiers.join('.')}`
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * Walks `distDir` and returns its files with zip paths relative to it, throwing an `ArtifactCheckError` on the
 * first rule the server would reject: a symlink, a disallowed extension, an unsafe or duplicate name, too many
 * files, too many uncompressed bytes, or no root `index.html`.
 */
export async function collectArtifactFiles(distDir) {
  const distStat = await stat(distDir).catch(() => undefined)
  if (!distStat?.isDirectory()) {
    throw new ArtifactCheckError(`${distDir} does not exist; run \`pnpm build\` first`)
  }

  const files = []
  const identities = new Set()
  let totalBytes = 0

  async function walk(directory, prefix) {
    const entries = await readdir(directory)
    entries.sort()
    for (const name of entries) {
      const absolutePath = path.join(directory, name)
      const zipPath = prefix ? `${prefix}/${name}` : name
      const entryStat = await lstat(absolutePath)
      if (entryStat.isSymbolicLink()) {
        throw new ArtifactCheckError(`${zipPath} is a symlink; symlinks are not allowed`)
      }
      if (name.includes('\\')) {
        throw new ArtifactCheckError(`${zipPath} contains a backslash; rename it`)
      }
      // Browsers treat these as URL syntax, so a file named with them could never be fetched.
      if (/[%?#]/.test(name)) {
        throw new ArtifactCheckError(`${zipPath} contains %, ? or #; rename it`)
      }
      if (Buffer.byteLength(zipPath, 'utf8') > MAX_PATH_BYTES) {
        throw new ArtifactCheckError(`${zipPath} is longer than ${MAX_PATH_BYTES} bytes; shorten it`)
      }
      if (entryStat.isDirectory()) {
        await walk(absolutePath, zipPath)
        continue
      }
      if (!entryStat.isFile()) {
        throw new ArtifactCheckError(`${zipPath} is not a regular file`)
      }
      // Finder drops .DS_Store into folders it opens; the Maco server ignores it, so leave it out of the zip.
      if (name === '.DS_Store') {
        continue
      }
      const extension = extensionOf(name)
      if (!ARTIFACT_EXTENSIONS.includes(extension)) {
        throw new ArtifactCheckError(`${zipPath} has a disallowed extension "${extension || '(none)'}"; allowed: ${ARTIFACT_EXTENSIONS.join(' ')}`)
      }
      const identity = zipPath.normalize('NFC').toLowerCase()
      if (identities.has(identity)) {
        throw new ArtifactCheckError(`${zipPath} differs from another file only by letter case or Unicode form`)
      }
      identities.add(identity)
      files.push({ absolutePath, path: zipPath, size: entryStat.size })
      if (files.length > MAX_FILES) {
        throw new ArtifactCheckError(`dist/ has more than ${MAX_FILES} files`)
      }
      totalBytes += entryStat.size
      if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new ArtifactCheckError(`dist/ is larger than ${MAX_UNCOMPRESSED_BYTES} bytes uncompressed`)
      }
    }
  }

  await walk(distDir, '')
  if (!files.some(file => file.path === 'index.html')) {
    throw new ArtifactCheckError('dist/ has no index.html at its root')
  }
  return { files, totalBytes }
}

/** Mirrors the server's warning-only bridge check. */
export async function hasBridge(files) {
  for (const file of files) {
    if (BRIDGE_SCAN_EXTENSIONS.has(extensionOf(file.path))) {
      const text = await readFile(file.absolutePath, 'utf8')
      if (text.includes(BRIDGE_PROTOCOL)) {
        return true
      }
    }
  }
  return false
}

/** Writes the files to `outFile` and returns the zip size, removing the zip and throwing when it is over the limit. */
export async function writeArtifactZip(files, outFile) {
  await mkdir(path.dirname(outFile), { recursive: true })
  const zip = new yazl.ZipFile()
  for (const file of files) {
    zip.addFile(file.absolutePath, file.path)
  }
  await new Promise((resolve, reject) => {
    const output = createWriteStream(outFile)
    output.on('close', resolve)
    output.on('error', reject)
    zip.outputStream.on('error', reject)
    zip.outputStream.pipe(output)
    zip.end()
  })
  const { size } = await stat(outFile)
  if (size > MAX_ZIP_BYTES) {
    await rm(outFile, { force: true })
    throw new ArtifactCheckError(`the zip is ${size} bytes, over the ${MAX_ZIP_BYTES}-byte limit`)
  }
  return size
}

export async function validateProject(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const key = manifest.maco?.key
  const version = manifest.version
  const problem = gameKeyProblem(key) ?? versionProblem(version)
  if (problem) {
    throw new ArtifactCheckError(problem)
  }

  const { files, totalBytes } = await collectArtifactFiles(path.join(root, 'dist'))
  const bridgeFound = await hasBridge(files)
  if (!bridgeFound) {
    console.warn(`warning: no .html, .js or .mjs file contains "${BRIDGE_PROTOCOL}"; maco zip/publish will add the classic iframe bridge to dist/`)
  }

  return { key, version, files, totalBytes, bridgeFound }
}

export async function zipProject(root) {
  const bridgeAdded = await ensureArtifactBridge(root)
  const { key, version, files, totalBytes } = await validateProject(root)
  const outFile = path.join(root, 'maco-upload', `${key}-${version}.zip`)
  const zipBytes = await writeArtifactZip(files, outFile)

  return { key, version, files, totalBytes, outFile, zipBytes, bridgeAdded }
}

async function main() {
  const root = process.cwd()
  const envFile = path.join(root, '.env')
  if (await stat(envFile).then(file => file.isFile()).catch(() => false)) process.loadEnvFile(envFile)
  const args = process.argv.slice(2)
  const validateOnly = args.length === 1 && args[0] === '--validate'
  if (args.length > 0 && !validateOnly) {
    throw new ArtifactCheckError(`unknown option ${args[0]}; use --validate or no options`)
  }

  if (validateOnly) {
    const { key, version, files, totalBytes } = await validateProject(root)
    console.log(`Validated ${key}@${version}: ${files.length} files, ${totalBytes} bytes uncompressed.`)
    return
  }

  const { key, version, files, totalBytes, outFile, zipBytes, bridgeAdded } = await zipProject(root)

  if (bridgeAdded) console.log(`Added ${CLASSIC_BRIDGE_FILE} to dist/ so the game can complete the Maco iframe handshake.`)
  console.log(`Wrote ${path.relative(root, outFile)}: ${files.length} files, ${totalBytes} bytes uncompressed, ${zipBytes} bytes zipped.`)
  console.log(`Upload it at ${submissionFormUrl()} with:`)
  console.log(`  Game key: ${key}`)
  console.log(`  Version:  ${version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof ArtifactCheckError ? `maco:zip: ${error.message}` : error)
    process.exitCode = 1
  })
}
