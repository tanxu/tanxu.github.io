# 微前端模板（GitHub Pages · 原生 ESM 契约）

一套可直接部署到 GitHub Pages 的微前端项目模板：Shell 主应用负责路由与装载，三个技术栈互相独立的子应用各自构建、各自管理状态，运行时通过 Shadow DOM 与 ESM 模块作用域隔离。

| 子应用 | 技术栈 | 状态管理 | 构建产物 |
| --- | --- | --- | --- |
| `shell` | Vite + TypeScript（**无框架运行时**） | 无业务状态，仅路由与装载 | `dist/index.html` |
| `apps/vanilla` | 原生 JavaScript（ESM） | 自研 `EventTarget` + 不可变快照 store | `dist/apps/vanilla/` |
| `apps/react-19` | React 19 + TSX | Zustand | `dist/apps/react-19/` |
| `apps/vue-3` | Vue 3 + SFC | Pinia（每个子应用独立 `createPinia()`） | `dist/apps/vue-3/` |
| `packages/contract` | 纯 TypeScript 类型（零运行时） | — | 不产出，编译期擦除 |

## 运行效果

| 原生 JavaScript + 自研 Store | React 19 + Zustand | Vue 3 + Pinia |
| --- | --- | --- |
| ![原生 JavaScript 子应用](docs/screenshots/vanilla.png) | ![React 19 子应用](docs/screenshots/react-19.png) | ![Vue 3 子应用](docs/screenshots/vue-3.png) |

三个子应用各自拥有独立的视觉风格与状态容器；顶栏右侧状态胶囊显示当前装载状态，页脚右侧实时显示最近一条跨应用事件。

---

## 1. 快速开始

```bash
npm install        # 或 pnpm install
npm run typecheck  # 可选：全量类型检查
npm run build      # 完整构建，产物合并到 dist/
npm run preview    # 本地预览生产产物 → http://localhost:4173/
```

开发：

```bash
npm run dev            # 集成模式：Shell (HMR) + 三个子应用产物监听
npm run dev:vanilla    # 独立开发原生子应用 → http://localhost:5174/
npm run dev:react      # 独立开发 React 子应用 → http://localhost:5175/
npm run dev:vue        # 独立开发 Vue 子应用    → http://localhost:5176/
```

> **独立模式**用 `tools/dev-host.ts` 复刻了 Shell 的 Shadow DOM 环境（含把 Vite 注入 `document.head` 的样式搬进 ShadowRoot），因此在单应用里就能提前发现隔离相关问题。
> **集成模式**下 Shell 加载的始终是真实构建产物，与线上行为完全一致，不会出现「dev 正常、部署后白屏」。

---

## 2. 目录结构

```
.
├─ shell/                      Shell 主应用
│  ├─ src/registry.ts          ★ 子应用注册表：新增子应用只需改这里
│  ├─ src/router.ts            hash 路由解析： #/<appId>/<内部路由>
│  ├─ src/loader.ts            装载器：manifest → 样式 → 动态 import → mount
│  ├─ src/bus.ts               CustomEvent 事件总线
│  ├─ src/shadow-base.css      注入每个 ShadowRoot 的基础样式与设计变量
│  └─ src/shell.css            Shell 自身样式（只作用于 light DOM）
├─ apps/
│  ├─ vanilla/src/{mfe.ts,store.ts,app-store.ts,view.ts}
│  ├─ react-19/src/{mfe.tsx,App.tsx,store.ts}
│  └─ vue-3/src/{mfe.ts,App.vue,stores/counter.ts}
├─ packages/contract/src/index.ts   ★ 唯一契约：MfeMountContext / MicroAppModule / AppBus
├─ tools/
│  ├─ mfe-manifest.ts          构建期生成 manifest.json 的 Vite 插件
│  ├─ dev-host.ts              独立开发用的 Shadow DOM 宿主
│  └─ workspace.mjs            脚本公共工具（包管理器探测、进程托管）
├─ scripts/                    build / dev / preview / typecheck / clean
├─ .github/workflows/deploy.yml
└─ dist/                       ★ 构建产物：Shell 与三个子应用合并为一份可部署目录
```

