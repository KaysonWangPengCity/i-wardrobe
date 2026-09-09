/**
 * 占位图生成工具:用 canvas 画纯色背景 + 中心 emoji + 底部子分类名。
 * 供手动录入衣物(没选图片)时使用,确保衣橱网格有内容可展示。
 */

/** W3C 相对亮度公式,返回 0-1。用于决定文字颜色。 */
export function hexLuminance(hex: string): number {
  const clean = hex.replace('#', '')
  const v = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  const r = parseInt(v.slice(0, 2), 16) / 255
  const g = parseInt(v.slice(2, 4), 16) / 255
  const b = parseInt(v.slice(4, 6), 16) / 255
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

/** 按亮度自动取反色文字:>0.55 用深色,否则浅色 */
export function contrastTextColor(hex: string): string {
  return hexLuminance(hex) > 0.55 ? '#111111' : '#ffffff'
}

/**
 * 在传入的 canvas 上重绘占位图(不输出 Blob,直接改 DOM,用于实时预览)。
 * canvas.width/height 若未与 size 对齐,内部先按 size 重置尺寸。
 */
export function drawPlaceholderPreview(
  canvas: HTMLCanvasElement,
  colorHex: string,
  emoji: string,
  subCategoryLabel: string,
  size = 640,
): void {
  // eslint-disable-next-line no-param-reassign
  canvas.width = size
  // eslint-disable-next-line no-param-reassign
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 背景
  ctx.fillStyle = colorHex
  ctx.fillRect(0, 0, size, size)

  const textColor = contrastTextColor(colorHex)

  // Emoji 中心
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.floor(size * 0.28)}px system-ui, -apple-system, "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  ctx.fillText(emoji || '👕', size / 2, size / 2 - 20)
  ctx.restore()

  // 底部 subCategory label
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = textColor
  ctx.font = `600 ${Math.floor(size * 0.04)}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
  // 描边保证在浅底/深底上都可读
  const strokeColor = hexLuminance(colorHex) > 0.55 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 4
  ctx.strokeStyle = strokeColor
  ctx.strokeText(subCategoryLabel || '', size / 2, size * 0.8)
  ctx.fillText(subCategoryLabel || '', size / 2, size * 0.8)
  ctx.restore()
}

/** 同一张占位图,输出为 JPEG Blob,用于入库。 */
export function makePlaceholderBlob(
  colorHex: string,
  emoji: string,
  subCategoryLabel: string,
  size = 640,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    drawPlaceholderPreview(canvas, colorHex, emoji, subCategoryLabel, size)
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob failed for placeholder'))
      },
      'image/jpeg',
      0.85,
    )
  })
}
