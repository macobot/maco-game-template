// Vendored verbatim from minigames `scripts/maco-iframe-bridge.ts`; protocol `maco-game/v1`.
// Keep it identical to that file, which follows the host in maco-games `domains/gamification/games/maco-game-bridge.ts`.
export const MACO_GAME_PROTOCOL = 'maco-game/v1'

const MACOGAME_DOMAIN = __MACOGAME_DOMAIN__
const IS_DEVELOPMENT = import.meta.env.DEV

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

/**
 * The only pages a published build answers: the configured player, the admin review preview and their development
 * servers. The local-only development allowance below is deliberately not present in a published build.
 */
export const MACO_HOST_ORIGINS = [
  MACOGAME_DOMAIN,
  'https://macomanga.com',
  'http://localhost:7070',
  'http://localhost:6868',
] as const

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  } catch {
    return false
  }
}

/** Local iframe hosts are accepted only by Vite's development server, never by a published build. */
export function isMacoHostOrigin(origin: string, allowLocalhost = IS_DEVELOPMENT): boolean {
  return (MACO_HOST_ORIGINS as readonly string[]).includes(origin) || (allowLocalhost && isLocalhostOrigin(origin))
}

/**
 * Where the browser reports the embedding page (Chromium, Safari), refuse a foreign one before any message arrives.
 * `"null"` is not foreign: Maco frames games with `referrerpolicy="no-referrer"`, which hides its origin there, so the
 * handshake decides. Firefox has no `ancestorOrigins`, and the handshake decides there too.
 */
function isFramedByForeignPage() {
  const parentOrigin = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0]
  return parentOrigin !== undefined && parentOrigin !== 'null' && !isMacoHostOrigin(parentOrigin)
}

export const MACO_GAMES_URL = `${MACOGAME_DOMAIN}/`

/** Replaces the page with a link to Maco Games when the artefact is opened on its own, outside the host's iframe. */
export function showPlayOnMaco(container: HTMLElement) {
  const notice = document.createElement('main')
  notice.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;min-height:100%;padding:24px;box-sizing:border-box;font:16px/1.5 system-ui,sans-serif;color:#fff;text-align:center'
  const message = document.createElement('p')
  message.style.margin = '0'
  message.textContent = 'Trò chơi này chỉ chơi được trên Maco Games.'
  const link = document.createElement('a')
  link.href = MACO_GAMES_URL
  link.textContent = 'Chơi tại macogame.com'
  link.style.cssText = 'padding:12px 20px;border-radius:999px;background:#2563eb;color:#fff;font-weight:600;text-decoration:none'
  notice.append(message, link)
  container.replaceChildren(notice)
}

/**
 * Mount a game as an isolated iframe artefact. Only a Maco host origin can complete the handshake, and every later
 * command must come from that same window and origin. A copy framed by any other page shows the Maco Games notice
 * instead of the game. Do not put credentials or score-authority in this bridge.
 */
export function mountMacoIframeGame(mountGame: GameMount) {
  if (window.parent === window) {
    // A published build plays only inside Maco Games; `vite dev` still mounts it standalone for development.
    if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) mountGame(document.body)
    else showPlayOnMaco(document.body)
    return
  }

  if (isFramedByForeignPage()) {
    showPlayOnMaco(document.body)
    return
  }

  let hostOrigin: string | undefined
  let mountedGame: ReturnType<GameMount> | undefined

  const mount = (locale?: string) => {
    mountedGame?.destroy()
    mountedGame = mountGame(document.body, locale ? { lang: locale } : undefined)
  }

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || !isBridgeMessage(event.data)) return
    if (!isMacoHostOrigin(event.origin)) {
      // A page outside Maco speaking the protocol: a re-hosted copy. It never gets the game.
      window.removeEventListener('message', onMessage)
      mountedGame?.destroy()
      mountedGame = undefined
      showPlayOnMaco(document.body)
      return
    }

    if (event.data.type === 'host-ready') {
      hostOrigin ??= event.origin
      if (hostOrigin !== event.origin) return
      window.parent.postMessage({ protocol: MACO_GAME_PROTOCOL, type: 'ready' }, hostOrigin)
      return
    }

    if (hostOrigin !== event.origin) return
    if (event.data.type === 'init' || event.data.type === 'locale') mount(getLocale(event.data))
  }
  window.addEventListener('message', onMessage)

  // A post whose target origin does not match the parent is dropped, so only a Maco parent hears this.
  for (const origin of MACO_HOST_ORIGINS) window.parent.postMessage({ protocol: MACO_GAME_PROTOCOL, type: 'ready' }, origin)
}
