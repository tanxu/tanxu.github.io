import { PACKAGES, runScript } from '../tools/workspace.mjs'

/**
 * 对所有包执行类型检查。
 * 子应用各自使用自己的类型检查器：原生 / React 用 tsc，Vue 用 vue-tsc。
 */

const failed = []

for (const pkg of PACKAGES) {
  console.log(`\n▶ 类型检查 ${pkg.label}（${pkg.dir}）`)
  if (runScript(pkg.dir, 'typecheck') !== 0) failed.push(pkg.dir)
}

console.log('\n▶ 类型检查 packages/contract')
if (runScript('packages/contract', 'typecheck') !== 0) failed.push('packages/contract')

if (failed.length > 0) {
  console.error(`\n❌ 类型检查未通过：${failed.join('、')}`)
  process.exit(1)
}

console.log('\n✅ 全部类型检查通过')
