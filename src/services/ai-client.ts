import type { Settings, ApiProvider } from '@/types'

export function resolveEndpoint(provider: ApiProvider, baseUrl: string | undefined): string {
  if (baseUrl) {
    // 防御性规范化:用户常把完整 /chat/completions 或末尾斜杠粘进来,自动归一避免双拼
    let u = baseUrl.replace(/\/$/, '')
    if (u.endsWith('/chat/completions')) u = u.slice(0, -'/chat/completions'.length)
    if (u.endsWith('/v1/chat')) u = u.slice(0, -'/chat'.length)
    return u + '/chat/completions'
  }
  switch (provider) {
    case 'openai': return 'https://api.openai.com/v1/chat/completions'
    case 'qwen': return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    case 'zhipu': return 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    case 'deepseek': return 'https://api.deepseek.com/v1/chat/completions'
    case 'custom': throw new Error('自定义提供商需填写 API Base URL')
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  model: string
  messages: ChatMessage[]
  responseFormat?: 'json_object'
  maxTokens?: number
}

export async function callChatCompletion(
  settings: Settings,
  opts: ChatCompletionOptions,
): Promise<string> {
  if (!settings.apiKey) throw new Error('未配置 API Key')
  const endpoint = resolveEndpoint(settings.apiProvider, settings.apiBaseUrl || undefined)

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  }
  if (opts.responseFormat) body.response_format = { type: opts.responseFormat }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI 接口错误 ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

export async function callVisionCompletion(
  settings: Settings,
  systemPrompt: string,
  imageBase64: string,
  jsonSchemaHint?: string,
): Promise<string> {
  if (!settings.apiKey) throw new Error('未配置 API Key')
  const endpoint = resolveEndpoint(settings.apiProvider, settings.apiBaseUrl || undefined)

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: jsonSchemaHint ?? '请识别这件衣物。' },
        { type: 'image_url' as const, image_url: { url: imageBase64 } },
      ],
    },
  ]

  const body: Record<string, unknown> = {
    model: settings.visionModel,
    messages,
    max_tokens: 800,
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI 视觉接口错误 ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}
