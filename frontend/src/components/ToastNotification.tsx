import { useEffect, useRef } from 'react'
import styles from './ToastNotification.module.css'

export type ToastItem = {
  id: string
  title: string
  detail?: string
  variant?: 'success' | 'info' | 'error'
}

type Props = {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

const AUTO_DISMISS_MS = 5000

function SingleToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast.id, onDismiss])

  const icon = toast.variant === 'error' ? '✕' : toast.variant === 'info' ? 'ℹ' : '✓'

  return (
    <div className={`${styles.toast} ${styles[toast.variant ?? 'success']}`} role="status" aria-live="polite">
      <span className={styles.icon} aria-hidden>{icon}</span>
      <div className={styles.body}>
        <p className={styles.title}>{toast.title}</p>
        {toast.detail ? <p className={styles.detail}>{toast.detail}</p> : null}
      </div>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
      <div
        className={styles.progress}
        style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
      />
    </div>
  )
}

export function ToastNotification({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null
  return (
    <div className={styles.container} aria-label="Notifications">
      {toasts.map((t) => (
        <SingleToast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
