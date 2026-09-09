import type { ItemTagResult, Settings } from '@/types'
import { callVisionCompletion } from './ai-client'

const SYSTEM_PROMPT = `你是一名专业的服装识别助手。你将收到一张衣物单品的照片。请准确识别它并严格按照 JSON 格式输出结果。`

const USER_HINT = `请识别这件衣物,输出严格 JSON(不要 markdown,不要解释):
{
  "category": "Top|Bottom|Outerwear|Shoes",
  "subCategory": "具体品类(如 T恤|衬衫|牛仔裤|西装|连衣裙|外套|风衣|运动鞋|皮鞋)",
  "color": "主色英文名(如 navy-blue|khaki|white|black|red)",
  "colorHex": "#rrggbb 主色十六进制",
  "season": ["spring","summer","autumn","winter"] 可多选,
  "thickness": 1-5 (1=极薄,5=极厚),
  "pattern": "solid|stripe|plaid|print",
  "style": ["casual|formal|street|business|vintage|sport|minimal"] 可多选,
  "confidence": 0-1 对整体识别结果的置信度
}
注意:category 只允许 Top(上装)、Bottom(下装)、Outerwear(外套)、Shoes(鞋子)四个值。`

function extractJson(text: string): string {
  // LLM 可能包 ```json ```,去掉
  let s = text.trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')
  // 找第一个 { 到最后一个 }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('AI 返回中没找到 JSON')
  return s.slice(start, end + 1)
}

export async function tagImage(
  settings: Settings,
  imageBase64: string,
): Promise<ItemTagResult> {
  const raw = await callVisionCompletion(settings, SYSTEM_PROMPT, imageBase64, USER_HINT)
  const jsonStr = extractJson(raw)
  const parsed = JSON.parse(jsonStr) as Partial<ItemTagResult>

  // 补默认值
  return {
    category: (parsed.category as ItemTagResult['category']) ?? 'Top',
    subCategory: parsed.subCategory ?? '未知',
    color: parsed.color ?? 'unknown',
    colorHex: parsed.colorHex ?? '#cccccc',
    season: parsed.season ?? ['spring', 'summer'],
    thickness: parsed.thickness ?? 2,
    pattern: (parsed.pattern as ItemTagResult['pattern']) ?? 'solid',
    style: parsed.style ?? ['casual'],
    confidence: parsed.confidence ?? 0.5,
  }
}
