import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { nextVersion, scoringProblem } from '../scripts/zip-maco.mjs'

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

test('nextVersion follows npm version patch for releases and prerelease for pre-releases', () => {
  assert.equal(nextVersion('1.0.0'), '1.0.1')
  assert.equal(nextVersion('0.9.9'), '0.9.10')
  assert.equal(nextVersion('1.0.0-beta.1'), '1.0.0-beta.2')
  assert.equal(nextVersion('1.0.0-1'), '1.0.0-2')
  assert.equal(nextVersion('1.0.0-rc'), '1.0.0-rc.0')
  assert.equal(nextVersion('1.0.0-pre-release.alpha'), '1.0.0-pre-release.alpha.0')
})

// The handoff opens a browser with `open` (macOS) or `xdg-open` (Linux); these stand-ins accept the URL and exit.
const publishTest = { skip: process.platform === 'win32' && 'the stand-in browser opener is a shell script' }

/**
 * Runs `maco publish` in a game project whose build writes `dist/index.html`. `files` seeds extra project files,
 * such as zips already in `maco-upload/`.
 */
function withPublishableProject({ manifestText, files = {} }, body) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'maco-cli-test-'))
  try {
    const fakeBin = path.join(projectRoot, '.fake-bin')
    mkdirSync(fakeBin)
    for (const opener of ['open', 'xdg-open']) {
      writeFileSync(path.join(fakeBin, opener), '#!/bin/sh\nexit 0\n')
      chmodSync(path.join(fakeBin, opener), 0o755)
    }
    writeFileSync(path.join(projectRoot, 'package.json'), manifestText)
    writeFileSync(path.join(projectRoot, 'README.md'), '# Test game\n')
    writeFileSync(path.join(projectRoot, 'build.mjs'), [
      "import { mkdirSync, writeFileSync } from 'node:fs'",
      "if (process.env.FAIL_BUILD) process.exit(4)",
      "mkdirSync('dist', { recursive: true })",
      "writeFileSync('dist/index.html', '<p>game</p>')",
    ].join('\n'))
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true })
      writeFileSync(path.join(projectRoot, file), content)
    }
    const publish = (env = {}) => spawnSync(process.execPath, [path.join(packageRoot, 'bin/maco.mjs'), 'publish'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
        // Run the project scripts with npm, which every Node install has.
        npm_config_user_agent: 'npm/10.0.0 node/v20.12.0',
        ...env,
      },
    })
    const manifestSource = () => readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
    const zipExists = (name) => existsSync(path.join(projectRoot, 'maco-upload', name))
    return body({ publish, manifestSource, zipExists })
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
}

function gameManifest(version, extra = {}) {
  return `${JSON.stringify({
    name: 'test-game',
    version,
    maco: { key: 'test-game' },
    scripts: { build: 'node build.mjs' },
    ...extra,
  }, null, 2)}\n`
}

function formVersion(stdout) {
  return new URL(stdout.match(/Form: (.+)/)?.[1]).searchParams.get('version')
}

test('publish keeps a version that has no zip yet', publishTest, () => {
  withPublishableProject({ manifestText: gameManifest('1.0.0') }, ({ publish, manifestSource, zipExists }) => {
    const result = publish()

    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(manifestSource()).version, '1.0.0')
    assert.equal(zipExists('test-game-1.0.0.zip'), true)
    assert.equal(formVersion(result.stdout), '1.0.0')
    assert.doesNotMatch(result.stdout, /tăng version/)
  })
})

test('publish moves past every version that already has a zip', publishTest, () => {
  withPublishableProject({
    manifestText: gameManifest('1.0.0'),
    files: { 'maco-upload/test-game-1.0.0.zip': '', 'maco-upload/test-game-1.0.1.zip': '' },
  }, ({ publish, manifestSource, zipExists }) => {
    const result = publish()

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /tăng version 1\.0\.0 → 1\.0\.2 trong package\.json/)
    assert.equal(JSON.parse(manifestSource()).version, '1.0.2')
    assert.equal(zipExists('test-game-1.0.2.zip'), true)
    assert.equal(formVersion(result.stdout), '1.0.2')
  })
})

test('publish bumps a pre-release the way npm version prerelease does', publishTest, () => {
  withPublishableProject({
    manifestText: gameManifest('2.0.0-rc'),
    files: { 'maco-upload/test-game-2.0.0-rc.zip': '' },
  }, ({ publish, manifestSource }) => {
    const result = publish()

    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(manifestSource()).version, '2.0.0-rc.0')
  })
})

test('publish rewrites only the version and keeps the file formatting', publishTest, () => {
  const manifestText = gameManifest('1.0.0', { config: { version: 'keep-me' } }).replaceAll('  ', '\t')
  withPublishableProject({
    manifestText,
    files: { 'maco-upload/test-game-1.0.0.zip': '' },
  }, ({ publish, manifestSource }) => {
    const result = publish()

    assert.equal(result.status, 0, result.stderr)
    assert.equal(manifestSource(), manifestText.replace('"version": "1.0.0"', '"version": "1.0.1"'))
  })
})

