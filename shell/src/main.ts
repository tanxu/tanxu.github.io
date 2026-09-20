import type { MfeEvent } from '@mfe/contract'
import { createBus } from './bus'
import { MicroFrontendRuntime } from './loader'
import { APPS, findApp, type AppDefinition } from './registry'
import { buildHash, parseHash } from './router'
import baseStyle from './shadow-base.css?inline'
import './shell.css'

/** 取必需的 DOM 节点，缺失即报错 —— 这样后续在闭包里使用到的都是非空类型 */
function mustQuery<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`Shell 初始化失败：index.html 缺少 ${selector} 节点`)
  return el
}

const stage = mustQuery<HTMLElement>('#stage')
const nav = mustQuery<HTMLElement>('#nav')
const status = mustQuery<HTMLElement>('#status')
const events = mustQuery<HTMLUListElement>('#events')
const clearButton = mustQuery<HTMLButtonElement>('#bus-clear')

/**
 * 站点根 URL。项目页（https://user.github.io/<repo>/）与用户页（https://user.github.io/）
 * 都能正确解析，因此子应用目录无需任何环境变量注入。
 * hash 路由保证页面永远是同一个 HTML 文档，相对解析始终成立。
 */
const siteRoot = new URL('./', window.location.href)

/**
 * Shell 自己的一份总线门面，发送方标识为 'shell'。
 * 三个子应用各自持有自己的门面（由 loader 创建），它们共用 document 上的同一个通道，
 * 因此互相收得到消息，又不会把自己发出去的消息再收回来。
 */
const bus = createBus(() => 'shell')

/* ---------------- 跨应用事件流（展示 + 离线回放缓存） ---------------- */

/** 缓存的最近事件条数，同时也是子应用挂载时最多能补回的历史条数 */
const HISTORY_LIMIT = 20

/**
 * 为什么 Shell 要缓存事件：
 * 同一时刻只有一个子应用处于挂载状态，其余子应用在 unmount 时已取消总线订阅，
 * 因此「A 广播时 B 不在线」是常态而非异常。Shell 作为中立方缓存最近的跨应用事件，
 * 在子应用挂载后把它离线期间错过的部分补投一遍（标记 `replayed: true`），
 * 跨应用通信才真正有意义 —— 它传递的是「你不在场时发生过什么」。
 */
const history: MfeEvent<unknown>[] = []

// 通配订阅：Shell 不解释任何业务事件，只做消息中转与展示
bus.on('*', (event) => {
  history.push(event)
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT)
  renderEvents()
})

function summarize(detail: unknown): string {
  if (detail === undefined) return ''
  if (detail === null) return 'null'
  if (typeof detail !== 'object') return String(detail)
  try {
    const text = JSON.stringify(detail)
    return text.length > 80 ? `${text.slice(0, 80)}…` : text
  } catch {
    return '[不可序列化]'
  }
}

function renderEvents(): void {
  if (history.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'shell__bus-empty'
    empty.textContent = '暂无跨应用事件'
    events.replaceChildren(empty)
    return
  }

  // 最新的排在最前
  events.replaceChildren(...[...history].reverse().map(createEventRow))
}

function createEventRow(event: MfeEvent<unknown>): HTMLLIElement {
  const row = document.createElement('li')
  row.className = 'shell__bus-item'

  const time = document.createElement('span')
  time.className = 'shell__bus-time'
  time.textContent = new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour12: false })

  const source = document.createElement('span')
  source.className = 'shell__bus-source'
  source.textContent = event.source

  const type = document.createElement('span')
  type.className = 'shell__bus-type'
  type.textContent = event.type

  const payload = document.createElement('span')
  payload.className = 'shell__bus-payload'
  payload.textContent = summarize(event.detail)

  row.append(time, source, type, payload)
  return row
}

clearButton.addEventListener('click', () => {
  history.length = 0
  renderEvents()
})

/* ---------------- 运行时 ---------------- */

const runtime = new MicroFrontendRuntime({
  stage,
  baseStyle,
  siteRoot,
  getRecentEvents: () => history,
  onStatus(text, kind = 'idle') {
    status.textContent = text
    status.dataset.kind = kind
  }
})

const fallback = APPS[0]
if (!fallback) throw new Error('子应用注册表为空，请检查 shell/src/registry.ts')

/* ---------------- 导航 ---------------- */

const navLinks = new Map<string, HTMLAnchorElement>()

for (const app of APPS) {
  const link = document.createElement('a')
  link.className = 'shell__nav-item'
  link.href = buildHash(app.id, app.defaultRoute)

  const label = document.createElement('span')
  label.className = 'shell__nav-label'
  label.textContent = app.title

  const stack = document.createElement('span')
  stack.className = 'shell__nav-stack'
  stack.textContent = app.stack

  link.append(label, stack)
  nav.appendChild(link)
  navLinks.set(app.id, link)
}

function highlight(appId: string | null): void {
  for (const [id, link] of navLinks) {
    if (id === appId) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
}

/* ---------------- 路由 ---------------- */

async function handleRoute(): Promise<void> {
  const route = parseHash(window.location.hash)
  const def = route ? findApp(route.appId) : undefined

  if (!route || !def) {
    // 空 hash 或未知子应用：重定向到默认子应用
    const target = buildHash(fallback.id, fallback.defaultRoute)
    if (window.location.hash !== target) window.location.replace(target)
    return
  }

  highlight(def.id)
  document.title = `${def.title} · 微前端 Shell`
  await runtime.activate(def, route.subPath)
}

window.addEventListener('hashchange', () => {
  void handleRoute()
})

/* ---------------- 调试入口 ---------------- */

declare global {
  interface Window {
    __MFE__?: {
      runtime: MicroFrontendRuntime
      bus: typeof bus
      apps: readonly AppDefinition[]
      siteRoot: string
      history: readonly MfeEvent<unknown>[]
    }
  }
}

window.__MFE__ = { runtime, bus, apps: APPS, siteRoot: siteRoot.href, history }

console.info(
  '%c[MFE Shell]%c 站点根路径 ' + siteRoot.href + ' · 调试入口 window.__MFE__',
  'color:#0969da;font-weight:500',
  'color:inherit'
)

void handleRoute()
