import { useEffect } from 'react'
import styles from './AlertModal.module.css'

type Props = {
  open: boolean
  title?: string
  message: string
  onClose: () => void
  variant?: 'error' | 'info' | 'success'
}

export function AlertModal({ open, title, message, onClose, variant = 'error' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={`${styles.card} ${styles[variant]}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        aria-describedby="alert-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="alert-modal-title" className={styles.title}>
          {title ?? (variant === 'error' ? 'Something went wrong' : 'Notice')}
        </h2>
        <p id="alert-modal-desc" className={styles.message}>
          {message}
        </p>
        <button type="button" className={styles.okBtn} onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  )
}
