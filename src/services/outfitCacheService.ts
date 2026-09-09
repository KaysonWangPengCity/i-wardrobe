/**
 * 今日推荐缓存服务 (对应设计方案 1)
 * ----------------------------------
 * 单一职责:构造 pk / 计算 inputHash / 读写 outfitCache 表 / 还原 rankedList / 清理旧缓存
 * Today 页面只通过该服务与缓存层交互,不直接 db.outfitCache 查询。
 */
import { db } from '@/db/database'
import type {
  Item, RankedOutfit, StyleProfile, WeatherSnapshot, OutfitCacheEntry, OutfitCacheRecord,
} from '@/types'
import { fnv1a } from '@/lib/hash'
import { todayStr } from '@/lib/image'

// ---- 常量 ----
const TTL_MS = 24 * 60 * 60 * 1000 // 24h TTL 上限
const DEFAULT_KEEP_DAYS = 3

// ---- 基础工具 ----
export function buildPk(date: string, location: string, inputHash: string): string {
  return `${date}-${encodeURIComponent(location)}-${inputHash}`
}

function daysAgoStr(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return todayStr(d)
}

// ---- Hash ----
/**
 * 按 spec §3.3 计算三段式 inputHash:
 *   itemsDigest :: id 排序后 `${id}:${colorHex}:${season}:${style}:${thickness}:${pattern}`
 *   styleDigest :: preferredStyles|avoidedColors|warmthBias
 *   weatherDigest :: round(tempHi)|round(tempLo)|condition
 * 三段 join('||') -> FNV-1a -> hex8
 * 故意**不包含 wearLog 和 location**(见设计决策)
 */
export function computeInputHash(
  activeItems: Item[],
  style: StyleProfile,
  weather: Pick<WeatherSnapshot, 'tempHi' | 'tempLo' | 'condition'>,
): string {
  // 段 1
  const sorted = [...activeItems].sort((a, b) => a.id.localeCompare(b.id))
  const itemsLine = sorted.map(
    (it) =>
      `${it.id}:${it.colorHex}:${it.season.join(',')}:${it.style.join(',')}:${it.thickness}:${it.pattern}`,
  ).join('::')

  // 段 2
  const styles = [...style.preferredStyles].sort().join(',')
  const avoided = [...style.avoidedColors].sort().join(',')
  const styleLine = `${styles}|${avoided}|${style.warmthBias.toFixed(3)}`

  // 段 3
  const weatherLine = `${Math.round(weather.tempHi)}|${Math.round(weather.tempLo)}|${weather.condition}`

  return fnv1a([itemsLine, styleLine, weatherLine].join('||'))
}

// ---- 序列化 ranked -> cache entries ----
export function rankedListToCacheEntries(ranked: RankedOutfit[]): OutfitCacheEntry[] {
  return ranked.map((r) => ({
    itemIds: r.candidate.items.map((it) => (it ? it.id : null)),
    ruleScore: r.candidate.ruleScore,
    breakdown: { ...r.candidate.breakdown },
    aiIndex: r.aiIndex,
    reason: r.reason,
  }))
}

// ---- 还原 cache record -> ranked ----
export class CacheDegradedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CacheDegradedError'
  }
}

export function cacheRecordToRankedList(
  record: OutfitCacheRecord,
  activeItems: Item[],
): RankedOutfit[] {
  const byId = new Map(activeItems.map((it) => [it.id, it]))
  const result: RankedOutfit[] = []
  for (const entry of record.outfits) {
    const items: (Item | null)[] = entry.itemIds.map((id) => {
      if (id === null) return null
      return byId.get(id) ?? null
    })
    // slot 0/1/3 (top/bottom/shoes) 必填缺失则整套丢弃;slot 2 (outerwear) 可为 null
    const requiredMissing = [0, 1, 3].some((idx) => items[idx] === null && entry.itemIds[idx] !== null)
    if (requiredMissing) continue
    result.push({
      candidate: {
        items,
        ruleScore: entry.ruleScore,
        breakdown: { ...entry.breakdown },
      },
      aiIndex: entry.aiIndex,
      reason: entry.reason,
    })
  }
  if (result.length < 1) {
    throw new CacheDegradedError(
      `缓存还原后不足 1 套(原值 ${record.outfits.length} 套,均因衣服被删/丢弃而无效)`,
    )
  }
  return result
}

// ---- 读缓存 ----
/**
 * 尝试命中缓存:
 *  - 记录不存在 -> null
 *  - 存在但超过 24h TTL -> 返回 null (视为过期)
 *  - 否则返回 record
 */
export async function tryReadCache(pk: string): Promise<OutfitCacheRecord | null> {
  const rec = await db.outfitCache.get(pk)
  if (!rec) return null
  if (Date.now() - rec.generatedAt > TTL_MS) return null
  return rec
}

// ---- 写缓存 ----
/**
 * 把 AI 刚算好的 rankedList 写入缓存 (put 覆盖同 pk 旧记录)。
 * 写完后后台跑一次清理。调用方应 try/catch,缓存写入失败不阻塞 UI。
 */
export async function writeCache(
  pk: string,
  date: string,
  location: string,
  inputHash: string,
  ranked: RankedOutfit[],
): Promise<void> {
  const record: OutfitCacheRecord = {
    pk,
    date,
    location,
    inputHash,
    outfits: rankedListToCacheEntries(ranked),
    generatedAt: Date.now(),
  }
  await db.outfitCache.put(record)
  // 后台清理旧缓存,不 await 不阻塞
  void purgeOldOutfitCache(DEFAULT_KEEP_DAYS).catch(() => {})
}

// ---- 清理 ----
/** 清理 N 天以前的缓存,返回删除条数。
 *  keepDays=3 → 保留今天、昨天、前天共 3 天,其余全部删除。
 */
export async function purgeOldOutfitCache(keepDays = DEFAULT_KEEP_DAYS): Promise<number> {
  const daysAgo = Math.max(0, keepDays - 1) // 含今天,所以往前推 keepDays-1 天
  const cutoff = daysAgoStr(daysAgo)        // date >= cutoff 保留,date < cutoff 删除
  return db.outfitCache.where('date').below(cutoff).delete()
}

// ---- 调试辅助 ----
/** 给今日页 HIT/MISS/BYPASS 日志用,不要直接改状态 */
export const OUTFIT_CACHE_TTL_MS = TTL_MS

// ---- 宽松查询(昨日参考专用) ----
/**
 * 按 date + location 找最新一条 outfitCache 记录。
 * 不校验 TTL、不校验 inputHash（因为是展示"昨天我穿了什么"的参考，衣橱/天气 hash 变了也要能看到）。
 * 一天最多也就 1~2 条缓存,不做索引优化。
 */
export async function findLatestRecordForDate(
  date: string,
  location: string,
): Promise<OutfitCacheRecord | null> {
  const list = await db.outfitCache.where('date').equals(date).toArray()
  const match = list
    .filter((r) => r.location === location)
    .sort((a, b) => b.generatedAt - a.generatedAt)
  return match[0] ?? null
}
