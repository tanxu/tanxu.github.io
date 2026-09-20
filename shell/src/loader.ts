import type { AppManifest, MfeBus, MfeEnv, MfeMountContext, MicroAppModule } from '@mfe/contract'
import { createBus } from './bus'
import type { AppDefinition } from './registry'

const MANIFEST_FILE = 'manifest.json'

type StatusKind = 'idle' | 'loading' | 'ready' | 'error'

interface Instance {
  def: AppDefinition
  /** 宿主元素，位于 Shell 的 light DOM 中 */
  host: HTMLElement
  /** 隔离边界：子应用的全部 DOM 与样式都关在这里面 */
  root: ShadowRoot
  /** 业务挂载点，位于 ShadowRoot 内部 */
  container: HTMLElement
  /** 子应用资源基路径（绝对 URL，以 / 结尾） */
  baseUrl: string
  /**
   * 该子应用专属的事件总线门面。
   *
   * 为什么每个子应用一份：总线需要知道「我在替谁发消息」才能正确过滤掉自己发出的事件。
   * 所有门面共用 document 上的同一个通道，但各自持有独立的订阅表与发送方标识，
   * 因此既不会自触发回声，也不会把 A 的事件误判成 B 自己发的。
   */
  bus: MfeBus
  module: MicroAppModule | null
  env: MfeEnv | null
  mounted: boolean
}

export interface RuntimeOptions {
  /** 子应用宿主节点的挂载位置 */
  stage: HTMLElement
  /** 注入每个 ShadowRoot 的基础样式（reset + 设计变量） */
  baseStyle: string
  /** 站点根 URL，由 `new URL('./', location.href)` 得到，项目页与用户页通吃 */
  siteRoot: URL
  onStatus(text: string, kind?: StatusKind): void
}

/**
 * 微前端运行时。
 *
 * 隔离策略：
 * - DOM / 样式：每个子应用一个 ShadowRoot，Shell 全局样式无法渗入，
 *   子应用样式也无法泄漏到 Shell 或其他子应用。
 * - JS：子应用是独立的 ESM 模块图，各自打包自己的框架与状态库，
 *   只要遵守 `packages/contract` 里「不写 window 全局变量」的约定，
 *   运行时就互不干涉。这里不做 Proxy 沙箱 —— 隔离靠架构约定而非框架。
 * - 状态：运行时只提供只读 env 与事件总线，不提供任何共享 store。
 *
 * 实例缓存：子应用一旦加载就常驻（module 与 ShadowRoot 都保留），
 * 切走时只调用其 unmount 清理副作用，切回来直接复用，
 * 因此各子应用的内部状态天然互不干扰且不会互相清零。
 */
