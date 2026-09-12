import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Card, CardContent, Label } from '@/components/ui'
import { ItemForm } from '@/components/ItemForm'
import { useAppStore } from '@/store/app'
import { db } from '@/db/database'
import { useToast } from '@/components/ui/Toast'
import { tagImage } from '@/services/tagService'
import { uuid, blobToDataURL, resizeImage, makeThumbnail } from '@/lib/image'
import { makePlaceholderBlob, drawPlaceholderPreview } from '@/lib/placeholder'
import { SUB_CATEGORY_MAP, matchSubCategory, defaultSeasonsForNow } from '@/constants/category'
import type { Item, ItemTagResult, Category, Season, Style, Pattern } from '@/types'

type Mode = 'photo' | 'manual'
type Step = 'idle' | 'preview' | 'tagging' | 'confirm'

type FormState = Partial<ItemTagResult>

const DEFAULT_COLOR = 'navy-blue'
const DEFAULT_COLOR_HEX = '#1e3a8a'
const DEFAULT_THICKNESS = 2
const DEFAULT_PATTERN: Pattern = 'solid'
const DEFAULT_STYLE: Style[] = ['casual']

/**
 * 将不完整的 form(不管来自拍照识别还是手动填写)补齐为入库可用的一组默认值。
 * 返回一个新对象,不修改原 form。
 */
function finalizeFormDefaults(form: FormState): Required<Omit<FormState, 'confidence'>> & { confidence?: number } {
  const category: Category = (form.category as Category) || 'Top'
  const subList = SUB_CATEGORY_MAP[category]
  const firstSub = subList[0]
  // 优先用 form.subCategory 精确匹配到的 label,否则用已有的自由文本,再否则第一项
  let subCategory = form.subCategory?.trim() || ''
  if (!subCategory) subCategory = firstSub?.label || '未知'
  const season: Season[] = (form.season as Season[]) || defaultSeasonsForNow()
  const style: Style[] = (form.style as Style[]) || DEFAULT_STYLE
  return {
    category,
    subCategory,
    color: form.color?.trim() || DEFAULT_COLOR,
    colorHex: form.colorHex || DEFAULT_COLOR_HEX,
    season: season.length > 0 ? season : defaultSeasonsForNow(),
    thickness: typeof form.thickness === 'number' ? Math.max(1, Math.min(5, form.thickness)) : DEFAULT_THICKNESS,
    pattern: (form.pattern as Pattern) || DEFAULT_PATTERN,
    style: style.length > 0 ? style : DEFAULT_STYLE,
    confidence: form.confidence,
  }
}

