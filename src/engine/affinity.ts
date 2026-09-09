import type { Item, Feedback } from '@/types'

/**
 * 更新 affinityScore + 指数衰减
 */
export function computeAffinityDelta(feedback: Feedback, worn: boolean): number {
  let delta = 0
  if (worn) delta += 1
  switch (feedback) {
    case 'liked': delta += 2; break
    case 'disliked': delta -= 2; break
    default: break
  }
  return delta
}

export function applyAffinityUpdate(items: Item[], deltaPerItem: number): Item[] {
  return items.map((it) => {
    let s = it.affinityScore + deltaPerItem
    // 指数衰减
    s *= 0.98
    // 限制范围
    s = Math.max(-10, Math.min(10, s))
    return { ...it, affinityScore: s }
  })
}
