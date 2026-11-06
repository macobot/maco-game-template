import assert from 'node:assert/strict'
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
    writeFileSync(path.join(projectRoot, 'README.md'), '# Test game\nShort description.\n')

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
    assert.equal(new URLSearchParams(form.hash.slice(1)).get('readme'), '# Test game\nShort description.\n')
    assert.match(result.stdout, /Dry run hoàn tất/)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})
