import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'default' | 'destructive'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  action?: ToastAction
  /** Auto-dismiss delay in ms. Pass 0 to keep it until dismissed. Default 6000. */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++
      const item: ToastItem = { duration: 6000, variant: 'default', ...opts, id }
      setToasts((prev) => [...prev, item])
      if (item.duration && item.duration > 0) {
        window.setTimeout(() => dismiss(id), item.duration)
      }
      return id
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const destructive = toast.variant === 'destructive'
  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-4 shadow-lg',
        'animate-in fade-in slide-in-from-bottom-2',
        destructive && 'border-destructive/40',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={cn('text-sm font-medium', destructive && 'text-destructive')}>{toast.title}</p>
        {toast.description && (
          <p className="truncate text-xs text-muted-foreground">{toast.description}</p>
        )}
      </div>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick()
            onDismiss()
          }}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand-muted"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
