import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bridgeSource = readFileSync(path.join(packageRoot, 'bridge/maco-bridge.js'), 'utf8')
const HOST = 'https://macogame.com'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Runs the classic bridge in a framed window stand-in and records what it posts to the parent. */
function loadClassicBridge({ crypto = globalThis.crypto } = {}) {
  const posted = []
  const listeners = []
  const parent = {
    postMessage(message, targetOrigin) {
      // The message comes from another realm; plain JSON compares across realms.
      posted.push({ message: JSON.parse(JSON.stringify(message)), targetOrigin })
    },
  }
  const window = {
    parent,
    location: {},
    crypto,
    document: { documentElement: {} },
    stop() {},
    addEventListener(type, listener) {
      if (type === 'message') listeners.push(listener)
    },
  }
  vm.runInNewContext(bridgeSource, { window, setTimeout, clearTimeout })
  const send = (data, { origin = HOST, source = parent } = {}) => {
    for (const listener of listeners) listener({ data, origin, source })
  }
  const handshake = () => send({ protocol: 'maco-game/v1', type: 'host-ready' })
  const scores = () => posted.filter(({ message }) => message.type === 'score')
  return { bridge: window.MacoBridge, window, posted, send, handshake, scores }
}

test('classic bridge keeps its existing API and adds submitScore', () => {
  const { bridge } = loadClassicBridge()

  assert.equal(bridge.protocol, 'maco-game/v1')
  for (const name of ['getLocale', 'on', 'requestRoomTicket', 'requestMatchTicket', 'requestVoiceTicket', 'submitScore']) {
    assert.equal(typeof bridge[name], 'function', name)
  }
})

test('classic bridge submitScore sends nothing before the host handshake', () => {
  const { bridge, posted } = loadClassicBridge()

  assert.equal(bridge.submitScore(100), false)
  assert.deepEqual(posted, [{ message: { protocol: 'maco-game/v1', type: 'ready' }, targetOrigin: '*' }])
})

test('classic bridge submitScore posts one score message to the handshaken host', () => {
  const { bridge, handshake, scores } = loadClassicBridge()
  handshake()

  assert.equal(bridge.submitScore(1000), true)
  const [sent, ...rest] = scores()
  assert.deepEqual(rest, [])
  assert.equal(sent.targetOrigin, HOST)
  assert.deepEqual(Object.keys(sent.message), ['protocol', 'type', 'payload'])
  assert.equal(sent.message.protocol, 'maco-game/v1')
  assert.deepEqual(Object.keys(sent.message.payload), ['id', 'score'])
  assert.equal(sent.message.payload.score, 1000)
  assert.match(sent.message.payload.id, UUID_V4)
})

test('classic bridge submitScore gives every play its own id', () => {
  const { bridge, handshake, scores } = loadClassicBridge()
  handshake()

  bridge.submitScore(1)
  bridge.submitScore(2)
  const [first, second] = scores()
  assert.notEqual(first.message.payload.id, second.message.payload.id)
})

test('classic bridge submitScore refuses scores that are not positive safe integers', () => {
  const { bridge, handshake, scores } = loadClassicBridge()
  handshake()

  for (const score of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, '10', null, undefined, {}]) {
    assert.equal(bridge.submitScore(score), false, String(score))
  }
  assert.equal(bridge.submitScore(Number.MAX_SAFE_INTEGER), true)
  assert.equal(scores().length, 1)
})

test('classic bridge submitScore falls back to getRandomValues for a v4 id', () => {
  const crypto = { getRandomValues: bytes => bytes.fill(0xff) }
  const { bridge, handshake, scores } = loadClassicBridge({ crypto })
  handshake()

  assert.equal(bridge.submitScore(7), true)
  assert.equal(scores()[0].message.payload.id, 'ffffffff-ffff-4fff-bfff-ffffffffffff')
})

test('classic bridge submitScore ignores a handshake from a foreign page and stops after a refusal', () => {
  const { bridge, send, handshake } = loadClassicBridge()
  const foreign = { origin: 'https://copy.example' }

  send({ protocol: 'maco-game/v1', type: 'ping' }, foreign)
  assert.equal(bridge.submitScore(5), false)

  handshake()
  send({ protocol: 'maco-game/v1', type: 'host-ready' }, foreign)
  assert.equal(bridge.submitScore(5), false)
})

test('classic bridge submitScore ignores a host-ready that does not come from the parent window', () => {
  const { bridge, send } = loadClassicBridge()

  send({ protocol: 'maco-game/v1', type: 'host-ready' }, { source: {} })
  assert.equal(bridge.submitScore(5), false)
})
