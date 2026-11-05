import { describe, expect, it, vi } from 'vitest'
import source from '../bridge/maco-bridge.js?raw'

const PROTOCOL = 'maco-game/v1'
const READY = { protocol: PROTOCOL, type: 'ready' }
const HOST_READY = { protocol: PROTOCOL, type: 'host-ready' }
const CLASSIC_HOST_ORIGINS = [
  'https://macogame.com',
  'https://macomanga.com',
  'http://localhost:7070',
  'http://localhost:6868',
]

type MessageListener = (event: { source: unknown, origin: string, data: unknown }) => void

/** Runs the classic script against a fake iframe window whose parent records every message. */
function loadClassicBridge(ancestorOrigins?: string[]) {
  const parent = { postMessage: vi.fn() }
  let listener: MessageListener | undefined
  const documentElement = { innerHTML: '<head></head><body><canvas></canvas></body>' }
  const fakeWindow = {
    parent,
    stop: vi.fn(),
    location: { ancestorOrigins },
    document: { documentElement },
    addEventListener: (type: string, callback: MessageListener) => {
      if (type === 'message') listener = callback
    },
  }
  // The script is a classic IIFE that reads the global `window`; pass the fake one in its place.
  new Function('window', source)(fakeWindow)
  const receive = (data: unknown, origin = 'https://macogame.com', from: unknown = parent) => {
    listener?.({ source: from, origin, data })
  }
  return { parent, receive, fakeWindow, documentElement }
}

describe('bridge/maco-bridge.js', () => {
  it('keeps its fixed Maco host origin list', () => {
    for (const origin of CLASSIC_HOST_ORIGINS) expect(source).toContain(`'${origin}'`)
    expect(source.match(/'https?:\/\/[^']+'/g)?.filter(origin => !origin.includes('macogame.com/'))).toHaveLength(CLASSIC_HOST_ORIGINS.length)
  })

  it('announces ready once to each Maco host origin and never to every origin', () => {
    const { parent } = loadClassicBridge()
    expect(parent.postMessage.mock.calls).toEqual(CLASSIC_HOST_ORIGINS.map(origin => [READY, origin]))
  })

  it('binds the first Maco host-ready origin and answers only that origin', () => {
    const { parent, receive } = loadClassicBridge()
    parent.postMessage.mockClear()
    receive(HOST_READY)
    expect(parent.postMessage).toHaveBeenLastCalledWith(READY, 'https://macogame.com')

    receive(HOST_READY, 'http://localhost:7070')
    receive(HOST_READY)
    expect(parent.postMessage).toHaveBeenCalledTimes(2)
    expect(parent.postMessage.mock.calls.every(([, origin]) => origin === 'https://macogame.com')).toBe(true)
  })

  it('answers the admin review preview', () => {
    const { parent, receive } = loadClassicBridge()
    parent.postMessage.mockClear()
    receive(HOST_READY, 'https://macomanga.com')
    expect(parent.postMessage).toHaveBeenCalledWith(READY, 'https://macomanga.com')
  })

  it('replaces the page with the Maco Games notice when a page outside Maco says host-ready', () => {
    const { parent, receive, fakeWindow, documentElement } = loadClassicBridge()
    parent.postMessage.mockClear()
    receive(HOST_READY, 'https://games.example.com')
    receive(HOST_READY)

    expect(parent.postMessage).not.toHaveBeenCalled()
    expect(fakeWindow.stop).toHaveBeenCalledOnce()
    expect(documentElement.innerHTML).not.toContain('<canvas>')
    expect(documentElement.innerHTML).toContain('href="https://macogame.com/"')
  })

  it('refuses a foreign embedding page the browser reports, before any message', () => {
    const { parent, documentElement } = loadClassicBridge(['https://games.example.com'])
    expect(parent.postMessage).not.toHaveBeenCalled()
    expect(documentElement.innerHTML).toContain('Trò chơi này chỉ chơi được trên Maco Games.')
  })

  it('leaves an embedding page hidden by referrer policy to the handshake', () => {
    const { parent, receive, documentElement } = loadClassicBridge(['null'])
    receive(HOST_READY)
    expect(parent.postMessage).toHaveBeenLastCalledWith(READY, 'https://macogame.com')
    expect(documentElement.innerHTML).toContain('<canvas>')
  })

  it('ignores messages from other windows, other protocols, init and locale', () => {
    const { parent, receive, documentElement } = loadClassicBridge()
    parent.postMessage.mockClear()
    receive(HOST_READY, 'https://games.example.com', {})
    receive({ protocol: 'other/v1', type: 'host-ready' }, 'https://games.example.com')
    receive({ protocol: PROTOCOL, type: 'init', payload: { locale: 'vi' } })
    receive({ protocol: PROTOCOL, type: 'locale', payload: { locale: 'en' } })
    receive(null)
    expect(parent.postMessage).not.toHaveBeenCalled()
    expect(documentElement.innerHTML).toContain('<canvas>')
  })

  it('does nothing when it is not inside an iframe', () => {
    const addEventListener = vi.fn()
    const topWindow: { parent?: unknown, addEventListener: typeof addEventListener } = { addEventListener }
    topWindow.parent = topWindow
    new Function('window', source)(topWindow)
    expect(addEventListener).not.toHaveBeenCalled()
  })
})
