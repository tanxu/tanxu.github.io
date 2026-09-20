# 项目长期笔记：微前端模板

## 技术决策（已定，勿轻易改动）
- 包管理器：**pnpm 12.4.2**（根 package.json 的 packageManager 字段锁定，CI 同版本）。
- 集成方式：**Shell + 原生 ESM 契约**，子应用各自构建为自包含 ESM 包，Shell 动态 `import()` 加载。
  不用 Module Federation（三个异构栈无可共享运行时依赖）、不用 qiankun（不提供状态隔离价值）、不用 iframe（UI 融合差）。
- 隔离：Shadow DOM（DOM/样式）+ ESM 模块作用域（JS）。**不做 Proxy 沙箱**，靠契约约束。
- 路由：hash（`#/<appId>/<subPath>`），规避 GitHub Pages 无服务端路由。
- 站点根在运行时由 `new URL('./', location.href)` 推导，`base` 一律用相对路径 `'./'`，
  因此项目页 `/<repo>/` 与用户页 `/` 都无需任何环境变量。

## 关键约定
- `@mfe/contract` 是**纯类型包**，只能 `import type`，禁止出现运行时值。
  pnpm 下每个使用方必须显式声明 `"@mfe/contract": "workspace:*"`。
- 子应用之间**不共享 store、不互相 import**，跨应用数据只走 `ctx.bus` CustomEvent。
- **同一时刻只有一个子应用挂载**：跨应用事件语义 =「离线消息」。Shell 缓存最近 20 条
  （`bus.on('*')` 通配订阅），子应用挂载后延迟 50ms 补投（事件带 `replayed: true`），
  每实例 lastDeliveredTs 水位线防止重复回放。副作用敏感的 handler 必须跳过 replayed 事件。
- `unmount()` 只清理副作用（定时器 / 总线订阅 / 框架实例 / 宿主节点），**不重置业务状态**。
- 子应用 `mount()` 每次新建容器节点，`unmount()` 整体移除 —— 避免 `createRoot` 对同一容器调用两次。
- 新增子应用需改两处：`tools/workspace.mjs` 的 `PACKAGES`、`shell/src/registry.ts` 的 `APPS`。
- pnpm 11+ 用 `allowBuilds`（map：包名 → true/false）放行依赖的 postinstall，
  旧的 `onlyBuiltDependencies` 已移除；`strictDepBuilds` 默认 true，未审查脚本会让 install
  直接 ERR_PNPM_IGNORED_BUILDS 失败。模板放行 esbuild、vue-demi。

## 产物约定（GitHub Pages CDN 缓存不可失效）
- 子应用入口固定名 `index.js`，内部资源带 content hash；
- 每个子应用构建产物含 `manifest.json`（entry / style / hash / builtAt），由 `tools/mfe-manifest.ts` 生成；
- Shell 运行时先拉 `manifest.json?t=<时间戳>`，再 `import(index.js?v=<hash>)`。

## 部署约定（GitHub Pages）
- 仓库 **Settings → Pages → Source 必须选 "GitHub Actions"**。若保持默认的 "Deploy from a branch"，
  GitHub 会同时跑内置的 `pages build and deployment`（Jekyll）把仓库根目录当站点构建 ——
  根目录只有 README.md 时，域名首页就渲染成 README，本模板的 dist/ 永不生效。
- workflow 已加 `enablement: true`（Pages 未启用时自动以 Actions 模式开启），
  但它**不会**把已有的 branch 来源改成 Actions，来源切换只能手动做一次。
- 判据：线上首页 HTML 应含 `id="mfe-stage"`；Actions 列表不应再出现 `pages build and deployment`。
- CI 链路：pnpm/action-setup@v4（版本读 packageManager 字段，workflow 里不写 version）→
  setup-node cache: pnpm → `pnpm install --frozen-lockfile`。pnpm 必须在 setup-node **之前**装。

## 环境事实
- 本机有全局 **pnpm 12.4.2**（`$APPDATA/npm`，Bash 中需 `PATH="$PATH:$APPDATA/npm"`）；
  系统 Node 24 自带 corepack，managed Node 22 没有。
- 根 package.json 的 devDependencies（vite、@types/node）是给 `tools/` 共享插件用的 ——
  pnpm 不做提升，`tools/mfe-manifest.ts` 的 `import type { Plugin } from 'vite'` 必须靠根声明解析。
- PowerShell 工具的 stdout 不返回，需写文件再 Read；**Bash（Git Bash）可用**：git / curl / node / netstat 等，
  优先用 Bash。未装 gh CLI，查公开仓库用 `curl https://api.github.com/...`（免认证）。
- vite preview 在 Windows 只绑 IPv6 `::1`，curl 探测用 localhost 而非 127.0.0.1；CDP `/json/new` 需要 PUT。
- headless Chrome：`C:/Users/tx/.agent-browser/browsers/chrome-*/chrome.exe` + CDP + Node 内置 WebSocket
  可做运行时冒烟验证（agent-browser CLI 的会话不跨调用保持，直连 CDP 更可靠）。
