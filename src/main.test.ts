import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountGame, type MountedGame } from './main'
import { MACO_GAME_PROTOCOL, mountMacoIframeGame } from './maco-iframe-bridge'

const HOST_ORIGIN = 'https://macogame.com'

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
  it('answers host-ready and re-mounts on init and each locale without throwing', () => {
    const parent = { postMessage: vi.fn() }
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window)
    const errors: unknown[] = []
    window.addEventListener('error', event => errors.push(event.error))

    mountMacoIframeGame(mountGame)
    expect(parent.postMessage).toHaveBeenCalledWith({ protocol: MACO_GAME_PROTOCOL, type: 'ready' }, '*')

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
})
