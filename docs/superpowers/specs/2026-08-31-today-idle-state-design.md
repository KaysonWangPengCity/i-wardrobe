# 今日页面空态与昨日参考设计 v1

- 日期：2026-08-31
- 状态：Design review approved
- 上游设计：《2026-08-31 Today 推荐缓存粒度优化 方案 1》（已实现，IndexedDB outfitCache 表 + 24h TTL + 输入哈希 pk）

## 1. 背景

当前「今日」页面行为：

```
useEffect([]) → runCachedPipeline(false)
  ├─ 今日缓存 HIT → 秒渲染，0 AI ✅
  ├─ 今日缓存 MISS（首次/跨天/衣橱变了/过期）
  │    → 立即 rankOutfits(...) → 自动打 1 次 AI ❌
  └─ Degraded/失败 → 回退规则分，也写缓存 ✅
```

用户反馈：「第一次进入不要自动调，给个按钮让我自己点。」核心动机——**省 Token / 不被偷偷烧 API / 用户主动掌控何时调用 AI**。

### 1.1 非目标（本轮不做）
- 不重做欢迎视觉/插画/引导 onboarding
- 不触碰 outfitCacheService / DB schema / hash / 缓存策略
- 不改造 OutfitCard 组件
- 不做"今日到昨日"的穿搭继承逻辑

---

## 2. 需求（用户逐条确认）

| # | 需求 | 来源 |
|---|---|---|
| R1 | **首次进入今日（今日无缓存）时不自动打 AI**，展示一个 CTA 按钮让用户主动点生成 | 用户直接要求 |
| R2 | **今日有缓存时**直接渲染（和当前 HIT 行为一致），**不要再让用户点一次按钮** | 设计守卫 §2 边界第 2 条 |
| R3 | 前置条件不满足（衣橱<3 件 / 未设位置 / 未设 AI 配置）→ CTA 按钮 disabled + 具体文字提示，避免点了后才报错 | 设计守卫 §2 边界第 3 条 |
| R4 | **空态要显示昨天缓存参考**（如果昨天有记录） | 用户追加要求 |
| R5 | 昨日参考中若有 item 今天已从衣橱删除 → **复用现有空 slot 渲染（A 规则）**：缺失 slot 显示灰色空框 + 提示文字；若 top/bottom/shoes 三者任一整套缺失则整套丢弃 | 澄清题选 A |
| R6 | 昨日参考为"只读"：不显示换一套 / 收藏 / 标记穿过 3 个操作按钮 | 设计 §2 空态 UI |
| R7 | 主按钮点击后调用现在的 `runCachedPipeline(false)`（MISS→打 AI→写缓存→渲染） | 设计 §2 |
| R8 | 已生成态：保留现在的"🔄 今日重新生成"小号 BYPASS 按钮、swap 循环+confirm、📦/✨ Badge，**零改动** | 设计 §3 |

---

## 3. 架构与数据流

### 3.1 依赖关系（保持严格隔离，本轮只改 1 个文件）

```
pages/Today.tsx                     ← ★ 唯一改动文件
  ├─ db/database.ts                 （读 outfitCache：查昨日记录）
  ├─ services/outfitCacheService.ts （tryReadCache / writeCache / runCachedPipeline 原签名复用）
  ├─ components/OutfitCard.tsx       （昨日参考复用 OutfitCard，readonly 传新 prop）
  └─ services/* / lib/*              （零改动）
```

### 3.2 状态机

```typescript
// Today 内部新增
type Mode = 'loading' | 'idle' | 'ready'
const [mode, setMode] = useState<Mode>('loading')
const [yesterdayRanked, setYesterdayRanked] = useState<RankedOutfit[] | null>(null)
```

**启动流程（根 useEffect）：**

```
settings / location / styleProfile / wearLog / weather / activeItems
          │
          ▼
   computeInputHash(activeItems, styleProfile, weather)
          │
          ▼
   todayPk = buildPk(today, location, hash)
   yesterdayPk = buildPk(yesterday, location, hash)   ← 先按 strict hash 查；查不到再 fallback：
                                                         where('date').equals(yesterday)
                                                         .and(r => r.location === location)
                                                         .first()  （宽松匹配，更符合用户预期）
          │
          ▼
   tryReadCache(todayPk)
   ├─ HIT + valid TTL → setRanked → setMode('ready')   // 当前 HIT 行为
   ├─ MISS / Degraded / Expired
   │    ├─ setMode('idle')
   │    └─ (async) 查昨日记录（strict→宽松两级策略）→ 还原成功则 setYesterdayRanked(2套+)
   │          还原 < 1 套 / 查不到 → setYesterdayRanked(null)
   └─ setCacheStatusBadge accordingly
```

### 3.3 昨日还原策略（A 规则 + 丢弃整套）

