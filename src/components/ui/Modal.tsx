import * as React from 'react'
import { Dialog } from './Dialog'
import { AlertTriangle, Sparkles, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}

interface AlertOptions {
  title?: string
  confirmText?: string
}

interface ModalContextValue {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
  alert: (message: string, options?: AlertOptions) => Promise<void>
}

const ModalContext = React.createContext<ModalContextValue | null>(null)

interface ConfirmState {
  open: boolean
  message: string
  title: string
  confirmText: string
  cancelText: string
  destructive: boolean
  resolve?: (v: boolean) => void
}

interface AlertState {
  open: boolean
  message: string
  title: string
  confirmText: string
  resolve?: () => void
}

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [confirm, setConfirm] = React.useState<ConfirmState>({
    open: false, message: '', title: '提示', confirmText: '确定', cancelText: '取消', destructive: false,
  })
  const [alert, setAlert] = React.useState<AlertState>({
    open: false, message: '', title: '提示', confirmText: '知道了',
  })

  const api = React.useMemo<ModalContextValue>(() => ({
    confirm: (message, opts = {}) => new Promise<boolean>((resolve) => {
      setConfirm({
        open: true,
        message,
        title: opts.title ?? '提示',
        confirmText: opts.confirmText ?? '确定',
        cancelText: opts.cancelText ?? '取消',
        destructive: opts.destructive ?? false,
        resolve,
      })
    }),
    alert: (message, opts = {}) => new Promise<void>((resolve) => {
      setAlert({
        open: true,
        message,
        title: opts.title ?? '提示',
        confirmText: opts.confirmText ?? '知道了',
        resolve,
      })
    }),
  }), [])

  function closeConfirm(ok: boolean) {
    confirm.resolve?.(ok)
    setConfirm((s) => ({ ...s, open: false }))
  }
  function closeAlert() {
    alert.resolve?.()
    setAlert((s) => ({ ...s, open: false }))
  }

  return (
    <ModalContext.Provider value={api}>
      {children}

      {/* Confirm */}
      <Dialog
        open={confirm.open}
        onClose={() => closeConfirm(false)}
        className="max-w-[21rem]"
      >
        <div className="px-6 pt-7 pb-6 text-center">
          <div
            className={cn(
              'mx-auto flex h-12 w-12 items-center justify-center rounded-full',
              confirm.destructive ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary',
            )}
          >
            {confirm.destructive ? (
              <AlertTriangle size={24} strokeWidth={2} />
            ) : (
              <Sparkles size={24} strokeWidth={2} />
            )}
          </div>
          <h2 className="mt-4 text-[15px] font-bold leading-snug tracking-tight">{confirm.title}</h2>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {confirm.message}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              autoFocus
              className={cn(
                'h-10 w-full rounded-xl text-sm font-semibold transition-colors',
                confirm.destructive
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-primary text-primary-foreground hover:opacity-90',
              )}
              onClick={() => closeConfirm(true)}
            >
              {confirm.confirmText}
            </button>
            <button
              type="button"
              className="h-10 w-full rounded-xl border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => closeConfirm(false)}
            >
              {confirm.cancelText}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Alert */}
      <Dialog
        open={alert.open}
        onClose={closeAlert}
        className="max-w-[21rem]"
      >
        <div className="px-6 pt-7 pb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Info size={24} strokeWidth={2} />
          </div>
          <h2 className="mt-4 text-[15px] font-bold leading-snug tracking-tight">{alert.title}</h2>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {alert.message}
          </p>
          <div className="mt-6">
            <button
              type="button"
              autoFocus
              className="h-10 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
              onClick={closeAlert}
            >
              {alert.confirmText}
            </button>
          </div>
        </div>
      </Dialog>
    </ModalContext.Provider>
  )
}

export function useModal(): ModalContextValue {
  const ctx = React.useContext(ModalContext)
  if (!ctx) throw new Error('useModal must be used within ModalProvider')
  return ctx
}

/** render-prop 形式的消费者,供类组件或深层组件避免 prop drilling */
export function ModalConsumer({ children }: { children: (v: ModalContextValue) => React.ReactNode }) {
  const ctx = React.useContext(ModalContext)
  if (!ctx) throw new Error('ModalConsumer must be used within ModalProvider')
  return <>{children(ctx)}</>
}
