import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountGame, type MountedGame } from './main'
import { MACO_GAME_PROTOCOL, MACO_GAMES_URL, MACO_HOST_ORIGINS, isMacoHostOrigin, mountMacoIframeGame } from './maco-iframe-bridge'

const HOST_ORIGIN = MACO_HOST_ORIGINS[0]

function mountedLang(container: HTMLElement): string | undefined {
  const child = container.firstElementChild
  return child instanceof HTMLElement ? child.lang : undefined
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('mountGame', () => {
  it('survives the init, locale, locale re-mount sequence on the same container', () => {
    const container = document.body
    let game: MountedGame | undefined

    expect(() => {
      game = mountGame(container, { lang: 'vi' })
      game.destroy()
      game = mountGame(container, { lang: 'en' })
      game.destroy()
      game = mountGame(container, { lang: 'en' })
    }).not.toThrow()

    expect(container.children).toHaveLength(1)
    expect(mountedLang(container)).toBe('en')
    expect(container.firstElementChild?.shadowRoot?.textContent).toContain('Replace this placeholder screen')
    game?.destroy()
    expect(container.children).toHaveLength(0)
  })

  it('never attaches a shadow root to the container itself', () => {
    const game = mountGame(document.body)
    expect(document.body.shadowRoot).toBeNull()
    expect(mountedLang(document.body)).toBe('vi')
    game.destroy()
  })

  it('falls back to Vietnamese copy for an unknown language but keeps the tag', () => {
    const game = mountGame(document.body, { lang: 'fr' })
    expect(mountedLang(document.body)).toBe('fr')
    expect(document.body.firstElementChild?.shadowRoot?.textContent).toContain('Thay thế màn hình mẫu')
    game.destroy()
  })
})

describe('mountGame through the Maco bridge', () => {
  it('accepts arbitrary localhost ports only in development', () => {
    expect(isMacoHostOrigin('http://localhost:5173', true)).toBe(true)
    expect(isMacoHostOrigin('http://127.0.0.1:4173', true)).toBe(true)
    expect(isMacoHostOrigin('http://localhost:5173', false)).toBe(false)
    expect(isMacoHostOrigin('https://games.example.com', true)).toBe(false)
  })

  it('answers host-ready and re-mounts on init and each locale without throwing', () => {
    const parent = { postMessage: vi.fn() }
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window)
    const errors: unknown[] = []
    window.addEventListener('error', event => errors.push(event.error))

    mountMacoIframeGame(mountGame)
    expect(parent.postMessage.mock.calls.map(([, target]) => target)).toEqual([...MACO_HOST_ORIGINS])

    const send = (type: string, locale?: string) => window.dispatchEvent(new MessageEvent('message', {
      data: { protocol: MACO_GAME_PROTOCOL, type, ...(locale ? { payload: { locale } } : {}) },
      origin: HOST_ORIGIN,
      source: parent as unknown as Window,
    }))

    send('host-ready')
    expect(parent.postMessage).toHaveBeenLastCalledWith({ protocol: MACO_GAME_PROTOCOL, type: 'ready' }, HOST_ORIGIN)

    send('init', 'vi')
    expect(mountedLang(document.body)).toBe('vi')
    send('locale', 'en')
    send('locale', 'vi')
    send('locale', 'en')

    expect(errors).toEqual([])
    expect(document.body.children).toHaveLength(1)
    expect(mountedLang(document.body)).toBe('en')
  })

  function framedBy(origin: string) {
    const parent = { postMessage: vi.fn() }
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window)
    mountMacoIframeGame(mountGame)
    const send = (type: string) => window.dispatchEvent(new MessageEvent('message', {
      data: { protocol: MACO_GAME_PROTOCOL, type, payload: { locale: 'vi' } },
      origin,
      source: parent as unknown as Window,
    }))
    return { parent, send }
  }

  it('mounts for the admin review preview', () => {
    const { send } = framedBy('https://macomanga.com')
    send('host-ready')
    send('init')
    expect(mountedLang(document.body)).toBe('vi')
  })

  it('shows the Maco Games notice to a page outside Maco instead of the game', () => {
    const { parent, send } = framedBy('https://games.example.com')
    parent.postMessage.mockClear()
    send('host-ready')
    send('init')
    expect(parent.postMessage).not.toHaveBeenCalled()
    expect(document.body.firstElementChild?.shadowRoot).toBeFalsy()
    expect(document.body.textContent).not.toContain('Thay thế màn hình mẫu')
    expect(document.querySelector('a')?.getAttribute('href')).toBe(MACO_GAMES_URL)
  })
})
