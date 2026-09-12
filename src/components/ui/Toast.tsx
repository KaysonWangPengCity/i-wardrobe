import * as React from 'react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

let _id = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const toast = React.useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++_id
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2400)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[200] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-2.5 text-sm shadow-lg',
              'animate-[toast-in_.22s_ease-out]',
              t.variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              t.variant === 'error' && 'border-red-200 bg-red-50 text-red-800',
              t.variant === 'info' && 'border-border bg-background text-foreground',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue['toast'] {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}

export function ToastConsumer({ children }: { children: (v: ToastContextValue) => React.ReactNode }) {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('ToastConsumer must be used within ToastProvider')
  return <>{children(ctx)}</>
}
