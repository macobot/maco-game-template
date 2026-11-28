/** Browser SDK for games embedded by Maco Games. It deliberately has no score authority. */
export const MACO_GAME_PROTOCOL = 'maco-game/v1'

/** The Maco origins accepted by a production game unless its integrator supplies an override. */
export const MACO_HOST_ORIGINS = [
  'https://macogame.com',
  'https://macomanga.com',
  'http://localhost:7070',
  'http://localhost:6868',
] as const

export const MACO_GAMES_URL = 'https://macogame.com/'

export type GameMount = (container: HTMLElement, options?: { lang?: string }) => { destroy(): void }

/** The game-facing API, also published as `window.MacoBridge` for engines that cannot import ESM. */
export interface MacoBridgeApi {
  readonly protocol: typeof MACO_GAME_PROTOCOL
  submitScore(score: number): boolean
  startRun(): void
  completeStage(stage: number): Promise<StageResult>
}

/** Options belong to the game integration, never to the score authority on the Maco server. */
export interface MacoIframeGameOptions {
  /** Allowed embedding origins. Use this only for a Maco staging/development host. */
  hostOrigins?: readonly string[]
  /** Destination of the notice shown when a published game is opened outside Maco. */
  macoGamesUrl?: string
  /** Accept localhost iframe hosts. Keep false in a published build. */
  allowLocalhost?: boolean
  /** Mount outside an iframe, for a local development page only. Keep false in a published build. */
  allowStandalone?: boolean
  /** Explicit local-only mock. Never use for a published build. */
  mockStages?: boolean
}

declare global {
  interface Window {
    MacoBridge?: Partial<MacoBridgeApi>
  }
}

interface BridgeMessage {
  protocol: typeof MACO_GAME_PROTOCOL
  type: 'host-ready' | 'init' | 'locale'
  payload?: { locale?: string }
}

/** The origin of the Maco host that completed the handshake with the mounted game, if any. */
let scoreHostOrigin: string | undefined

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

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  } catch {
    return false
  }
}

/** Checks the SDK defaults. `mountMacoIframeGame` also accepts an integration-specific origin list. */
export function isMacoHostOrigin(origin: string, allowLocalhost = false): boolean {
  return (MACO_HOST_ORIGINS as readonly string[]).includes(origin) || (allowLocalhost && isLocalhostOrigin(origin))
}

function isTrustedMacoHostOrigin(origin: string, hostOrigins: readonly string[], allowLocalhost: boolean): boolean {
  return hostOrigins.includes(origin) || (allowLocalhost && isLocalhostOrigin(origin))
}

function isFramedByForeignPage(hostOrigins: readonly string[], allowLocalhost: boolean) {
  const parentOrigin = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0]
  return parentOrigin !== undefined && parentOrigin !== 'null' && !isTrustedMacoHostOrigin(parentOrigin, hostOrigins, allowLocalhost)
}

function uuidV4(): string | undefined {
  const cryptoApi = globalThis.crypto as Crypto | undefined
  if (typeof cryptoApi?.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID()
    } catch {
      // Fall back to getRandomValues in a non-secure context.
    }
  }
  if (typeof cryptoApi?.getRandomValues !== 'function') return undefined
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Reports one finished play to the Maco host that completed the handshake. `true` only means the message was sent;
 * the host decides whether it is recorded and how much XP it earns.
 */
export function submitScore(score: number): boolean {
  if (scoreHostOrigin === undefined || !Number.isSafeInteger(score) || score <= 0) return false
  const id = uuidV4()
  if (id === undefined) return false
  window.parent.postMessage({ protocol: MACO_GAME_PROTOCOL, type: 'score', payload: { id, score } }, scoreHostOrigin)
  return true
}

/** A semantic alias for code that describes the end of a play as reporting rather than submitting. */
export const reportScore = submitScore

export interface StageResult { recorded: boolean, xpAwarded: number, mode: 'live' | 'mock' }

let mockStages = false
let stageRun: Promise<string> | undefined
let stageQueue: Promise<void> = Promise.resolve()
let stageIds = new Map<number, string>()
const stagePending = new Map<string, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()
const STAGE_TIMEOUT_MS = 5000

function stageRequest(type: string, id: string, fields: object): Promise<unknown> {
  const origin = scoreHostOrigin
  if (!origin) return Promise.reject(new Error('Maco host is unavailable'))
  if (stagePending.has(id) || stagePending.size >= 8) return Promise.reject(new Error('Stage request is already pending'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stagePending.delete(id); reject(new Error('Maco stage request timed out')) }, STAGE_TIMEOUT_MS)
    stagePending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value) },
      reject: error => { clearTimeout(timer); reject(error) },
    })
    window.parent.postMessage({ protocol: MACO_GAME_PROTOCOL, type, payload: { ...fields, id } }, origin)
  })
}

/** Begins a new run. The host issues its ID; the game never supplies reward values. */
export function startRun(): void {
  const id = uuidV4()
  stageIds = new Map()
  stageQueue = Promise.resolve()
  if (!id) stageRun = Promise.reject(new Error('Secure random IDs are unavailable'))
  else if (mockStages) stageRun = Promise.resolve(id)
  else stageRun = stageRequest('stage-run-request', id, {}).then((data) => {
    if (!data || typeof data !== 'object' || typeof (data as { runId?: unknown }).runId !== 'string') throw new Error('Invalid stage run')
    return (data as { runId: string }).runId
  })
  void stageRun.catch(() => undefined)
}

