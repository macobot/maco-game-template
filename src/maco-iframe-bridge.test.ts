import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const HOST = 'https://macogame.com'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type Bridge = typeof import('./maco-iframe-bridge')

interface Posted {
  message: { protocol: string, type: string, payload?: { id: string, score: number } }
  targetOrigin: string
}

let parent: { postMessage: (message: Posted['message'], targetOrigin: string) => void }
let posted: Posted[]

/** Mounts a fresh copy of the bridge as if this page were framed by `parent`. */
async function mountFramed(): Promise<Bridge> {
  vi.resetModules()
  const bridge = await import('./maco-iframe-bridge')
  bridge.mountMacoIframeGame(() => ({ destroy() {} }))
  return bridge
}

function send(type: string, { origin = HOST, source = parent as unknown }: { origin?: string, source?: unknown } = {}) {
  window.dispatchEvent(new MessageEvent('message', {
    data: { protocol: 'maco-game/v1', type },
    origin,
    source: source as MessageEventSource,
  }))
}

const scores = () => posted.filter(({ message }) => message.type === 'score')

beforeEach(() => {
  posted = []
  parent = { postMessage: (message, targetOrigin) => posted.push({ message, targetOrigin }) }
  vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window)
  delete window.MacoBridge
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('submitScore', () => {
  it('sends nothing before the host handshake', async () => {
    const bridge = await mountFramed()

    expect(bridge.submitScore(100)).toBe(false)
    expect(scores()).toEqual([])
  })

  it('posts one score message to the handshaken host and publishes window.MacoBridge', async () => {
    const bridge = await mountFramed()
    send('host-ready')

    expect(window.MacoBridge).toBe(bridge.MacoBridge)
    expect(window.MacoBridge?.submitScore?.(1000)).toBe(true)
    expect(scores()).toEqual([{
      message: { protocol: 'maco-game/v1', type: 'score', payload: { id: expect.stringMatching(UUID_V4), score: 1000 } },
      targetOrigin: HOST,
    }])
  })

  it('refuses scores that are not positive safe integers', async () => {
    const bridge = await mountFramed()
    send('host-ready')

    for (const score of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, '10', null, undefined]) {
      expect(bridge.submitScore(score as number)).toBe(false)
    }
    expect(scores()).toEqual([])
  })

  it('falls back to getRandomValues for a v4 id', async () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) })
    const bridge = await mountFramed()
    send('host-ready')

    expect(bridge.submitScore(7)).toBe(true)
    expect(scores()[0]?.message.payload?.id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('ignores a handshake that does not come from the parent window', async () => {
    const bridge = await mountFramed()
    send('host-ready', { source: {} })

    expect(bridge.submitScore(5)).toBe(false)
  })

  it('stops once a foreign page speaks the protocol', async () => {
    const bridge = await mountFramed()
    send('host-ready')
    send('host-ready', { origin: 'https://copy.example' })

    expect(bridge.submitScore(5)).toBe(false)
    expect(document.body.textContent).toContain('Maco Games')
  })

  it('keeps a window.MacoBridge another bridge published first', async () => {
    const existing = { submitScore: () => true }
    window.MacoBridge = existing
    await mountFramed()

    expect(window.MacoBridge).toBe(existing)
  })
})
