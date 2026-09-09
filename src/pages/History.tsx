import { useEffect, useState } from 'react'
import { db } from '@/db/database'
import type { Outfit, Item } from '@/types'

export default function HistoryPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [images, setImages] = useState<Record<string, string>>({})

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
      // 清理旧 URL
      Object.values(prev).forEach((u) => {
        if (!Object.values(urls).includes(u)) URL.revokeObjectURL(u)
      })
      return urls
    })
  }

  // 按周分组
  const grouped = outfits.reduce<Record<string, Outfit[]>>((acc, o) => {
    const d = new Date(o.date)
    const weekKey = `${d.getFullYear()} W${getWeekNumber(d)}`
    ;(acc[weekKey] ||= []).push(o)
    return acc
  }, {})

  if (outfits.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-4 text-center text-muted-foreground">
        <p>还没有穿搭记录</p>
        <p className="text-xs">每天"今日推荐"页面点"✓ 穿了"就会记录</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-3 text-xl font-bold">穿搭历史</h1>

      {Object.entries(grouped).map(([week, list]) => (
        <div key={week} className="mb-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">{week}</div>
          <div className="space-y-2">
            {list.map((o) => {
              const realItems = o.itemIds.map((id) => id ? items.find((it) => it.id === id) : null)
              return (
                <div key={o.id} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{o.date}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.weather.condition} {Math.round(o.weather.tempLo)}°/{Math.round(o.weather.tempHi)}°
                    </span>
                  </div>
                  <div className="mb-2 flex gap-1">
                    {realItems.map((it, i) => (
                      <div key={i} className="h-12 w-12 overflow-hidden rounded border bg-muted">
                        {it && images[it.id] ? (
                          <img src={images[it.id]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                            {it ? it.subCategory : '(无)'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">{o.reason}</div>
                  <div className="mt-1 text-[11px]">
                    {o.worn && <span className="mr-2">✓ 穿了</span>}
                    {o.feedback === 'liked' && <span className="mr-2 text-pink-500">👍</span>}
                    {o.feedback === 'disliked' && <span className="mr-2 text-muted-foreground">👎</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function getWeekNumber(d: Date): number {
  const firstDayOfYear = new Date(d.getFullYear(), 0, 1)
  const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}
