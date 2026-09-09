# 今日推荐缓存优化 v1 — 设计规格

- **版本**: 1.0
- **日期**: 2026-08-31
- **状态**: 设计稿待复审
- **关联**: 根 spec `2026-08-30-wardrobe-outfit-app-design.md`；前置 `2026-08-31-manual-item-entry-design.md`
- **前端工程师实现预估**: 新增 ~350 行，改 7 个文件（2 新增、5 改造）；单测/手测共 1-2 小时

---

## 1. 问题背景与目标

### 1.1 现状问题
每次进入「今日」页（SPA 切 Tab 切换 / 刷新浏览器 / 关应用重开），`TodayPage` 的 `useEffect([])` 都会完整重跑 `runPipeline()`，全链路中：
- 天气查询：已有 12h IndexedDB 缓存，可忽略
- 衣橱/穿着记录查询 / 筛选 / 20 套候选生成：本地 CPU，< 80ms，可忽略
- **`rankOutfits` → LLM call**：数秒延迟 + Token 费用 + 偶发解析失败，**但完全无缓存**，是唯一真正昂贵的环节

### 1.2 目标（用户确认的粒度 A）
> **同一天 + 输入不变 → 全天最多打 1 次 AI**

输入不变的定义：衣橱内容（active items）、风格偏好、天气摘要三者完全一致；任一变化 → 缓存失效，跑新 AI。
配合一个**手动「🔄 今日重新生成」**按钮可随时绕过缓存。

### 1.3 验收成功判据（K1-K7）
| K | 验证场景 | 方法 | 期望结果 |
|---|---|---|---|
| K1 | 同一天 + 输入不变：首次进今日 | DevTools Network 过滤 `chat/completions` | **1 条** AI 调用 |
| K2 | 同一天 + 输入不变：SPA 切走再切回今日 | Network + Console | **0 条** AI；Console `[outfitCache] HIT pk=...`；UI 秒开 |
| K3 | 同一天 + 输入不变：刷新浏览器 / 关应用重开 | 同 K2 | 同 K2（缓存持久化到 IndexedDB） |
| K4 | swap「🔄 换一套」浏览完 3 套 | Network + UI | **0 条** AI；弹 confirm「要重新生成吗？」，只有确认才打 AI |
| K5 | 点「🔄 今日重新生成」按钮 | Network + Console | 强制走 MISS、打 1 条 AI，新缓存覆盖旧的，Console `[outfitCache] BYPASS` |
| K6 | 去 Capture 新加一件衣服 → 回今日 | Network | hash 变 → MISS → 正确打新 AI（不能拿旧缓存推荐旧衣橱组合） |
| K7 | 跨天（系统日期变了）首次进今日 | Network + pk | pk 日期不同 → MISS，自动打新 AI；旧缓存后台清理 |

---

## 2. 方案选型（已确认：方案 1）

三方案对比结论见 brainstorming 记录，此处存档：

| 方案 | 说明 | 优点 | 缺点 |
|---|---|---|---|
| **方案 1（选定）** | 新增 IndexedDB `outfitCache` 表，pk = `${date}-${location}-${inputHash}`，仅存 itemIds 和得分，不含 Blob；对齐 weatherCache 模式 | 语义干净；跨刷新/重开全有效；swap 零 AI；代码风格统一 | 需升级 DB v3；需写 hash + 还原函数 |
| 方案 2 | Zustand store 内存缓存 | 代码最少 | 刷新/关应用失效，达不到全天最多 1 次的省钱预期 |
| 方案 3 | 在 `outfits` 表加 `source` 字段混存推荐 | 不新增表 | 严重污染 outfits 语义；下游统计全要加 filter |

---

## 3. 数据模型

