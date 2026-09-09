import type { Category, Season, Pattern, Style } from '@/types'

export interface SubCategoryOpt {
  key: string
  label: string
  emoji: string
}

export const SUB_CATEGORY_MAP: Record<Category, SubCategoryOpt[]> = {
  Top: [
    { key: 't-shirt',     label: 'T恤',           emoji: '👕' },
    { key: 'shirt',       label: '衬衫',          emoji: '👔' },
    { key: 'hoodie',      label: '卫衣',          emoji: '🧥' },
    { key: 'sweater',     label: '毛衣/针织衫',     emoji: '🧶' },
    { key: 'polo',        label: 'POLO 衫',       emoji: '👕' },
    { key: 'tank',        label: '背心/吊带',      emoji: '🎽' },
    { key: 'blouse',      label: '雪纺/衬衫女',     emoji: '👚' },
  ],
  Bottom: [
    { key: 'jeans',       label: '牛仔裤',         emoji: '👖' },
    { key: 'chino',       label: '休闲裤',         emoji: '👖' },
    { key: 'trousers',    label: '西裤',           emoji: '👖' },
    { key: 'shorts',      label: '短裤',           emoji: '🩳' },
    { key: 'skirt',       label: '半裙',           emoji: '👗' },
    { key: 'dress-pants', label: '连衣裙/连体裤',   emoji: '👗' },
  ],
  Outerwear: [
    { key: 'denim-jacket',label: '牛仔外套',       emoji: '🧥' },
    { key: 'windbreaker', label: '风衣',           emoji: '🧥' },
    { key: 'blazer',      label: '西装',           emoji: '🧥' },
    { key: 'down',        label: '羽绒服',         emoji: '🧥' },
    { key: 'coat',        label: '毛呢大衣',        emoji: '🧥' },
    { key: 'cardigan',    label: '开衫',           emoji: '🧶' },
    { key: 'bomber',      label: '飞行员夹克',      emoji: '🧥' },
  ],
  Shoes: [
    { key: 'sneakers',    label: '运动鞋',         emoji: '👟' },
    { key: 'dress-shoes', label: '皮鞋',           emoji: '👞' },
    { key: 'boots',       label: '短靴/长靴',       emoji: '👢' },
    { key: 'sandals',     label: '凉鞋',           emoji: '🩴' },
    { key: 'heels',       label: '高跟鞋',          emoji: '👠' },
    { key: 'flats',       label: '平底鞋',          emoji: '👡' },
    { key: 'canvas',      label: '帆布鞋',          emoji: '👟' },
  ],
}

export const CATEGORY_LABEL: Record<Category, string> = {
  Top: '上装',
  Bottom: '下装',
  Outerwear: '外套',
  Shoes: '鞋子',
}

export const CATEGORY_OPTS: Category[] = ['Top', 'Bottom', 'Outerwear', 'Shoes']

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
export const SEASON_LABEL: Record<Season, string> = {
  spring: '春', summer: '夏', autumn: '秋', winter: '冬',
}

export const STYLES: Style[] = [
  'casual', 'formal', 'street', 'business', 'vintage', 'sport', 'minimal',
]
export const STYLE_LABEL: Record<Style, string> = {
  casual: '休闲', formal: '正式', street: '街头', business: '商务',
  vintage: '复古', sport: '运动', minimal: '极简',
}

export const PATTERNS: Pattern[] = ['solid', 'stripe', 'plaid', 'print']
export const PATTERN_LABEL: Record<Pattern, string> = {
  solid: '纯色', stripe: '条纹', plaid: '格纹', print: '印花',
}

/** 根据当前月份推断默认季节。北半球:3-4→春秋,5-7→夏,8-9→春秋,10-2/1-2→秋冬 */
export function defaultSeasonsForNow(): Season[] {
  const m = new Date().getMonth() + 1 // 1-12
  if (m === 1 || m === 2 || m === 10 || m === 11 || m === 12) return ['autumn', 'winter']
  if (m === 5 || m === 6 || m === 7) return ['summer']
  return ['spring', 'autumn'] // 3-4 8-9
}

/** 尝试把 AI 返回的自由文本 subCategory 匹配到常量 label/key;找不到返回 undefined */
export function matchSubCategory(
  category: Category,
  freeText: string | undefined,
): SubCategoryOpt | undefined {
  if (!freeText) return undefined
  const norm = freeText.trim().toLowerCase().replace(/[\s\-_/]/g, '')
  for (const opt of SUB_CATEGORY_MAP[category]) {
    const l = opt.label.toLowerCase().replace(/[\s\-_/]/g, '')
    const k = opt.key.toLowerCase().replace(/[\s\-_/]/g, '')
    if (l === norm || k === norm || l.includes(norm) || norm.includes(l)) return opt
  }
  return undefined
}
