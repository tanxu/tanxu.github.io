import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 所有可构建的包。
 * port 仅用于独立开发模式（`pnpm run dev:<app>`）。
 */
export const PACKAGES = [
  { dir: 'shell', label: 'Shell 主应用', port: 5173 },
  { dir: 'apps/vanilla', label: '子应用 · 原生 JavaScript', port: 5174 },
  { dir: 'apps/react-19', label: '子应用 · React 19', port: 5175 },
  { dir: 'apps/vue-3', label: '子应用 · Vue 3', port: 5176 }
]

export const APP_PACKAGES = PACKAGES.filter((pkg) => pkg.dir.startsWith('apps/'))

export function findPackage(dir) {
  return PACKAGES.find((pkg) => pkg.dir === dir)
}

/** 子应用 id 与部署目录名一致，例如 apps/react-19 -> react-19 */
export function appIdOf(dir) {
  return dir.split('/')[1]
}

/**
 * 识别当前使用的包管理器。
 * 优先读 npm_config_user_agent（由 npm / pnpm / yarn 在执行 script 时注入），
 * 这样无论用户用哪个包管理器，脚本都不需要改。
 */
export function detectPackageManager() {
  const agent = process.env.npm_config_user_agent ?? ''
  if (agent.startsWith('pnpm')) return 'pnpm'
  if (agent.startsWith('yarn')) return 'yarn'
  if (agent.startsWith('npm')) return 'npm'

  if (existsSync(resolve(ROOT, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(resolve(ROOT, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function scriptArgs(script, extraArgs) {
  const pm = detectPackageManager()
  return pm === 'yarn' ? [script, ...extraArgs] : ['run', script, ...extraArgs]
}

const spawnOptions = (dir) => ({
  cwd: resolve(ROOT, dir),
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

/** 同步执行某个包里的 script，返回退出码（不抛错） */
export function runScript(dir, script, extraArgs = []) {
  const result = spawnSync(detectPackageManager(), scriptArgs(script, extraArgs), spawnOptions(dir))
  return result.status ?? 1
}

/** 同步执行，失败即抛错 */
export function runScriptOrThrow(dir, script, extraArgs = []) {
  const status = runScript(dir, script, extraArgs)
  if (status !== 0) {
    throw new Error(`${dir} 的 "${script}" 执行失败，退出码 ${status}`)
  }
}

/** 异步启动某个包里的 script，返回子进程 */
export function spawnScript(dir, script) {
  return spawn(detectPackageManager(), scriptArgs(script, []), spawnOptions(dir))
}

/** 结束子进程及其派生进程（Windows 下需要 taskkill /T） */
export function killTree(child) {
  if (!child || child.pid === undefined || child.exitCode !== null) return

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}