test('publish refuses to bump when the first "version" key is not the top-level one', publishTest, () => {
  const manifestText = `${JSON.stringify({
    name: 'test-game',
    config: { version: '9.9.9' },
    version: '1.0.0',
    maco: { key: 'test-game' },
    scripts: { build: 'node build.mjs' },
  }, null, 2)}\n`
  withPublishableProject({
    manifestText,
    files: { 'maco-upload/test-game-1.0.0.zip': '' },
  }, ({ publish, manifestSource }) => {
    const result = publish()

    assert.equal(result.status, 1)
    assert.match(result.stderr, /Đặt "version" thành 1\.0\.1 rồi chạy lại/)
    assert.equal(manifestSource(), manifestText)
  })
})

test('a build that fails after the bump does not bump again on the next run', publishTest, () => {
  withPublishableProject({
    manifestText: gameManifest('1.0.0'),
    files: { 'maco-upload/test-game-1.0.0.zip': '' },
  }, ({ publish, manifestSource, zipExists }) => {
    const failed = publish({ FAIL_BUILD: '1' })
    assert.equal(failed.status, 4)
    assert.equal(JSON.parse(manifestSource()).version, '1.0.1')

    const retried = publish()
    assert.equal(retried.status, 0, retried.stderr)
    assert.equal(JSON.parse(manifestSource()).version, '1.0.1')
    assert.equal(zipExists('test-game-1.0.1.zip'), true)
  })
})

test('zip never changes the version, even when its zip already exists', () => {
  withProject({ name: 'test-game', version: '1.2.3', maco: { key: 'test-game' } }, (projectRoot, manifest) => {
    mkdirSync(path.join(projectRoot, 'dist'))
    writeFileSync(path.join(projectRoot, 'dist', 'index.html'), '<p>game</p>')

    assert.equal(run(['zip'], projectRoot).status, 0)
    const second = run(['zip'], projectRoot)

    assert.equal(second.status, 0, second.stderr)
    assert.equal(manifest().version, '1.2.3')
  })
})

