import { createReadStream, statSync } from 'node:fs'
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

/**
 * 开发期把 dist/apps 挂到 /apps/ 路径下。
 *
 * 为什么需要它：Shell 的加载器要求子应用以「构建产物 + manifest.json」的形态存在，
 * 这样开发期与线上行为完全一致。子应用源码由各自的 `vite build --watch` 负责重建，
 * 这里只负责把重建结果以正确的 MIME 类型吐出来。
 */
function serveBuiltApps(): Plugin {
  return {
    name: 'mfe-serve-built-apps',
    apply: 'serve',
    configureServer(server) {
      const distApps = resolve(server.config.root, '../dist/apps')

      server.middlewares.use((req, res, next) => {
        const url = req.url
        if (!url || !url.startsWith('/apps/')) return next()

        const pathname = decodeURIComponent(url.split('?')[0])
        const filePath = normalize(join(distApps, pathname.replace(/^\/apps\//, '')))

        // 防目录穿越
        if (!filePath.startsWith(distApps)) return next()

        try {
          if (!statSync(filePath).isFile()) return next()
        } catch {
          return next()
        }

        res.setHeader('Content-Type', MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream')
        // 与线上 CDN 行为保持一致：入口每次重新校验
        res.setHeader('Cache-Control', 'no-store')
        createReadStream(filePath).pipe(res)
      })
    }
  }
}

export default defineConfig({
  // 相对基路径：项目页（/<repo>/）与用户页（/）都能开箱即用，无需注入环境变量。
  // 页面始终是同一个 HTML 文档（hash 路由），相对路径解析永远成立。
  base: './',

  plugins: [serveBuiltApps()],

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