### 3.1 新增类型（`src/types/index.ts`）
```ts
/** 今日推荐缓存记录。仅存 itemIds + 分数，绝不存 Blob。 */
export interface OutfitCacheRecord {
  /** 主键: `${YYYY-MM-DD}-${location}-${inputHash}` */
  pk: string
  /** 日期字符串 YYYY-MM-DD，便于按日期范围清理旧缓存 */
  date: string
  /** 城市（冗余在 pk 前缀里已经带了，这里备份便于调试和查询） */
  location: string
  /** 输入摘要哈希；决定命中/未命中 */
  inputHash: string
  /** AI 排序后的 Top N 套穿搭，通常 3 套 */
  outfits: Array<{
    /** [topId, bottomId, outerwearId|null, shoesId]，4 位 */
    itemIds: (string | null)[]
    /** generateCandidates 计算的规则总分 */
    ruleScore: number
    /** 五维子分，用于 UI 上的色彩/品类/轮换 Badge */
    breakdown: {
      colorHarmony: number
      categoryFit: number
      rotationScore: number
      affinityScore: number
      styleMatch: number
    }
    /** AI 排名 1-based（与 aiRanking 字段对齐） */
    aiIndex: number
    /** AI 生成的中文推荐理由一句 */
    reason: string
  }>
  /** 生成时间戳，用于 24h 上限 TTL 校验 */
  generatedAt: number
}
```

### 3.2 DB Schema 升级（version 2 → version 3，`src/db/database.ts`）
```ts
export class WardrobeDB extends Dexie {
  items!: Table<Item, string>
  outfits!: Table<Outfit, string>
  wearLog!: Table<WearLogEntry, string>
  styleProfile!: Table<StyleProfile, string>
  settings!: Table<Settings, string>
  weatherCache!: Table<WeatherCache, string>
  outfitCache!: Table<OutfitCacheRecord, string>  // ✨ 新增

  constructor() {
    super('wardrobe-db')
    // v2 保持不变（删除了 discarded/season/lastWornAt 布尔/undefined 兼容性问题索引）
    this.version(2).stores({
      items: 'id, category, color, createdAt, affinityScore',
      outfits: 'id, date, feedback, worn',
      wearLog: 'id, date, eventType',
      styleProfile: 'id',
      settings: 'id',
      weatherCache: 'date, location, fetchedAt',
    })
    // ✨ v3: 新增 outfitCache 表
    this.version(3).stores({
      items:        'id, category, color, createdAt, affinityScore',  // 不变
      outfits:      'id, date, feedback, worn',                       // 不变
      wearLog:      'id, date, eventType',                            // 不变
      styleProfile: 'id',                                              // 不变
      settings:     'id',                                              // 不变
      weatherCache: 'date, location, fetchedAt',                       // 不变
      outfitCache:  'pk, date, generatedAt',                           // 新增 pk 主键 + date/genAt 用于清理
    })
  }
}
```
> Dexie 处理 version upgrade：用户 DB 为 v2 时打开会自动升级 v3 并创建 outfitCache 表；首次安装用户直接跳到 v3 表结构。

### 3.3 inputHash 算法（`src/lib/hash.ts`，新增）
**哈希函数**：FNV-1a 32bit → 输出 8 位 hex（纯 JS，零依赖，避免装额外库）。  
**哈希输入**（4 段，任意一段变化 → hash 变化 → 不命中）：
```
段 1 · 衣橱摘要 itemsDigest:
  activeItems 按 id 字典序排序后 map:
    `${item.id}:${item.colorHex}:${item.season.join(',')}:${item.style.join(',')}:${item.thickness}:${item.pattern}`
  用 '::' 拼接所有行 → sha...不，直接 FNV-1a 整段字符串
  （为什么不只按 id？因为用户改颜色/季节属性（未来可编辑）也应该触发重算，不推荐旧组合）

段 2 · 风格摘要 styleDigest:
  `${preferredStyles.join(',')}|${avoidedColors.join(',')}|${warmthBias.toFixed(3)}`

段 3 · 天气摘要 weatherDigest:
  `${Math.round(tempHi)}|${Math.round(tempLo)}|${condition}`

完整: hash = FNV-1a( [段1, 段2, 段3].join('||') ).toString(16).padStart(8, '0')
```
主键: `pk = `${todayStr()}-${encodeURIComponent(location)}-${hash}``

> pk 前缀已包含 `location`，因此**同一日期下不同城市的缓存天然隔离**，无需再把 location 放进 inputHash。

