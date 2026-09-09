import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { db } from '@/db/database'
import type { Item, Category } from '@/types'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

const CATEGORIES: (Category | 'All')[] = ['All', 'Top', 'Bottom', 'Outerwear', 'Shoes']

export default function WardrobePage() {
  const [items, setItems] = useState<Item[]>([])
  const [filter, setFilter] = useState<Category | 'All'>('All')

  useEffect(() => {
    load()
    // 监听数据库变化 — 简单做法:定时刷新
    const iv = setInterval(load, 3000)
    return () => clearInterval(iv)
  }, [])

  async function load() {
    // discarded 不再作为索引(布尔键兼容性差),这里用 JS filter
    const all = (await db.items.toArray()).filter((it) => !it.discarded)
    setItems(all)
  }

  const filtered = useMemo(
    () => filter === 'All' ? items : items.filter((it) => it.category === filter),
    [items, filter],
  )

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">衣橱 <Badge variant="outline">{items.length} 件</Badge></h1>
        <Link
          to="/capture"
          className="flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          <Plus size={16} /> 新衣物
        </Link>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
              filter === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
          >
            {c === 'All' ? '全部' : c === 'Top' ? '上装' : c === 'Bottom' ? '下装' : c === 'Outerwear' ? '外套' : '鞋'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center text-muted-foreground">
          <p className="mb-2">衣橱里还没有衣服</p>
          <Link to="/capture" className="text-primary underline">📷 去拍照入库</Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {filtered.map((it) => (
            <ItemCard key={it.id} item={it} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function ItemCard({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const u = URL.createObjectURL(item.thumbnailBlob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [item.thumbnailBlob])

  async function discard() {
    if (!confirm(`标记"丢弃"${item.subCategory} ${item.color}?`)) return
    await db.items.update(item.id, { discarded: true })
    onChanged()
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <button className="block w-full text-left" onClick={() => setExpanded((e) => !e)}>
        <div className="aspect-square w-full bg-muted">
          {url ? (
            <img src={url} alt={item.subCategory} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">无图</div>
          )}
        </div>
      </button>
      <div className="p-1.5 text-[10px]">
        <div className="font-medium truncate">{item.subCategory}</div>
        <div className="text-muted-foreground truncate">{item.color} · {item.style.join('/')}</div>
      </div>
      {expanded && (
        <div className="border-t p-2 text-[11px] text-muted-foreground space-y-1">
          <div>厚度 {item.thickness}/5 · 季:{item.season.join(',')}</div>
          <div>穿过 {item.wearCount} 次 · 亲和 {item.affinityScore.toFixed(1)}</div>
          <button
            onClick={discard}
            className="mt-1 w-full rounded bg-destructive/10 p-1 text-[10px] text-destructive hover:bg-destructive/20"
          >
            标记丢弃
          </button>
        </div>
      )}
    </div>
  )
}
