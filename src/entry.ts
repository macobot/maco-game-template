import { mountGame } from './main'
import { mountMacoIframeGame } from './maco-iframe-bridge'

// The bridge is the only caller of `mountGame`: it mounts on `init` and re-mounts on every `locale`.
mountMacoIframeGame(mountGame)
