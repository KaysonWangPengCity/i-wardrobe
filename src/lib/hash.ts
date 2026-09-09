/**
 * 稳定哈希工具 — FNV-1a 32bit → 8 位 hex 字符串
 * 纯 JS 零依赖，输出稳定（相同输入永远得相同 hash）。
 * 在 "衣橱百件 × 365 天" 规模下 2^32 空间碰撞率完全可忽略。
 */

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5 // FNV-1a 32-bit offset basis
  const FNV_PRIME = 0x01000193
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    // UTF-16 code unit 按高低字节分开处理,保证中英文/特殊字符稳定
    hash ^= (code >>> 8) & 0xff
    hash = Math.imul(hash, FNV_PRIME)
    hash ^= code & 0xff
    hash = Math.imul(hash, FNV_PRIME)
  }
  // >>> 0 强制转成 unsigned 32-bit
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 对象稳定摘要 — 先按 keys 字典序序列化（避免对象 key 顺序变化）再 fnv1a。
 * 支持:字符串/数字/布尔/null/数组/对象(嵌套)；不支持 Date(会变成数字,若需要先格式化字符串)。
 */
export function stableDigest(value: unknown): string {
  return fnv1a(stableStringify(value))
}

function stableStringify(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort()
    const parts = keys.map(k => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k]))
    return '{' + parts.join(',') + '}'
  }
  // undefined/function/symbol 不支持,统一占位(我们的输入不出现这些)
  return '?'
}