/** Reports a stage in order. A repeated stage retains its request ID, including on timeout retry. */
export function completeStage(stage: number): Promise<StageResult> {
  const run = stageRun
  if (!run || !Number.isSafeInteger(stage) || stage <= 0) return Promise.reject(new Error('Start a run and pass a positive stage number'))
  const id = stageIds.get(stage) ?? uuidV4()
  if (!id) return Promise.reject(new Error('Secure random IDs are unavailable'))
  const previous = stageIds.has(stage)
  stageIds.set(stage, id)
  const result = stageQueue.then(async () => {
    const runId = await run
    if (mockStages) return { recorded: !previous, xpAwarded: 5, mode: 'mock' as const }
    const attempt = () => stageRequest('stage-complete-request', id, { runId, stage })
    let data: unknown
    try { data = await attempt() } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Maco stage request timed out') throw error
      data = await attempt()
    }
    if (!data || typeof data !== 'object') throw new Error('Invalid stage result')
    const value = data as Partial<StageResult>
    if (typeof value.recorded !== 'boolean' || !Number.isSafeInteger(value.xpAwarded) || (value.xpAwarded ?? -1) < 0 || value.mode !== 'live') throw new Error('Invalid stage result')
    return value as StageResult
  })
  stageQueue = result.then(() => undefined, () => undefined)
  return result
}

export const MacoBridge: MacoBridgeApi = { protocol: MACO_GAME_PROTOCOL, submitScore, startRun, completeStage }

/** Replaces the page with a Maco Games link when a published artefact is opened outside its host iframe. */
export function showPlayOnMaco(container: HTMLElement, macoGamesUrl = MACO_GAMES_URL) {
  const notice = document.createElement('main')
  notice.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;min-height:100%;padding:24px;box-sizing:border-box;font:16px/1.5 system-ui,sans-serif;color:#fff;text-align:center'
  const message = document.createElement('p')
  message.style.margin = '0'
  message.textContent = 'Trò chơi này chỉ chơi được trên Maco Games.'
  const link = document.createElement('a')
  link.href = macoGamesUrl
  link.textContent = 'Chơi tại macogame.com'
  link.style.cssText = 'padding:12px 20px;border-radius:999px;background:#2563eb;color:#fff;font-weight:600;text-decoration:none'
  notice.append(message, link)
  container.replaceChildren(notice)
}

/**
 * Mounts a game as an isolated iframe artefact. Only an allowed Maco host can complete the handshake, and every
 * later command must come from that same window and origin. The SDK contains no credentials or score authority.
 */
export function mountMacoIframeGame(mountGame: GameMount, options: MacoIframeGameOptions = {}) {
  const hostOrigins = options.hostOrigins ?? MACO_HOST_ORIGINS
  const macoGamesUrl = options.macoGamesUrl ?? MACO_GAMES_URL
  const allowLocalhost = options.allowLocalhost ?? false
  const allowStandalone = options.allowStandalone ?? false
  scoreHostOrigin = undefined
  // A framed page can never select the mock.
  mockStages = options.mockStages === true && allowStandalone && window.parent === window
  // Keep an API that an engine bridge published first.
  window.MacoBridge ??= MacoBridge

  if (window.parent === window) {
    if (allowStandalone) mountGame(document.body)
    else showPlayOnMaco(document.body, macoGamesUrl)
    return
  }
  if (isFramedByForeignPage(hostOrigins, allowLocalhost)) {
    showPlayOnMaco(document.body, macoGamesUrl)
    return
  }

  let hostOrigin: string | undefined
  let mountedGame: ReturnType<GameMount> | undefined
  const mount = (locale?: string) => {
    mountedGame?.destroy()
    mountedGame = mountGame(document.body, locale ? { lang: locale } : undefined)
  }
  const onMessage = (event: MessageEvent) => {
    if (event.source === window.parent && event.origin === hostOrigin && event.data && typeof event.data === 'object'
      && event.data.protocol === MACO_GAME_PROTOCOL && event.data.type === 'stage-response') {
      const payload = event.data.payload as { id?: unknown, data?: unknown, error?: unknown } | undefined
      if (!payload || typeof payload.id !== 'string') return
      const pending = stagePending.get(payload.id)
      if (!pending) return
      stagePending.delete(payload.id)
      if (payload.error) pending.reject(new Error('Maco stage request denied'))
      else pending.resolve(payload.data)
      return
    }
    if (event.source !== window.parent || !isBridgeMessage(event.data)) return
    if (!isTrustedMacoHostOrigin(event.origin, hostOrigins, allowLocalhost)) {
      window.removeEventListener('message', onMessage)
      scoreHostOrigin = undefined
      mountedGame?.destroy()
      mountedGame = undefined
      showPlayOnMaco(document.body, macoGamesUrl)
      return
    }
    if (event.data.type === 'host-ready') {
      hostOrigin ??= event.origin
      if (hostOrigin !== event.origin) return
      scoreHostOrigin = hostOrigin
      window.parent.postMessage({ protocol: MACO_GAME_PROTOCOL, type: 'ready' }, hostOrigin)
      return
    }
    if (hostOrigin !== event.origin) return
    if (event.data.type === 'init' || event.data.type === 'locale') mount(getLocale(event.data))
  }
  window.addEventListener('message', onMessage)

  // A target-origin mismatch makes the browser drop the post, so only an allowed parent can hear it.
  for (const origin of hostOrigins) window.parent.postMessage({ protocol: MACO_GAME_PROTOCOL, type: 'ready' }, origin)
}