export class MicroFrontendRuntime {
  private readonly instances = new Map<string, Instance>()
  private activeId: string | null = null
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly options: RuntimeOptions) {}

  get active(): string | null {
    return this.activeId
  }

  /** 串行化激活请求，避免快速切路由时并发 mount 同一个子应用 */
  activate(def: AppDefinition, subPath: string): Promise<void> {
    const run = (): Promise<void> => this.doActivate(def, subPath)
    this.queue = this.queue.then(run, run)
    return this.queue
  }

  private async doActivate(def: AppDefinition, subPath: string): Promise<void> {
    const instance = this.ensureInstance(def)

    // 必须先把宿主节点接入文档：ShadowRoot 内脱离文档的 <link rel=stylesheet>
    // 不会发起请求，onload 永不触发，会直接卡死整个激活流程。
    // 此时宿主还是 display:none，不会闪出半成品 UI。
    this.attach(instance)

    if (this.activeId && this.activeId !== def.id) {
      const previous = this.instances.get(this.activeId)
      if (previous) await this.teardown(previous)
    }

    if (!instance.module) {
      try {
        await this.download(instance)
      } catch (error) {
        this.renderError(instance, error)
        this.show(instance)
        this.options.onStatus(error instanceof Error ? error.message : String(error), 'error')
        // 已渲染错误面板，不再向上抛，避免中断 hashchange 流程
        return
      }
    }

    this.show(instance)
    this.activeId = def.id

    const module = instance.module
    if (!module) return

    try {
      if (!instance.mounted) {
        await module.mount(this.createContext(instance, subPath))
        instance.mounted = true
      } else if (typeof module.update === 'function') {
        await module.update({ route: subPath })
      } else {
        // 子应用未实现 update：退化为 unmount + mount，状态会重置
        await module.unmount()
        await module.mount(this.createContext(instance, subPath))
      }
      this.options.onStatus(`${def.title} 已就绪`, 'ready')
    } catch (error) {
      this.options.onStatus(`${def.title} 运行异常：${describe(error)}`, 'error')
      console.error(`[shell] 子应用 ${def.id} 生命周期异常`, error)
    }
  }

  private ensureInstance(def: AppDefinition): Instance {
    const cached = this.instances.get(def.id)
    if (cached) return cached

    const host = document.createElement('div')
    host.className = 'mfe-host'
    host.dataset.app = def.id

    const root = host.attachShadow({ mode: 'open' })

    const baseStyle = document.createElement('style')
    baseStyle.textContent = this.options.baseStyle
    root.appendChild(baseStyle)

    const container = document.createElement('div')
    container.className = 'mfe-container'
    container.dataset.app = def.id
    root.appendChild(container)

    const instance: Instance = {
      def,
      host,
      root,
      container,
      baseUrl: new URL(def.dir, this.options.siteRoot).href,
      bus: createBus(() => def.id),
      module: null,
      env: null,
      mounted: false
    }
    this.instances.set(def.id, instance)
    return instance
  }

  /** 拉 manifest -> 注入样式 -> 动态 import 入口 ESM */
  private async download(instance: Instance): Promise<void> {
    const { def, baseUrl } = instance
    this.options.onStatus(`加载 ${def.title} …`, 'loading')

    // manifest 走 no-store + 时间戳查询：CDN 缓存不可主动失效，只能换 URL
    const manifestUrl = new URL(`${MANIFEST_FILE}?t=${Date.now()}`, baseUrl).href
    const response = await fetch(manifestUrl, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(
        `manifest.json 拉取失败（HTTP ${response.status}）：${manifestUrl} —— 请先执行完整构建（npm run build）。`
      )
    }

    const manifest = (await response.json()) as AppManifest
    if (!manifest.entry) {
      throw new Error(`manifest.json 缺少 entry 字段：${manifestUrl}`)
    }

    // 样式先于挂载注入，避免首帧裸样式闪烁
    if (manifest.style) {
      await this.loadStyle(instance, new URL(`${manifest.style}?v=${manifest.hash}`, baseUrl).href)
    }

    const entryUrl = new URL(`${manifest.entry}?v=${manifest.hash}`, baseUrl).href
    // @vite-ignore：入口 URL 运行期才确定，禁止打包器做静态分析
    const loaded = (await import(/* @vite-ignore */ entryUrl)) as Partial<MicroAppModule>

    if (typeof loaded.mount !== 'function' || typeof loaded.unmount !== 'function') {
      throw new Error(`入口未导出 mount/unmount：${entryUrl}`)
    }

    instance.module = loaded as MicroAppModule
    instance.env = {
      appId: def.id,
      baseUrl,
      builtAt: manifest.builtAt,
      hash: manifest.hash
    }
  }

  private loadStyle(instance: Instance, href: string): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve()
      }

      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.addEventListener('load', done, { once: true })
      link.addEventListener(
        'error',
        () => {
          console.warn(`[shell] 样式加载失败：${href}`)
          done()
        },
        { once: true }
      )

      // 兜底超时：样式异常绝不能阻塞子应用激活
      const timer = window.setTimeout(() => {
        console.warn(`[shell] 样式加载超时：${href}`)
        done()
      }, 5000)

      instance.root.insertBefore(link, instance.container)
    })
  }

  private createContext(instance: Instance, route: string): MfeMountContext {
    const env = instance.env
    if (!env) throw new Error(`子应用 ${instance.def.id} 尚未完成加载`)

    return {
      appId: instance.def.id,
      shadowRoot: instance.root,
      container: instance.container,
      base: instance.baseUrl,
      route,
      bus: instance.bus,
      getEnv: () => env
    }
  }

  private async teardown(instance: Instance): Promise<void> {
    const module = instance.module
    if (instance.mounted && module) {
      try {
        await module.unmount()
      } catch (error) {
        console.error(`[shell] 子应用 ${instance.def.id} unmount 异常`, error)
      }
      instance.mounted = false
    }
    instance.host.classList.remove('is-active')
    instance.host.setAttribute('aria-hidden', 'true')
  }

  /** 把宿主节点接入文档（此时仍是隐藏的），是 ShadowRoot 内资源能正常加载的前提 */
  private attach(instance: Instance): void {
    if (instance.host.parentNode !== this.options.stage) {
      this.options.stage.appendChild(instance.host)
    }
  }

  private show(instance: Instance): void {
    this.attach(instance)
    for (const other of this.instances.values()) {
      if (other !== instance) {
        other.host.classList.remove('is-active')
        other.host.setAttribute('aria-hidden', 'true')
      }
    }
    instance.host.classList.add('is-active')
    instance.host.removeAttribute('aria-hidden')
  }

  private renderError(instance: Instance, error: unknown): void {
    instance.container.replaceChildren()
    const box = document.createElement('div')
    box.className = 'mfe-error'

    const title = document.createElement('h2')
    title.textContent = `${instance.def.title} 加载失败`

    const detail = document.createElement('pre')
    detail.textContent = describe(error)

    const hint = document.createElement('p')
    hint.textContent = '常见原因：未执行完整构建、manifest.json 未生成、或子应用入口导出异常。'

    box.append(title, detail, hint)
    instance.container.appendChild(box)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