---

## 3. 架构与隔离机制

```
       ┌──────────────────────────────────────────────┐
       │ Shell   hash 路由 · 布局 · 装载器 · 事件总线   │  无业务状态
       └───────────────┬──────────────────────────────┘
                       │ 动态 import() 子应用 ESM 入口
       ┌───────────────┴───────────────┬───────────────┐
       ▼                               ▼               ▼
  ┌─────────┐                    ┌──────────┐    ┌─────────┐
  │ vanilla │                    │ react-19 │    │  vue-3  │
  │ 各自 ESM │                    │ 各自 ESM  │    │ 各自 ESM │
  │ 各自 Store│                   │ 各自 Store│    │ 各自 Store│
  └────┬────┘                    └────┬─────┘    └────┬────┘
       └────────── CustomEvent 事件总线 ──────────────┘
                    （唯一允许的通信通道）
```

### 三层隔离分别由什么保证

| 维度 | 机制 | 落地位置 |
| --- | --- | --- |
| **DOM / 样式** | 每个子应用一个 `ShadowRoot`，Shell 全局样式进不来，子应用样式也出不去 | `shell/src/loader.ts` 的 `attachShadow` |
| **JavaScript** | 子应用是彼此独立的 ESM 模块图，各自打包自己的框架与状态库，靠**不写 `window` 全局变量**的约定互不干扰 | `packages/contract` 的接口约定 |
| **状态** | 每个子应用的 store 都定义在自己的模块图内。Shell 与 `MfeMountContext` 里**没有任何共享 store**，只给只读 `env` 与事件总线 | 三个子应用的 `store.ts` / `stores/` |

> 这是刻意的取舍：**不做 Proxy 沙箱**。三个异构技术栈之间没有值得共享的运行时依赖，沙箱带来的复杂度换不来实际收益。如果后续确需「物理级」隔离，可以直接替换 `shell/src/loader.ts` 的装载实现（换成 wujie 或 iframe），子应用代码一行都不用改 —— 因为契约是 `mount/unmount`，与装载方式无关。

### 子应用生命周期

每个子应用的 ESM 入口必须导出：

```ts
export function mount(ctx: MfeMountContext): void | Promise<void>
export function unmount(): void | Promise<void>
export function update?(ctx: { route: string }): void | Promise<void>   // 可选
```

Shell 的调度规则：

| 场景 | Shell 行为 |
| --- | --- |
| 首次进入子应用 | `mount(ctx)` |
| hash 内部路由变化（如 `#/react-19/a` → `#/react-19/b`） | 有 `update` 就调 `update({route})`，否则退化为 `unmount` + `mount` |
| 切到别的子应用 | `unmount()`，宿主节点隐藏但**不销毁** |
| 再切回来 | 直接复用已加载的模块实例，重新 `mount(ctx)` |

因此 **`unmount` 只负责清理副作用（定时器、总线订阅、第三方实例），不负责清空业务状态**。三个子应用各自切来切去，计数互不影响，也不会互相清零。

`unmount` 里必须做三件事（模板已示范）：

1. 取消所有事件总线订阅（`ctx.bus.on(...)` 返回的函数）；
2. 销毁框架实例（`root.unmount()` / `app.unmount()`）；
3. 移除本次 mount 创建的宿主节点。

---

## 4. 状态管理约定（必须遵守）

- **每个子应用的 store 只属于自己。** 不要把它提升成"微前端全局 store"，也不要把 Shell 做成状态中枢。
- **跨应用数据一律走事件，不走共享对象。** `ctx.bus.emit()` / `ctx.bus.on()` 是唯一通道。
- **事件不会回传给发送者自身**，避免自己 emit 又触发自己的 handler 形成回声循环。
- **子应用非激活状态收不到事件。** 因为 `unmount` 必须取消订阅（否则泄漏），所以被切走的子应用不会持续接收广播；切回来重新 `mount` 时会重新订阅。如果你的业务确实需要「后台持续接收」，那就不要在 `unmount` 里取消订阅 —— 但要清楚这会带来泄漏与越权处理事件的风险。
- **事件 payload 不要就地修改。** 所有订阅者拿到同一份 `detail` 引用，要派生数据请先拷贝。
- Shell 侧不存业务状态。它只提供：路由、只读 `env`（`appId` / `baseUrl` / `hash` / `builtAt`）、事件总线。