**设计决策**：
- ✅ **不把 wearLog 纳入 hash**：用户点「✓ 穿了」不应该立刻让当天所有缓存失效，否则会浪费 API。穿过又出现在推荐里是合理行为——3 套候选本来就可能包含最近穿过但轮换分稍低、AI 仍然排名 Top 的组合。用户真不想看了点「今日重新生成」。
- ✅ **不把 location 纳入 hash**：location 已经在 pk 前缀。
- ✅ **tempHi/tempLo 取整**：同一天气 API 因为小数位变动导致 hash 变是无意义抖动。
- ✅ **FNV-1a 而非 crypto.subtle SHA**：后者异步、复杂、在非 https 环境有时不可用；FNV-1a 一行代码、碰撞率在 "衣橱几百件 × 一年 365 天"规模下完全可以忽略。

---

## 4. 核心流程

### 4.1 今日页面运行新状态机 `runCachedPipeline(forceBypassCache = false)`
```
TodayPage.mount
  └─ useEffect([]) ─▶ runCachedPipeline(false)

步骤（伪代码）：
1. settings / styleProfile? 未初始化跳 /settings
2. w = await generateWeatherCache()      ← 已有逻辑，复用
3. activeItems = (await db.items.toArray()).filter(!discarded)
4. wearLog = await db.wearLog.orderBy('date').reverse().limit(30).toArray()
5. activeItems < 3? 报错 return（已有）
6. hash = computeInputHash(activeItems, styleProfile, w)
   pk = buildPk(todayStr(), settings.location, hash)

7. 如果 forceBypassCache === false:
     record = await db.outfitCache.get(pk)
     if record && Date.now()-record.generatedAt < 24h:
         try ranked = restoreRanked(record, activeItems)   ← 按 itemId 反查重建 RankedOutfit[]
         catch (err) {                                       ← 还原失败(缺 slot 或不足 1 套)视为缓存失效降级
             console.debug('[outfitCache] DEGRADE', err.message)
             record = undefined
         }
         if record:
             console.debug('[outfitCache] HIT', {pk, generatedAt: record.generatedAt, n: ranked.length})
             setUiState(HIT, w, ranked)          ← 右上角显示 "📦 今日推荐(缓存)" badge
             return

8. ──── MISS / BYPASS 分支 ────
   filtered = filterByWeather(activeItems, w)           ← 不变
   candidates = generateCandidates(filtered, wearLog, style, w, {count:20}) ← 不变
   try ranked = await rankOutfits(settings, candidates, w, style, wearLog)
   catch  ranked = 规则分排序回退                          ← 完全不变

   ├─ 成功/回退都写入缓存（回退也写，避免下次再打 AI 还是失败重复）
   │  try await writeCache(pk, todayStr(), settings.location, hash, ranked)
   │  catch console.warn('[outfitCache] 写入失败,不阻塞 UI', err)
   └─ purgeOldOutfitCache(3)   // 后台执行，不 await

9. setUiState(MISS | BYPASS, w, ranked)
   console.debug(forceBypassCache ? '[outfitCache] BYPASS' : '[outfitCache] MISS', {pk})
```

### 4.2 restoreRanked（还原算法）
```
restoreRanked(record, activeItems): RankedOutfit[]
  itemsById = new Map(activeItems.map(i => [i.id, i]))
  ranked = []
  for each o in record.outfits:
    slotItems = o.itemIds.map(id => id ? itemsById.get(id) : null)
    // 关键容错:任何一个非 null slot 查不到 → 整套丢弃
    missingButRequired = slotItems.some((it, idx) => idx !== 2 && it === null)
    if missingButRequired: continue
    // outerwear slot 为 null 是正常的（不需要外套）
    candidate = { items: slotItems, ruleScore: o.ruleScore, breakdown: o.breakdown }
    ranked.push({ candidate, aiIndex: o.aiIndex, reason: o.reason })
  if ranked.length < 1:
    throw new CacheDegradedError('缓存还原后不足 1 套,丢弃缓存走 MISS')
  return ranked
```
> 设计决策：**宁可丢弃缓存走 MISS 也不渲染缺失 slot 的坏卡片**。丢率极低（衣服删除是低频操作）。

