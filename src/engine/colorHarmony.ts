// 色彩兼容表:颜色名 → 兼容色列表 + 黑白灰百搭
// 简化版,够用即可
import type { Item } from '@/types'

// 互补色对(近似)
const COMPLEMENTARY_PAIRS: [string, string][] = [
  ['red', 'green'],
  ['orange', 'blue'],
  ['yellow', 'purple'],
  ['red', 'teal'],
  ['orange', 'navy-blue'],
  ['yellow', 'violet'],
]

// 邻近色对(同色相附近,和谐)
const ANALOGOUS_PAIRS: [string, string][] = [
  ['red', 'orange'], ['red', 'pink'], ['orange', 'yellow'], ['yellow', 'lime'],
  ['green', 'lime'], ['green', 'teal'], ['teal', 'blue'], ['blue', 'navy-blue'],
  ['blue', 'purple'], ['purple', 'violet'], ['violet', 'pink'], ['pink', 'red'],
]

const NEUTRALS = new Set(['black', 'white', 'gray', 'grey', 'beige', 'khaki', 'nude', 'brown', 'navy-blue', 'charcoal', 'cream'])

// 判断两个颜色是否兼容,输出 0-1
export function colorHarmony(colorA: string, colorB: string): number {
  const a = normalizeColor(colorA)
  const b = normalizeColor(colorB)
  if (!a || !b) return 0.5
  if (a === b) return 0.9 // 同色也算和谐(全身同色也 OK)
  if (NEUTRALS.has(a) || NEUTRALS.has(b)) return 0.95 // 黑白灰百搭

  // 互补色
  if (isPair(a, b, COMPLEMENTARY_PAIRS)) return 0.85
  // 邻近色
  if (isPair(a, b, ANALOGOUS_PAIRS)) return 0.9

  return 0.55 // 其他情况中等分,不会太低
}

function isPair(a: string, b: string, pairs: [string, string][]): boolean {
  return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

function normalizeColor(c: string): string {
  const s = c.toLowerCase().trim()
  // 常见别名归一化
  const map: Record<string, string> = {
    'navy': 'navy-blue',
    'navy blue': 'navy-blue',
    'grey': 'gray',
    'light blue': 'blue',
    'dark blue': 'navy-blue',
    'olive': 'green',
    'burgundy': 'red',
    'maroon': 'red',
    'coral': 'orange',
    'salmon': 'pink',
    'denim': 'blue',
    'indigo': 'purple',
  }
  return map[s] ?? s
}

export function avgColorHarmony(items: (Item | null)[]): number {
  const colors = items.filter((it): it is Item => !!it && it.category !== 'Shoes').map((it) => it.color)
  if (colors.length < 2) return 0.9
  let sum = 0
  let count = 0
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      sum += colorHarmony(colors[i], colors[j])
      count++
    }
  }
  return sum / count
}