事件命名建议 `域:动作`，例如模板里的 `counter:changed`。

---

## 5. 构建产物与缓存策略

GitHub Pages 是静态托管 + CDN，**无法主动 purge 缓存**，因此产物分两类处理：

```
dist/index.html                Shell 入口
dist/assets/<name>-<hash>.js   Shell 资源（content hash，可长期缓存）
dist/apps/<id>/index.js        子应用入口（固定文件名）
dist/apps/<id>/manifest.json   子应用产物清单（含构建指纹 hash）
dist/apps/<id>/assets/*.js     子应用内部 chunk（content hash，可长期缓存）
```

运行时流程：

```
Shell → fetch  apps/<id>/manifest.json?t=<时间戳>   （no-store，永远拿到最新）
      → 注入 <link> 样式到 ShadowRoot
      → import(apps/<id>/index.js?v=<manifest.hash>) （hash 变化即绕过 CDN 缓存）
```

`manifest.json` 由 `tools/mfe-manifest.ts` 在各子应用构建结束时自动生成，无需手工维护。

---

## 6. 新增一个子应用

以新增 `apps/svelte` 为例：

1. 复制 `apps/vanilla` 作为起点，改 `package.json` 的 `name`；
2. 改 `vite.config.ts` 里的 `NAME = 'svelte'`、`lib.entry`、`server.port`；
3. 实现 `src/mfe.ts`，导出 `mount` / `unmount`（`update` 可选），
   并 `import './style.css'` —— 样式会被打进同一个 css 文件，由 Shell 注入 ShadowRoot；
4. 在 `tools/workspace.mjs` 的 `PACKAGES` 里加一行；
5. 在 `shell/src/registry.ts` 的 `APPS` 里加一项：

```ts
{
  id: 'svelte',
  title: 'Svelte',
  stack: 'Svelte 5 + Runes',
  dir: 'apps/svelte/',
  defaultRoute: '/'
}
```

6. 在根 `package.json` 加一条 `dev:svelte` 脚本（可选）；
7. `npm run build`，产物会自动进入 `dist/apps/svelte/`。

---

## 7. 部署到 GitHub Pages

1. 新建 GitHub 仓库并推送代码（**务必提交 `package-lock.json`**，CI 用 `npm ci`）；
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；
   > ⚠️ **这一步不能跳过。** 若保持默认的「Deploy from a branch」，GitHub 会额外跑一个内置的
   > `pages build and deployment`（Jekyll）流程，把仓库根目录当成站点构建 —— 而本模板根目录
   > 只有 `README.md`，结果就是访问域名时显示 README 内容，本模板的 `dist/` 永远不会生效。
   > 两个流程会长期并存、互相覆盖。改成 **GitHub Actions** 后，Jekyll 流程立即停止触发。
   > 验证：仓库 Actions 列表里**不应**再出现 `pages build and deployment` 这条记录。
3. 推送到 `main` 分支即自动触发 `.github/workflows/deploy.yml`：类型检查 → 构建 → 上传 `dist/` → 部署；
4. 站点地址：
   - 项目页 `https://<user>.github.io/<repo>/`
   - 用户页 / 自定义域名 `https://<user>.github.io/`

**两种地址都开箱即用，无需改任何配置。** 原因：

- Shell 与子应用的 `base` 都设为相对路径 `'./'`；
- 站点根由 Shell 运行时推导：`new URL('./', location.href)`；
- 路由统一走 hash，页面永远是同一个 HTML 文档，相对路径解析恒成立。

（如果你希望改成绝对基路径，把 `shell/vite.config.ts` 和三个子应用的 `base` 改成 `'/<repo>/'` 即可。）

---

## 8. 已知限制与注意事项

**架构层面**