### 4.3 swapOutfit 改造
```
swapOutfit():
  if currentIdx + 1 < ranked.length:
    setCurrentIdx(currentIdx + 1)
    return

  // 浏览完 3 套，**不再自动重打 AI**
  confirmed = confirm('今天已为你推荐了 3 套最佳穿搭。要基于当前衣橱重新生成吗？')
  if confirmed:
    setRefreshing(true)
    runCachedPipeline(true)    // forceBypassCache=true,强制打新 AI
  else:
    setCurrentIdx(0)           // 循环展示
```

### 4.4 「🔄 今日重新生成」按钮
- 位置：操作按钮 3 列正下方，单独一行 `Button variant="outline" size="sm"`，左对齐
- onClick: `setRefreshing(true); runCachedPipeline(true)`
- UI 文字: `🔄 今日重新生成`（含 loading 态为 `...`）

### 4.5 顶部状态徽章
- 位置：今日标题下方日期行右边，inline Badge `variant="outline"`
- HIT 时: `📦 缓存`（灰色 outline）
- BYPASS 成功（刚点了重新生成）/ MISS 时: `✨ AI`（蓝色 outline，3 秒后自动消失成 📦 缓存）
- 首次加载 loading 时不显示 badge

---

## 5. 错误边界

| # | 场景 | 处理策略 |
|---|---|---|
| E1 | 缓存命中后某 itemId 查不到（衣服被删/丢弃） | restore 时丢弃该套；全部不足 1 套 → 走 MISS |
| E2 | AI 成功但写缓存 DB 抛错 | 不阻塞 UI；只打 console.warn；下次因无缓存再打一次 |
| E3 | 用户当天穿了衣服 → 下一次命中旧缓存 | 故意**命中**（wearLog 不算进 hash）。理由：衣服没变不该白烧 API；如用户在意手动重生成 |
| E4 | 生成的缓存 > 24h（极端情况下应用整天不关） | 命中时再补一道 `now - generatedAt < 24h` 校验 → 过期自动 MISS |
| E5 | cache 表里无限增长 | 每次写新缓存后台 purgeOld(保留 3 天) |
| E6 | DB v2 → v3 升级期间 outfitCache 表短暂不存在 | Dexie version upgrade 机制保证在 open() 完成后才执行查询；TodayPage 正常流程在 settings/DB ready 之后才运行，天然安全 |
| E7 | settings/location 缺失 | 与现有处理一致：跳 /settings，缓存逻辑不触及 |
| E8 | items/天气不足 | 原有 guard 全部保留；hash 计算仅在通过 guard 后执行，不会遇到空值（即便空 FNV 也稳定返回，不会崩溃） |

---

## 6. 清理策略

### 6.1 `purgeOldOutfitCache(keepDays = 3): Promise<number>`
```ts
async function purgeOldOutfitCache(keepDays = 3) {
  const cutoff = todayStrMinusDays(keepDays)   // YYYY-MM-DD
  return db.outfitCache.where('date').below(cutoff).delete()
}
```
**触发**：每次 MISS/BYPASS 写入成功后 `void purgeOldOutfitCache()`（后台执行，不 await）。

### 6.2 24h TTL
HIT 时校验 `Date.now() - record.generatedAt < 86400000`。避免极端场景：用户整天不关浏览器、天气午夜变但日期没变。

---

## 7. 改动文件清单

| # | 文件 | 类型 | 说明 |
|---|---|---|---|
| 1 | `src/types/index.ts` | 改造 | 新增 `OutfitCacheRecord` interface（含 OutfitCacheEntry 内部结构） |
| 2 | `src/lib/hash.ts` | **新增** | FNV-1a 32bit 实现：`fnv1a(str): string`(返回 hex8) + 可选 `stableJsonDigest(obj)` 小工具 |
| 3 | `src/db/database.ts` | 改造 | 升级到 version(3)，新增 outfitCache 表、对应 Table 字段类型 |
| 4 | `src/services/outfitCacheService.ts` | **新增** | 6 个纯函数+DB：`computeInputHash, buildPk, rankedListToCacheOutfits, cacheRecordToRankedList, tryReadCache, writeCache, purgeOldOutfitCache` |
| 5 | `src/pages/Today.tsx` | 改造 | ① 新增 `runCachedPipeline(forceBypassCache?)` 替代旧 `runPipeline`；② 新增缓存状态 Badge；③ 操作区下方加「今日重新生成」按钮；④ swapOutfit 改为循环+确认；⑤ console.debug 结构化日志；⑥ 所有已有 guard（items<3/weather 不足/跳设置）全部保留并复用 |
| 6 | `src/lib/image.ts` | **不改** | `todayStr()` 已经在此文件定义；outfitCacheService 直接 `import { todayStr } from '@/lib/image'` 即可（image.ts 不依赖任何本项目自定义模块/类型/DB，不会产生循环引用，直接 import 安全）。 |
| 7 | 测试脚本 `tmp_outfit_cache_test.mjs`（实现后可删）| 临时新增 | fake-indexeddb + Dexie，验证 HIT/MISS/BYPASS/purge/hash 变化/降级 7 个单测过 6+ 才算过 |

