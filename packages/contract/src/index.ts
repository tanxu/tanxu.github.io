/**
 * @mfe/contract —— Shell 与子应用之间的唯一契约。
 *
 * 设计约束：
 * 1. 本文件只能包含类型定义，禁止出现任何运行时值（const / function / class）。
 *    所有引用方必须使用 `import type { ... } from '@mfe/contract'`，
 *    这样打包器会在编译期把整条 import 语句擦除，不会产生任何运行时耦合。
 * 2. 子应用之间不共享任何模块实例，只共享这里定义的消息形状。
 */

/** 子应用唯一标识，对应 shell/src/registry.ts 中的 id */
export type AppId = string

/** 一次跨应用事件的完整描述 */
export interface MfeEvent<T = unknown> {
  /** 事件类型，建议使用 `域:动作` 形式，如 `counter:changed` */
  type: string
  /** 事件负载，必须是可结构化克隆的普通数据 */
  detail: T
  /** 事件发送方的 appId */
  source: AppId
  /** 发送时刻（Date.now()）。回放事件的 timestamp 是它**真实发生**的时间，不是投递时间 */
  timestamp: number
  /**
   * 是否为「离线回放」事件。
   *
   * 同一时刻只有一个子应用处于挂载状态（其余已 unmount 并取消订阅），
   * 因此 Shell 会缓存最近的跨应用事件，并在子应用挂载后把它离线期间
   * 错过的事件补投一遍，这些事件的 `replayed` 为 `true`。
   *
   * **副作用敏感的 handler 必须处理这个标记**：例如「收到事件就发起请求」
   * 的逻辑，在回放时应当跳过，否则会重复执行历史动作。
   */
  replayed?: boolean
}

export type MfeEventHandler<T = unknown> = (event: MfeEvent<T>) => void

/**
 * 跨应用事件总线。这是子应用之间唯一被允许的通信通道。
 *
 * 语义要点：
 * 1. 事件不会回传给发送者自身，避免自触发回声循环。
 * 2. 只有**当前挂载中**的子应用能实时收到事件；未挂载的子应用会在下次
 *    挂载时通过 Shell 的离线回放补齐（见 `MfeEvent.replayed`）。
 */
export interface MfeBus {
  /** 广播事件给其余所有子应用与 Shell */
  emit<T = unknown>(type: string, detail?: T): void
  /**
   * 订阅事件，返回取消订阅函数。
   * `type` 传 `'*'` 表示通配订阅：该 handler 会收到所有类型的事件。
   */
  on<T = unknown>(type: string, handler: MfeEventHandler<T>): () => void
  /** 订阅一次，触发后自动取消 */
  once<T = unknown>(type: string, handler: MfeEventHandler<T>): () => void
}

/** Shell 暴露给子应用的只读环境信息 */
export interface MfeEnv {
  /** 当前子应用 id */
  appId: AppId
  /** 子应用构建产物的部署基路径（绝对 URL，以 / 结尾） */
  baseUrl: string
  /** 构建时间戳，来自子应用自己的 manifest.json */
  builtAt: string
  /** 构建指纹，用于排查"页面跑的是不是最新产物" */
  hash: string
}

/** Shell 调用 mount 时注入的运行时上下文 */
export interface MfeMountContext {
  /** 当前子应用 id */
  appId: AppId
  /** 子应用的 ShadowRoot —— DOM 与样式的隔离边界 */
  shadowRoot: ShadowRoot
  /** 业务 DOM 的挂载点，位于 shadowRoot 内部 */
  container: HTMLElement
  /** 子应用资源基路径（绝对 URL，以 / 结尾） */
  base: string
  /** 当前子应用内部路由，即 hash 中 appId 之后的部分，形如 `/detail/1` */
  route: string
  /** Shell 提供的跨应用事件总线 */
  bus: MfeBus
  /** 读取只读环境信息 */
  getEnv(): Readonly<MfeEnv>
}

/**
 * 每个子应用的 ESM 入口必须导出这三个函数。
 *
 * 生命周期约定：
 *   activate(app)   -> mount(ctx)    首次进入该子应用
 *   hash 子路径变化  -> update({route})  已挂载状态下的内部路由切换
 *   activate(其他app) -> unmount()   离开该子应用
 *   activate(app)   -> mount(ctx)    再次进入（模块实例仍在，状态保留）
 */
export interface MicroAppModule {
  /** 挂载。必须把业务 DOM 挂到 ctx.container 下 */
  mount(ctx: MfeMountContext): void | Promise<void>
  /**
   * 卸载。必须清理：定时器、window/document 监听、
   * 事件总线订阅、第三方实例（图表、编辑器等）。
   */
  unmount(): void | Promise<void>
  /** 子应用内部路由变化。未导出时 Shell 会退化为 unmount + mount */
  update?(ctx: Pick<MfeMountContext, 'route'>): void | Promise<void>
}

/** 子应用构建产物中的 manifest.json 结构，由各子应用的 vite 插件生成 */
export interface AppManifest {
  /** 子应用 id */
  name: AppId
  /** ESM 入口文件，相对子应用基路径 */
  entry: string
  /** 需要注入 ShadowRoot 的样式文件，相对子应用基路径；无样式时省略 */
  style?: string
  /** 构建指纹，Shell 用它给入口 URL 加 query 以击穿 CDN 缓存 */
  hash: string
  /** 构建时间（ISO 8601） */
  builtAt: string
}
