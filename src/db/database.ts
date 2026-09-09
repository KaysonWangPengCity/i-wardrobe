import Dexie, { type Table } from 'dexie'
import type {
  Item, Outfit, WearLogEntry, StyleProfile, Settings, WeatherCache, OutfitCacheRecord,
} from '@/types'

export class WardrobeDB extends Dexie {
  items!: Table<Item, string>
  outfits!: Table<Outfit, string>
  wearLog!: Table<WearLogEntry, string>
  styleProfile!: Table<StyleProfile, string>
  settings!: Table<Settings, string>
  weatherCache!: Table<WeatherCache, string>
  outfitCache!: Table<OutfitCacheRecord, string>

  constructor() {
    super('wardrobe-db')
    // v2: 移除 discarded(布尔键兼容性差)、season(数组/未使用)、lastWornAt(可选/未使用) 索引
    //     避免 IndexedDB IDBKeyRange.bound() 因非法键类型抛错
    this.version(2).stores({
      items: 'id, category, color, createdAt, affinityScore',
      outfits: 'id, date, feedback, worn',
      wearLog: 'id, date, eventType',
      styleProfile: 'id', // 单条
      settings: 'id', // 单条
      weatherCache: 'date, location, fetchedAt',
    })
    // v3: 新增今日推荐缓存表 outfitCache
    this.version(3).stores({
      items:        'id, category, color, createdAt, affinityScore', // 不变
      outfits:      'id, date, feedback, worn',                       // 不变
      wearLog:      'id, date, eventType',                            // 不变
      styleProfile: 'id',                                              // 不变
      settings:     'id',                                              // 不变
      weatherCache: 'date, location, fetchedAt',                       // 不变
      outfitCache:  'pk, date, generatedAt',                           // ✨ 新增
    })
  }
}

export const db = new WardrobeDB()

// 确保 settings / styleProfile 存在
export async function ensureDefaults(): Promise<void> {
  await db.settings.get('default').then(async (s) => {
    if (!s) {
      await db.settings.put({
        id: 'default',
        apiKey: '',
        apiProvider: 'openai',
        apiBaseUrl: '',
        visionModel: 'gpt-4o-mini',
        textModel: 'gpt-4o-mini',
        location: '',
        units: 'metric',
        notificationTime: '07:30',
        outfitComponents: [true, true, true, true],
      })
    }
  })
  await db.styleProfile.get('default').then(async (s) => {
    if (!s) {
      await db.styleProfile.put({
        id: 'default',
        preferredStyles: ['casual'],
        colorPalette: [],
        avoidedColors: [],
        warmthBias: 0.5,
        notes: '',
      })
    }
  })
}