/** Lists the entry names of a zip from its central directory. */
function zipEntryNames(zipFile) {
  const zip = readFileSync(zipFile)
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  let offset = zip.readUInt32LE(end + 16)
  const names = []
  for (let index = 0; index < count; index++) {
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    names.push(zip.toString('utf8', offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return names
}

/** A project with a built `dist/index.html` and `maco.scoring` set to `scoring` (left out when `undefined`). */
function withScoringProject(scoring, body) {
  const maco = scoring === undefined ? { key: 'test-game' } : { key: 'test-game', scoring }
  return withProject({ name: 'test-game', version: '1.2.3', maco }, (projectRoot) => {
    mkdirSync(path.join(projectRoot, 'dist'))
    writeFileSync(path.join(projectRoot, 'dist', 'index.html'), '<p>game</p>')
    const setScoring = (next) => {
      const manifestPath = path.join(projectRoot, 'package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (next === undefined) delete manifest.maco.scoring
      else manifest.maco.scoring = next
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    }
    const scoringManifest = path.join(projectRoot, 'dist', 'maco.json')
    const zipFile = path.join(projectRoot, 'maco-upload', 'test-game-1.2.3.zip')
    return body({ projectRoot, setScoring, scoringManifest, zipFile })
  })
}

test('scoringProblem accepts a valid or absent declaration', () => {
  assert.equal(scoringProblem(undefined), undefined)
  assert.equal(scoringProblem({ maxScore: 1 }), undefined)
  assert.equal(scoringProblem({ maxScore: 1_000_000_000, order: 'asc' }), undefined)
  assert.equal(scoringProblem({ maxScore: 1000, order: 'desc' }), undefined)
})

test('scoringProblem explains every invalid declaration', () => {
  for (const scoring of [null, [], 'desc', 1000]) {
    assert.match(scoringProblem(scoring), /"maco\.scoring" must be an object/)
  }
  assert.match(scoringProblem({ maxScore: 1000, min: 0 }), /unknown key "min"; allowed: maxScore, order/)
  assert.match(scoringProblem({ maxScore: 1000, a: 1, b: 2 }), /unknown keys "a", "b"/)
  for (const maxScore of [undefined, 0, -1, 1.5, 1_000_000_001, '1000', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.match(scoringProblem({ maxScore }), /"maco\.scoring\.maxScore" must be an integer from 1 to 1000000000/)
  }
  for (const order of ['up', 'DESC', null, 1]) {
    assert.match(scoringProblem({ maxScore: 1000, order }), /"maco\.scoring\.order" must be "desc" or "asc"/)
  }
})

test('zip writes dist/maco.json with an explicit order and packs it at the zip root', () => {
  withScoringProject({ maxScore: 1000 }, ({ projectRoot, scoringManifest, zipFile }) => {
    const result = run(['zip'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(scoringManifest, 'utf8'), '{"scoring":{"maxScore":1000,"order":"desc"}}')
    assert.match(result.stdout, /Wrote dist\/maco\.json for scoring: maxScore 1000, order desc\./)
    assert.deepEqual(zipEntryNames(zipFile).sort(), ['index.html', 'maco-bridge.js', 'maco.json'])
  })
})

test('zip rewrites dist/maco.json when the declaration changes and removes it when scoring is dropped', () => {
  withScoringProject({ maxScore: 1000, order: 'desc' }, ({ projectRoot, setScoring, scoringManifest, zipFile }) => {
    assert.equal(run(['zip'], projectRoot).status, 0)

    setScoring({ maxScore: 90, order: 'asc' })
    const changed = run(['zip'], projectRoot)
    assert.equal(changed.status, 0, changed.stderr)
    assert.equal(readFileSync(scoringManifest, 'utf8'), '{"scoring":{"maxScore":90,"order":"asc"}}')

    setScoring(undefined)
    const dropped = run(['zip'], projectRoot)
    assert.equal(dropped.status, 0, dropped.stderr)
    assert.equal(existsSync(scoringManifest), false)
    assert.doesNotMatch(dropped.stdout, /maco\.json/)
    assert.equal(zipEntryNames(zipFile).includes('maco.json'), false)
  })
})

test('zip without scoring writes no maco.json', () => {
  withScoringProject(undefined, ({ projectRoot, scoringManifest, zipFile }) => {
    const result = run(['zip'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.equal(existsSync(scoringManifest), false)
    assert.equal(zipEntryNames(zipFile).includes('maco.json'), false)
  })
})

test('zip refuses a dist/maco.json the CLI did not write and leaves it in place', () => {
  for (const [scoring, content] of [
    [{ maxScore: 1000 }, '{"name":"my level data"}'],
    [undefined, '{"scoring":{"maxScore":1000,"order":"desc"}}\n'],
    [undefined, '{"scoring":{"maxScore":1000}}'],
    [undefined, 'not json'],
  ]) {
    withScoringProject(scoring, ({ projectRoot, scoringManifest, zipFile }) => {
      writeFileSync(scoringManifest, content)

      const result = run(['zip'], projectRoot)

      assert.equal(result.status, 1, content)
      assert.match(result.stderr, /maco:zip: dist\/maco\.json is reserved for the scoring declaration/)
      assert.equal(readFileSync(scoringManifest, 'utf8'), content)
      assert.equal(existsSync(zipFile), false)
    })
  }
})

test('zip refuses an invalid scoring declaration before writing anything', () => {
  withScoringProject({ maxScore: 0 }, ({ projectRoot, scoringManifest, zipFile }) => {
    const result = run(['zip'], projectRoot)

    assert.equal(result.status, 1)
    assert.match(result.stderr, /maco:zip: package\.json "maco\.scoring\.maxScore" must be an integer from 1 to 1000000000/)
    assert.equal(existsSync(scoringManifest), false)
    assert.equal(existsSync(zipFile), false)
  })
})

test('validate checks the scoring declaration without writing dist/maco.json', () => {
  withScoringProject({ maxScore: 500, order: 'asc' }, ({ projectRoot, scoringManifest }) => {
    const result = run(['validate'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Scoring: maxScore 500, order asc\./)
    assert.equal(existsSync(scoringManifest), false)
  })
  withScoringProject(undefined, ({ projectRoot }) => {
    const result = run(['validate'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Scoring: no maco\.scoring in package\.json/)
  })
})

test('validate refuses an invalid scoring declaration and a foreign dist/maco.json', () => {
  withScoringProject({ maxScore: 1000, order: 'desc', extra: true }, ({ projectRoot }) => {
    const result = run(['validate'], projectRoot)

    assert.equal(result.status, 1)
    assert.match(result.stderr, /unknown key "extra"; allowed: maxScore, order/)
  })
  withScoringProject({ maxScore: 1000, order: 'up' }, ({ projectRoot }) => {
    const result = run(['validate'], projectRoot)

    assert.equal(result.status, 1)
    assert.match(result.stderr, /"maco\.scoring\.order" must be "desc" or "asc"/)
  })
  withScoringProject({ maxScore: 1000 }, ({ projectRoot, scoringManifest }) => {
    writeFileSync(scoringManifest, '{"levels":[]}')
    const result = run(['validate'], projectRoot)

    assert.equal(result.status, 1)
    assert.match(result.stderr, /dist\/maco\.json is reserved/)
  })
})

test('setup keeps the scoring declaration', () => {
  withProject({ name: 'test-game', maco: { key: 'test-game', scoring: { maxScore: 1000, order: 'asc' } } }, (projectRoot, manifest) => {
    const result = run(['setup'], projectRoot)

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(manifest().maco.scoring, { maxScore: 1000, order: 'asc' })
  })
})
