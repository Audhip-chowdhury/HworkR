import { render, screen, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RealtimeEventsProvider, useRealtimeEvents } from './RealtimeEventsContext'

function Consumer() {
  const { events, pushRawMessage } = useRealtimeEvents()
  return (
    <div>
      <button type="button" onClick={() => pushRawMessage(JSON.stringify({ channel: 'domain', payload: { event_type: 'ping', occurred_at: '', company_id: 'c', entity_type: null, entity_id: null, actor_user_id: null, data: {} } }))}>
        push
      </button>
      <span data-testid="count">{events.length}</span>
    </div>
  )
}

describe('RealtimeEventsProvider', () => {
  it('records domain channel payloads', async () => {
    render(
      <RealtimeEventsProvider>
        <Consumer />
      </RealtimeEventsProvider>,
    )
    expect(screen.getByTestId('count').textContent).toBe('0')
    await act(async () => {
      screen.getByRole('button', { name: 'push' }).click()
    })
    expect(screen.getByTestId('count').textContent).toBe('1')
  })
})
