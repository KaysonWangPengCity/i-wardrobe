// ================== 今日推荐缓存 + 昨日参考 回归测试 (T1-T8) ==================
// 用法: npx tsx tests/outfit-cache.test.mts
// 环境: fake-indexeddb 自注入(替代全局 indexedDB),Dexie 取到的就是 fake DB
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
;(globalThis as any).Dexie = Dexie  // 兼容 Dexie 依赖 globalThis

import { db } from '@/db/database'
import type { Item, StyleProfile, Weather, RankedOutfit } from '@/types'
import {
  buildPk,
  computeInputHash,
  rankedListToCacheEntries,
  cacheRecordToRankedList,
  CacheDegradedError,
  tryReadCache,
  writeCache,
  purgeOldOutfitCache,
  findLatestRecordForDate,
} from '@/services/outfitCacheService'

const today = new Date()
function todayStr(d = today) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function daysAgo(n: number) {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return todayStr(d)
}
let passed = 0, total = 0
async function t(name: string, fn: () => Promise<void>) {
  total++
  const ctx = { ok: true, reason: '' }
  function truthy(v: any, msg = '') { if (!v) { ctx.ok = false; ctx.reason = `应当为 truthy: ${msg},实际 ${String(v)}` } }
  function falsy(v: any, msg = '') { if (v) { ctx.ok = false; ctx.reason = `应当为 falsy: ${msg},实际 ${String(v)}` } }
  function eq(a: any, b: any, msg = '') { if (a !== b) { ctx.ok = false; ctx.reason = `${msg}:${String(a)} !== ${String(b)}` } }
  try {
    await fn({ truthy, falsy, eq } as any)
  } catch (e: any) {
    ctx.ok = false
    ctx.reason = `抛错:${e?.stack ?? String(e)}`
  }
  if (ctx.ok) { passed++; console.log(`✅ PASS ${total}. ${name}`) }
  else { console.log(`❌ FAIL ${total}. ${name}\n   ${ctx.reason}`) }
}

// ---------- 基础造数 ----------
function mkItem(i: number, category: 'Top' | 'Bottom' | 'Outerwear' | 'Shoes', color: string, colorHex: string, subCategory: string): Item {
  const bg = new Blob([`dummy-${i}`], { type: 'text/plain' })
  return {
    id: `item-${i}`,
    category,
    subCategory,
    color,
    colorHex,
    season: ['Spring', 'Autumn'],
    style: ['casual'],
    thickness: 2,
    pattern: 'solid',
    affinityScore: 0,
    wearCount: 0,
    createdAt: Date.now(),
    thumbnailBlob: bg,
    discarded: false,
  } as Item
}
const baseItems: Item[] = [
  mkItem(1, 'Top', '白', '#ffffff', 'T-shirt'),
  mkItem(2, 'Bottom', '黑', '#000000', 'Jeans'),
  mkItem(3, 'Shoes', '棕', '#8B4513', 'Sneakers'),
  mkItem(4, 'Outerwear', '藏蓝', '#1a365d', 'Jacket'),
]
const baseStyle: StyleProfile = {
  id: 'default',
  preferredStyles: ['casual', 'minimal'],
  avoidedColors: [],
  warmthBias: 0.5,
  notes: '',
}
const baseWeather: Weather = {
  location: 'Shenzhen',
  tempHi: 28,
  tempLo: 24,
  condition: 'Sunny',
  icon: '☀️',
}

