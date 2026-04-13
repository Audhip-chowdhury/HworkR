import { useRealtimeEvents } from '../../context/RealtimeEventsContext'
import { useCompanyRealtime } from '../../hooks/useCompanyRealtime'

export function CompanyRealtimeBridge({ companyId }: { companyId: string }) {
  const { pushRawMessage } = useRealtimeEvents()
  useCompanyRealtime({
    companyId,
    onMessage: pushRawMessage,
    enabled: Boolean(companyId),
  })
  return null
}
