import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Badge } from '@/components/ui'
import { useAppStore } from '@/store/app'
import { db } from '@/db/database'
import { useModal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useImagePreview } from '@/components/ui/ImagePreview'
import { cn } from '@/lib/utils'
import type { Item, StyleProfile, Weather, RankedOutfit } from '@/types'
import { fetchWeather } from '@/services/weatherService'
import { filterByWeather, shouldHaveOuterwear } from '@/engine/filter'
import { generateCandidates } from '@/engine/generate'
import { rankOutfits } from '@/services/recommendService'
import { uuid, todayStr } from '@/lib/image'
import {
  buildPk,
  computeInputHash,
  cacheRecordToRankedList,
  CacheDegradedError,
  tryReadCache,
  writeCache,
  findLatestRecordForDate,
} from '@/services/outfitCacheService'

type CacheStatus = 'idle' | 'loading' | 'hit' | 'miss' | 'bypass'
type PageMode = 'loading' | 'idle' | 'ready'

const SLOT_LABELS = ['上装', '下装', '外套', '鞋子']
const SLOT_ICONS = ['👕', '👖', '🧥', '👟']

function daysAgoStr(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return todayStr(d)
}

export default function TodayPage() {
  const { settings, styleProfile } = useAppStore()
  const navigate = useNavigate()
  const modal = useModal()
  const toast = useToast()

  // 页面级（整页转圈：冷启动/错误重试/BYPASS 时用）
  const [loading, setLoading] = useState(true)
  // CTA 按钮级（空态点"生成今日推荐"时，不弹整页转圈，只按钮转圈）
  const [generating, setGenerating] = useState(false)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [ranked, setRanked] = useState<RankedOutfit[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>('idle')
  // MISS/BYPASS 刚结束短时显示 AI badge,3s 后变成 hit(因为已经写入缓存)
  const [aiBadgeVisible, setAiBadgeVisible] = useState(false)
  const [mode, setMode] = useState<PageMode>('loading')
  // 昨日参考:idle 态异步加载,失败/无记录时为 null
  const [yesterdayRanked, setYesterdayRanked] = useState<RankedOutfit[] | null>(null)
  // 为昨日参考/今日 ready 共用的物品清单,idle 态异步算好后缓存,避免 CTA 点击再查
  const [activeItems, setActiveItems] = useState<Item[]>([])
  // 今日推荐结果态:当前 outfit 是否已喜欢/已穿
  const [feedbackState, setFeedbackState] = useState<{ liked: boolean; worn: boolean }>({ liked: false, worn: false })

  async function generateWeatherCache() {
    if (!settings?.location) {
      setError('未设置位置,请先到设置页填写城市')
      return null
    }
    try {
      const cache = await db.weatherCache.get(settings.location + '-' + todayStr())
      if (cache && Date.now() - cache.fetchedAt < 12 * 3600 * 1000) {
        return {
          location: cache.location,
          tempHi: cache.tempHi,
          tempLo: cache.tempLo,
          condition: cache.condition,
          icon: cache.icon,
        } as Weather
      }
      const w = await fetchWeather(settings.location)
      await db.weatherCache.put({
        date: todayStr(),
        location: w.location,
        tempHi: w.tempHi,
        tempLo: w.tempLo,
        condition: w.condition,
        icon: w.icon,
        fetchedAt: Date.now(),
      })
      return w
    } catch (e) {
      // 回退:读最近一次
      const fallback = await db.weatherCache.orderBy('fetchedAt').reverse().first()
      if (fallback) {
        return {
          location: fallback.location,
          tempHi: fallback.tempHi,
          tempLo: fallback.tempLo,
          condition: fallback.condition,
          icon: fallback.icon,
          stale: true,
        } as Weather
      }
      setError(`天气获取失败:${(e as Error).message}`)
      return null
    }
  }

  /**
   * 缓存推荐主流程。
   * @param forceBypassCache true=忽略今日缓存,强制重打 AI(BYPASS 语义)
   * @param showFullPageSpinner true=setLoading(true/false) 弹整页转圈(冷启动/重试/BYPASS 用);false=不弹(CTA 点击时由调用方管 generating 圆圈)
   */
  async function runCachedPipeline(forceBypassCache = false, showFullPageSpinner = true) {
    if (showFullPageSpinner) setLoading(true)
    setError(null)
    setCacheStatus('loading')

    if (!settings) {
      navigate('/settings', { replace: true })
      return
    }

    const w = await generateWeatherCache()
    if (!w) {
      if (showFullPageSpinner) setLoading(false)
      setCacheStatus('idle')
      setMode('idle')
      return
    }
    setWeather(w)

    const items = (await db.items.toArray()).filter((it) => !it.discarded)
    setActiveItems(items)
    if (items.length < 3) {
      setError('衣橱单品不足,至少需要上装、下装、鞋子各一件')
      if (showFullPageSpinner) setLoading(false)
      setCacheStatus('idle')
      setMode('idle')
      return
    }

    const filtered = filterByWeather(items, w)
    if (filtered.top.length === 0 || filtered.bottom.length === 0 || filtered.shoes.length === 0) {
      setError('当前天气下没有合适的单品,请去衣橱添加更多衣物')
      if (showFullPageSpinner) setLoading(false)
      setCacheStatus('idle')
      setMode('idle')
      return
    }

    // ---- 缓存命中分支 ----
    if (!forceBypassCache) {
      const hash = computeInputHash(items, styleProfile as StyleProfile, w)
      const pk = buildPk(todayStr(), settings.location, hash)
      const rec = await tryReadCache(pk)
      if (rec) {
        try {
          const restored = cacheRecordToRankedList(rec, items)
          console.debug('[outfitCache] HIT', {
            pk,
            generatedAt: new Date(rec.generatedAt).toLocaleTimeString(),
            n: restored.length,
          })
          setRanked(restored)
          setCurrentIdx(0)
          setCacheStatus('hit')
          setAiBadgeVisible(false)
          setFeedbackState({ liked: false, worn: false })
          if (showFullPageSpinner) setLoading(false)
          setRefreshing(false)
          setMode('ready')
          return
        } catch (err) {
          if (err instanceof CacheDegradedError) {
            console.debug('[outfitCache] DEGRADE', err.message)
            // 降级:放弃缓存,继续走 MISS 分支重算
          } else {
            // 其他异常降级为 MISS,记录但不阻塞
            console.warn('[outfitCache] 还原失败,将重打 AI', err)
          }
        }
      }
    }

    // ---- MISS / BYPASS 分支:正常打 AI ----
    const wearLog = await db.wearLog.orderBy('date').reverse().limit(30).toArray()
    const candidates = generateCandidates(filtered, wearLog, styleProfile!, w, { count: 20 })

    if (candidates.length === 0) {
      setError('无法生成候选搭配')
      if (showFullPageSpinner) setLoading(false)
      setCacheStatus('idle')
      setMode('idle')
      setRefreshing(false)
      return
    }

    let results: RankedOutfit[]
    try {
      results = await rankOutfits(settings, candidates, w, styleProfile!, wearLog)
    } catch (e) {
      // AI 失败,回退到规则分
      results = candidates
        .slice()
        .sort((a, b) => b.ruleScore - a.ruleScore)
        .map((c, i) => ({ candidate: c, aiIndex: i + 1, reason: '规则分最优(AI 不可用)' }))
    }

    // 写入缓存(即便 AI 失败回退规则分也写入,避免下次重复打 AI 又失败浪费)
    try {
      const hash2 = computeInputHash(items, styleProfile as StyleProfile, w)
      const pk2 = buildPk(todayStr(), settings.location, hash2)
      await writeCache(pk2, todayStr(), settings.location, hash2, results)
    } catch (e) {
      // spec E2:写缓存失败不阻塞 UI,只打 warn
      console.warn('[outfitCache] 写入失败,今日推荐正常展示,下次会重打 AI', e)
    }

    setRanked(results)
    setCurrentIdx(0)
    setCacheStatus(forceBypassCache ? 'bypass' : 'miss')
    setAiBadgeVisible(true)
    setFeedbackState({ liked: false, worn: false })
    console.debug(forceBypassCache ? '[outfitCache] BYPASS' : '[outfitCache] MISS', {
      pk: buildPk(todayStr(), settings.location, computeInputHash(items, styleProfile as StyleProfile, w)),
      n: results.length,
    })
    // 3s 后 AI badge 消失(用户下一次切 Tab 再回来就是 HIT 了)
    setTimeout(() => setAiBadgeVisible(false), 3000)

    if (showFullPageSpinner) setLoading(false)
    setRefreshing(false)
    setMode('ready')
  }

  // 为 error 页「重试」按钮保留别名
  const runPipeline = () => runCachedPipeline(false, true)

  /** 冷启动:今日缓存 HIT -> 秒开;MISS -> 不打 AI,仅展示空态 + 昨日参考(按需点 CTA) */
  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (!settings) {
        // settings 未初始化 -> 交给 runCachedPipeline 跳转 /settings
        await runCachedPipeline(false, true)
        return
      }

      setLoading(true)
      setCacheStatus('loading')
      setMode('loading')
      setError(null)

      const w = await generateWeatherCache()
      if (cancelled) return
      if (!w) {
        setLoading(false)
        setMode('idle')
        setCacheStatus('idle')
        return
      }
      setWeather(w)

      const items = (await db.items.toArray()).filter((it) => !it.discarded)
      if (cancelled) return
      setActiveItems(items)

      if (!styleProfile) {
        // styleProfile 也没初始化 -> 走完整 pipeline 跳设置
        await runCachedPipeline(false, true)
        return
      }

      const hash = computeInputHash(items, styleProfile as StyleProfile, w)
      const todayPk = buildPk(todayStr(), settings.location, hash)
      const rec = await tryReadCache(todayPk)
      if (cancelled) return

      if (rec) {
        try {
          const restored = cacheRecordToRankedList(rec, items)
          console.debug('[outfitCache] HIT', {
            pk: todayPk,
            generatedAt: new Date(rec.generatedAt).toLocaleTimeString(),
            n: restored.length,
          })
          setRanked(restored)
          setCurrentIdx(0)
          setCacheStatus('hit')
          setAiBadgeVisible(false)
          setFeedbackState({ liked: false, worn: false })
          setLoading(false)
          setMode('ready')
          return
        } catch (err) {
          if (err instanceof CacheDegradedError) console.debug('[outfitCache] DEGRADE', err.message)
          else console.warn('[outfitCache] HIT 还原失败,进入空态', err)
        }
      }

      // ---- 今日缓存 MISS -> 不自动打 AI,进入空态 R1 ✅ ----
      console.debug('[outfitCache] IDLE (今日缓存为空,不自动打 AI,等用户点 CTA)')
      setLoading(false)
      setMode('idle')
      setCacheStatus('idle')

      // 并行:宽松查昨日记录（不管 TTL、不管 hash 变不变）—— 展示作参考
      try {
        const yesterday = daysAgoStr(1)
        const yRec = await findLatestRecordForDate(yesterday, settings.location)
        if (cancelled) return
        if (yRec) {
          try {
            const yRanked = cacheRecordToRankedList(yRec, items) // A 规则:缺 item 变 null;缺一整套丢弃
            if (yRanked.length >= 1) {
              console.debug('[outfitCache] IDLE+YESTERDAY', {
                date: yesterday,
                pk: yRec.pk,
                outfits: yRanked.length,
              })
              if (!cancelled) setYesterdayRanked(yRanked)
            } else {
              console.debug('[outfitCache] IDLE (昨日缓存还原<1套,不显示参考)')
            }
          } catch (err) {
            if (err instanceof CacheDegradedError) {
              console.debug('[outfitCache] IDLE (昨日还原 Degraded,不显示参考):', err.message)
            } else {
              console.warn('[outfitCache] 昨日参考还原异常:', err)
            }
          }
        }
      } catch (err) {
        console.warn('[outfitCache] 昨日参考查询失败(不阻塞空态):', err)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleGenerateClick() {
    if (generating) return
    setGenerating(true)
    setError(null)
    try {
      await runCachedPipeline(false, false)
    } finally {
      setGenerating(false)
    }
  }

  async function feedbackOutfit(liked: boolean, worn: boolean) {
    const outfit = ranked[currentIdx]
    if (!outfit || !settings) return

    // ============ 重复检测:同一天同一套(按 itemIds 集合比对) ============
    const today = todayStr()
    const itemIds = outfit.candidate.items.map((it) => it?.id ?? null) as (string | null)[]
    const todayRecords = await db.outfits.where('date').equals(today).toArray()
    const sameOutfit = todayRecords.find((r) =>
      r.itemIds.length === itemIds.length
      && r.itemIds.every((id, i) => id === itemIds[i]),
    )
    if (sameOutfit) {
      if (worn && sameOutfit.worn) {
        toast('今天已经穿过这套了 ✓', 'info')
        setFeedbackState({ liked: sameOutfit.feedback === 'liked', worn: true })
        return
      }
      if (liked && sameOutfit.feedback === 'liked') {
        toast('今天已经喜欢过这套了 👍', 'info')
        setFeedbackState({ liked: true, worn: sameOutfit.worn })
        return
      }
      // 已喜欢但现在穿了 / 已穿但现在喜欢 → 更新而非新建
      await db.outfits.update(sameOutfit.id, {
        feedback: liked ? 'liked' : sameOutfit.feedback,
        worn: worn || sameOutfit.worn,
        createdAt: sameOutfit.createdAt, // 保留首次时间
      })
      // 更新 affinity / wearLog
      const now = Date.now()
      const validItems = outfit.candidate.items.filter((it): it is Item => !!it)
      for (const it of validItems) {
        await db.items.update(it.id, {
          affinityScore: Math.max(-10, Math.min(10, it.affinityScore + (liked ? 2 : 0))),
          lastWornAt: worn ? now : it.lastWornAt,
          wearCount: worn ? it.wearCount + 1 : it.wearCount,
        })
      }
      if (worn) {
        await db.wearLog.add({
          id: uuid(), date: today, itemIds: validItems.map((it) => it.id), eventType: 'worn', createdAt: now,
        })
      }
      toast(worn ? '✓ 已补记为今天穿了' : '👍 已补记为喜欢', 'success')
      setFeedbackState((s) => ({ liked: s.liked || liked, worn: s.worn || worn }))
      return
    }

    // ============ 新建记录 ============
    await db.outfits.add({
      id: uuid(),
      date: today,
      itemIds,
      reason: outfit.reason,
      aiRanking: outfit.aiIndex,
      weather: weather!,
      feedback: liked ? 'liked' : 'neutral',
      worn,
      createdAt: Date.now(),
    })

    const now = Date.now()
    const validItems = outfit.candidate.items.filter((it): it is Item => !!it)
    for (const it of validItems) {
      await db.items.update(it.id, {
        affinityScore: Math.max(-10, Math.min(10, it.affinityScore + (liked ? 2 : 0))),
        lastWornAt: worn ? now : it.lastWornAt,
        wearCount: worn ? it.wearCount + 1 : it.wearCount,
      })
    }

    if (worn) {
      await db.wearLog.add({
        id: uuid(), date: today, itemIds: validItems.map((it) => it.id), eventType: 'worn', createdAt: now,
      })
    }

    toast(worn ? '✓ 已记录今天的穿搭' : liked ? '👍 已收藏' : '已记录', 'success')
    setFeedbackState((s) => ({ liked: s.liked || liked, worn: s.worn || worn }))
  }

  async function swapOutfit() {
    if (currentIdx + 1 < ranked.length) {
      setCurrentIdx(currentIdx + 1)
      setFeedbackState({ liked: false, worn: false })
      return
    }
    // 浏览完所有 ranked —— 不再自动打 AI,确认后才走 BYPASS 重新生成
    const ok = await modal.confirm(
      `今天已为你推荐了 ${ranked.length} 套最佳穿搭。\n要基于当前衣橱重新生成吗?`,
    )
    if (ok) {
      setRefreshing(true)
      setFeedbackState({ liked: false, worn: false })
      void runCachedPipeline(true, true) // forceBypassCache + 整页转圈
    } else {
      setCurrentIdx(0) // 循环展示
      setFeedbackState({ liked: false, worn: false })
    }
  }

  // ========== CTA disabled guard R3 ==========
  const disabledReason = useMemo<string | null>(() => {
    if (!settings) return '请先完成初始化(点击跳转设置页)'
    if (!settings.apiKey || !settings.apiProvider || !settings.textModel) {
      return '请先在【设置】tab 配置 AI 服务'
    }
    if (!settings.location) return '请先在【设置】tab 配置城市'
    if (activeItems.length < 3) {
      return `请先在【衣橱】tab 录入至少 3 件衣物（当前 ${activeItems.length} 件）`
    }
    return null
  }, [settings, activeItems.length])

  if (loading) {
    return (
      <div className="mx-auto max-w-md pb-24">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-4 pb-3">
          <h1 className="text-xl font-bold">今日穿搭</h1>
        </div>
        <div className="px-4 flex min-h-[60vh] flex-col items-center justify-center gap-4 text-muted-foreground">
          <div className="text-4xl animate-spin">🧵</div>
          <p>正在为今天挑选穿搭...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md pb-24">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-4 pb-3">
          <h1 className="text-xl font-bold">今日穿搭</h1>
        </div>
        <div className="px-4 flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-muted-foreground">{error}</p>
          {!settings?.location && (
            <Button onClick={() => navigate('/settings')}>去设置位置</Button>
          )}
          <Button variant="outline" onClick={runPipeline}>重试</Button>
        </div>
      </div>
    )
  }

  // idle 态 weather 一定已经有了;ready 态 ranked 也有
  if (!weather) return null

  const currentOutfit = mode === 'ready' ? ranked[currentIdx] ?? null : null
  const yesterdayOutfit = mode === 'idle' ? yesterdayRanked?.[0] ?? null : null
  const needOuterwearToday = !!weather && shouldHaveOuterwear(weather)

  return (
    <div className="mx-auto max-w-md pb-24">
      {/* ========== Sticky header: 标题 + 天气 ========== */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">今日穿搭</h1>
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
              <span>
                {todayStr()} · {weather.location}
                {weather.stale && <span className="ml-1 text-yellow-600">(天气已过期)</span>}
              </span>
              {aiBadgeVisible ? (
                <Badge variant="default" className="bg-blue-500 hover:bg-blue-500 text-white text-[10px] px-1.5 py-0 h-4">✨ AI</Badge>
              ) : cacheStatus === 'hit' ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">📦 缓存</Badge>
              ) : mode === 'idle' ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">📭 今日为空</Badge>
              ) : null}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold">
              {Math.round(weather.tempLo)}° ~ {Math.round(weather.tempHi)}°
            </div>
            <div className="text-xs text-muted-foreground">{weather.condition}</div>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="px-4">

      {/* ========== 今日 Ready:正常四件套卡片 ========== */}
      {mode === 'ready' && currentOutfit && (
        <OutfitCard
          outfit={currentOutfit}
          needOuterwear={needOuterwearToday}
          feedbackState={feedbackState}
          onLike={() => feedbackOutfit(true, false)}
          onSwap={swapOutfit}
          onWorn={() => feedbackOutfit(false, true)}
          swapRefreshing={refreshing}
        />
      )}

      {/* ========== 今日 Ready:小号 BYPASS 手动重新生成 (R8 保留) ========== */}
      {mode === 'ready' && (
        <div className="mt-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={async () => {
              const ok = await modal.confirm(
                '确定要重新生成今日的穿搭推荐吗?会调用 AI 并覆盖现有缓存。',
                { title: '重新生成今日推荐' },
              )
              if (ok) {
                setRefreshing(true)
                void runCachedPipeline(true, true)
              }
            }}
            disabled={refreshing || generating || loading}
          >
            {refreshing ? '正在重新生成…' : '🔄 今日重新生成'}
          </Button>
        </div>
      )}

      {/* ========== 今日 Idle:CTA 卡 ========== */}
      {mode === 'idle' && (
        <div className="mb-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-primary/[0.07] to-transparent p-7 text-center shadow-sm">
          <h2 className="text-lg font-bold tracking-tight">今天的穿搭准备好了吗？</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            基于你的衣橱 + 天气 + 风格偏好生成 3 套候选
            <br />
            <span className="text-[12px] opacity-80">全天本地缓存，只调用 1 次 AI</span>
          </p>
          <button
            type="button"
            onClick={!disabledReason && !generating && !loading ? handleGenerateClick : undefined}
            disabled={!!disabledReason || generating || loading}
            className={`mx-auto mt-6 flex h-36 w-36 flex-col items-center justify-center rounded-full transition-all ${
              disabledReason || generating || loading
                ? 'cursor-not-allowed bg-muted text-muted-foreground opacity-70'
                : 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:scale-[1.03] hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]'
            }`}
            aria-label="生成今日推荐"
          >
            {generating ? (
              <span className="text-3xl animate-spin inline-block">⚙️</span>
            ) : (
              <span className="text-3xl">✨</span>
            )}
            <span className="mt-1.5 text-sm font-semibold">生成今日推荐</span>
            <span className="mt-0.5 text-[10px] opacity-80">点击开始 · 仅首次需 AI</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/capture')}
            className="mt-4 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            选择图片 · 直接填写
          </button>
          {disabledReason && (
            <p className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 text-left dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400">
              ⚠️ {disabledReason}
            </p>
          )}
        </div>
      )}

      {/* ========== 今日 Idle:昨日参考 (R4/R5/R6) ========== */}
      {mode === 'idle' && yesterdayOutfit && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm text-amber-800">
            <span>📌</span>
            <span className="font-medium">昨天我穿了什么 · 仅供参考（不可操作）</span>
          </div>
          <OutfitCard
            outfit={yesterdayOutfit}
            needOuterwear={needOuterwearToday}
            readonly
          />
        </div>
      )}
      </div>
    </div>
  )
}