function mkRanked(items: Item[]): RankedOutfit[] {
  const t = items.find(i => i.category === 'Top') || null
  const b = items.find(i => i.category === 'Bottom') || null
  const o = items.find(i => i.category === 'Outerwear') || null
  const s = items.find(i => i.category === 'Shoes') || null
  const bd = { colorHarmony: 0.8, categoryFit: 0.7, rotationScore: 0.5, affinityScore: 0.6, styleMatch: 0.75 }
  return [
    { candidate: { items: [t, b, o, s], ruleScore: 0.82, breakdown: { ...bd } }, aiIndex: 1, reason: '色彩协调' },
    { candidate: { items: [t, b, null, s], ruleScore: 0.75, breakdown: { ...bd, colorHarmony: 0.7 } }, aiIndex: 2, reason: '舒适' },
    { candidate: { items: [t, b, o, s], ruleScore: 0.70, breakdown: { ...bd, categoryFit: 0.6 } }, aiIndex: 3, reason: '轮换' },
  ]
}

// ---------- 串行执行:每个用例前清 outfitCache 表 ----------
async function clear() { await db.open(); await db.outfitCache.clear() }

await db.open()
console.log(`DB version after open:${db.verno},tables:${db.tables.map(t=>t.name).join(',')}`)

await clear()
await t('T1 HASH-STABLE:相同输入 hash 稳定 8 位 hex', async ({ truthy, eq }) => {
  const h1 = computeInputHash(baseItems, baseStyle, baseWeather)
  const h2 = computeInputHash(baseItems, baseStyle, baseWeather)
  eq(h1, h2, '两次结果相等'); truthy(/^[0-9a-f]{8}$/.test(h1), `hex8 格式:${h1}`)
})

await clear()
await t('T2 HASH-CHANGE:衣橱/风格/天气变 hash 变;同整温度 hash 不变', async ({ truthy, eq }) => {
  const h = computeInputHash(baseItems, baseStyle, baseWeather)
  // 衣橱加衣
  const h2 = computeInputHash([...baseItems, mkItem(9, 'Top', '红', '#ff0000', 'T-shirt')], baseStyle, baseWeather)
  truthy(h !== h2, '衣橱变 hash 变')
  // 风格变
  const h3 = computeInputHash(baseItems, { ...baseStyle, warmthBias: 0.1 }, baseWeather)
  truthy(h !== h3, '风格变 hash 变')
  // 天气真变(温差 2 度)
  const h4 = computeInputHash(baseItems, baseStyle, { ...baseWeather, tempHi: 30 })
  truthy(h !== h4, '天气变 hash 变')
  // 小数位四舍五入到同一整数 -> hash 稳
  const h5 = computeInputHash(baseItems, baseStyle, { ...baseWeather, tempHi: 28.1, tempLo: 24.2 })
  const h6 = computeInputHash(baseItems, baseStyle, { ...baseWeather, tempHi: 28.4, tempLo: 24.4 })
  eq(h5, h6, '同整数温度 hash 稳')
})

await clear()
await t('T3 HIT-RESTORE:写->读->还原字段全等 + entries.itemIds 正确', async ({ truthy, eq }) => {
  const ranked = mkRanked(baseItems)
  const hash = computeInputHash(baseItems, baseStyle, baseWeather)
  const pk = buildPk(todayStr(), 'Shenzhen', hash)
  await writeCache(pk, todayStr(), 'Shenzhen', hash, ranked)
  const rec = await tryReadCache(pk) as any
  truthy(rec, '写入后读到'); eq(rec.pk, pk, 'pk 相同')
  const restored = cacheRecordToRankedList(rec, baseItems)
  eq(restored.length, 3, '3 套')
  const r = restored[0]
  eq(r.aiIndex, ranked[0].aiIndex, 'aiIndex')
  eq(r.reason, ranked[0].reason, 'reason')
  eq(r.candidate.ruleScore, ranked[0].candidate.ruleScore, 'ruleScore')
  eq(r.candidate.breakdown.colorHarmony, ranked[0].candidate.breakdown.colorHarmony, 'colorHarmony')
  // outerwear=null 第 2 套正确保留 null
  eq(restored[1].candidate.items[2], null, '第 2 套 outerwear=null')
  // entries.itemIds 长度=4,第 0,1,3 位存的是 id 字符串
  truthy(rec.outfits[0].itemIds.length === 4, 'entries.itemIds len=4')
})

