import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { listMyWorksWithPeers, type WorksWithPeer } from '../../../api/employeesApi'
import {
  listMyPendingPeerFeedbackRequests,
  listMyPeerReviewCycles,
  submitPeerReviewFeedback,
  submitPeerReviewNominations,
  type PeerReviewCycleCard,
  type PeerReviewPendingRequest,
} from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'

const MAX_PEERS = 3

type PeerReviewTab = 'others' | 'self'

/** Form fields for peer feedback about a colleague (matches product spec). */
export const PEER_FEEDBACK_FORM_FIELDS = [
  {
    id: 'strengths' as const,
    label: "What are this person's strengths?",
    type: 'textarea' as const,
  },
  {
    id: 'improvements' as const,
    label: 'What are areas where this person can improve?',
    type: 'textarea' as const,
  },
  {
    id: 'additional_feedback' as const,
    label: 'Any additional feedback?',
    type: 'textarea' as const,
    required: false as const,
  },
]

type DraftKey = string
type FeedbackDraft = { strengths: string; improvements: string; additional_feedback: string }

function requestKey(p: PeerReviewPendingRequest): DraftKey {
  return `${p.review_cycle_id}:${p.subject_employee_id}`
}

export function PeerReviewPage() {
  const { companyId = '' } = useParams()
  const [tab, setTab] = useState<PeerReviewTab>('others')
  /** Empty string = show all pending requests; otherwise filter by subject employee id. */
  const [subjectFilterId, setSubjectFilterId] = useState('')
  const [peers, setPeers] = useState<WorksWithPeer[]>([])
  const [cycles, setCycles] = useState<PeerReviewCycleCard[]>([])
  const [pendingFeedback, setPendingFeedback] = useState<PeerReviewPendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submittingFeedbackKey, setSubmittingFeedbackKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [selectedPeerIds, setSelectedPeerIds] = useState<Set<string>>(new Set())
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<DraftKey, FeedbackDraft>>({})

  const subjectFilterOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>()
    for (const req of pendingFeedback) {
      if (!byId.has(req.subject_employee_id)) {
        byId.set(req.subject_employee_id, {
          id: req.subject_employee_id,
          label: `${req.subject_display_name} (${req.subject_display_email})`,
        })
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [pendingFeedback])

  const filteredPending = useMemo(() => {
    if (!subjectFilterId) return pendingFeedback
    return pendingFeedback.filter((req) => req.subject_employee_id === subjectFilterId)
  }, [pendingFeedback, subjectFilterId])

  useEffect(() => {
    if (!subjectFilterId) return
    const stillPending = pendingFeedback.some((p) => p.subject_employee_id === subjectFilterId)
    if (!stillPending) setSubjectFilterId('')
  }, [pendingFeedback, subjectFilterId])

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [p, c, fb] = await Promise.all([
        listMyWorksWithPeers(companyId),
        listMyPeerReviewCycles(companyId),
        listMyPendingPeerFeedbackRequests(companyId),
      ])
      setPeers(p)
      setCycles(c)
      setPendingFeedback(fb)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setFeedbackDrafts((prev) => {
      const next = { ...prev }
      for (const req of pendingFeedback) {
        const k = requestKey(req)
        if (!next[k]) {
          next[k] = { strengths: '', improvements: '', additional_feedback: '' }
        }
      }
      return next
    })
  }, [pendingFeedback])

  const activeCycle = useMemo(() => cycles.find((x) => x.cycle.id === selectedCycleId) ?? null, [cycles, selectedCycleId])

  useEffect(() => {
    if (cycles.length === 0) {
      setSelectedCycleId('')
      setSelectedPeerIds(new Set())
      return
    }
    setSelectedCycleId((prev) => {
      if (prev && cycles.some((c) => c.cycle.id === prev)) return prev
      const open = cycles.find((c) => !c.peer_nominations_submitted_at)
      return (open ?? cycles[0]).cycle.id
    })
  }, [cycles])

  useEffect(() => {
    if (!activeCycle?.peer_nominations_submitted_at) return
    setSelectedPeerIds(new Set(activeCycle.selected_reviewer_employee_ids))
  }, [activeCycle?.cycle.id, activeCycle?.peer_nominations_submitted_at, activeCycle?.selected_reviewer_employee_ids])

  function setDraftField(key: DraftKey, field: keyof FeedbackDraft, value: string) {
    setFeedbackDrafts((prev) => {
      const cur = prev[key] ?? { strengths: '', improvements: '', additional_feedback: '' }
      return { ...prev, [key]: { ...cur, [field]: value } }
    })
  }

  function togglePeer(id: string) {
    if (activeCycle?.peer_nominations_submitted_at) return
    setSelectedPeerIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        if (next.size >= MAX_PEERS) {
          toast.info(`You can select at most ${MAX_PEERS} peer reviewers.`)
          return prev
        }
        next.add(id)
      }
      return next
    })
  }

  async function onSubmitNominations() {
    if (!companyId || !selectedCycleId || selectedPeerIds.size === 0) {
      toast.error('Choose a review cycle and at least one peer.')
      return
    }
    if (activeCycle?.peer_nominations_submitted_at) return
    setSubmitting(true)
    try {
      const res = await submitPeerReviewNominations(companyId, selectedCycleId, {
        reviewer_employee_ids: Array.from(selectedPeerIds),
      })
      toast.success(`Submitted. ${res.reviewers_notified} reviewer(s) were notified.`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitFeedback(req: PeerReviewPendingRequest) {
    if (!companyId) return
    const k = requestKey(req)
    const d = feedbackDrafts[k] ?? { strengths: '', improvements: '', additional_feedback: '' }
    const strengths = d.strengths.trim()
    const improvements = d.improvements.trim()
    if (!strengths || !improvements) {
      toast.error('Please fill in strengths and areas for improvement.')
      return
    }
    setSubmittingFeedbackKey(k)
    try {
      await submitPeerReviewFeedback(companyId, req.review_cycle_id, {
        subject_employee_id: req.subject_employee_id,
        strengths,
        improvements,
        additional_feedback: d.additional_feedback.trim() || null,
      })
      toast.success('Peer feedback saved.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmittingFeedbackKey(null)
    }
  }

  const pendingCount = pendingFeedback.length
  const othersTabLabel = `Reviews for others${pendingCount > 0 ? ` (${pendingCount})` : ''}`

  return (
    <section className={styles.card}>
      <h3 className={styles.h3}>Peer review</h3>
      <p className={`${styles.muted} ${styles.peerReviewIntro}`}>
        Complete feedback colleagues asked you for, or nominate works-with peers to review you during each review
        cycle.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {!loading ? (
        <>
          <div className={styles.peerReviewTabBar} role="tablist" aria-label="Peer review sections">
            <button
              id="peer-tab-others"
              type="button"
              role="tab"
              aria-selected={tab === 'others'}
              className={`${styles.peerReviewTabBtn} ${tab === 'others' ? styles.peerReviewTabBtnActive : ''}`}
              onClick={() => setTab('others')}
            >
              {othersTabLabel}
            </button>
            <button
              id="peer-tab-self"
              type="button"
              role="tab"
              aria-selected={tab === 'self'}
              className={`${styles.peerReviewTabBtn} ${tab === 'self' ? styles.peerReviewTabBtnActive : ''}`}
              onClick={() => setTab('self')}
            >
              Request reviews for yourself
            </button>
          </div>

          {tab === 'others' ? (
            <div role="tabpanel" aria-labelledby="peer-tab-others">
              <p className={styles.muted} style={{ marginBottom: '1rem', maxWidth: '48rem' }}>
                Use the list to focus on one colleague, or show everyone with an open request. Submit one form per
                person per cycle; your answers are saved for that review cycle only.
              </p>

              <div className={styles.peerReviewFilterRow}>
                <label className={`${styles.labelBlock} ${styles.peerReviewFilterInput}`} style={{ marginBottom: 0 }}>
                  Filter by colleague
                  <select
                    className={styles.input}
                    value={subjectFilterId}
                    onChange={(e) => setSubjectFilterId(e.target.value)}
                    aria-label="Filter peer review requests by colleague"
                  >
                    <option value="">All colleagues ({pendingCount})</option>
                    {subjectFilterOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className={styles.peerReviewFilterMeta}>
                  Showing {filteredPending.length} of {pendingCount}
                </span>
              </div>

              {pendingCount === 0 ? (
                <div className={styles.peerReviewEmptyPanel}>
                  No open peer-review requests. When a colleague nominates you as a reviewer, their name and form will
                  appear here.
                </div>
              ) : filteredPending.length === 0 ? (
                <div className={styles.peerReviewEmptyPanel}>
                  No open requests for this colleague. Choose &quot;All colleagues&quot; or another name from the list.
                </div>
              ) : (
                <div className={styles.peerReviewFormStack}>
                  {filteredPending.map((req) => {
                    const k = requestKey(req)
                    const d = feedbackDrafts[k] ?? { strengths: '', improvements: '', additional_feedback: '' }
                    const busy = submittingFeedbackKey === k
                    return (
                      <div key={k} className={styles.peerReviewFormCard}>
                        <div className={styles.peerReviewFormCardHeader}>
                          <div>
                            <div className={styles.peerReviewSubjectName}>{req.subject_display_name}</div>
                            <div className={styles.muted} style={{ fontSize: '0.9rem' }}>
                              {req.subject_display_email}
                            </div>
                            <div className={styles.peerReviewCycleTag}>
                              Review cycle: <strong style={{ color: 'var(--text-primary)' }}>{req.cycle_name}</strong>
                            </div>
                          </div>
                          <Link
                            className={styles.linkBtn}
                            to={`/company/${companyId}/employees/${req.subject_employee_id}`}
                            style={{ textDecoration: 'none' }}
                          >
                            View profile
                          </Link>
                        </div>
                        {PEER_FEEDBACK_FORM_FIELDS.map((field) => {
                          const val =
                            field.id === 'strengths'
                              ? d.strengths
                              : field.id === 'improvements'
                                ? d.improvements
                                : d.additional_feedback
                          return (
                            <label key={field.id} className={styles.labelBlock} style={{ marginTop: '0.75rem' }}>
                              {field.label}
                              {'required' in field && field.required === false ? (
                                <span className={styles.muted}> (optional)</span>
                              ) : null}
                              <textarea
                                className={styles.input}
                                style={{ minHeight: 88 }}
                                value={val}
                                onChange={(e) => setDraftField(k, field.id, e.target.value)}
                                required={!('required' in field && field.required === false)}
                                aria-required={!('required' in field && field.required === false)}
                              />
                            </label>
                          )
                        })}
                        <div className={styles.formActions} style={{ marginTop: '1rem' }}>
                          <button
                            type="button"
                            className={styles.btnSm}
                            disabled={Boolean(busy)}
                            onClick={() => void onSubmitFeedback(req)}
                          >
                            {busy ? 'Saving…' : 'Submit peer feedback'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.peerReviewSelfSection} role="tabpanel" aria-labelledby="peer-tab-self">
              <p className={styles.muted} style={{ marginBottom: '1rem', maxWidth: '48rem' }}>
                For each review cycle you were notified about, pick up to <strong>{MAX_PEERS}</strong> colleagues from
                your works-with list (same manager and same position grade). They receive a notification to write a peer
                review for you.
              </p>

              {cycles.length === 0 ? (
                <div className={styles.peerReviewEmptyPanel}>
                  No nomination cycles yet. When HR creates a review cycle with goals and a deadline, you will get a
                  notification to nominate peer reviewers here.
                </div>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  <label className={styles.labelBlock} style={{ marginBottom: '1rem' }}>
                    Review cycle
                    <select
                      className={styles.input}
                      value={selectedCycleId}
                      onChange={(e) => {
                        setSelectedCycleId(e.target.value)
                        setSelectedPeerIds(new Set())
                      }}
                    >
                      {cycles.map((c) => (
                        <option key={c.cycle.id} value={c.cycle.id}>
                          {c.cycle.name}
                          {c.cycle.goals_deadline ? ` · goals due ${c.cycle.goals_deadline}` : ''}
                          {c.peer_nominations_submitted_at ? ' (submitted)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  {activeCycle?.peer_nominations_submitted_at ? (
                    <p className={styles.muted}>
                      You already submitted peer choices for this cycle on{' '}
                      {new Date(activeCycle.peer_nominations_submitted_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      .
                    </p>
                  ) : null}
                </div>
              )}

              {peers.length === 0 ? (
                <div className={styles.peerReviewEmptyPanel}>
                  No works-with peers found. You need an assigned <strong>position</strong> and <strong>manager</strong>,
                  plus other active colleagues with the same manager and grade.
                </div>
              ) : cycles.length > 0 ? (
                <>
                  <p className={styles.muted} style={{ marginBottom: '0.75rem' }}>
                    Selected: {selectedPeerIds.size} / {MAX_PEERS}
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ width: 48 }}>Pick</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Code</th>
                          <th>Position</th>
                          <th>Grade</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {peers.map((r) => {
                          const checked = selectedPeerIds.has(r.employee_id)
                          const disabledRow = Boolean(activeCycle?.peer_nominations_submitted_at)
                          const disableCheckbox = disabledRow || (!checked && selectedPeerIds.size >= MAX_PEERS)
                          return (
                            <tr key={r.employee_id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disableCheckbox}
                                  onChange={() => togglePeer(r.employee_id)}
                                  aria-label={`Select ${r.display_name} for peer review`}
                                />
                              </td>
                              <td>{r.display_name}</td>
                              <td>{r.display_email}</td>
                              <td>{r.employee_code}</td>
                              <td>{r.position_name}</td>
                              <td>{r.grade}</td>
                              <td>
                                <Link
                                  to={`/company/${companyId}/employees/${r.employee_id}`}
                                  style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontSize: '0.9rem' }}
                                >
                                  Profile
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!activeCycle?.peer_nominations_submitted_at ? (
                    <div className={styles.formActions} style={{ marginTop: '1rem' }}>
                      <button
                        type="button"
                        className={styles.btnSm}
                        disabled={submitting || selectedPeerIds.size === 0 || !selectedCycleId}
                        onClick={() => void onSubmitNominations()}
                      >
                        {submitting ? 'Submitting…' : 'Submit peer choices & notify reviewers'}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}
