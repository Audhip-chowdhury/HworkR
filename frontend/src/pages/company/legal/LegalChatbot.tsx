import { useCallback, useEffect, useState } from 'react'
import { postLegalChat, type LegalCitation, type LegalChatResponse } from '../../../api/legalApi'
import ws from '../CompanyWorkspacePage.module.css'
import styles from './LegalChatbot.module.css'
import {
  addSavedAnswer,
  loadChatHistory,
  loadSavedAnswers,
  removeSavedAnswer,
  type SavedLegalAnswer,
  saveChatHistory,
} from './legalChatPersistence'

type ChatTurn = {
  role: 'user' | 'assistant'
  text: string
  citations?: LegalCitation[]
}

const DEFAULT_REGION = 'India'

function precedingUserQuestion(messages: ChatTurn[], assistantIndex: number): string {
  for (let j = assistantIndex - 1; j >= 0; j -= 1) {
    if (messages[j].role === 'user') return messages[j].text
  }
  return ''
}

export function LegalChatbot({ companyId }: { companyId: string }) {
  const [messages, setMessages] = useState<ChatTurn[]>(() => loadChatHistory(companyId))
  const [saved, setSaved] = useState<SavedLegalAnswer[]>(() => loadSavedAnswers(companyId))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMessages(loadChatHistory(companyId))
    setSaved(loadSavedAnswers(companyId))
  }, [companyId])

  useEffect(() => {
    saveChatHistory(companyId, messages)
  }, [companyId, messages])

  const send = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || !companyId || loading) return
    setInput('')
    setError(null)
    setMessages((m) => [...m, { role: 'user', text: trimmed }])
    setLoading(true)
    try {
      const res: LegalChatResponse = await postLegalChat(companyId, {
        message: trimmed,
        region: DEFAULT_REGION,
      })
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: res.answer,
          citations: res.citations?.length ? res.citations : undefined,
        },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [companyId, input, loading])

  function handleSaveAnswer(assistantIndex: number, msg: ChatTurn) {
    if (msg.role !== 'assistant' || !companyId) return
    const q = precedingUserQuestion(messages, assistantIndex)
    addSavedAnswer(companyId, {
      userQuestion: q || '(no preceding question)',
      answer: msg.text,
      citations: msg.citations ?? [],
    })
    setSaved(loadSavedAnswers(companyId))
  }

  function handleRemoveSaved(id: string) {
    removeSavedAnswer(companyId, id)
    setSaved(loadSavedAnswers(companyId))
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.regionLabel}>Region</span>
        <select className={ws.input} value={DEFAULT_REGION} disabled aria-label="Region (India only for now)">
          <option value="India">India</option>
        </select>
        {messages.length > 0 ? (
          <span className={styles.ttlHint} title="Stored in this browser tab only. Cleared after five minutes without a new message.">
            Conversation kept 5 min after your last message
          </span>
        ) : null}
      </div>

      {saved.length > 0 ? (
        <details className={styles.savedPanel}>
          <summary className={styles.savedSummary}>Saved answers ({saved.length})</summary>
          <ul className={styles.savedList}>
            {saved.map((s) => (
              <li key={s.id} className={styles.savedItem}>
                <div className={styles.savedQ}>{s.userQuestion.length > 120 ? `${s.userQuestion.slice(0, 120)}…` : s.userQuestion}</div>
                <div className={styles.savedMeta}>
                  {new Date(s.savedAt).toLocaleString()}
                  <button type="button" className={styles.linkish} onClick={() => handleRemoveSaved(s.id)}>
                    Remove
                  </button>
                </div>
                <div className={styles.savedA}>{s.answer}</div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? <p className={ws.error}>{error}</p> : null}
      <div className={styles.thread} aria-live="polite">
        {messages.length === 0 ? (
          <p className={ws.muted} style={{ margin: 0 }}>
            Ask about notice periods, termination, wages, or other HR legal topics. Responses use your uploaded Indian labour
            law corpus and cite sources when available.
          </p>
        ) : null}
        {messages.map((msg, i) => (
          <div
            key={`${i}-${msg.role}`}
            className={`${styles.msg} ${msg.role === 'user' ? styles.msgUser : styles.msgAssistant}`}
          >
            <div className={styles.msgHeader}>
              <div className={styles.role}>{msg.role === 'user' ? 'You' : 'Legal assistant'}</div>
              {msg.role === 'assistant' ? (
                <button type="button" className={styles.saveBtn} onClick={() => handleSaveAnswer(i, msg)}>
                  Save answer
                </button>
              ) : null}
            </div>
            <div>{msg.text}</div>
            {msg.role === 'assistant' && msg.citations?.length ? (
              <div className={styles.citations}>
                <div className={styles.citationsTitle}>Sources</div>
                {msg.citations.map((c, j) => (
                  <div key={j} className={styles.citationItem}>
                    {[c.act, c.section].filter(Boolean).join(' · ') || 'Reference'}
                    {c.source_doc ? ` — ${c.source_doc}` : ''}
                    {c.excerpt ? <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)' }}>{c.excerpt}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {loading ? <div className={styles.loading}>Thinking…</div> : null}
      </div>
      <div className={styles.composer}>
        <textarea
          className={styles.textarea}
          placeholder="Describe your HR / legal situation or question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          disabled={loading}
          rows={3}
        />
        <button type="button" className={styles.send} onClick={() => void send()} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