export default function CapturePage() {
  const { settings } = useAppStore()
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryFileRef = useRef<HTMLInputElement>(null)
  const manualFileRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const [mode, setMode] = useState<Mode>('photo')
  const [step, setStep] = useState<Step>('idle')

  // 图片
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  // 手动模式下是否选了真实图片(vs 用占位生成器)
  const [manualRealImage, setManualRealImage] = useState(false)

  // AI + form
  const [tagged, setTagged] = useState<ItemTagResult | null>(null)
  const [form, setForm] = useState<FormState>({})
  const [error, setError] = useState<string | null>(null)

  // 当切换 mode,重置一切
  function resetAll() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageBlob(null)
    setPreviewUrl(null)
    setManualRealImage(false)
    setTagged(null)
    setError(null)
    if (mode === 'photo') {
      setStep('idle')
      setForm({})
    } else {
      // 手动模式,进入 confirm 并预填默认
      setStep('confirm')
      const cat: Category = 'Top'
      const first = SUB_CATEGORY_MAP[cat][0]
      setForm({
        category: cat,
        subCategory: first?.label || '',
        color: DEFAULT_COLOR,
        colorHex: DEFAULT_COLOR_HEX,
        season: defaultSeasonsForNow(),
        thickness: DEFAULT_THICKNESS,
        pattern: DEFAULT_PATTERN,
        style: [...DEFAULT_STYLE],
      })
    }
  }

  // mode 变化时重置
  useEffect(() => {
    resetAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // 手动模式下:form.colorHex 或 子分类 变化 → 重绘 canvas 预览
  useEffect(() => {
    if (mode !== 'manual' || manualRealImage) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const finalized = finalizeFormDefaults(form)
    const matched = matchSubCategory(finalized.category, finalized.subCategory)
    const emoji = matched?.emoji ?? '👕'
    drawPlaceholderPreview(canvas, finalized.colorHex, emoji, finalized.subCategory, 480)
  }, [mode, manualRealImage, form.colorHex, form.subCategory, form.category])

  // --- 拍照模式流程 ---
  function pickPhotoFile() { fileRef.current?.click() }
  function pickGalleryFile() { galleryFileRef.current?.click() }

  async function onPhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const resized = await resizeImage(file, 1280)
    const url = URL.createObjectURL(resized)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageBlob(resized)
    setPreviewUrl(url)
    setStep('preview')
    setTagged(null)
    setForm({})
  }

  async function startTagging() {
    if (!imageBlob || !settings) return
    if (!settings.apiKey) {
      toast('请先到"设置"页填写 API Key', 'error')
      navigate('/settings')
      return
    }
    setStep('tagging')
    setError(null)
    try {
      const dataUrl = await blobToDataURL(imageBlob)
      const result = await tagImage(settings, dataUrl)
      setTagged(result)
      // 预填表单
      const patch: FormState = {
        category: result.category,
        subCategory: result.subCategory,
        color: result.color,
        colorHex: result.colorHex,
        season: result.season,
        thickness: result.thickness,
        pattern: result.pattern,
        style: result.style,
        confidence: result.confidence,
      }
      setForm(patch)
      setStep('confirm')
    } catch (e) {
      setError(`AI 识别失败:${(e as Error).message}`)
      // 失败也允许手动填
      setTagged(null)
      // 至少给个默认 category + season
      setForm({
        category: 'Top',
        subCategory: SUB_CATEGORY_MAP.Top[0]?.label || '',
        color: DEFAULT_COLOR,
        colorHex: DEFAULT_COLOR_HEX,
        season: defaultSeasonsForNow(),
        thickness: DEFAULT_THICKNESS,
        pattern: DEFAULT_PATTERN,
        style: [...DEFAULT_STYLE],
      })
      setStep('confirm')
    }
  }

  // --- 手动模式:可选图片上传 ---
  function pickManualFile() { manualFileRef.current?.click() }
  async function onManualFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const resized = await resizeImage(file, 1280)
    const url = URL.createObjectURL(resized)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageBlob(resized)
    setPreviewUrl(url)
    setManualRealImage(true)
  }
  function clearManualImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageBlob(null)
    setPreviewUrl(null)
    setManualRealImage(false)
  }

  // --- 保存(双模式共用,imageBlob 来源分支) ---
  async function saveItem() {
    // 1. 先补齐默认值
    const finalized = finalizeFormDefaults(form)

    // 2. 硬校验(最少必填)
    if (!finalized.category) { toast('请选择品类', 'error'); return }
    if (!finalized.color) { toast('请填写颜色', 'error'); return }
    if (!finalized.colorHex) { toast('请选择颜色色值', 'error'); return }

    // 3. 决定 imageBlob 来源
    let finalBlob: Blob
    if (mode === 'photo') {
      if (!imageBlob) { toast('请先选择或拍摄图片', 'error'); return }
      finalBlob = imageBlob
    } else {
      // 手动模式
      if (imageBlob && manualRealImage) {
        finalBlob = imageBlob
      } else {
        // 调用占位生成器
        const matched = matchSubCategory(finalized.category, finalized.subCategory)
        try {
          finalBlob = await makePlaceholderBlob(
            finalized.colorHex,
            matched?.emoji ?? '👕',
            finalized.subCategory,
            640,
          )
        } catch (e) {
          toast(`生成占位图失败:${(e as Error).message}`, 'error')
          return
        }
      }
    }

    // 4. 缩略图
    let thumbnail: Blob
    try {
      thumbnail = await makeThumbnail(finalBlob, 200)
    } catch (e) {
      toast(`生成缩略图失败:${(e as Error).message}`, 'error')
      return
    }

    // 5. 入库
    const now = Date.now()
    const item: Item = {
      id: uuid(),
      imageBlob: finalBlob,
      thumbnailBlob: thumbnail,
      category: finalized.category,
      subCategory: finalized.subCategory,
      color: finalized.color,
      colorHex: finalized.colorHex,
      season: finalized.season,
      thickness: finalized.thickness,
      pattern: finalized.pattern,
      style: finalized.style,
      createdAt: now,
      wearCount: 0,
      affinityScore: 0,
      discarded: false,
    }
    await db.items.add(item)
    toast('已加入衣橱!', 'success')
    navigate('/wardrobe')
  }

  // --- UI ---
  return (
    <div className="mx-auto max-w-md pb-24">
      {/* Sticky header: 标题 + Tab */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-4 pb-3">
        <h1 className="mb-3 text-xl font-bold">入库</h1>
        <div className="flex rounded-lg bg-background p-1 border">
          <button
            type="button"
            onClick={() => setMode('photo')}
            className={
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
              (mode === 'photo' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')
            }
          >
            📷 拍照入库
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
              (mode === 'manual' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')
            }
          >
            ✏️ 手动录入
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="px-4">
      {/* 隐藏的 file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPhotoFileChange}
      />
      <input
        ref={galleryFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPhotoFileChange}
      />
      <input
        ref={manualFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onManualFileChange}
      />

      {/* =========================== 拍照模式 =========================== */}
      {mode === 'photo' && (
        <>
          {step === 'idle' && (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
              <div
                onClick={pickPhotoFile}
                className="flex h-40 w-40 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-primary bg-primary/10 text-primary text-4xl"
              >
                📷
              </div>
              <p className="text-sm text-muted-foreground">拍照或从相册选择</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={pickGalleryFile}>🖼 相册选图</Button>
                <Button onClick={pickPhotoFile}>📷 拍照</Button>
              </div>
            </div>
          )}

          {step === 'preview' && previewUrl && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border">
                <img src={previewUrl} alt="preview" className="w-full" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('idle')}>重新选图</Button>
                <Button className="flex-1" onClick={startTagging}>
                  {settings?.apiKey ? '🤖 AI 识别' : '直接填写'}
                </Button>
              </div>
            </div>
          )}

          {step === 'tagging' && (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
              <div className="text-4xl animate-pulse">🤖</div>
              <p>AI 识别中,请稍候...</p>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              {previewUrl && (
                <div className="overflow-hidden rounded-lg border">
                  <img src={previewUrl} alt="preview" className="w-full" />
                </div>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
              {tagged && tagged.confidence < 0.6 && (
                <p className="text-xs text-yellow-600">⚠️ AI 置信度较低,请确认以下字段</p>
              )}

              <ItemForm form={form} setForm={setForm} />

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('preview')}>返回</Button>
                <Button className="flex-1" onClick={saveItem}>保存到衣橱</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* =========================== 手动模式 =========================== */}
      {mode === 'manual' && step === 'confirm' && (
        <div className="space-y-4">
          {/* 图片卡片:可选,默认显示 canvas 占位预览 */}
          <Card>
            <CardContent className="space-y-3 pt-4">
              <Label>📷 图片(可选 · 留空自动生成颜色占位图)</Label>
              <div className="overflow-hidden rounded-lg border">
                {manualRealImage && previewUrl ? (
                  <img src={previewUrl} alt="preview" className="w-full" />
                ) : (
                  <canvas
                    ref={previewCanvasRef}
                    className="w-full h-auto block bg-muted"
                    style={{ aspectRatio: '1 / 1' }}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={pickManualFile}>
                  📁 选择图片
                </Button>
                {manualRealImage && (
                  <Button variant="outline" size="sm" onClick={clearManualImage}>
                    🧹 清除,用占位
                  </Button>
                )}
                <p className="flex-1 text-xs text-muted-foreground self-center">
                  {manualRealImage ? '当前:真实图片' : '当前:自动生成占位,色值/子分类变化实时更新'}
                </p>
              </div>
            </CardContent>
          </Card>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <ItemForm form={form} setForm={setForm} />

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              // 重置为默认值
              const cat: Category = 'Top'
              const first = SUB_CATEGORY_MAP[cat][0]
              setForm({
                category: cat,
                subCategory: first?.label || '',
                color: DEFAULT_COLOR,
                colorHex: DEFAULT_COLOR_HEX,
                season: defaultSeasonsForNow(),
                thickness: DEFAULT_THICKNESS,
                pattern: DEFAULT_PATTERN,
                style: [...DEFAULT_STYLE],
              })
              clearManualImage()
            }}>
              清空重填
            </Button>
            <Button className="flex-1" onClick={saveItem}>💾 保存到衣橱</Button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
