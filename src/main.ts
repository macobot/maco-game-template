export interface MountedGame {
  destroy(): void
}

export interface MountOptions {
  /** BCP 47 language tag sent by the Maco host, for example `vi` or `en`. */
  lang?: string
}

const DEFAULT_LANG = 'vi'

const PLACEHOLDER_TEXT: Record<string, string> = {
  vi: 'Thay thế màn hình mẫu bằng game của bạn',
  en: 'Replace this placeholder screen with your game',
}

function placeholderText(lang: string): string {
  const language = lang.split('-')[0]?.toLowerCase() ?? ''
  return PLACEHOLDER_TEXT[language] ?? PLACEHOLDER_TEXT[DEFAULT_LANG] ?? ''
}

/**
 * Mounts the game inside `container`. The Maco bridge calls it on `init` and again after every `locale` message,
 * always destroying the previous mount first, and passes `document.body` as the container. Each call therefore
 * builds a fresh child element and attaches its shadow root there: a second `attachShadow` on the same element
 * would throw. Replace the placeholder UI with the game, but keep this signature and `destroy()`.
 */
export function mountGame(container: HTMLElement, options: MountOptions = {}): MountedGame {
  const lang = options.lang ?? DEFAULT_LANG
  const host = container.ownerDocument.createElement('div')
  host.lang = lang
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host { display: block; min-height: 100vh; }
      main {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
        background: #172554;
        color: #f8fafc;
        font: 700 20px/1.4 system-ui, sans-serif;
        text-align: center;
      }
    </style>
    <main></main>
  `
  const main = root.querySelector('main')
  if (main) {
    main.textContent = placeholderText(lang)
  }
  container.append(host)

  return {
    destroy() {
      // Stop timers, animation frames, audio and listeners here before the element goes away.
      host.remove()
    },
  }
}