await clear()
await t('T4 DEGRADE:必填 slot 缺失整套丢弃;全部不足 1 套抛 CacheDegradedError', async ({ truthy }) => {
  const ranked = mkRanked(baseItems)
  // 模拟:3 套中前 2 套 Top/Bottom/Shoes 都能找到,第 3 套 Top=null(故意丢)→ >=1 套所以不抛
  const hash = computeInputHash(baseItems, baseStyle, baseWeather)
  const pk = buildPk(todayStr(), 'Shenzhen', hash)
  // 构造 record:把 entries 里 topId 改了指向不存在,指向 missing-top
  const fakeEntries = rankedListToCacheEntries(ranked).map(e => ({
    ...e,
    itemIds: e.itemIds.map((id, i) => i === 0 ? 'missing-top' : id),  // 每套 Top 都 missing -> 所有 3 套都丢弃
  }))
  await db.outfitCache.put({ pk, date: todayStr(), location: 'Shenzhen', inputHash: hash, outfits: fakeEntries, generatedAt: Date.now() })
  let thrown = false
  try { cacheRecordToRankedList((await db.outfitCache.get(pk))!, baseItems) } catch (e) { thrown = e instanceof CacheDegradedError }
  truthy(thrown, '每套 Top 缺都整套丢弃 -> 抛 CacheDegradedError')
})

await clear()
await t('T5 BYPASS-OVERWRITE:同 pk 覆盖写入 generatedAt 刷新 + outfit 覆盖', async ({ truthy, eq }) => {
  const ranked = mkRanked(baseItems)
  const hash = computeInputHash(baseItems, baseStyle, baseWeather)
  const pk = buildPk(todayStr(), 'Shenzhen', hash)
  await writeCache(pk, todayStr(), 'Shenzhen', hash, ranked)
  const tOld = (await db.outfitCache.get(pk))!.generatedAt
  // 2 套新结果(长度不同方便验证)
  const newRanked = ranked.slice(0, 1)
  await new Promise(r => setTimeout(r, 10))
  await writeCache(pk, todayStr(), 'Shenzhen', hash, newRanked)
  const after = await db.outfitCache.get(pk)
  truthy(after!.generatedAt > tOld, 'generatedAt 刷新')
  eq(after!.outfits.length, 1, '长度覆盖为 1')
})

await clear()
await t('T6 PURGE:purgeOld(3) 只保留 3 天(含今天)', async ({ eq }) => {
  const hash = computeInputHash(baseItems, baseStyle, baseWeather)
  const items = baseItems
  const ranked = mkRanked(items)
  const dates = [0, 1, 2, 3, 4, 5].map(n => daysAgo(n))  // 今天/昨天/前天/3天前/4天前/5天前
  for (const d of dates) {
    await db.outfitCache.put({
      pk: buildPk(d, 'Shenzhen', hash) + '-' + Math.random().toString(36).slice(2, 6),
      date: d, location: 'Shenzhen', inputHash: hash,
      outfits: rankedListToCacheEntries(ranked), generatedAt: Date.now(),
    })
  }
  const before = await db.outfitCache.count()
  eq(before, 6, 'purge 前 6 条')
  const del = await purgeOldOutfitCache(3)
  eq(del, 3, '删 3 条(3/4/5 天前)')
  const left = await db.outfitCache.orderBy('date').primaryKeys()
  eq(left.length, 3, '剩 3 条')
  const todayK = daysAgo(0), yK = daysAgo(1), bK = daysAgo(2)
  truthyCheck(left, todayK); truthyCheck(left, yK); truthyCheck(left, bK)
  function truthyCheck(arr: any[], d: string) { if (!arr.some(k => String(k).startsWith(d))) throw new Error(`保留中缺少日期=${d},left=${arr.join(',')}`) }
  // 另一种:确保保留中最新日期是今天
  eq(left.slice(-1)[0].toString().startsWith(todayK.slice(0, 10)), true, `保留中最新日期为今天=${todayK}`)
})

