import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  APP_PACKAGES,
  PACKAGES,
  ROOT,
  findPackage,
  killTree,
  runScriptOrThrow,
  spawnScript
} from '../tools/workspace.mjs'

const target = process.argv[2]

if (target) {
  runStandalone(target)
} else {
  runIntegrated()
}

/**
 * 独立开发模式：pnpm run dev:vanilla | dev:react | dev:vue
 * 只启动单个子应用的 vite dev server（带 HMR），
 * 页面里用 tools/dev-host.ts 复刻了 Shell 的 Shadow DOM 环境。
 */
function runStandalone(dir) {
  const pkg = findPackage(dir)
  if (!pkg) {
    console.error(`未知的包：${dir}\n可用值：${PACKAGES.map((item) => item.dir).join(' | ')}`)
    process.exit(1)
  }

  if (pkg.dir === 'shell') {
    console.error(
      'Shell 需要加载子应用构建产物，无法独立启动。\n' +
        '请使用 `pnpm run dev`（集成模式），或先 `pnpm run build` 再 `pnpm run preview`。'
    )
    process.exit(1)
  }

  console.log(`▶ 独立开发 ${pkg.label}`)
  console.log(`  地址：http://localhost:${pkg.port}/`)
  console.log('  该模式不参与构建产物，仅用于单个子应用的日常开发与热更新。\n')

  const child = spawnScript(pkg.dir, 'dev')
  child.on('exit', (code) => process.exit(code ?? 0))
}

/**
 * 集成开发模式：pnpm run dev
 *
 * 1. 先完整构建一次，生成 dist/
 * 2. 三个子应用进入 `vite build --watch`，源码改动自动重建产物
 * 3. Shell 以 vite dev 启动（带 HMR），dev server 把 dist/apps 挂在 /apps/ 下
 *
 * 因此 Shell 加载的始终是真实的子应用构建产物，与线上行为完全一致 ——
 * 不会出现「dev 正常、部署后白屏」这类只在产物形态下才暴露的问题。
 */
function runIntegrated() {
  rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true })

  console.log('▶ 首次完整构建（仅此一次，之后子应用进入监听模式）\n')
  for (const pkg of PACKAGES) {
    console.log(`   · ${pkg.label}`)
    runScriptOrThrow(pkg.dir, 'build')
  }

  const children = []
  let shuttingDown = false

  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\n▶ 正在停止监听进程 …')
    for (const child of children) killTree(child)
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  console.log('\n▶ 子应用进入产物监听（改动源码后自动重建，刷新页面即可）')
  for (const pkg of APP_PACKAGES) {
    console.log(`   · ${pkg.label}`)
    children.push(spawnScript(pkg.dir, 'build:watch'))
  }

  console.log('\n▶ 启动 Shell 开发服务器')
  console.log('  地址：http://localhost:5173/')
  console.log('  提示：子应用也可以单独跑 `pnpm run dev:<app>` 获得 HMR 体验。')
  console.log('  退出：Ctrl + C\n')

  const shell = spawnScript('shell', 'dev')
  children.push(shell)
  shell.on('exit', (code) => {
    for (const child of children) killTree(child)
    process.exit(code ?? 0)
  })
}
