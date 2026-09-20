import { existsSync, readFileSync, rmSync } from 'node:fs'
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
 */

rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true })
console.log('已清理 dist/\n')

for (const pkg of PACKAGES) {
  console.log(`▶ 构建 ${pkg.label}（${pkg.dir}）`)
  runScriptOrThrow(pkg.dir, 'build')
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

if (problems.length > 0) {
  console.error('\n❌ 产物校验未通过：')
  for (const problem of problems) console.error(`   - ${problem}`)
  process.exit(1)
}

console.log('\n✅ 构建完成。本地预览：npm run preview   集成开发：npm run dev')
