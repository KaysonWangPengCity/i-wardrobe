import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Input, Card, CardContent, CardHeader, CardTitle, Label, Badge } from '@/components/ui'
import { useAppStore } from '@/store/app'
import { db } from '@/db/database'
import { seedMockData } from '@/lib/mockData'
import type { Settings as SettingsType } from '@/types'

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore()
  const navigate = useNavigate()
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locMsg, setLocMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) navigate('/', { replace: true })
  }, [settings, navigate])

  if (!settings) return null

  async function testConnection() {
    if (!settings!.apiKey) {
      setTestMsg('请先填写 API Key')
      return
    }
    setTesting(true)
    setTestMsg(null)
    try {
      const res = await fetch(
        settings!.apiProvider === 'openai'
          ? 'https://api.openai.com/v1/models'          : (settings!.apiBaseUrl || 'https://api.openai.com/v1') + '/models',
        { headers: { Authorization: `Bearer ${settings!.apiKey}` } },
      )
      if (res.ok) setTestMsg('✓ 连接成功')
      else setTestMsg(`✗ 错误 ${res.status}:${(await res.text()).slice(0, 100)}`)
    } catch (e) {
      setTestMsg(`✗ ${(e as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  async function useGeo() {
    setLocating(true)
    setLocMsg(null)
    try {
      const pos = await new Promise<{ lat: number; lon: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
          (err) => reject(new Error(err.message)),
          { timeout: 8000 },
        )
      })
      // 反查城市 — 用 Open-Meteo 的 geocoding 反向
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${pos.lat}&longitude=${pos.lon}&language=zh`,
      )
      const data = (await res.json()) as { results?: { name: string }[] }
      const city = data.results?.[0]?.name
      if (city) {
        await updateSettings({ location: city })
        setLocMsg(`✓ 已定位到 ${city}`)
      } else {
        setLocMsg('✓ 获取到坐标,但未能反查城市')
      }
    } catch (e) {
      setLocMsg(`✗ ${(e as Error).message}`)
    } finally {
      setLocating(false)
    }
  }

  async function exportData() {
    const items = await db.items.toArray()
    const outfits = await db.outfits.toArray()
    const wearLog = await db.wearLog.toArray()
    const profile = await db.styleProfile.get('default')
    const backup = {
      version: 1 as const,
      exportedAt: Date.now(),
      items: await Promise.all(items.map(async (it) => {
        const { imageBlob, thumbnailBlob, ...rest } = it
        return { ...rest }
      })),
      outfits,
      wearLog,
      styleProfile: profile,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wardrobe-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function clearAll() {
    if (!confirm('确定要清空所有数据吗?此操作不可恢复!')) return
    await Promise.all([
      db.items.clear(),
      db.outfits.clear(),
      db.wearLog.clear(),
    ])
    alert('已清空')
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-24">
      <h1 className="text-xl font-bold">设置</h1>

      {/* AI 服务 */}
      <Card>
        <CardHeader><CardTitle>AI 服务</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {import.meta.env.DEV && (
            <div className="rounded-md border border-dashed border-amber-400/50 bg-amber-50/30 p-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full border-amber-400 text-amber-700 hover:bg-amber-100"
                onClick={async () => {
                  const key = import.meta.env.VITE_TEST_API_KEY
                  const baseUrl = import.meta.env.VITE_TEST_API_BASE_URL
                  const provider = import.meta.env.VITE_TEST_API_PROVIDER as SettingsType['apiProvider'] | undefined
                  const visionModel = import.meta.env.VITE_TEST_VISION_MODEL
                  const textModel = import.meta.env.VITE_TEST_TEXT_MODEL
                  const location = import.meta.env.VITE_TEST_LOCATION
                  if (!key) {
                    alert('✗ 未配置 .env.local 的 VITE_TEST_API_KEY')
                    return
                  }
                  await updateSettings({
                    apiKey: key,
                    apiBaseUrl: baseUrl || '',
                    apiProvider: provider || 'custom',
                    visionModel: visionModel || '',
                    textModel: textModel || '',
                    location: location || '',
                  })
                  alert('✓ 开发配置已载入')
                }}
              >
                🧪 载入开发配置(从 .env.local)
              </Button>
            </div>
          )}
          <div>
            <Label>提供商</Label>
            <select
              value={settings.apiProvider}
              onChange={(e) => {
                const provider = e.target.value as SettingsType['apiProvider']
                const patch: Partial<SettingsType> = { apiProvider: provider }
                // 切换提供商时自动填默认模型
                if (provider === 'deepseek') {
                  patch.visionModel = 'deepseek-v4-flash-vision-exp'
                  patch.textModel = 'deepseek-v4-flash'
                } else if (provider === 'openai') {
                  patch.visionModel = 'gpt-4o-mini'
                  patch.textModel = 'gpt-4o-mini'
                } else if (provider === 'qwen') {
                  patch.visionModel = 'qwen-vl-plus'
                  patch.textModel = 'qwen-plus'
                } else if (provider === 'zhipu') {
                  patch.visionModel = 'glm-4v'
                  patch.textModel = 'glm-4-flash'
                }
                updateSettings(patch)
              }}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="qwen">通义 (DashScope)</option>
              <option value="zhipu">智谱 (BigModel)</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          {settings.apiProvider === 'custom' && (
            <div>
              <Label>API Base URL</Label>
              <Input
                value={settings.apiBaseUrl}
                onChange={(e) => updateSettings({ apiBaseUrl: e.target.value })}
                placeholder="https://your-api.com/v1  (代码会自动拼 /chat/completions)"
                className="mt-1 font-mono text-[12px]"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                👉 填到 <code className="px-1 rounded bg-muted">/v1</code> 为止。若不小心粘了完整 <code className="px-1 rounded bg-muted">/chat/completions</code> 后缀,代码会自动归一(不会双拼报错)
              </p>
            </div>
          )}
          <div>
            <Label>API Key</Label>
            <Input
              type="password"
              value={settings.apiKey}
              onChange={(e) => updateSettings({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="mt-1 font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>视觉模型</Label>
              <Input
                value={settings.visionModel}
                onChange={(e) => updateSettings({ visionModel: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>文本模型</Label>
              <Input
                value={settings.textModel}
                onChange={(e) => updateSettings({ textModel: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
              {testing ? '测试中...' : '测试连接'}
            </Button>
            {testMsg && <Badge variant="outline">{testMsg}</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* 位置 */}
      <Card>
        <CardHeader><CardTitle>位置</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={settings.location}
              onChange={(e) => updateSettings({ location: e.target.value })}
              placeholder="城市名,如 北京"
              className="flex-1"
            />
            <Button size="sm" variant="outline" onClick={useGeo} disabled={locating}>
              {locating ? '定位中...' : '📍 自动定位'}
            </Button>
          </div>
          {locMsg && <p className="text-xs text-muted-foreground">{locMsg}</p>}
        </CardContent>
      </Card>

      {/* 穿搭构成 */}
      <Card>
        <CardHeader><CardTitle>穿搭构成</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['上装', true],
              ['下装', true],
              ['外套(按天气)', true],
              ['鞋子', true],
            ].map(([label, _], i) => {
              const comp = settings.outfitComponents
              return (
                <label key={label as string} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={comp[i]}
                    onChange={(e) => {
                      const next = [...comp]
                      next[i] = e.target.checked
                      updateSettings({ outfitComponents: next })
                    }}
                  />
                  {label}
                </label>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 数据 */}
      <Card>
        <CardHeader><CardTitle>数据管理</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" variant="outline" className="w-full" onClick={async () => {
            await updateSettings({
              apiProvider: 'openai',
              apiKey: '',
              apiBaseUrl: '',
              visionModel: 'gpt-4o-mini',
              textModel: 'gpt-4o-mini',
            })
            alert('✓ 已清空 AI 配置,请手动填写你的 API Key 和模型名')
          }}>
            🧹 清空 AI 配置
          </Button>
          <Button size="sm" variant="outline" className="w-full" onClick={async () => {
            try {
              const n = await seedMockData()
              if (n > 0) alert(`✓ 已载入 ${n} 件示例衣物!去"今日"看看吧`)
              else alert('已取消或已有数据')
            } catch (e) {
              alert(`✗ 载入失败:${(e as Error).message}`)
            }
          }}>
            🎁 载入示例数据(测试用)
          </Button>
          <Button size="sm" variant="outline" className="w-full" onClick={exportData}>
            💾 导出备份
          </Button>
          <Button size="sm" variant="destructive" className="w-full" onClick={clearAll}>
            🗑 清空衣物与推荐记录
          </Button>
        </CardContent>
      </Card>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        v1.0 · 所有数据仅存本地,不会上传
      </p>
    </div>
  )
}
