import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { DomainEventEnvelope } from '../api/types'

const MAX_EVENTS = 40

export type LiveEventRow = { id: number; envelope: DomainEventEnvelope }

type RealtimeContextValue = {
  events: LiveEventRow[]
  pushRawMessage: (data: string) => void
  clearEvents: () => void
}

const RealtimeEventsContext = createContext<RealtimeContextValue | null>(null)

export function RealtimeEventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<LiveEventRow[]>([])
  const seq = useRef(0)

  const pushRawMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data) as { channel?: string; payload?: DomainEventEnvelope }
      if (msg.channel === 'domain' && msg.payload?.event_type) {
        const id = ++seq.current
        setEvents((prev) => {
          const row: LiveEventRow = { id, envelope: msg.payload! }
          return [row, ...prev].slice(0, MAX_EVENTS)
        })
      }
    } catch {
      /* ignore malformed */
    }
  }, [])

  const clearEvents = useCallback(() => setEvents([]), [])

  const value = useMemo(
    () => ({ events, pushRawMessage, clearEvents }),
    [events, pushRawMessage, clearEvents],
  )

  return <RealtimeEventsContext.Provider value={value}>{children}</RealtimeEventsContext.Provider>
}

export function useRealtimeEvents(): RealtimeContextValue {
  const ctx = useContext(RealtimeEventsContext)
  if (!ctx) throw new Error('useRealtimeEvents outside RealtimeEventsProvider')
  return ctx
}
