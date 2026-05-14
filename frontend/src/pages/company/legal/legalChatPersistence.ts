import type { LegalCitation } from '../../../api/legalApi'

const HISTORY_PREFIX = 'hworkr:legal-chat:'
const SAVED_PREFIX = 'hworkr:legal-saved:'
export const LEGAL_CHAT_HISTORY_TTL_MS = 5 * 60 * 1000

export type PersistedChatTurn = {
  role: 'user' | 'assistant'
  text: string
  citations?: LegalCitation[]
}

type HistoryEnvelope = {
  messages: PersistedChatTurn[]
  lastUpdatedAt: number
}

function historyKey(companyId: string): string {
  return `${HISTORY_PREFIX}${companyId}`
}

function savedKey(companyId: string): string {
  return `${SAVED_PREFIX}${companyId}`
}

export function loadChatHistory(companyId: string): PersistedChatTurn[] {
  if (!companyId || typeof sessionStorage === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(historyKey(companyId))
    if (!raw) return []
    const data = JSON.parse(raw) as HistoryEnvelope
    if (!data.messages || !Array.isArray(data.messages) || typeof data.lastUpdatedAt !== 'number') {
      sessionStorage.removeItem(historyKey(companyId))
      return []
    }
    if (Date.now() - data.lastUpdatedAt > LEGAL_CHAT_HISTORY_TTL_MS) {
      sessionStorage.removeItem(historyKey(companyId))
      return []
    }
    return data.messages
  } catch {
    sessionStorage.removeItem(historyKey(companyId))
    return []
  }
}

export function saveChatHistory(companyId: string, messages: PersistedChatTurn[]): void {
  if (!companyId || typeof sessionStorage === 'undefined') return
  const key = historyKey(companyId)
  if (messages.length === 0) {
    sessionStorage.removeItem(key)
    return
  }
  const env: HistoryEnvelope = { messages, lastUpdatedAt: Date.now() }
  sessionStorage.setItem(key, JSON.stringify(env))
}

export type SavedLegalAnswer = {
  id: string
  savedAt: string
  userQuestion: string
  answer: string
  citations: LegalCitation[]
}

export function loadSavedAnswers(companyId: string): SavedLegalAnswer[] {
  if (!companyId || typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(savedKey(companyId))
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (x): x is SavedLegalAnswer =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as SavedLegalAnswer).id === 'string' &&
        typeof (x as SavedLegalAnswer).answer === 'string',
    )
  } catch {
    return []
  }
}

export function addSavedAnswer(companyId: string, item: Omit<SavedLegalAnswer, 'id' | 'savedAt'>): SavedLegalAnswer {
  const full: SavedLegalAnswer = {
    ...item,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  }
  const prev = loadSavedAnswers(companyId)
  const next = [full, ...prev]
  localStorage.setItem(savedKey(companyId), JSON.stringify(next))
  return full
}

export function removeSavedAnswer(companyId: string, id: string): void {
  const prev = loadSavedAnswers(companyId)
  const next = prev.filter((x) => x.id !== id)
  localStorage.setItem(savedKey(companyId), JSON.stringify(next))
}
