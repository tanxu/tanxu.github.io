# 项目长期笔记：微前端模板

## 技术决策（已定，勿轻易改动）
- 集成方式：**Shell + 原生 ESM 契约**，子应用各自构建为自包含 ESM 包，Shell 动态 `import()` 加载。
  不用 Module Federation（三个异构栈无可共享运行时依赖）、不用 qiankun（不提供状态隔离价值）、不用 iframe（UI 融合差）。
- 隔离：Shadow DOM（DOM/样式）+ ESM 模块作用域（JS）。**不做 Proxy 沙箱**，靠契约约束。
- 路由：hash（`#/<appId>/<subPath>`），规避 GitHub Pages 无服务端路由。
- 站点根在运行时由 `new URL('./', location.href)` 推导，`base` 一律用相对路径 `'./'`，
  因此项目页 `/<repo>/` 与用户页 `/` 都无需任何环境变量。

## 关键约定
- `@mfe/contract` 是**纯类型包**，只能 `import type`，禁止出现运行时值。
- 子应用之间**不共享 store、不互相 import**，跨应用数据只走 `ctx.bus` CustomEvent。
- `unmount()` 只清理副作用（定时器 / 总线订阅 / 框架实例 / 宿主节点），**不重置业务状态**。
- 子应用 `mount()` 每次新建容器节点，`unmount()` 整体移除 —— 避免 `createRoot` 对同一容器调用两次。
- 新增子应用需改两处：`tools/workspace.mjs` 的 `PACKAGES`、`shell/src/registry.ts` 的 `APPS`。

## 产物约定（GitHub Pages CDN 缓存不可失效）
- 子应用入口固定名 `index.js`，内部资源带 content hash；
- 每个子应用构建产物含 `manifest.json`（entry / style / hash / builtAt），由 `tools/mfe-manifest.ts` 生成；
- Shell 运行时先拉 `manifest.json?t=<时间戳>`，再 `import(index.js?v=<hash>)`。

## 部署约定（GitHub Pages）
- 仓库 **Settings → Pages → Source 必须选 "GitHub Actions"**。若保持默认的 "Deploy from a branch"，
  GitHub 会同时跑内置的 `pages build and deployment`（Jekyll）把仓库根目录当站点构建 ——
  根目录只有 README.md 时，域名首页就渲染成 README，本模板的 dist/ 永不生效（两个流程并存互相覆盖）。
- workflow 已加 `enablement: true`（Pages 未启用时自动以 Actions 模式开启），
  但它**不会**把已有的 branch 来源改成 Actions，来源切换只能手动做一次。
- 切换来源后不会自动重新部署，需 Actions → Run workflow 重跑。
- 判据：修复后线上首页 HTML 应含 `id="mfe-stage"`；仓库 Actions 列表不应再出现 `pages build and deployment`。

## 环境事实
- 用户本机只有 **npm**（无 pnpm）。脚本通过 `npm_config_user_agent` 自动探测包管理器，两种都兼容。
- 本机 PowerShell 工具的 stdout 不返回，需要把输出写文件再用 Read 读。
- **Bash 工具（Git Bash）可用**：git / curl / node / heredoc 均正常。涉及 git 状态、HTTP 探测、JSON 接口
  查验时优先用 Bash，比 PowerShell 重定向到文件再读更省事。
- 未安装 `gh` CLI；查 GitHub 仓库/Actions 状态用 `curl https://api.github.com/...`（公开仓库免认证）。
