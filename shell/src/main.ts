import { createBus } from './bus'
import { MicroFrontendRuntime } from './loader'
import { APPS, findApp, type AppDefinition } from './registry'
import { buildHash, parseHash } from './router'
import baseStyle from './shadow-base.css?inline'
import './shell.css'

const stage = document.querySelector<HTMLElement>('#stage')
const nav = document.querySelector<HTMLElement>('#nav')
const status = document.querySelector<HTMLElement>('#status')
const events = document.querySelector<HTMLElement>('#events')

if (!stage || !nav || !status || !events) {
  throw new Error('Shell 初始化失败：index.html 缺少 #stage / #nav / #status / #events 节点')
}

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

const runtime = new MicroFrontendRuntime({
  stage,
  baseStyle,
  siteRoot,
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

/* ---------------- 总线上的一次演示订阅 ---------------- */

bus.on<{ total: number }>('counter:changed', (event) => {
  const time = new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
  events.textContent = `最近事件：${event.source} 广播计数 ${event.detail.total} · ${time}`
})

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
    }
  }
}

window.__MFE__ = { runtime, bus, apps: APPS, siteRoot: siteRoot.href }

console.info(
  '%c[MFE Shell]%c 站点根路径 ' + siteRoot.href + ' · 调试入口 window.__MFE__',
  'color:#0969da;font-weight:500',
  'color:inherit'
)

void handleRoute()