**非目标（明确不做）**：
- ❌ 不做「穿过的候选灰显」视觉（MVP 不做）
- ❌ 不引入 React Query / SWR（非必要复杂度，IndexedDB + service 已满足）
- ❌ 不把缓存状态存进 Zustand store（持久层足够，避免双重写与一致性 bug）
- ❌ 不修改 Capture / Wardrobe / Settings / RecommendService / FilterEngine / GenerateEngine — 改动面严格隔离到 Today + 新 service + 类型 + DB schema

---

## 8. 测试计划（手测 + 轻量 Node 单测）

### 8.1 轻量单测（fake-indexeddb）
覆盖：
1. **HASH-CHANGE**：activeItems 加一件 → hash 不同 → pk 不同 → MISS ✔
2. **HIT-RESTORE**：写入 3 套 → 读回 → 还原后 aiIndex/reason/breakdown 完全一致 ✔
3. **HIT-DEGRADE**：写缓存后删除其中一件 → 还原命中时该套剔除；不足 1 套走 MISS ✔
4. **BYPASS**：forceBypassCache=true → 即便 pk 已有也不读，写新 record 覆盖 ✔（generatedAt 刷新）
5. **PURGE**：写 N 条跨 5 天 → purge(3) 后剩下最近 3 天 ✔
6. **TTL**：generatedAt = 25h 前 → HIT 校验失败走 MISS ✔
7. **SWAP-CYCLE**：3 套浏览完不自动打 AI，循环回 index=0（这个在浏览器手测更合适，单测可 skip）

### 8.2 浏览器手测（对应 K1-K7）
- 浏览器 DevTools：① Console 过滤 `[outfitCache]` 看 HIT/MISS/BYPASS 日志 ② Network 过滤 chat 看 API 调用次数
- K1 首次 1 次 AI、K2/K3 切 Tab/刷新 0 次、K4 swap 3 套后不打 AI、K5 按钮点完打 1 次、K6 去入库加一件回来打 1 次、K7 系统日期拨快 1 天打 1 次（或手改 pk 日期/模拟 cache 里的旧记录）

---

## 9. 风险与回退

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| Dexie version(3) 升级后老用户 DB 版本 < 2（极少数第一天用户） | 低 | 低 | Dexie 按版本依次升级：v1→v2→v3 链式自然处理，无需特殊代码 |
| hash 冲突（两件不同衣橱算出同一个 hash） | 极低 | 中（概率 ≈ 1/40 亿） | FNV-1a 8 位 hex 在百件衣橱下冲突概率可忽略；若真发生用户点"今日重新生成"可绕过 |
| outfitCache 还原后某 slot 缺失，用户懵 | 低 | 低 | 降级策略：整套剔除、不足 1 套走 MISS、打新 AI 重新写入正确 |
| 清理失败（purge 报错） | 低 | 极低 | 只打 console.warn，不影响主流程；累积 1 年最多 365 条记录，DB 空间 < 500KB |
| 浏览器不支持 crypto.randomUUID（hash.ts 不需要，hash 用 FNV-1a 不碰 crypto） | 极低 | 无 | hash.ts 完全纯 JS，零 Web API 依赖 |

**回退方案**：若上线后发现任何严重问题，只需把 Today.tsx 的 `runCachedPipeline` 换回原来无缓存 `runPipeline` 版本即可，**不用降级 DB schema**（outfitCache 表空着不影响功能），风险可控。

---

## 10. 开放问题
无（已在设计阶段全部澄清，MVP 范围明确）。
