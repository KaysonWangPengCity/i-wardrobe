import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ArrowLeft } from 'lucide-react'
import { db } from '@/db/database'
import type { Item, Category, ItemTagResult } from '@/types'
import { Badge, Card, CardContent } from '@/components/ui'
import { Button } from '@/components/Button'
import { ItemForm } from '@/components/ItemForm'
import { useModal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useImagePreview } from '@/components/ui/ImagePreview'
import { cn } from '@/lib/utils'

const CATEGORIES: (Category | 'All')[] = ['All', 'Top', 'Bottom', 'Outerwear', 'Shoes']

export default function WardrobePage() {
  const [items, setItems] = useState<Item[]>([])
  const [filter, setFilter] = useState<Category | 'All'>('All')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    load()
    const iv = setInterval(load, 3000)
    return () => clearInterval(iv)
  }, [])

  async function load() {
    const all = (await db.items.toArray()).filter((it) => !it.discarded)
    setItems(all)
  }

  const filtered = useMemo(
    () => filter === 'All' ? items : items.filter((it) => it.category === filter),
    [items, filter],
  )

  const editingItem = useMemo(() => items.find((it) => it.id === editingId) || null, [items, editingId])

  // ============ 全屏编辑态 ============
  if (editingItem) {
    return <EditFull item={editingItem} onBack={() => setEditingId(null)} onChanged={load} />
  }

  // ============ 网格列表态 ============
  return (
    <div className="mx-auto max-w-md pb-24">
      {/* Sticky header: 标题 + 筛选 */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-4">
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
      </div>

      {/* 内容区 */}
      <div className="px-4">
        {filtered.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-center text-muted-foreground">
            <p className="mb-2">衣橱里还没有衣服</p>
            <Link to="/capture" className="text-primary underline">📷 去拍照入库</Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((it) => (
              <ItemCard key={it.id} item={it} onChanged={load} onEdit={(id) => setEditingId(id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============ 全屏编辑组件 ============
function EditFull({ item, onBack, onChanged }: { item: Item; onBack: () => void; onChanged: () => void }) {
  const [form, setForm] = useState<Partial<ItemTagResult>>({})
  const [url, setUrl] = useState<string | null>(null)
  const imagePreview = useImagePreview()

  useEffect(() => {
    setForm({
      category: item.category,
      subCategory: item.subCategory,
      color: item.color,
      colorHex: item.colorHex,
      season: item.season,
      thickness: item.thickness,
      pattern: item.pattern,
      style: item.style,
    })
  }, [item.id])

  useEffect(() => {
    const u = URL.createObjectURL(item.thumbnailBlob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [item.thumbnailBlob])

  async function save() {
    await db.items.update(item.id, {
      category: form.category as Category,
      subCategory: form.subCategory || item.subCategory,
      color: form.color || item.color,
      colorHex: form.colorHex || item.colorHex,
      season: (form.season as Item['season']) || item.season,
      thickness: typeof form.thickness === 'number' ? form.thickness : item.thickness,
      pattern: form.pattern || item.pattern,
      style: (form.style as Item['style']) || item.style,
    })
    onBack()
    onChanged()
  }

  return (
    <div className="mx-auto max-w-md pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-4 pb-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold">编辑衣物</h1>
      </div>

      {/* 内容区 */}
      <div className="px-4">
        {/* 大图预览 */}
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="flex gap-3">
              <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                {url && (
                  <div
                    role="button"
                    aria-label={`${item.subCategory} · ${item.color}`}
                    className="h-full w-full cursor-zoom-in select-none bg-cover bg-center [-webkit-touch-callout:none]"
                    style={{ backgroundImage: `url(${url})` }}
                    onClick={() => imagePreview.open(url, `${item.subCategory} · ${item.color}`)}
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col justify-center text-sm">
                <div className="font-medium">{item.subCategory}</div>
                <div className="text-muted-foreground">{item.color} · {item.style.join('/')}</div>
                <div className="mt-1 text-xs text-muted-foreground">厚度 {item.thickness}/5 · 穿 {item.wearCount} 次</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 编辑表单 */}
        <ItemForm form={form} setForm={setForm} />

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack}>取消</Button>
          <Button className="flex-1" onClick={save}>保存修改</Button>
        </div>
      </div>
    </div>
  )
}

// ============ 网格卡片组件 ============
function ItemCard({
  item,
  onChanged,
  onEdit,
}: {
  item: Item
  onChanged: () => void
  onEdit: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const modal = useModal()
  const toast = useToast()
  const imagePreview = useImagePreview()

  useEffect(() => {
    const u = URL.createObjectURL(item.thumbnailBlob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [item.thumbnailBlob])

  async function discard() {
    const ok = await modal.confirm(
      `标记「丢弃」${item.subCategory} ${item.color}？`,
      { title: '丢弃衣物', confirmText: '丢弃', destructive: true },
    )
    if (!ok) return
    await db.items.update(item.id, { discarded: true })
    onChanged()
    toast('已丢弃 ✓', 'success')
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <button className="block w-full text-left" onClick={() => setExpanded((e) => !e)}>
        <div className="aspect-square w-full bg-muted">
          {url ? (
            <div
              role="button"
              aria-label={`${item.subCategory} · ${item.color}`}
              className="h-full w-full cursor-zoom-in select-none bg-cover bg-center [-webkit-touch-callout:none]"
              style={{ backgroundImage: `url(${url})` }}
              onClick={(e) => { e.stopPropagation(); imagePreview.open(url, `${item.subCategory} · ${item.color}`) }}
            />
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
        <div className="border-t p-2 space-y-1">
          <div className="text-[11px] text-muted-foreground">
            厚度 {item.thickness}/5 · 季:{item.season.join(',')}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onEdit(item.id)}
              className="flex-1 rounded bg-primary/10 p-1 text-[10px] text-primary hover:bg-primary/20"
            >
              ✏️ 编辑
            </button>
            <button
              onClick={discard}
              className="flex-1 rounded bg-destructive/10 p-1 text-[10px] text-destructive hover:bg-destructive/20"
            >
              丢弃
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
