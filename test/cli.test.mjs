import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(args, cwd = packageRoot) {
  return spawnSync(process.execPath, [path.join(packageRoot, 'bin/maco.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
  })
}

test('prints usage without an action', () => {
  const result = run([])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /maco <setup\|validate\|zip\|publish>/)
})

function withProject(manifest, body) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'maco-cli-test-'))
  try {
    writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    return body(projectRoot, () => JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')))
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
}

test('setup overwrites the Maco package scripts and keeps a key the developer chose', () => {
  withProject({
    name: 'test-game',
    maco: { key: 'old-game', obfuscate: true },
    scripts: { build: 'vite build', 'maco:zip': 'custom zip' },
  }, (projectRoot, manifest) => {
    const result = run(['setup'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.equal(manifest().scripts.build, 'vite build')
    assert.equal(manifest().scripts['maco:validate'], 'maco validate')
    assert.equal(manifest().scripts['maco:zip'], 'maco zip')
    assert.equal(manifest().scripts['maco:publish'], 'maco publish')
    assert.deepEqual(manifest().maco, { key: 'old-game', obfuscate: true })
    assert.match(result.stdout, /Giữ nguyên maco\.key: old-game/)
  })
})

test('setup derives the key from a scoped project name', () => {
  withProject({ name: '@lukhaiminh/shuttle-blitz' }, (projectRoot, manifest) => {
    const result = run(['setup'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.equal(manifest().maco.key, 'shuttle-blitz')
  })
})

test('setup replaces the template key with one derived from the project name', () => {
  withProject({ name: 'Space Runner', maco: { key: 'my-game' } }, (projectRoot, manifest) => {
    const result = run(['setup'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.equal(manifest().maco.key, 'space-runner')
  })
})

test('setup refuses a name that cannot become a key and leaves package.json unchanged', () => {
  withProject({ name: 'api' }, (projectRoot, manifest) => {
    const result = run(['setup'], projectRoot)

    assert.equal(result.status, 1)
    assert.match(result.stderr, /Đặt "maco": \{ "key": "\.\.\." \}/)
    assert.deepEqual(manifest(), { name: 'api' })
  })
})

test('publish needs a build script', () => {
  withProject({ name: 'test-game', version: '1.0.0', scripts: {} }, (projectRoot) => {
    const result = run(['publish'], projectRoot)

    assert.equal(result.status, 1)
    assert.match(result.stderr, /cần có script "build"/)
  })
})

test('publish skips typecheck and test when the project has none', () => {
  withProject({ name: 'test-game', version: '1.0.0', scripts: { build: 'node -e "process.exit(3)"' } }, (projectRoot) => {
    const result = run(['publish'], projectRoot)

    assert.match(result.stdout, /Bỏ qua "typecheck"/)
    assert.match(result.stdout, /Bỏ qua "test"/)
    // The failing build proves publish reached it and stops there.
    assert.equal(result.status, 3)
  })
})

test('zip uses the script bundled with the CLI, not a script in the game project', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'maco-cli-test-'))
  try {
    writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify({
      name: 'test-game',
      version: '1.2.3',
      maco: { key: 'test-game' },
    }, null, 2)}\n`)
    mkdirSync(path.join(projectRoot, 'dist'))
    writeFileSync(path.join(projectRoot, 'dist', 'index.html'), '<p>game</p>')

    const result = run(['zip'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Wrote maco-upload\/test-game-1\.2\.3\.zip/)
    assert.equal(existsSync(path.join(projectRoot, 'maco-upload', 'test-game-1.2.3.zip')), true)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('zip adds the classic bridge to a build without the Maco protocol, once', () => {
  withProject({ name: 'test-game', version: '1.2.3', maco: { key: 'test-game' } }, (projectRoot) => {
    mkdirSync(path.join(projectRoot, 'dist'))
    writeFileSync(path.join(projectRoot, 'dist', 'index.html'), '<html><head></head><body>game</body></html>')

    const first = run(['zip'], projectRoot)
    const second = run(['zip'], projectRoot)

    assert.equal(first.status, 0, first.stderr)
    assert.equal(second.status, 0, second.stderr)
    assert.match(first.stdout, /Added maco-bridge\.js to dist\//)
    const html = readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8')
    assert.equal(html.match(/maco-bridge\.js/g)?.length, 1)
    assert.equal(existsSync(path.join(projectRoot, 'dist', 'maco-bridge.js')), true)
  })
})

test('handoff refuses a README that is not UTF-8', () => {
  withProject({ name: 'test-game', version: '1.2.3', maco: { key: 'test-game' } }, (projectRoot) => {
    writeFileSync(path.join(projectRoot, 'README.md'), Buffer.from('# Game\n', 'utf16le'))

    const result = spawnSync(process.execPath, [path.join(packageRoot, 'scripts/handoff-maco.mjs'), '--dry-run'], {
      cwd: projectRoot,
      encoding: 'utf8',
    })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /UTF-8/)
  })
})

test('zip loads MACOGAME_DOMAIN from the project .env for its upload instruction', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'maco-cli-test-'))
  try {
    writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify({
      name: 'test-game',
      version: '1.2.3',
      maco: { key: 'test-game' },
    }, null, 2)}\n`)
    writeFileSync(path.join(projectRoot, '.env'), 'MACOGAME_DOMAIN=http://localhost:8787\n')
    mkdirSync(path.join(projectRoot, 'dist'))
    writeFileSync(path.join(projectRoot, 'dist', 'index.html'), '<p>game</p>')

    const result = run(['zip'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Upload it at http:\/\/localhost:8787\/developer\/game-submissions with:/)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('handoff reads the game metadata and prepares the submission form', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'maco-cli-test-'))
  try {
    writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify({
      name: 'test-game',
      version: '1.2.3',
      maco: { key: 'test-game' },
    }, null, 2)}\n`)
    writeFileSync(path.join(projectRoot, 'README.md'), '# Test game\nJump & run, A+B = 100%.\n')

    const result = spawnSync(process.execPath, [path.join(packageRoot, 'scripts/handoff-maco.mjs'), '--dry-run'], {
      cwd: projectRoot,
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Game key: test-game/)
    assert.match(result.stdout, /Version: 1\.2\.3/)
    assert.match(result.stdout, /README: README\.md/)
    const form = new URL(result.stdout.match(/Form: (.+)/)?.[1])
    assert.equal(form.searchParams.get('game_key'), 'test-game')
    assert.equal(form.searchParams.get('version'), '1.2.3')
    assert.equal(form.hash.startsWith('#readme='), true)
    assert.equal(decodeURIComponent(form.hash.slice('#readme='.length)), '# Test game\nJump & run, A+B = 100%.\n')
    assert.match(result.stdout, /Dry run hoàn tất/)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})
