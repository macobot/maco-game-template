// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_FILES,
  collectArtifactFiles,
  gameKeyFromName,
  gameKeyProblem,
  hasBridge,
  submissionFormUrl,
  versionProblem,
  writeArtifactZip,
} from './zip-maco.mjs'

describe('gameKeyProblem', () => {
  it.each(['my-game', 'a', 'space-runner-2', 'fixture-demo', 'a'.repeat(40)])('accepts %s', (key) => {
    expect(gameKeyProblem(key)).toBeUndefined()
  })

  it.each([
    undefined, '', 'My-Game', 'my_game', '-game', 'game-', 'my--game', 'a'.repeat(41),
    'api', 'assets', 'games', 'review', 'static', 'thumbs', 'www',
    'r-123', '123e4567-e89b-12d3-a456-426614174000',
  ])('rejects %s', (key) => {
    expect(gameKeyProblem(key)).toEqual(expect.any(String))
  })
})

describe('gameKeyFromName', () => {
  it.each([
    ['@lukhaiminh/shuttle-blitz', 'shuttle-blitz'],
    ['My_Game', 'my-game'],
    ['Trường Gà Nhí', 'truong-ga-nhi'],
    ['--space  runner 2--', 'space-runner-2'],
    [`@scope/${'a'.repeat(39)}-b`, 'a'.repeat(39)],
  ])('turns %s into %s', (name, key) => {
    expect(gameKeyFromName(name)).toBe(key)
    expect(gameKeyProblem(key)).toBeUndefined()
  })

  it('can still produce a key that gameKeyProblem refuses', () => {
    expect(gameKeyProblem(gameKeyFromName('@scope/api'))).toEqual(expect.any(String))
  })
})

describe('versionProblem', () => {
  it.each(['0.2.0', '1.0.0', '1.0.0-beta.1', '10.20.30-rc-1'])('accepts %s', (version) => {
    expect(versionProblem(version)).toBeUndefined()
  })

  it.each([undefined, '', '1.0', '01.0.0', 'v1.0.0', '1.0.0+build.1', '1.0.0-'])('rejects %s', (version) => {
    expect(versionProblem(version)).toEqual(expect.any(String))
  })
})

describe('submissionFormUrl', () => {
  it('uses the configured Maco domain', () => {
    expect(submissionFormUrl('http://localhost:3000')).toBe('http://localhost:3000/developer/game-submissions')
  })

  it.each(['ftp://macogame.com', 'https://macogame.com/path', 'not a URL'])('rejects an invalid domain: %s', (domain) => {
    expect(() => submissionFormUrl(domain)).toThrow('MACOGAME_DOMAIN must be an HTTP(S) origin')
  })
})

describe('collectArtifactFiles', () => {
  let dist

  beforeEach(async () => {
    dist = await mkdtemp(path.join(tmpdir(), 'maco-zip-'))
  })

  afterEach(async () => {
    await rm(dist, { recursive: true, force: true })
  })

  async function put(relativePath, content = 'x') {
    const file = path.join(dist, relativePath)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content)
  }

  it('returns sorted relative paths and the byte total for a valid build', async () => {
    await put('index.html', '<script src="./assets/index.js"></script>')
    await put('assets/index.js', 'const p = "maco-game/v1"')
    await put('assets/sprite.PNG', 'png')

    const { files, totalBytes } = await collectArtifactFiles(dist)
    expect(files.map(file => file.path)).toEqual(['assets/index.js', 'assets/sprite.PNG', 'index.html'])
    expect(totalBytes).toBe(files.reduce((sum, file) => sum + file.size, 0))
    expect(await hasBridge(files)).toBe(true)
  })

  it('fails when dist does not exist', async () => {
    await expect(collectArtifactFiles(path.join(dist, 'missing'))).rejects.toThrow('run `pnpm build` first')
  })

  it('fails without a root index.html', async () => {
    await put('game/index.html')
    await expect(collectArtifactFiles(dist)).rejects.toThrow('no index.html at its root')
  })

  it.each(['evil.exe', 'bundle.js.br', 'bundle.js.gz', 'notes.DS_Store', 'LICENSE'])('fails on the disallowed file %s', async (name) => {
    await put('index.html')
    await put(name)
    await expect(collectArtifactFiles(dist)).rejects.toThrow('disallowed extension')
  })

  it.each(['a%20b.js', 'a?b.js', 'c#d.js'])('fails on the URL-unsafe name %s', async (name) => {
    await put('index.html')
    await put(name)
    await expect(collectArtifactFiles(dist)).rejects.toThrow('contains %, ? or #')
  })

  it('accepts a 512-byte path and refuses a 513-byte one', async () => {
    await put('index.html')
    const folders = `${'d'.repeat(200)}/${'e'.repeat(200)}`
    await put(`${folders}/${'a'.repeat(107)}.js`)
    await expect(collectArtifactFiles(dist)).resolves.toBeTruthy()
    await put(`${folders}/${'b'.repeat(108)}.js`)
    await expect(collectArtifactFiles(dist)).rejects.toThrow('longer than 512 bytes')
  })

  it('leaves Finder .DS_Store files out of the zip', async () => {
    await put('index.html')
    await put('.DS_Store')
    await put('assets/.DS_Store')
    const { files } = await collectArtifactFiles(dist)
    expect(files.map(file => file.path)).toEqual(['index.html'])
  })

  it('fails on a symlink', async () => {
    await put('index.html')
    await symlink(path.join(dist, 'index.html'), path.join(dist, 'link.html'))
    await expect(collectArtifactFiles(dist)).rejects.toThrow('symlink')
  })

  it(`fails above ${MAX_FILES} files`, async () => {
    await put('index.html')
    await Promise.all(Array.from({ length: MAX_FILES }, (_, index) => put(`assets/${index}.txt`)))
    await expect(collectArtifactFiles(dist)).rejects.toThrow(`more than ${MAX_FILES} files`)
  })

  it('reports a build without the bridge protocol', async () => {
    await put('index.html', '<p>no bridge</p>')
    const { files } = await collectArtifactFiles(dist)
    expect(await hasBridge(files)).toBe(false)
  })

  it('writes a zip whose entries are relative to dist', async () => {
    await put('index.html', '<p>hi</p>')
    await put('assets/app.js', 'x')
    const { files } = await collectArtifactFiles(dist)
    const outFile = path.join(dist, 'out', 'game.zip')
    const size = await writeArtifactZip(files, outFile)
    const zip = await readFile(outFile)
    expect(size).toBe(zip.length)
    expect(zip.includes('assets/app.js')).toBe(true)
    expect(zip.includes('index.html')).toBe(true)
    expect(zip.includes(dist)).toBe(false)
  })
})
