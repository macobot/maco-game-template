import { describe, expect, it, vi } from 'vitest'
import source from '../bridge/maco-bridge.js?raw'

const PROTOCOL = 'maco-game/v1'
const READY = { protocol: PROTOCOL, type: 'ready' }

type MessageListener = (event: { source: unknown, origin: string, data: unknown }) => void

/** Runs the classic script against a fake iframe window whose parent records every message. */
function loadClassicBridge() {
  const parent = { postMessage: vi.fn() }
  let listener: MessageListener | undefined
  const fakeWindow = {
    parent,
    addEventListener: (type: string, callback: MessageListener) => {
      if (type === 'message') listener = callback
    },
  }
  // The script is a classic IIFE that reads the global `window`; pass the fake one in its place.
  new Function('window', source)(fakeWindow)
  const receive = (data: unknown, origin = 'https://macogame.com', from: unknown = parent) => {
    listener?.({ source: from, origin, data })
  }
  return { parent, receive }
}

describe('bridge/maco-bridge.js', () => {
  it('announces ready to any origin once on load', () => {
    const { parent } = loadClassicBridge()
    expect(parent.postMessage).toHaveBeenCalledTimes(1)
    expect(parent.postMessage).toHaveBeenCalledWith(READY, '*')
  })

  it('binds the first host-ready origin and answers only that origin', () => {
    const { parent, receive } = loadClassicBridge()
    receive({ protocol: PROTOCOL, type: 'host-ready' })
    expect(parent.postMessage).toHaveBeenLastCalledWith(READY, 'https://macogame.com')

    receive({ protocol: PROTOCOL, type: 'host-ready' }, 'https://evil.example')
    receive({ protocol: PROTOCOL, type: 'host-ready' })
    expect(parent.postMessage).toHaveBeenCalledTimes(3)
    expect(parent.postMessage.mock.calls.every(([, origin]) => origin !== 'https://evil.example')).toBe(true)
  })

  it('ignores messages from other windows, opaque origins, other protocols, init and locale', () => {
    const { parent, receive } = loadClassicBridge()
    receive({ protocol: PROTOCOL, type: 'host-ready' }, 'https://macogame.com', {})
    receive({ protocol: PROTOCOL, type: 'host-ready' }, 'null')
    receive({ protocol: 'other/v1', type: 'host-ready' })
    receive({ protocol: PROTOCOL, type: 'init', payload: { locale: 'vi' } })
    receive({ protocol: PROTOCOL, type: 'locale', payload: { locale: 'en' } })
    receive(null)
    expect(parent.postMessage).toHaveBeenCalledTimes(1)
  })

  it('does nothing when it is not inside an iframe', () => {
    const addEventListener = vi.fn()
    const topWindow: { parent?: unknown, addEventListener: typeof addEventListener } = { addEventListener }
    topWindow.parent = topWindow
    new Function('window', source)(topWindow)
    expect(addEventListener).not.toHaveBeenCalled()
  })
})