await clear()
await t('T7 TTL:generatedAt>24h 过期读不到;23h 前读得到;pk 格式正确 + 不同城市隔离', async ({ truthy, eq }) => {
  const ranked = mkRanked(baseItems)
  const hash = computeInputHash(baseItems, baseStyle, baseWeather)
  const pk = buildPk(todayStr(), 'Shenzhen', hash)
  truthy(pk.startsWith(`${todayStr()}-Shenzhen-`), `pk 前缀=日期-位置-hash,实际 ${pk}`)
  truthy(pk.endsWith(hash), `pk 尾=hash,尾 ${pk.slice(-8)} vs ${hash}`)

  await writeCache(pk, todayStr(), 'Shenzhen', hash, ranked)
  await db.outfitCache.update(pk, { generatedAt: Date.now() - 25 * 3600_000 })
  truthy(!await tryReadCache(pk), '25h 前应过期')
  await db.outfitCache.update(pk, { generatedAt: Date.now() - 23 * 3600_000 })
  truthy(await tryReadCache(pk), '23h 前应命中')
  const pk2 = buildPk(todayStr(), 'Beijing', hash)
  truthy(pk !== pk2, `不同城市 pk 应不同:${pk} vs ${pk2}`)
})

await clear()
await t('T8 YESTERDAY-LOOKUP:昨日参考宽松查询 findLatestRecordForDate(date,location) — 不校验 TTL 不校验 hash', async ({ truthy, eq }) => {
  const ranked = mkRanked(baseItems)
  // 昨日记录用「故意错的 hash」模拟衣橱今天加了衣服 hash 变了的场景
  const yesterday = daysAgo(1)
  const wrongHash = '00000000'
  const pk = buildPk(yesterday, 'Shenzhen', wrongHash)
  const veryOld = Date.now() - 48 * 3600_000  // 超 TTL 2 天
  await db.outfitCache.put({ pk, date: yesterday, location: 'Shenzhen', inputHash: wrongHash, outfits: rankedListToCacheEntries(ranked), generatedAt: veryOld })
  const got = await findLatestRecordForDate(yesterday, 'Shenzhen')
  truthy(got, '宽松查询应命中,不校验 TTL/hash')
  eq(got!.pk, pk, '命中 pk')
  // location 错城市 -> null
  const got2 = await findLatestRecordForDate(yesterday, 'Beijing')
  truthy(!got2, '错误 location -> null')
  // date = 今天 -> 没数据 -> null
  const got3 = await findLatestRecordForDate(todayStr(), 'Shenzhen')
  truthy(!got3, '今天无记录 -> null')
  // 同一日期同城市多条,取最新 generatedAt
  const hashA = 'aaaaaaaa', hashB = 'bbbbbbbb'
  const tOld = Date.now() - 10 * 3600_000
  const tNew = Date.now() - 1 * 3600_000
  await db.outfitCache.bulkPut([
    { pk: `${yesterday}-Shenzhen-old-hashA`, date: yesterday, location: 'Shenzhen', inputHash: hashA, outfits: rankedListToCacheEntries(ranked.slice(0, 1)), generatedAt: tOld },
    { pk: `${yesterday}-Shenzhen-new-hashB`, date: yesterday, location: 'Shenzhen', inputHash: hashB, outfits: rankedListToCacheEntries(ranked), generatedAt: tNew },
  ])
  const got4 = await findLatestRecordForDate(yesterday, 'Shenzhen')
  eq(got4!.generatedAt, tNew, '同日同城市多条,取 generatedAt 最新')
  eq(got4!.outfits.length, 3, '最新那条 3 套')
})

// ========== 最终汇总 ==========
console.log(`\n📊 ${passed}/${total} 通过`)
process.exit(passed === total ? 0 : 1)
