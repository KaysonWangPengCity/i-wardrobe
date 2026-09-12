import * as React from 'react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

/** 通用 Modal:居中 + 遮罩 + backdrop-blur + 点击遮罩/ESC 关闭(由调用方控制 open) */
export function Dialog({ open, onClose, children, className }: DialogProps) {
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl',
          'animate-[dialog-in_.18s_ease-out]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 pt-5 pb-2', className)}>{children}</div>
}
export function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn('text-base font-semibold leading-tight', className)}>{children}</h2>
}
export function DialogDesc({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('mt-1 text-sm text-muted-foreground leading-relaxed', className)}>{children}</p>
}
export function DialogBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-2', className)}>{children}</div>
}
export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-end gap-2 px-5 pb-5 pt-2', className)}>{children}</div>
}
