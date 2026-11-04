// Vendored verbatim from minigames `scripts/maco-iframe-bridge.ts`; protocol `maco-game/v1`.
// Keep it identical to that file, which follows the host in maco-games `domains/gamification/games/maco-game-bridge.ts`.
export const MACO_GAME_PROTOCOL = 'maco-game/v1'

type GameMount = (container: HTMLElement, options?: { lang?: string }) => { destroy(): void }

interface BridgeMessage {
  protocol: typeof MACO_GAME_PROTOCOL
  type: 'host-ready' | 'init' | 'locale'
  payload?: {
    locale?: string
  }
}

function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<BridgeMessage>
  if (message.protocol !== MACO_GAME_PROTOCOL) return false
  if (message.type !== 'host-ready' && message.type !== 'init' && message.type !== 'locale') return false
  return !message.payload || typeof message.payload === 'object'
}

function getLocale(message: BridgeMessage) {
  const locale = message.payload?.locale
  return typeof locale === 'string' && locale.length <= 35 ? locale : undefined
}

function isWebOrigin(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Mount a game as an isolated iframe artefact. The parent origin is bound on
 * its explicit handshake; every later command must come from that same window
 * and origin. Do not put credentials or score-authority in this bridge.
 */
export function mountMacoIframeGame(mountGame: GameMount) {
  if (window.parent === window) {
    mountGame(document.body)
    return
  }

  let hostOrigin: string | undefined
  let mountedGame: ReturnType<GameMount> | undefined

  const mount = (locale?: string) => {
    mountedGame?.destroy()
    mountedGame = mountGame(document.body, locale ? { lang: locale } : undefined)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !isWebOrigin(event.origin) || !isBridgeMessage(event.data)) return

    if (event.data.type === 'host-ready') {
      hostOrigin ??= event.origin
      if (hostOrigin !== event.origin) return
      window.parent.postMessage({ protocol: MACO_GAME_PROTOCOL, type: 'ready' }, hostOrigin)
      return
    }

    if (hostOrigin !== event.origin) return
    if (event.data.type === 'init' || event.data.type === 'locale') mount(getLocale(event.data))
  })

  window.parent.postMessage({ protocol: MACO_GAME_PROTOCOL, type: 'ready' }, '*')
}
