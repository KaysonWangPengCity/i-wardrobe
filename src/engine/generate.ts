import type { Item, OutfitCandidate, StyleProfile, WearLogEntry, Weather } from '@/types'
import { avgColorHarmony } from './colorHarmony'

interface GenerateOptions {
  count?: number
  minDaysBeforeWear?: number // 默认 3
  currentDate?: Date
}

function daysSince(ts: number | undefined, now: number): number {
  if (!ts) return 999
  return Math.floor((now - ts) / (1000 * 60 * 60 * 24))
}

function rotationScore(items: (Item | null)[], now: number, minDays: number): number {
  let sum = 0
  let n = 0
  for (const it of items) {
    if (!it) continue
    const d = daysSince(it.lastWornAt, now)
    if (d < minDays) {
      sum += 0 // 近期穿过 0 分
    } else if (d === 999) {
      sum += 0.5 // 新物品
    } else {
      sum += Math.min(1, (d - minDays) / 14) // 14 天后满分
    }
    n++
  }
  return n > 0 ? sum / n : 0.5
}

function categoryFit(items: (Item | null)[]): number {
  // 上-下 / 上-外套 / 下-鞋 品类配对
  const [top, bottom, outer, shoes] = items
  let score = 0.5
  let n = 0

  if (top && bottom) {
    score += topBottomFit(top.subCategory, bottom.subCategory)
    n++
  }
  if (top && outer) {
    score += topOuterFit(top.subCategory, outer.subCategory)
    n++
  }
  if (bottom && shoes) {
    score += bottomShoesFit(bottom.subCategory, shoes.subCategory)
    n++
  }

  return n > 0 ? score / n : 0.6
}

function topBottomFit(top: string, bottom: string): number {
  const formal = ['衬衫', '西装', '毛衣']
  const formalBottom = ['西裤', '半身裙']
  const casual = ['T恤', '卫衣', 'polo']
  const casualBottom = ['牛仔裤', '短裤', '运动裤']

  const topF = formal.some((f) => top.includes(f))
  const topC = casual.some((c) => top.toLowerCase().includes(c.toLowerCase()))
  const botF = formalBottom.some((f) => bottom.includes(f))
  const botC = casualBottom.some((c) => bottom.includes(c))

  if ((topF && botF) || (topC && botC)) return 0.9
  if (topF && botC) return 0.55
  if (topC && botF) return 0.55
  return 0.6
}

function topOuterFit(top: string, outer: string): number {
  const light = ['T恤', '衬衫']
  const heavy = ['毛衣', '卫衣']
  const outerHeavy = ['大衣', '羽绒服', '棉服']

  const topH = heavy.some((h) => top.includes(h))
  const outH = outerHeavy.some((h) => outer.includes(h))

  if (topH && outH) return 0.5 // 太臃肿
  if (!topH && outH) return 0.85 // 薄内搭 + 厚外套 OK
  return 0.75
}

function bottomShoesFit(bottom: string, shoes: string): number {
  const formalShoes = ['皮鞋', '乐福鞋']
  const casualShoes = ['运动鞋', '帆布鞋', '拖鞋']
  const botF = ['西裤', '半身裙'].some((f) => bottom.includes(f))
  const shoeF = formalShoes.some((f) => shoes.includes(f))
  const shoeC = casualShoes.some((c) => shoes.includes(c))

  if (botF && shoeF) return 0.95
  if (botF && shoeC) return 0.4
  return 0.8
}

function affinityScore(items: (Item | null)[]): number {
  const vals = items.filter((it): it is Item => !!it).map((it) => it.affinityScore)
  if (vals.length === 0) return 0.5
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  // 归一化 -10~+10 → 0~1
  return Math.max(0, Math.min(1, (avg + 10) / 20))
}

function styleMatch(items: (Item | null)[], profile: StyleProfile): number {
  if (profile.preferredStyles.length === 0) return 0.6
  const its = items.filter((it): it is Item => !!it)
  if (its.length === 0) return 0.6
  let sum = 0
  for (const it of its) {
    const hit = it.style.some((s) => profile.preferredStyles.includes(s))
    sum += hit ? 1 : 0.5
  }
  return sum / its.length
}

export function generateCandidates(
  filtered: { top: Item[]; bottom: Item[]; outerwear: Item[]; shoes: Item[] },
  wearLog: WearLogEntry[],
  styleProfile: StyleProfile,
  weather: Weather,
  options: GenerateOptions = {},
): OutfitCandidate[] {
  const count = options.count ?? 20
  const minDays = options.minDaysBeforeWear ?? 3
  const now = (options.currentDate ?? new Date()).getTime()

  // 必选桶不能为空
  if (filtered.top.length === 0 || filtered.bottom.length === 0 || filtered.shoes.length === 0) {
    return []
  }

  const needOuterwear = filtered.outerwear.length > 0 // auto: 天气不需时已清空
  const outerwearOpts: (Item | null)[] = needOuterwear
    ? [...filtered.outerwear, null] // 有外套可选,也可跳过
    : [null]

  // 笛卡尔积
  const candidates: OutfitCandidate[] = []
  for (const top of filtered.top) {
    for (const bottom of filtered.bottom) {
      for (const shoes of filtered.shoes) {
        for (const outer of outerwearOpts) {
          const items: (Item | null)[] = [top, bottom, outer, shoes]

          // 硬约束:无外套时也要能出完整搭配,但跳过 null 外套与内搭重复逻辑已处理
          const color = avgColorHarmony(items)
          const catFit = categoryFit(items)
          const rot = rotationScore(items, now, minDays)
          const aff = affinityScore(items)
          const style = styleMatch(items, styleProfile)

          const score = color * 0.35 + catFit * 0.25 + rot * 0.2 + aff * 0.1 + style * 0.1

          candidates.push({
            items,
            ruleScore: score,
            breakdown: {
              colorHarmony: color,
              categoryFit: catFit,
              rotationScore: rot,
              affinityScore: aff,
              styleMatch: style,
            },
          })
        }
      }
    }
  }

  // 排序取 Top N
  candidates.sort((a, b) => b.ruleScore - a.ruleScore)
  return candidates.slice(0, count)
}
