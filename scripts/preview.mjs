import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT, killTree, spawnScript } from '../tools/workspace.mjs'

/**
 * 本地预览生产产物（http://localhost:4173/）。
 * 由 shell 的 vite preview 提供静态服务，根目录即 dist/。
 * 用 `npm run preview` 验证的是与 GitHub Pages 完全一致的产物形态。
 */

if (!existsSync(resolve(ROOT, 'dist/index.html'))) {
  console.error('dist/ 尚未生成，请先执行：npm run build')
  process.exit(1)
}

console.log('▶ 预览生产产物')
console.log('  地址：http://localhost:4173/')
console.log('  退出：Ctrl + C\n')

const child = spawnScript('shell', 'preview')

const shutdown = () => {
  killTree(child)
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
child.on('exit', (code) => process.exit(code ?? 0))
