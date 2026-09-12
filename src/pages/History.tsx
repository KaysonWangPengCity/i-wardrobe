import { useEffect, useMemo, useState } from 'react'
import { db } from '@/db/database'
import { useModal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useImagePreview } from '@/components/ui/ImagePreview'
import type { Outfit, Item } from '@/types'

type Tab = 'worn' | 'liked'

export default function HistoryPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [images, setImages] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Tab>('worn')
  const modal = useModal()
  const toast = useToast()
  const imagePreview = useImagePreview()

  useEffect(() => {
    load()
    const iv = setInterval(load, 3000)
    return () => clearInterval(iv)
  }, [])

  async function load() {
    const all = await db.outfits.orderBy('date').reverse().toArray()
    const allItems = await db.items.toArray()
    setOutfits(all)
    setItems(allItems)

    // 为缩略图生成 ObjectURL
    const urls: Record<string, string> = {}
    allItems.forEach((it) => {
      urls[it.id] = URL.createObjectURL(it.thumbnailBlob)
    })
    setImages((prev) => {
      Object.values(prev).forEach((u) => {
        if (!Object.values(urls).includes(u)) URL.revokeObjectURL(u)
      })
      return urls
    })
  }

  // 按 Tab 过滤
  const filtered = useMemo(() => {
    return outfits.filter((o) => (tab === 'worn' ? o.worn : o.feedback === 'liked'))
  }, [outfits, tab])

  // 按周分组（key = 可读的日期范围, 如 "8月31日 - 9月6日"）
  const grouped = useMemo(() => filtered.reduce<Record<string, Outfit[]>>((acc, o) => {
    const d = new Date(o.date)
    const key = weekRangeLabel(d)
    ;(acc[key] ||= []).push(o)
    return acc
  }, {}), [filtered])

  const tabCounts = useMemo(() => ({
    worn: outfits.filter((o) => o.worn).length,
    liked: outfits.filter((o) => o.feedback === 'liked').length,
  }), [outfits])

  async function removeOutfit(o: Outfit) {
    const ok = await modal.confirm(
      `确定要移除这条记录吗？\n${o.date} · ${o.weather.condition}`,
      { title: '移除记录', confirmText: '移除', destructive: true },
    )
    if (!ok) return
    await db.outfits.delete(o.id)
    await load()
    toast('已移除 ✓', 'success')
  }

  return (
    <div className="mx-auto max-w-md pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">穿搭历史</h1>
        {/* Tabs */}
        <div className="mt-3 flex rounded-lg bg-muted p-1 text-sm">
          <TabButton
            active={tab === 'worn'}
            onClick={() => setTab('worn')}
            label={`✓ 穿了 (${tabCounts.worn})`}
          />
          <TabButton
            active={tab === 'liked'}
            onClick={() => setTab('liked')}
            label={`👍 喜欢 (${tabCounts.liked})`}
          />
        </div>
      </div>

      {/* 内容区 */}
      <div className="px-4 pt-3">
        {filtered.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <p>{tab === 'worn' ? '还没有「穿了」记录' : '还没有「喜欢」记录'}</p>
            <p className="text-xs">
              {tab === 'worn'
                ? '每天在「今日穿搭」点「✓ 穿了」就会记录'
                : '在「今日穿搭」点「👍 喜欢」就会收藏'}
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([week, list]) => (
            <div key={week} className="mb-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">{week}</div>
              <div className="space-y-2">
                {list.map((o) => {
                  const realItems = o.itemIds.map((id) => (id ? items.find((it) => it.id === id) : null))
                  return (
                    <div key={o.id} className="group rounded-lg border p-3 transition-colors hover:bg-accent/40">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{o.date}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {o.weather.condition} {Math.round(o.weather.tempLo)}°/{Math.round(o.weather.tempHi)}°
                          </span>
                          <button
                            type="button"
                            aria-label="移除"
                            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                            onClick={() => void removeOutfit(o)}
                            title="移除这条记录"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18"/>
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                              <line x1="10" y1="11" x2="10" y2="17"/>
                              <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="mb-2 flex gap-1">
                        {realItems.map((it, i) => (
                          <div
                            key={i}
                            className="h-12 w-12 overflow-hidden rounded border bg-muted"
                          >
                            {it && images[it.id] ? (
                              <div
                                role="button"
                                aria-label={`${it.subCategory} · ${it.color}`}
                                className="h-full w-full cursor-zoom-in select-none bg-cover bg-center [-webkit-touch-callout:none]"
                                style={{ backgroundImage: `url(${images[it.id]})` }}
                                onClick={() => imagePreview.open(images[it.id], `${it.subCategory} · ${it.color}`)}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                {it ? it.subCategory : '(无)'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">{o.reason}</div>
                      <div className="mt-1 text-[11px] flex items-center gap-2">
                        {o.worn && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">✓ 穿了</span>}
                        {o.feedback === 'liked' && <span className="rounded-full bg-pink-50 px-2 py-0.5 text-pink-600">👍 喜欢</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
        (active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
      }
    >
      {label}
    </button>
  )
}

/** 返回 d 所在 ISO 周的可读标签, 如 "8月31日 - 9月6日"。跨月自然体现, 跨年则补上年份。 */
function weekRangeLabel(d: Date): string {
  const weekStart = new Date(d)
  const day = (d.getDay() + 6) % 7 // 周一 = 0
  weekStart.setDate(d.getDate() - day)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const fmt = (x: Date) => `${x.getMonth() + 1}月${x.getDate()}日`
  const a = fmt(weekStart)
  const b = fmt(weekEnd)
  if (weekStart.getFullYear() === weekEnd.getFullYear()) return `${a} - ${b}`
  return `${weekStart.getFullYear()}年${a} - ${weekEnd.getFullYear()}年${b}`
}
