// Domain types — 纯数据结构,不依赖任何库

export type Category = 'Top' | 'Bottom' | 'Outerwear' | 'Shoes'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Pattern = 'solid' | 'stripe' | 'plaid' | 'print'
export type Style = 'casual' | 'formal' | 'street' | 'business' | 'vintage' | 'sport' | 'minimal'
export type Feedback = 'liked' | 'disliked' | 'neutral'
export type EventType = 'worn' | 'dryCleaned' | 'discarded'

export interface Item {
  id: string
  imageBlob: Blob
  thumbnailBlob: Blob
  category: Category
  subCategory: string
  color: string
  colorHex: string
  season: Season[]
  thickness: number // 1-5
  pattern: Pattern
  style: Style[]
  brand?: string
  material?: string
  createdAt: number
  lastWornAt?: number
  wearCount: number
  affinityScore: number
  discarded: boolean
}

export interface Outfit {
  id: string
  date: string // YYYY-MM-DD
  itemIds: (string | null)[] // [top, bottom, outerwear, shoes]
  reason: string
  aiRanking: number
  weather: WeatherSnapshot
  feedback: Feedback
  worn: boolean
  createdAt: number
}

export interface WearLogEntry {
  id: string
  date: string
  itemIds: string[]
  eventType: EventType
  createdAt: number
}

export interface StyleProfile {
  id: 'default'
  preferredStyles: Style[]
  colorPalette: string[]
  avoidedColors: string[]
  warmthBias: number // 0-1
  notes: string
}

export type ApiProvider = 'openai' | 'qwen' | 'zhipu' | 'deepseek' | 'custom'

export interface Settings {
  id: 'default'
  apiKey: string
  apiProvider: ApiProvider
  apiBaseUrl: string
  visionModel: string
  textModel: string
  location: string
  units: 'metric' | 'imperial'
  notificationTime: string
  outfitComponents: boolean[] // [top, bottom, outerwear, shoes]
}

export interface WeatherCache {
  date: string
  location: string
  tempHi: number
  tempLo: number
  condition: string
  icon: string
  fetchedAt: number
}

export interface WeatherSnapshot {
  tempHi: number
  tempLo: number
  condition: string
  icon: string
}

export interface Weather extends WeatherSnapshot {
  location: string
  stale?: boolean
}

// ---- AI 相关 ----

export interface ItemTagResult {
  category: Category
  subCategory: string
  color: string
  colorHex: string
  season: Season[]
  thickness: number
  pattern: Pattern
  style: Style[]
  confidence: number
}

export interface OutfitCandidate {
  items: (Item | null)[] // [top, bottom, outerwear, shoes]
  ruleScore: number
  breakdown: {
    colorHarmony: number
    categoryFit: number
    rotationScore: number
    affinityScore: number
    styleMatch: number
  }
}

export interface RankedOutfit {
  candidate: OutfitCandidate
  aiIndex: number // 1-based, AI 排名
  reason: string
}

export interface BackupJSON {
  version: 1
  exportedAt: number
  items: Omit<Item, 'imageBlob' | 'thumbnailBlob'>[] // 导出时 blob 用 dataURL
  outfits: Outfit[]
  wearLog: WearLogEntry[]
  styleProfile: StyleProfile
  settings: Omit<Settings, 'apiKey'> // apiKey 不导出
}

/**
 * 今日推荐缓存记录（方案 1 · IndexedDB outfitCache 表）
 * 仅存 itemIds + 得分，绝不存 Blob，保证 DB 体积在 KB 级。
 * 主键 pk = `${YYYY-MM-DD}-${encodeURIComponent(location)}-${inputHash}`
 */
export interface OutfitCacheEntry {
  itemIds: (string | null)[] // [top, bottom, outerwear, shoes]
  ruleScore: number
  breakdown: {
    colorHarmony: number
    categoryFit: number
    rotationScore: number
    affinityScore: number
    styleMatch: number
  }
  aiIndex: number
  reason: string
}

export interface OutfitCacheRecord {
  pk: string
  date: string          // YYYY-MM-DD
  location: string
  inputHash: string
  outfits: OutfitCacheEntry[]
  generatedAt: number   // 24h TTL 依据
}
