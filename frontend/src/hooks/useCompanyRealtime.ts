import { useEffect, useRef } from 'react'
import { getToken } from '../api/client'
import { companyWebSocketUrl } from '../api/realtimeApi'

type Opts = {
  companyId: string
  onMessage: (data: string) => void
  enabled?: boolean
}

/**
 * Maintains a WebSocket to the company domain channel with simple exponential backoff reconnect.
 */
export function useCompanyRealtime({ companyId, onMessage, enabled = true }: Opts): void {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!enabled || !companyId) return

    let ws: WebSocket | null = null
    let cancelled = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      const token = getToken()
      if (!token || cancelled) return

      try {
        ws = new WebSocket(companyWebSocketUrl(companyId, token))
      } catch {
        scheduleReconnect()
        return
      }

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') onMessageRef.current(ev.data)
      }

      ws.onclose = () => {
        ws = null
        if (!cancelled) scheduleReconnect()
      }

      ws.onerror = () => {
        try {
          ws?.close()
        } catch {
          /* ignore */
        }
      }

      attempt = 0
    }

    function scheduleReconnect() {
      if (cancelled) return
      attempt += 1
      const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt, 8))
      timer = setTimeout(() => {
        timer = null
        connect()
      }, delay)
    }

    connect()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
    }
  }, [companyId, enabled])
}