// ========== 共用:四件套卡片 + 推荐理由 + 评分 + 3 操作按钮(readonly 时隐藏) ==========
function OutfitCard({
  outfit,
  needOuterwear,
  feedbackState,
  readonly = false,
  onLike,
  onSwap,
  onWorn,
  swapRefreshing,
}: {
  outfit: RankedOutfit
  needOuterwear: boolean
  feedbackState?: { liked: boolean; worn: boolean }
  readonly?: boolean
  onLike?: () => void
  onSwap?: () => void
  onWorn?: () => void
  swapRefreshing?: boolean
}) {
  const slotItems = outfit.candidate.items
  const liked = feedbackState?.liked
  const worn = feedbackState?.worn
  return (
    <div>
      {/* 四件套网格 */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {slotItems.map((item, i) => (
          <SlotCard
            key={i}
            label={SLOT_LABELS[i]}
            icon={SLOT_ICONS[i]}
            item={item}
            required={i !== 2 || needOuterwear}
          />
        ))}
      </div>

      {/* 推荐理由 */}
      <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900">
        💡 {outfit.reason}
      </div>

      {/* 规则分参考 (保留) */}
      <div className="mb-4 text-[11px] text-muted-foreground space-y-0.5">
        <div className="flex gap-2">
          <Badge variant="outline">色彩 {outfit.candidate.breakdown.colorHarmony.toFixed(2)}</Badge>
          <Badge variant="outline">品类 {outfit.candidate.breakdown.categoryFit.toFixed(2)}</Badge>
          <Badge variant="outline">轮换 {outfit.candidate.breakdown.rotationScore.toFixed(2)}</Badge>
        </div>
      </div>

      {/* 结果态横幅 */}
      {!readonly && (liked || worn) && (
        <div
          className={cn(
            'mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium animate-[dialog-in_.18s_ease-out]',
            worn
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
              : 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-400',
          )}
        >
          <span className="text-lg">{worn ? '✓' : '👍'}</span>
          <span>
            {worn && liked && '已记录今天的穿搭 · 已收藏'}
            {worn && !liked && '已记录今天的穿搭'}
            {!worn && liked && '已收藏这套搭配'}
          </span>
        </div>
      )}

      {/* 3 操作按钮:R6 昨日参考 readonly 时全部隐藏 */}
      {!readonly && (
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant={liked ? 'default' : 'outline'}
            className={liked ? 'bg-pink-500 text-white hover:bg-pink-600' : ''}
            onClick={onLike}
          >
            {liked ? '👍 已喜欢' : '👍 喜欢'}
          </Button>
          <Button variant="outline" onClick={onSwap} disabled={swapRefreshing}>
            {swapRefreshing ? '...' : '🔄 换一套'}
          </Button>
          <Button
            variant={worn ? 'default' : 'outline'}
            className={worn ? 'bg-emerald-500 text-white hover:bg-emerald-600' : ''}
            onClick={onWorn}
          >
            {worn ? '✓ 已穿了' : '✓ 穿了'}
          </Button>
        </div>
      )}
    </div>
  )
}

function SlotCard({
  label, icon, item, required,
}: {
  label: string
  icon: string
  item: Item | null
  required: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const imagePreview = useImagePreview()

  useEffect(() => {
    if (!item) return
    const u = URL.createObjectURL(item.thumbnailBlob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [item])

  if (!item) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs">{required ? '(无)' : '(无需)'}</span>
        <span className="text-[10px]">{label}</span>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="relative aspect-square bg-muted">
        {url ? (
          <div
            role="button"
            aria-label={`${item.subCategory} · ${item.color}`}
            className="h-full w-full cursor-zoom-in select-none bg-cover bg-center [-webkit-touch-callout:none]"
            style={{ backgroundImage: `url(${url})` }}
            onClick={() => imagePreview.open(url, `${item.subCategory} · ${item.color}`)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">{icon}</div>
        )}
      </div>
      <div className="p-2 text-center text-[10px]">
        <div className="font-medium">{item.subCategory}</div>
        <div className="text-muted-foreground">{item.color}</div>
      </div>
    </div>
  )
}
