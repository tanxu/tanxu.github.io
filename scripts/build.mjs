import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { APP_PACKAGES, PACKAGES, ROOT, appIdOf, runScriptOrThrow } from '../tools/workspace.mjs'

/**
 * 完整构建：Shell 与三个子应用各自独立构建，产物合并到同一个 dist/。
 *
 * 目录约定：
 *   dist/index.html                Shell
 *   dist/assets/*                  Shell 静态资源
 *   dist/apps/<id>/index.js        子应用入口（固定名，配合 manifest 的 hash 击穿 CDN 缓存）
 *   dist/apps/<id>/assets/*        子应用内部资源（带 content hash，可长期缓存）
 *   dist/apps/<id>/manifest.json   子应用产物清单，Shell 运行时读取
 *   dist/<site>/                   独立静态子站，由 sites/<site>/ 原样复制而来
 */

rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true })
console.log('已清理 dist/\n')

for (const pkg of PACKAGES) {
  console.log(`▶ 构建 ${pkg.label}（${pkg.dir}）`)
  runScriptOrThrow(pkg.dir, 'build')
  console.log('')
}

/* ---------------- 独立静态子站 ---------------- */
//
// sites/<name>/ 整目录原样复制到 dist/<name>/，因此在线上位于 <站点根>/<name>/。
// 这类站点不参与微前端装载流程、不需要构建，所以这里只做「复制 + 校验入口」两件事。

/**
 * 递归复制目录。
 *
 * 不用 `fs.cpSync`：本机 Node 22.22.2（Windows）在调用它时会直接原生崩溃
 * （退出码 0xC0000409 / -1073740791），连 JS 异常都抛不出来。
 * 手写的 readdir + copyFile 组合稳定且行为可预测。
 */
function copyDir(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = resolve(from, entry.name)
    const dst = resolve(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dst)
    else if (entry.isFile()) copyFileSync(src, dst)
  }
}

const sitesDir = resolve(ROOT, 'sites')
const siteNames = existsSync(sitesDir)
  ? readdirSync(sitesDir).filter((name) => {
      try {
        return statSync(resolve(sitesDir, name)).isDirectory()
      } catch {
        return false
      }
    })
  : []

if (siteNames.length > 0) {
  console.log('▶ 复制独立静态子站')
  for (const name of siteNames) {
    copyDir(resolve(sitesDir, name), resolve(ROOT, 'dist', name))
    console.log(`  → dist/${name}/`)
  }
  console.log('')
}

/* ---------------- 产物校验 ---------------- */

console.log('── 产物校验 ──')
const problems = []

if (existsSync(resolve(ROOT, 'dist/index.html'))) {
  console.log('  ✓ shell        dist/index.html')
} else {
  problems.push('缺少 dist/index.html（Shell 未正确输出）')
}

for (const pkg of APP_PACKAGES) {
  const id = appIdOf(pkg.dir)
  const manifestPath = resolve(ROOT, 'dist/apps', id, 'manifest.json')

  if (!existsSync(manifestPath)) {
    problems.push(`缺少 dist/apps/${id}/manifest.json`)
    console.log(`  ✗ ${id}`)
    continue
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entryPath = resolve(ROOT, 'dist/apps', id, manifest.entry)
  const entryExists = existsSync(entryPath)

  const marks = [entryExists ? '✓' : '✗']
  if (manifest.style) marks.push('css')
  console.log(`  ${marks.join(' ')} ${id.padEnd(12)} entry=${manifest.entry} hash=${manifest.hash}`)

  if (!entryExists) problems.push(`${id} 的入口文件不存在：${manifest.entry}`)
}

for (const name of siteNames) {
  if (existsSync(resolve(ROOT, 'dist', name, 'index.html'))) {
    console.log(`  ✓ site         dist/${name}/index.html`)
  } else {
    problems.push(`独立子站 ${name} 缺少 index.html（目录名为 ${name}，但入口文件不存在）`)
  }
}

if (problems.length > 0) {
  console.error('\n❌ 产物校验未通过：')
  for (const problem of problems) console.error(`   - ${problem}`)
  process.exit(1)
}

console.log('\n✅ 构建完成。本地预览：pnpm run preview   集成开发：pnpm run dev')