- **没有 JS 沙箱。** 子应用若直接给 `window` 挂全局变量、或改写 `Array.prototype` 之类，仍会互相影响。隔离靠契约与代码评审约束。需要硬隔离请上 wujie / iframe。
- **无 SSR，SEO 不友好。** 整站是客户端渲染。
- **框架不共享。** 三个子应用各自打包自己的框架，总体积比共享依赖的方案大（React 19 约 +45KB gzip）。这是"技术栈完全独立"的必要代价。
- **首屏串行**：`manifest.json` → 入口 JS → 子应用内部资源。每个子应用首次进入时有 2 跳网络往返。

**Shadow DOM 相关**

- **弹层组件**：`position: fixed` 的元素在 Shadow DOM 内仍受视口定位约束，一般可用；但依赖 `document.body` 的浮层库（如部分 UI 库的 `appendTo: 'body'`）会跑到 light DOM 丢失样式，需要把它挂到 `ctx.shadowRoot` 内的节点。
- **React 19**：`createRoot` 挂到 ShadowRoot 内的节点即可，事件系统原生支持；但 **Portal 的目标必须在同一个 ShadowRoot 内**；不要给 `document` 绑全局监听（如「点击外部关闭」），请绑到 `ctx.shadowRoot`。
- **Vue 3**：`createApp().mount()` 无需适配；**`Teleport` 不要指向 `body`**；组件库的全局样式注入默认写 `document.head`，在 Shadow DOM 下不生效，需手动注入 `ctx.shadowRoot`。
- **全局 CSS 变量**：Shell 通过 `shadow-base.css` 的 `:host` 注入 `--mfe-*` 设计变量，子应用可直接使用或覆盖。

**GitHub Pages 相关**

- 不能设置自定义响应头，`COOP` / `COEP` / 自定义 `CSP` 不可用（`SharedArrayBuffer` 等特性因此受限）。
- CDN 缓存无法主动失效，务必保持「入口固定名 + manifest 指纹」的既有产物结构。
- Service Worker 可用，但作用域受子路径限制；模板暂未启用。
- 仓库必须是 public（免费账号），Pages 对私有仓库需要付费方案。

---

## 9. 常见问题

**Q：Actions 部署显示成功，但访问域名看到的是 README 内容？**
A：仓库 Pages 的部署来源还停留在「Deploy from a branch」，GitHub 会另外跑一个内置的 Jekyll 流程把仓库**根目录**当站点构建 —— 根目录只有 `README.md`，于是 README 成了首页，本模板的 `dist/` 从未被采用。两个流程会同时存在并互相覆盖。修复：**Settings → Pages → Source** 改为 **GitHub Actions**，再 **Actions → Deploy to GitHub Pages → Run workflow** 重跑一次（切换来源不会自动重新部署）。修复成功的判据：线上首页 HTML 里能搜到 `id="mfe-stage"`，且 Actions 列表中不再出现 `pages build and deployment`。

**Q：切到某个子应用显示「加载失败」？**
A：`manifest.json` 拉取失败，通常是没跑过完整构建。执行 `npm run build` 后重试；`npm run dev` 会自动先构建一次。

**Q：子应用里的样式不生效？**
A：独立开发模式（`dev:<app>`）下请确认样式通过 `import './style.css'` 或 SFC `<style>` 声明在入口模块图中；集成模式请确认 `vite.config.ts` 里保留了 `cssCodeSplit: false`。

**Q：改了子应用代码，集成模式下没变化？**
A：`npm run dev` 的子应用走 `vite build --watch`，保存后约数百毫秒重建，浏览器需手动刷新（无 HMR）。要 HMR 体验请用 `npm run dev:<app>` 独立开发。

**Q：能在子应用里 import 另一个子应用的代码吗？**
A：不要。这会把两份打包结果耦合成共享模块图，破坏隔离前提。需要共享的只有 `packages/contract`（且必须是 `import type`）。

**Q：为什么 `@mfe/contract` 不能直接 import 值？**
A：它是纯类型包，所有引用必须写成 `import type { ... } from '@mfe/contract'`，这样打包器会在编译期把整条 import 擦除，保证子应用之间零运行时耦合。
