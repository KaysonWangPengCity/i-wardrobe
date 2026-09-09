import type { Item, Season, Weather } from '@/types'

// 温度 → 适合厚度上限(thickness 1-5)
function thicknessUpperBound(tempLo: number, tempHi: number): number {
  const avg = (tempLo + tempHi) / 2
  if (avg >= 28) return 1
  if (avg >= 22) return 2
  if (avg >= 16) return 3
  if (avg >= 8) return 4
  return 5
}

function currentSeason(date = new Date()): Season {
  const m = date.getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

function seasonInOrAdjacent(itemSeasons: Season[], now: Season): boolean {
  if (itemSeasons.includes(now)) return true
  const order: Season[] = ['spring', 'summer', 'autumn', 'winter']
  const idx = order.indexOf(now)
  const prev = order[(idx + 3) % 4]
  const next = order[(idx + 1) % 4]
  return itemSeasons.includes(prev) || itemSeasons.includes(next)
}

export interface FilteredItems {
  top: Item[]
  bottom: Item[]
  outerwear: Item[]
  shoes: Item[]
}

export interface FilterOptions {
  requireOuterwear?: boolean | null // true=必须有外套,false=必须无,null=自动按天气
  currentDate?: Date
}

export function shouldHaveOuterwear(weather: Weather): boolean {
  // 日均温度低于 15°C 时建议穿外套
  const avg = (weather.tempHi + weather.tempLo) / 2
  return avg < 15
}

export function filterByWeather(
  items: Item[],
  weather: Weather,
  opts: FilterOptions = {},
): FilteredItems {
  const upper = thicknessUpperBound(weather.tempLo, weather.tempHi)
  const season = currentSeason(opts.currentDate)

  const base = items.filter((it) => {
    if (it.discarded) return false
    if (!seasonInOrAdjacent(it.season, season)) return false
    if (it.thickness > upper + 1) return false // 允许 +1 冗余(微热时可穿稍厚)
    return true
  })

  const result: FilteredItems = {
    top: base.filter((it) => it.category === 'Top'),
    bottom: base.filter((it) => it.category === 'Bottom'),
    outerwear: base.filter((it) => it.category === 'Outerwear' && it.thickness <= upper + 1),
    shoes: base.filter((it) => it.category === 'Shoes'),
  }

  // 外套强制
  if (opts.requireOuterwear === true && result.outerwear.length === 0) {
    // 放宽 thickness 限制再试一次
    result.outerwear = items.filter((it) => it.category === 'Outerwear' && !it.discarded && seasonInOrAdjacent(it.season, season))
  }
  if (opts.requireOuterwear === false) {
    result.outerwear = []
  }
  // auto: 按 shouldHaveOuterwear,不需要时清空 outerwear 桶让枚举传 null
  if (opts.requireOuterwear === undefined && !shouldHaveOuterwear(weather)) {
    result.outerwear = []
  }

  return result
}
