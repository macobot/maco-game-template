export interface MountedGame {
  destroy(): void
}

/**
 * Public integration contract for Maco Games.
 * Replace the placeholder UI with the game's implementation, but keep this
 * function and its destroy method so the Nuxt host can mount and unmount it.
 */
export function mountGame(container: HTMLElement): MountedGame {
  const root = container.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host { display: block; min-height: 320px; }
      main {
        display: grid;
        min-height: 320px;
        place-items: center;
        border-radius: 24px;
        background: #172554;
        color: #f8fafc;
        font: 700 20px/1.4 system-ui, sans-serif;
      }
    </style>
    <main>Thay thế màn hình mẫu bằng game của bạn</main>
  `

  return {
    destroy() {
      root.replaceChildren()
    },
  }
}

if (typeof document !== 'undefined' && document.body.dataset.macoGameStandalone !== undefined) {
  mountGame(document.body)
}
