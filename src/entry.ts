import { mountGame } from './main'
import { mountMacoIframeGame } from './maco-iframe-bridge'

// The bridge is the only caller of `mountGame`: it mounts on `init` and re-mounts on every `locale`.
mountMacoIframeGame(mountGame, {
  // The SDK defaults to production. Keep this template's build-time staging-host override.
  hostOrigins: [__MACOGAME_DOMAIN__, 'https://macomanga.com', 'http://localhost:7070', 'http://localhost:6868'],
  macoGamesUrl: `${__MACOGAME_DOMAIN__}/`,
  allowLocalhost: import.meta.env.DEV,
  allowStandalone: import.meta.env.DEV,
})
