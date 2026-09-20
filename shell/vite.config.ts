import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

/** 以正确的 MIME 类型吐出一个文件；不是文件（含目录、越界、不存在）就交给下一个中间件 */
function sendFile(
  res: import('node:http').ServerResponse,
  next: () => void,
  rootDir: string,
  relativePath: string
): void {
  const rel = relativePath === '' ? 'index.html' : relativePath
  const filePath = normalize(join(rootDir, rel))

  // 防目录穿越
  if (!filePath.startsWith(rootDir)) return next()

  try {
    if (!statSync(filePath).isFile()) return next()
  } catch {
    return next()
  }

  res.setHeader('Content-Type', MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream')
  // 与线上 CDN 行为保持一致：入口每次重新校验
  res.setHeader('Cache-Control', 'no-store')
  createReadStream(filePath).pipe(res)
}

/**
 * 开发期把两类静态资源挂到与线上完全一致的路径下。
 *
 * 1. `/apps/<id>/...`  → `dist/apps/<id>/...`
 *    子应用源码由各自的 `vite build --watch` 负责重建，这里只负责把重建结果吐出来。
 *    这样开发期与线上行为一致：加载器永远面对「构建产物 + manifest.json」。
 *
 * 2. `/<site>/...`     → `sites/<site>/...`
 *    `sites/` 下的独立静态子站在线上位于 `dist/<site>/`，即 `/<站点根>/<site>/`。
 *    这里按目录名动态匹配，所以新增一个子站只要建目录，不用改这个文件。
 */
function serveStaticTrees(): Plugin {
  return {
    name: 'mfe-serve-static-trees',
    apply: 'serve',
    configureServer(server) {
      const distApps = resolve(server.config.root, '../dist/apps')
      const sitesRoot = resolve(server.config.root, '../sites')

      server.middlewares.use((req, res, next) => {
        const url = req.url
        if (!url) return next()

        const pathname = decodeURIComponent(url.split('?')[0] ?? '/')

        if (pathname.startsWith('/apps/')) {
          return sendFile(res, next, distApps, pathname.slice('/apps/'.length))
        }

        // 只匹配真实存在于 sites/ 下的一级目录，其余请求（/@vite、/src、/index.html 等）直接放行
        const site = pathname.split('/')[1]
        if (site) {
          const siteDir = resolve(sitesRoot, site)
          if (siteDir.startsWith(sitesRoot) && existsSync(siteDir)) {
            return sendFile(res, next, siteDir, pathname.slice(site.length + 2))
          }
        }

        next()
      })
    }
  }
}

export default defineConfig({
  // 相对基路径：项目页（/<repo>/）与用户页（/）都能开箱即用，无需注入环境变量。
  // 页面始终是同一个 HTML 文档（hash 路由），相对路径解析永远成立。
  base: './',

  plugins: [serveStaticTrees()],

  build: {
    // 输出到仓库根的 dist/，与各子应用的 dist/apps/<name>/ 合并为同一份部署产物
    // 注意：shell/ 只有一层深度，所以是 '../dist'（子应用在 apps/<name>/ 下，需要 '../../dist'）
    outDir: '../dist',
    // 绝不清理：dist/ 下还有各子应用的产物，清理由 scripts/build.mjs 统一负责
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },

  server: {
    port: 5173,
    strictPort: true
  },

  preview: {
    port: 4173,
    strictPort: true
  }
})
