import { useMemo } from 'react'
import { Card, CardContent, Input, Label } from '@/components/ui'
import type { Category, ItemTagResult, Pattern, Season, Style } from '@/types'
import {
  CATEGORY_LABEL,
  CATEGORY_OPTS,
  PATTERNS,
  PATTERN_LABEL,
  SEASONS,
  SEASON_LABEL,
  STYLES,
  STYLE_LABEL,
  SUB_CATEGORY_MAP,
  matchSubCategory,
} from '@/constants/category'

export interface ItemFormProps {
  form: Partial<ItemTagResult>
  setForm: (patch: Partial<ItemTagResult>) => void
  /** 拍照模式下,AI 已经识别了 subCategory,会自动尝试匹配到下拉项;找不到允许自由输入 */
  allowCustomSubCategory?: boolean
}

export function ItemForm({ form, setForm, allowCustomSubCategory = true }: ItemFormProps) {
  const category = (form.category as Category | undefined) ?? 'Top'

  // 当前 category 对应的子分类列表;加上"自定义…"兜底
  const subList = useMemo(() => SUB_CATEGORY_MAP[category], [category])

  // 尝试把 form.subCategory(自由文本)匹配到列表项
  const matchedOpt = useMemo(
    () => matchSubCategory(category, form.subCategory),
    [category, form.subCategory],
  )
  const customSelected = allowCustomSubCategory && !!form.subCategory && !matchedOpt
  const selectedKey = customSelected ? '__custom' : matchedOpt?.key ?? subList[0]?.key ?? '__custom'

  function onCategoryClick(c: Category) {
    // 切换 category → 重置 subCategory 为新大类第一项
    const first = SUB_CATEGORY_MAP[c][0]
    setForm({
      ...form,
      category: c,
      subCategory: first?.label ?? '',
    })
  }

  function onSubCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const key = e.target.value
    if (key === '__custom') {
      // 保留已有 subCategory(如果有),否则空字符串让用户自己填
      setForm({ ...form, subCategory: customSelected ? (form.subCategory ?? '') : '' })
    } else {
      const opt = subList.find((o) => o.key === key)
      if (opt) setForm({ ...form, subCategory: opt.label })
    }
  }

  function toggleSeason(s: Season) {
    const current = (form.season as Season[]) || []
    setForm({
      ...form,
      season: current.includes(s) ? current.filter((x) => x !== s) : [...current, s],
    })
  }

  function toggleStyle(s: Style) {
    const current = (form.style as Style[]) || []
    setForm({
      ...form,
      style: current.includes(s) ? current.filter((x) => x !== s) : [...current, s],
    })
  }

  function onPatternChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setForm({ ...form, pattern: e.target.value as Pattern })
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        {/* 品类 */}
        <div>
          <Label>品类</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {CATEGORY_OPTS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => onCategoryClick(c)}
                className={
                  'rounded-md border px-3 py-2 text-sm transition-colors ' +
                  (category === c
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent')
                }
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {/* 子品类(联动下拉 + 自定义兜底) */}
        <div>
          <Label>具体品类</Label>
          <div className="mt-1 grid grid-cols-1 gap-2">
            <select
              value={selectedKey}
              onChange={onSubCategoryChange}
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {subList.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.emoji} {o.label}
                </option>
              ))}
              {allowCustomSubCategory && (
                <option value="__custom">其他(自定义)…</option>
              )}
            </select>
            {(selectedKey === '__custom' || customSelected) && (
              <Input
                value={form.subCategory || ''}
                onChange={(e) => setForm({ ...form, subCategory: e.target.value })}
                placeholder="手动填写子品类,如「纯棉T恤」"
              />
            )}
          </div>
        </div>

        {/* 颜色 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>颜色</Label>
            <Input
              value={form.color || ''}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              placeholder="如 navy-blue"
              className="mt-1"
            />
          </div>
          <div>
            <Label>色值</Label>
            <Input
              type="color"
              value={form.colorHex || '#cccccc'}
              onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
              className="mt-1 h-9 p-1"
            />
          </div>
        </div>

        {/* 图案(新增) */}
        <div>
          <Label>图案</Label>
          <select
            value={(form.pattern as Pattern) || 'solid'}
            onChange={onPatternChange}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {PATTERNS.map((p) => (
              <option key={p} value={p}>{PATTERN_LABEL[p]}</option>
            ))}
          </select>
        </div>

        {/* 厚度 */}
        <div>
          <Label>厚度 ({form.thickness ?? 2}/5)</Label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={form.thickness ?? 2}
            onChange={(e) => setForm({ ...form, thickness: Number(e.target.value) })}
            className="mt-2 w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>薄(1)</span><span>中(3)</span><span>厚(5)</span>
          </div>
        </div>

        {/* 季节 */}
        <div>
          <Label>季节(可多选)</Label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {SEASONS.map((s) => {
              const picked = ((form.season as Season[]) || []).includes(s)
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSeason(s)}
                  className={
                    'rounded-md border px-2 py-2 text-sm transition-colors ' +
                    (picked
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'hover:bg-accent')
                  }
                >
                  {SEASON_LABEL[s]}
                </button>
              )
            })}
          </div>
        </div>

        {/* 风格 */}
        <div>
          <Label>风格(可多选)</Label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {STYLES.map((s) => {
              const picked = ((form.style as Style[]) || []).includes(s)
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleStyle(s)}
                  className={
                    'rounded-md border px-2 py-2 text-xs transition-colors ' +
                    (picked
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'hover:bg-accent')
                  }
                >
                  {STYLE_LABEL[s]}
                </button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ItemForm