- 复用现有 `cacheRecordToRankedList(record, activeItems)`：
  - 每个 slot：`itemId` 存在且 `activeItems.get(id)` 命中 → 填；否则 → **slot = null**（A 规则）
  - 最终校验：`topId && bottomId && shoesId` 三者**任一未找到对应 Item**（即 slot 虽为 null 但不是因为"没有这个 slot 位"，而是因为**itemId 存了但 activeItems 里查不到**）→ **整套丢弃**，不要渲染残缺 top/bottom/shoes
  - 还原后 < 1 套 → **抛 CacheDegradedError**，Today 捕获后 yesterdayRanked=null（不显示参考）
- **为什么还要 strict→宽松两级查询？**
  - 衣橱/天气变了会导致 inputHash 变。strict 用今天 hash 几乎查不到昨天 pk（除非衣橱天气完全没动），所以必须宽松匹配（`date + location` 匹配到任何一条就用）。
  - 这个 fallback 只会影响**昨日参考显示**，不影响今日缓存主键（今日 pk 仍然是 `日期+位置+hash`，隔离性不破坏）。

### 3.4 CTA 点击流程

```
用户点「✨ 生成今日推荐」
  │
  ▼
setLoading=true + runCachedPipeline(false)  ← 复用：MISS 打 AI→写缓存→restore ranked
  ├─ success → setRanked → setMode('ready')   // 自动切到已生成态
  ├─ fail → toast(错误提示) + 仍留 idle，按钮可再点
  └─ finally → setLoading=false
```

### 3.5 CTA disabled 条件（按优先级从上到下，命中第一条就取它的提示文字）

```ts
disabledReasons = [
  !aiConfigured          => '请先在【设置】tab 配置 AI 服务',
  !location              => '请先在【设置】tab 配置城市',
  activeItems.size < 3   => `请先在【衣橱】tab 录入至少 3 件衣物（当前 ${size} 件）`,
]
firstReason = disabledReasons.find(Boolean)   // firstReason 存在 → disabled + 显示原因
```

---

## 4. UI 详细规格

### 4.1 空态（mode === 'idle'）

