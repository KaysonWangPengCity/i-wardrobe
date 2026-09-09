import type { OutfitCandidate, RankedOutfit, Settings, Weather, StyleProfile, WearLogEntry } from '@/types'
import { callChatCompletion } from './ai-client'

function buildPrompt(
  candidates: OutfitCandidate[],
  weather: Weather,
  style: StyleProfile,
  recentWearLog: WearLogEntry[],
): { system: string; user: string } {
  const summary = candidates.map((c, i) => {
    const labels = c.items.map((it) => {
      if (!it) return 'null'
      return `${it.category}(${it.subCategory}, ${it.color}, ${it.style.join('/')})`
    }).join(' + ')
    return `${i + 1}. ${labels}  [规则分:${c.ruleScore.toFixed(2)}]`
  }).join('\n')

  const recent = recentWearLog
    .slice(-7)
    .map((w) => `${w.date}: ${w.itemIds.length}件`)
    .join(', ') || '(无)'

  return {
    system: '你是一名穿搭顾问。你需要从给定候选中选出最优 3 套穿搭,并给每套一句中文推荐理由。严格按 JSON 输出。',
    user: `今天天气:${weather.condition}, ${weather.tempHi}°/${weather.tempLo}°, ${weather.location}。
候选穿搭共 ${candidates.length} 套:
${summary}
用户风格偏好:prefer ${style.preferredStyles.join(',') || '无特别偏好'}${style.avoidedColors.length ? `, avoid colors: ${style.avoidedColors.join(',')}` : ''}, warmth bias ${style.warmthBias}。
用户备注:${style.notes || '(无)'}
近 7 天穿着:${recent}

请输出严格 JSON(不要 markdown):
{
  "ranked": [
    { "index": 候选编号从1开始, "reason": "一句中文理由" },
    ... 共 3 套
  ],
  "bestMatch": 最优那套的候选编号
}`,
  }
}

export async function rankOutfits(
  settings: Settings,
  candidates: OutfitCandidate[],
  weather: Weather,
  style: StyleProfile,
  recentWearLog: WearLogEntry[],
): Promise<RankedOutfit[]> {
  if (candidates.length === 0) return []
  if (candidates.length === 1) {
    return [{ candidate: candidates[0], aiIndex: 1, reason: '唯一可选' }]
  }

  const { system, user } = buildPrompt(candidates, weather, style, recentWearLog)

  const raw = await callChatCompletion(settings, {
    model: settings.textModel,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })

  let parsed: { ranked?: { index: number; reason: string }[] }
  try {
    let s = raw.trim()
    if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')
    parsed = JSON.parse(s)
  } catch {
    // 解析失败,回退到规则分排序
    return candidates
      .slice()
      .sort((a, b) => b.ruleScore - a.ruleScore)
      .map((c, i) => ({ candidate: c, aiIndex: i + 1, reason: '规则分最优(AI 解析失败)' }))
  }

  if (!parsed.ranked || parsed.ranked.length === 0) {
    return candidates
      .slice()
      .sort((a, b) => b.ruleScore - a.ruleScore)
      .map((c, i) => ({ candidate: c, aiIndex: i + 1, reason: '规则分最优' }))
  }

  return parsed.ranked
    .map((r) => {
      const idx = r.index - 1
      const candidate = candidates[idx]
      return candidate ? { candidate, aiIndex: r.index, reason: r.reason } : null
    })
    .filter((x): x is RankedOutfit => x !== null)
}
