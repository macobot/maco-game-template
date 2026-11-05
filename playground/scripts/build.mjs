import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await writeFile(path.join(dist, 'index.html'), `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Maco CLI playground</title>
  </head>
  <body>
    <main>Maco CLI playground build</main>
    <script type="module" src="./main.js"></script>
  </body>
</html>
`)
await writeFile(path.join(dist, 'main.js'), "// maco-game/v1\nconsole.log('Maco CLI playground')\n")

console.log('Built playground artifact in dist/.')
