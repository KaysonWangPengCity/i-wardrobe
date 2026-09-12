import * as React from 'react'
import { X } from 'lucide-react'

interface ImagePreviewContextValue {
  open: (src: string, caption?: string) => void
}

const ImagePreviewContext = React.createContext<ImagePreviewContextValue | null>(null)

export function ImagePreviewProvider({ children }: { children: React.ReactNode }) {
  const [src, setSrc] = React.useState<string | null>(null)
  const [caption, setCaption] = React.useState<string>('')

  const api = React.useMemo<ImagePreviewContextValue>(() => ({
    open: (s: string, c?: string) => {
      setSrc(s)
      setCaption(c ?? '')
    },
  }), [])

  function close() {
    setSrc(null)
  }

  React.useEffect(() => {
    if (!src) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [src])

  return (
    <ImagePreviewContext.Provider value={api}>
      {children}
      {src && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-[dialog-in_.18s_ease-out]"
          onClick={close}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
          <div className="relative max-h-[85vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div
              className="max-h-[85vh] max-w-[90vw] select-none rounded-lg shadow-2xl [-webkit-touch-callout:none] bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${src})`, width: '85vw', height: '85vh' }}
            />
            {caption && (
              <p className="mt-3 text-center text-sm text-white/80">{caption}</p>
            )}
          </div>
        </div>
      )}
    </ImagePreviewContext.Provider>
  )
}

export function useImagePreview(): ImagePreviewContextValue {
  const ctx = React.useContext(ImagePreviewContext)
  if (!ctx) throw new Error('useImagePreview must be used within ImagePreviewProvider')
  return ctx
}
