import { create } from 'zustand'
import type { Settings, StyleProfile } from '@/types'
import { db, ensureDefaults } from '@/db/database'

interface AppState {
  settings: Settings | null
  styleProfile: StyleProfile | null
  ready: boolean
  init: () => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  updateStyleProfile: (patch: Partial<StyleProfile>) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  styleProfile: null,
  ready: false,

  init: async () => {
    await ensureDefaults()
    const [s, p] = await Promise.all([
      db.settings.get('default'),
      db.styleProfile.get('default'),
    ])
    set({ settings: s ?? null, styleProfile: p ?? null, ready: true })
  },

  updateSettings: async (patch) => {
    const current = get().settings
    if (!current) return
    const next = { ...current, ...patch }
    await db.settings.put(next)
    set({ settings: next })
  },

  updateStyleProfile: async (patch) => {
    const current = get().styleProfile
    if (!current) return
    const next = { ...current, ...patch }
    await db.styleProfile.put(next)
    set({ styleProfile: next })
  },
}))
