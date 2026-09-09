import { db } from '@/db/database'
import { uuid, makeThumbnail } from '@/lib/image'
import type { Item, Category, Season, Style, Pattern } from '@/types'

interface MockCloth {
  category: Category
  subCategory: string
  color: string
  colorHex: string
  season: Season[]
  thickness: number
  pattern: Pattern
  style: Style[]
}

const MOCKS: MockCloth[] = [
  { category: 'Top', subCategory: '纯棉T恤', color: 'navy-blue', colorHex: '#1e3a5f', season: ['spring', 'summer'], thickness: 2, pattern: 'solid', style: ['casual', 'minimal'] },
  { category: 'Top', subCategory: '白色T恤', color: 'white', colorHex: '#f5f5f0', season: ['spring', 'summer'], thickness: 2, pattern: 'solid', style: ['casual', 'minimal'] },
  { category: 'Top', subCategory: '灰色卫衣', color: 'gray', colorHex: '#555555', season: ['autumn', 'winter'], thickness: 4, pattern: 'solid', style: ['casual', 'street'] },
  { category: 'Top', subCategory: '卡其衬衫', color: 'khaki', colorHex: '#b89968', season: ['spring', 'autumn'], thickness: 2, pattern: 'solid', style: ['business', 'casual'] },
  { category: 'Top', subCategory: '条纹衬衫', color: 'blue', colorHex: '#4a7ba7', season: ['spring', 'summer'], thickness: 2, pattern: 'stripe', style: ['casual', 'minimal'] },

  { category: 'Bottom', subCategory: '深色牛仔裤', color: 'navy-blue', colorHex: '#2d3748', season: ['spring', 'autumn', 'winter'], thickness: 3, pattern: 'solid', style: ['casual', 'street'] },
  { category: 'Bottom', subCategory: '卡其休闲裤', color: 'khaki', colorHex: '#a89560', season: ['spring', 'summer'], thickness: 2, pattern: 'solid', style: ['casual'] },
  { category: 'Bottom', subCategory: '黑色西裤', color: 'black', colorHex: '#1a1a1a', season: ['spring', 'autumn', 'winter'], thickness: 3, pattern: 'solid', style: ['business', 'formal'] },
  { category: 'Bottom', subCategory: '米色短裤', color: 'beige', colorHex: '#d4c5a9', season: ['summer'], thickness: 1, pattern: 'solid', style: ['casual'] },

  { category: 'Outerwear', subCategory: '牛仔外套', color: 'blue', colorHex: '#3a5a7c', season: ['spring', 'autumn'], thickness: 3, pattern: 'solid', style: ['casual', 'street'] },
  { category: 'Outerwear', subCategory: '卡其风衣', color: 'khaki', colorHex: '#a08060', season: ['spring', 'autumn'], thickness: 3, pattern: 'solid', style: ['business', 'minimal'] },
  { category: 'Outerwear', subCategory: '黑色羽绒服', color: 'black', colorHex: '#0d0d0d', season: ['winter'], thickness: 5, pattern: 'solid', style: ['casual'] },

  { category: 'Shoes', subCategory: '白色运动鞋', color: 'white', colorHex: '#ffffff', season: ['spring', 'summer', 'autumn'], thickness: 2, pattern: 'solid', style: ['casual', 'sport'] },
  { category: 'Shoes', subCategory: '黑色皮鞋', color: 'black', colorHex: '#111111', season: ['spring', 'autumn', 'winter'], thickness: 3, pattern: 'solid', style: ['business', 'formal'] },
  { category: 'Shoes', subCategory: '棕色短靴', color: 'brown', colorHex: '#6b4226', season: ['autumn', 'winter'], thickness: 3, pattern: 'solid', style: ['casual', 'street'] },
]

// 纯色 canvas 生成占位图 Blob
async function makeColorBlob(hex: string, size = 400): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, size, size)
  // 画点装饰线条让它不像一整片纯色
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 4
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.moveTo(0, (size / 5) * i + 40)
    ctx.lineTo(size, (size / 5) * i + 40)
    ctx.stroke()
  }
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85)
  })
}

export async function seedMockData(): Promise<number> {
  // 检查是否已有数据
  const existing = await db.items.count()
  if (existing > 0) {
    const ok = confirm(`衣橱已有 ${existing} 件衣物,继续添加示例数据?`)
    if (!ok) return 0
  }

  const now = Date.now()
  let count = 0
  for (const m of MOCKS) {
    try {
      const imageBlob = await makeColorBlob(m.colorHex)
      const thumbnailBlob = await makeThumbnail(imageBlob, 200)
      const item: Item = {
        id: uuid(),
        imageBlob,
        thumbnailBlob,
        category: m.category,
        subCategory: m.subCategory,
        color: m.color,
        colorHex: m.colorHex,
        season: m.season,
        thickness: m.thickness,
        pattern: m.pattern,
        style: m.style,
        createdAt: now,
        // lastWornAt 显式不要赋值:undefined 不是合法IndexedDB键,缺省才会被索引跳过
        wearCount: 0,
        affinityScore: 0,
        discarded: false,
      }
      await db.items.add(item)
      count++
      // eslint-disable-next-line no-console
      console.log(`[mock] +1 ${item.subCategory} (${item.category})`)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[mock] failed for', m.subCategory, e)
      throw e
    }
  }
  return count
}