```
┌────────────────────────────────────────────────────────────────────────┐
│  日期行  (今天的日期 + 位置 + 天气胶囊)       [📦 今日缓存为空 / 无Badge] │
├────────────────────────────────────────────────────────────────────────┤
│  CTA 卡片（替换原来的四件套卡片区整块 DOM）：                             │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │ ☀️  今天的穿搭准备好了吗？                                      │    │
│  │                                                                 │    │
│  │ 基于你的衣橱 + 天气 + 风格偏好生成 3 套候选                      │    │
│  │ 全天本地缓存，只调用 1 次 AI                                    │    │
│  │                                                                 │    │
│  │  [ ✨ 生成今日推荐 ]   ← 大号 primary 按钮                       │    │
│  │                        loading 时转圈 + 文案 "生成中..."         │    │
│  │                                                                 │    │
│  │  （disabled 时，在按钮正下方贴 1 行 text-muted 小字）            │    │
│  │   ▸ 「请先在【衣橱】tab 录入至少 3 件衣物（当前 2 件）」         │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  （仅当 yesterdayRanked 存在时显示，与 CTA 卡片之间有 24px gap）：         │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │ 📌 昨天我穿了什么 · 仅供参考（不可操作）                       │    │
│  ├───────────────────────────────────────────────────────────────┤    │
│  │ OutfitCard(yesterdayRanked[0])                                 │    │
│  │  ├─ items: 缺失 item → nullSlot 灰框+文字（A 规则）           │    │
│  │  ├─ actions: ❌ 隐藏（换一套/收藏/标记穿过 3 个按钮全部隐藏）   │    │
│  │  └─ breakdown/score: ✅ 保留                                   │    │
│  └───────────────────────────────────────────────────────────────┘    │
├────────────────────────────────────────────────────────────────────────┤
│  （操作区 3 按钮：今日未生成 → 全部隐藏）                               │
│  （"今日重新生成"小号 BYPASS 按钮：今日未生成 → 隐藏）                  │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 已生成态（mode === 'ready'）

和当前实现**字节级一致**，零改动。含：
- 四件套卡片 + 评分/breakdown
- 底部 3 操作按钮
- swap 3 套循环 + confirm 重生成
- 操作区下方小号「🔄 今日重新生成」BYPASS 按钮
- 日期行 📦 缓存 / ✨ AI Badge

### 4.3 样式约束
- CTA 卡片：`rounded-2xl p-8 border border-dashed border-gray-300 bg-white/50 text-center`（虚线边，视觉表明"待生成"）
- 昨日参考卡片：`rounded-2xl p-4 bg-amber-50/40 border border-amber-100`（轻微暖底色暗示"历史参考"）
- mobile：CTA 按钮全宽 100%，昨日参考和现在的 OutfitCard 一致响应式

---

## 5. Console 日志约定（便于用户验证 R1/R2）

- `[outfitCache] IDLE` → 今日无缓存，未打 AI，用户需点 CTA
- `[outfitCache] IDLE+YESTERDAY, refPk=xxx, outfits=3` → 今日无缓存 + 昨日有参考（含几套信息）
- 现有的 `HIT / MISS / BYPASS / DEGRADE` 继续保留

Network 面板过滤 `chat` 数 AI 调用次数，应满足：
- 今日首次进入（MISS）：`chat` 数 = **0**（CTA 未点）→ 验证 R1 ✅
- 点 CTA 后：`chat` 数 = **1** → 验证 R7 ✅
- 切 Tab / 刷新 / 关应用重开回来：`chat` 数 = **0**（HIT 直接渲染）→ 验证 R2 ✅
- 点小号 BYPASS 按钮：`chat` 数 = **+1**（BYPASS 分支）→ 验证 R8 ✅

---

## 6. 错误与降级

| 情况 | 处理 |
|---|---|
| 昨日记录查不到（昨天没生成或跨了很久） | `yesterdayRanked = null`，空态只显示 CTA 卡，不显示昨日参考区 |
| 昨日记录查到但还原后 < 1 套（≥ 1 套里 top/bottom/shoes 任缺一整套被删） | `cacheRecordToRankedList` 抛 CacheDegradedError，Today 捕获 → `yesterdayRanked = null`（同上，不显示参考区） |
| CTA 点击期间 rankOutfits API 失败 | toast 错误信息；仍停留在 idle 态，按钮可再点 |
| 天气接口 pending（首页 200ms deadline） | 现在的「天气胶囊 + loading」逻辑保持不变；**CTA 不会提前解锁**——必须等天气回来后才能算 inputHash 完成 guard 校验（避免点了生成又用错天气） |

---

## 7. 单元测试补充

本轮**不新增 fake-indexeddb 单测**（因为 outfitCacheService / DB 全部零改动，现有 T1-T7 7/7 通过）。
**新增 1 个逻辑回归点**（可放在浏览器 Console 手测）：

| # | 验证步骤 | 预期 |
|---|---|---|
| K1 | 清 outfitCache 表 → 进今日 | mode='idle'，**0 AI 调用**，Console `IDLE` 或 `IDLE+YESTERDAY` |
| K2 | K1 基础上昨天有缓存（生成 yesterday 记录手塞） | 空态下方出现"📌 昨天我穿了什么"参考卡，操作按钮隐藏，缺失 slot 灰框 |
| K3 | K1 + 衣橱删到 2 件 | CTA 按钮 disabled，下面显示「请先在【衣橱】tab 录入至少 3 件衣物（当前 2 件）」 |
| K4 | K1 + 未设位置 | CTA 按钮 disabled，下面显示「请先在【设置】tab 配置城市」 |
| K5 | K1 + 点 CTA | 打 1 条 AI → mode 切换 ready → 3 套卡+操作区+BYPASS 按钮全显示 |
| K6 | K5 后 → 切 tab 回今日 | mode ready，HIT，**0 AI 调用**，📦 缓存 Badge |
| K7 | K5 后 → 手造 yesterday 记录（itemId 故意引用已删除的 clothes）还原 | 参考卡缺失 slot：灰空框+文字（A 规则）；若 top/bottom/shoes 缺一整套 → 昨日区整体不显示（Degraded 捕获） |

---

## 8. 实施范围与风险

| 范围 | 值 |
|---|---|
| 改动文件数 | **1 个**：`src/pages/Today.tsx`（新增 `readonly` prop 时**可能**加 1 行 OutfitCard，但不改逻辑） |
| 新增行数 | ~120 行（状态机 + 空态卡 + 昨日查询 + disabled reasons） |
| 风险等级 | 🟢 极低（只改一个页面的渲染分支，数据层零改动） |
| 回滚策略 | 直接 revert 这一个文件的 commit |

---

## 9. 验收标准

1. ✅ **R1**：今日缓存为空时，进今日自动调 AI 次数 = 0
2. ✅ **R2**：今日缓存非空（HIT / BYPASS 后再回来）时，直接渲染，0 AI 调用
3. ✅ **R3**：前置条件不满足 → CTA disabled + 具体原因文字
4. ✅ **R4**：昨日有 outfitCache 记录 → 空态显示昨日参考
5. ✅ **R5**：昨日缺失的 item → A 规则 null 灰框；缺一整套 → 昨日区隐藏
6. ✅ **R6**：昨日参考卡的 3 个操作按钮全部隐藏
7. ✅ **R7**：点 CTA → 恰好打 1 次 AI → 切 ready 正常渲染
8. ✅ **R8**：已生成态的 swap / BYPASS 按钮 / Badge 保持现有行为

---

## 10. 后续可选优化（YAGNI，本轮不做）

- 空态大插画
- 昨日参考显示完整 3 套（而非仅第 0 套）+ 左右滑动
- 昨日→今日的「沿用这套但把缺的 slot 补一下」快捷生成
- 在 Wardrobe 删除衣物时提示「这件在昨日参考里，删后参考将残缺」
