import { useEffect, useState, type FormEvent } from 'react'
import {
  createLifecycleEvent,
  updateOnboardingChecklist,
  type EmployeeDetail,
  type LifecycleEvent,
} from '../../../api/employeesApi'
import styles from '../CompanyWorkspacePage.module.css'

const ONBOARDING_ITEMS = [
  { key: 'it_setup', label: 'IT setup' },
  { key: 'compliance_docs', label: 'Compliance docs' },
  { key: 'buddy_assignment', label: 'Buddy assignment' },
] as const

export const LIFECYCLE_TRANSFER = 'transfer'
export const LIFECYCLE_PROMOTION = 'promotion'
export const LIFECYCLE_TERMINATION = 'termination'
export const LIFECYCLE_REHIRE = 'rehire'

function readChecklist(j: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const d = j ?? {}
  return Object.fromEntries(ONBOARDING_ITEMS.map(({ key }) => [key, Boolean(d[key])]))
}

function showTerminationBlock(status: string, events: LifecycleEvent[]): boolean {
  const s = status.trim().toLowerCase()
  if (s === 'terminated' || s === 'offboarding' || s === 'inactive') return true
  return events.some((e) => e.event_type === LIFECYCLE_TERMINATION)
}

function payloadLines(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload || typeof payload !== 'object') return []
  return Object.entries(payload)
    .filter(([, v]) => v !== '' && v != null && v !== false)
    .map(([k, v]) => {
      if (typeof v === 'boolean') return `${k}: ${v ? 'yes' : 'no'}`
      return `${k.replace(/_/g, ' ')}: ${String(v)}`
    })
}

type Props = {
  companyId: string
  employeeId: string
  detail: EmployeeDetail
  lifecycleEvents: LifecycleEvent[]
  lifecycleLoading: boolean
  onRefreshDetail: () => void | Promise<void>
  onRefreshLifecycle: () => void | Promise<void>
}

export function EmployeeHrPanels({
  companyId,
  employeeId,
  detail,
  lifecycleEvents,
  lifecycleLoading,
  onRefreshDetail,
  onRefreshLifecycle,
}: Props) {
  const [onboardingPending, setOnboardingPending] = useState<string | null>(null)
  const [onboardingError, setOnboardingError] = useState<string | null>(null)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState<'transfer' | 'promotion' | 'termination' | 'rehire' | null>(null)

  useEffect(() => {
    setOpenForm(null)
    setLifecycleError(null)
    setOnboardingError(null)
  }, [employeeId])

  useEffect(() => {
    setLifecycleError(null)
  }, [openForm])

  const checklist = readChecklist(detail.onboarding_checklist_json)

  async function toggleOnboarding(key: string) {
    setOnboardingError(null)
    setOnboardingPending(key)
    try {
      const next = { ...checklist, [key]: !checklist[key] }
      await updateOnboardingChecklist(companyId, employeeId, next)
      await onRefreshDetail()
    } catch (e) {
      setOnboardingError(e instanceof Error ? e.message : 'Failed to update checklist')
    } finally {
      setOnboardingPending(null)
    }
  }

  const transfers = lifecycleEvents.filter((e) => e.event_type === LIFECYCLE_TRANSFER)
  const promotions = lifecycleEvents.filter((e) => e.event_type === LIFECYCLE_PROMOTION)
  const terminations = lifecycleEvents.filter((e) => e.event_type === LIFECYCLE_TERMINATION)
  const rehires = lifecycleEvents.filter((e) => e.event_type === LIFECYCLE_REHIRE)

  const showTermination = showTerminationBlock(detail.status, lifecycleEvents)

  return (
    <>
      <div className={styles.employeesSection}>
        <h5 className={styles.employeesSectionHeading}>Onboarding checklist (Talent Acq handoff)</h5>
        <p className={styles.hint}>
          HR-only — tracks IT, compliance, and buddy steps. Not shown on the employee app. Use the checkboxes below to mark each
          step complete or not.
        </p>
        {onboardingError ? <p className={styles.error}>{onboardingError}</p> : null}
        <ul className={styles.ul} style={{ marginTop: '0.5rem', listStyle: 'none', paddingLeft: 0 }}>
          {ONBOARDING_ITEMS.map(({ key, label }) => {
            const done = checklist[key]
            const pending = onboardingPending === key
            return (
              <li key={key} className={styles.hrOnboardingRow}>
                <label className={styles.hrOnboardingLabel}>
                  <input
                    type="checkbox"
                    className={styles.hrOnboardingCheckbox}
                    checked={done}
                    disabled={!!onboardingPending}
                    onChange={() => void toggleOnboarding(key)}
                  />
                  <span className={pending ? styles.muted : undefined}>
                    {label}
                    {pending ? ' (saving…)' : ''}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      {lifecycleError ? <p className={styles.error}>{lifecycleError}</p> : null}

      <div className={styles.employeesSection}>
        <h5 className={styles.employeesSectionHeading}>Transfers (department / location / manager)</h5>
        <p className={styles.hint}>Recorded as explicit lifecycle events (not inferred from profile edits).</p>
        {lifecycleLoading ? <p className={styles.muted}>Loading history…</p> : null}
        <EventList events={transfers} />
        {openForm === 'transfer' ? (
          <TransferForm
            companyId={companyId}
            employeeId={employeeId}
            onCancel={() => setOpenForm(null)}
            onSaved={async () => {
              setOpenForm(null)
              await onRefreshLifecycle()
            }}
            onError={setLifecycleError}
          />
        ) : (
          <button type="button" className={styles.btnSm} style={{ marginTop: '0.5rem' }} onClick={() => setOpenForm('transfer')}>
            Add transfer record
          </button>
        )}
      </div>

      <div className={styles.employeesSection}>
        <h5 className={styles.employeesSectionHeading}>Promotions (title, level, compensation)</h5>
        <p className={styles.hint}>Title / level / comp changes captured in each record’s payload.</p>
        {lifecycleLoading ? <p className={styles.muted}>Loading history…</p> : null}
        <EventList events={promotions} />
        {openForm === 'promotion' ? (
          <PromotionForm
            companyId={companyId}
            employeeId={employeeId}
            onCancel={() => setOpenForm(null)}
            onSaved={async () => {
              setOpenForm(null)
              await onRefreshLifecycle()
            }}
            onError={setLifecycleError}
          />
        ) : (
          <button type="button" className={styles.btnSm} style={{ marginTop: '0.5rem' }} onClick={() => setOpenForm('promotion')}>
            Add promotion record
          </button>
        )}
      </div>

      {showTermination ? (
        <div className={styles.employeesSection}>
          <h5 className={styles.employeesSectionHeading}>Terminations (exit checklist, assets, access)</h5>
          <p className={styles.hint}>
            Shown because status is terminal/offboarding or a termination event exists. Use records to track exit steps.
          </p>
          {lifecycleLoading ? <p className={styles.muted}>Loading history…</p> : null}
          <EventList events={terminations} />
          {openForm === 'termination' ? (
            <TerminationForm
              companyId={companyId}
              employeeId={employeeId}
              onCancel={() => setOpenForm(null)}
              onSaved={async () => {
                setOpenForm(null)
                await onRefreshLifecycle()
              }}
              onError={setLifecycleError}
            />
          ) : (
            <button type="button" className={styles.btnSm} style={{ marginTop: '0.5rem' }} onClick={() => setOpenForm('termination')}>
              Add termination record
            </button>
          )}
        </div>
      ) : null}

      <div className={styles.employeesSection}>
        <h5 className={styles.employeesSectionHeading}>Rehires</h5>
        <p className={styles.hint}>History of rehire events in this company (same employee record).</p>
        {lifecycleLoading ? <p className={styles.muted}>Loading history…</p> : null}
        {rehires.length === 0 && !lifecycleLoading ? <p className={styles.muted}>No rehire events recorded.</p> : null}
        <EventList events={rehires} />
        {openForm === 'rehire' ? (
          <RehireForm
            companyId={companyId}
            employeeId={employeeId}
            onCancel={() => setOpenForm(null)}
            onSaved={async () => {
              setOpenForm(null)
              await onRefreshLifecycle()
            }}
            onError={setLifecycleError}
          />
        ) : (
          <button type="button" className={styles.btnSm} style={{ marginTop: '0.5rem' }} onClick={() => setOpenForm('rehire')}>
            Add rehire record
          </button>
        )}
      </div>
    </>
  )
}

function EventList({ events }: { events: LifecycleEvent[] }) {
  if (events.length === 0) return <p className={styles.muted}>No records yet.</p>
  return (
    <ul className={styles.ul} style={{ marginTop: '0.35rem' }}>
      {events.map((ev) => (
        <li key={ev.id} style={{ marginBottom: '0.65rem' }}>
          <div style={{ fontWeight: 500 }}>
            {ev.effective_date ?? '—'}
            {ev.status && ev.status !== 'completed' ? ` · ${ev.status}` : null}
          </div>
          {ev.notes ? <div style={{ marginTop: '0.2rem', lineHeight: 1.45 }}>{ev.notes}</div> : null}
          {payloadLines(ev.payload_json as Record<string, unknown> | null | undefined).length > 0 ? (
            <ul className={styles.ul} style={{ marginTop: '0.25rem', fontSize: '0.92em' }}>
              {payloadLines(ev.payload_json as Record<string, unknown>).map((line, i) => (
                <li key={`${ev.id}-p-${i}`}>{line}</li>
              ))}
            </ul>
          ) : null}
          <div className={styles.muted} style={{ marginTop: '0.2rem', fontSize: '0.85em' }}>
            Logged {new Date(ev.created_at).toLocaleString()}
          </div>
        </li>
      ))}
    </ul>
  )
}

function TransferForm({
  companyId,
  employeeId,
  onCancel,
  onSaved,
  onError,
}: {
  companyId: string
  employeeId: string
  onCancel: () => void
  onSaved: () => void | Promise<void>
  onError: (msg: string | null) => void
}) {
  const [pending, setPending] = useState(false)
  const [effectiveDate, setEffectiveDate] = useState('')
  const [notes, setNotes] = useState('')
  const [fromDept, setFromDept] = useState('')
  const [toDept, setToDept] = useState('')
  const [fromLoc, setFromLoc] = useState('')
  const [toLoc, setToLoc] = useState('')
  const [fromMgr, setFromMgr] = useState('')
  const [toMgr, setToMgr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    onError(null)
    setPending(true)
    try {
      await createLifecycleEvent(companyId, employeeId, {
        event_type: LIFECYCLE_TRANSFER,
        effective_date: effectiveDate || null,
        notes: notes || null,
        payload_json: {
          from_department: fromDept || undefined,
          to_department: toDept || undefined,
          from_location: fromLoc || undefined,
          to_location: toLoc || undefined,
          from_manager: fromMgr || undefined,
          to_manager: toMgr || undefined,
        },
      })
      await onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={styles.hrLifecycleForm} onSubmit={(e) => void submit(e)}>
      <label className={styles.labelBlock}>
        Effective date
        <input className={styles.input} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
      </label>
      <label className={styles.labelBlock}>
        Notes
        <textarea className={styles.textarea} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className={styles.inline} style={{ flexWrap: 'wrap' }}>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          From dept
          <input className={styles.input} value={fromDept} onChange={(e) => setFromDept(e.target.value)} />
        </label>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          To dept
          <input className={styles.input} value={toDept} onChange={(e) => setToDept(e.target.value)} />
        </label>
      </div>
      <div className={styles.inline} style={{ flexWrap: 'wrap' }}>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          From location
          <input className={styles.input} value={fromLoc} onChange={(e) => setFromLoc(e.target.value)} />
        </label>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          To location
          <input className={styles.input} value={toLoc} onChange={(e) => setToLoc(e.target.value)} />
        </label>
      </div>
      <div className={styles.inline} style={{ flexWrap: 'wrap' }}>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          From manager
          <input className={styles.input} value={fromMgr} onChange={(e) => setFromMgr(e.target.value)} />
        </label>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          To manager
          <input className={styles.input} value={toMgr} onChange={(e) => setToMgr(e.target.value)} />
        </label>
      </div>
      <div className={styles.inline}>
        <button type="submit" className={styles.btnSm} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={styles.btnSm} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function PromotionForm({
  companyId,
  employeeId,
  onCancel,
  onSaved,
  onError,
}: {
  companyId: string
  employeeId: string
  onCancel: () => void
  onSaved: () => void | Promise<void>
  onError: (msg: string | null) => void
}) {
  const [pending, setPending] = useState(false)
  const [effectiveDate, setEffectiveDate] = useState('')
  const [notes, setNotes] = useState('')
  const [fromTitle, setFromTitle] = useState('')
  const [toTitle, setToTitle] = useState('')
  const [fromLevel, setFromLevel] = useState('')
  const [toLevel, setToLevel] = useState('')
  const [comp, setComp] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    onError(null)
    setPending(true)
    try {
      await createLifecycleEvent(companyId, employeeId, {
        event_type: LIFECYCLE_PROMOTION,
        effective_date: effectiveDate || null,
        notes: notes || null,
        payload_json: {
          from_title: fromTitle || undefined,
          to_title: toTitle || undefined,
          from_level: fromLevel || undefined,
          to_level: toLevel || undefined,
          compensation_summary: comp || undefined,
        },
      })
      await onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={styles.hrLifecycleForm} onSubmit={(e) => void submit(e)}>
      <label className={styles.labelBlock}>
        Effective date
        <input className={styles.input} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
      </label>
      <label className={styles.labelBlock}>
        Notes
        <textarea className={styles.textarea} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className={styles.inline} style={{ flexWrap: 'wrap' }}>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          From title
          <input className={styles.input} value={fromTitle} onChange={(e) => setFromTitle(e.target.value)} />
        </label>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          To title
          <input className={styles.input} value={toTitle} onChange={(e) => setToTitle(e.target.value)} />
        </label>
      </div>
      <div className={styles.inline} style={{ flexWrap: 'wrap' }}>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          From level
          <input className={styles.input} value={fromLevel} onChange={(e) => setFromLevel(e.target.value)} />
        </label>
        <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
          To level
          <input className={styles.input} value={toLevel} onChange={(e) => setToLevel(e.target.value)} />
        </label>
      </div>
      <label className={styles.labelBlock}>
        Compensation change (summary)
        <input className={styles.input} value={comp} onChange={(e) => setComp(e.target.value)} />
      </label>
      <div className={styles.inline}>
        <button type="submit" className={styles.btnSm} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={styles.btnSm} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function TerminationForm({
  companyId,
  employeeId,
  onCancel,
  onSaved,
  onError,
}: {
  companyId: string
  employeeId: string
  onCancel: () => void
  onSaved: () => void | Promise<void>
  onError: (msg: string | null) => void
}) {
  const [pending, setPending] = useState(false)
  const [effectiveDate, setEffectiveDate] = useState('')
  const [notes, setNotes] = useState('')
  const [exitChecklist, setExitChecklist] = useState(false)
  const [assetsReturned, setAssetsReturned] = useState(false)
  const [accessRevoked, setAccessRevoked] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    onError(null)
    setPending(true)
    try {
      await createLifecycleEvent(companyId, employeeId, {
        event_type: LIFECYCLE_TERMINATION,
        effective_date: effectiveDate || null,
        notes: notes || null,
        payload_json: {
          exit_checklist_complete: exitChecklist,
          assets_returned: assetsReturned,
          access_revoked: accessRevoked,
        },
      })
      await onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={styles.hrLifecycleForm} onSubmit={(e) => void submit(e)}>
      <label className={styles.labelBlock}>
        Effective date
        <input className={styles.input} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
      </label>
      <label className={styles.labelBlock}>
        Notes
        <textarea className={styles.textarea} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className={styles.inline} style={{ alignItems: 'center', gap: '0.35rem' }}>
        <input type="checkbox" checked={exitChecklist} onChange={(e) => setExitChecklist(e.target.checked)} />
        Exit checklist complete
      </label>
      <label className={styles.inline} style={{ alignItems: 'center', gap: '0.35rem' }}>
        <input type="checkbox" checked={assetsReturned} onChange={(e) => setAssetsReturned(e.target.checked)} />
        Assets returned
      </label>
      <label className={styles.inline} style={{ alignItems: 'center', gap: '0.35rem' }}>
        <input type="checkbox" checked={accessRevoked} onChange={(e) => setAccessRevoked(e.target.checked)} />
        Access revoked
      </label>
      <div className={styles.inline}>
        <button type="submit" className={styles.btnSm} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={styles.btnSm} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function RehireForm({
  companyId,
  employeeId,
  onCancel,
  onSaved,
  onError,
}: {
  companyId: string
  employeeId: string
  onCancel: () => void
  onSaved: () => void | Promise<void>
  onError: (msg: string | null) => void
}) {
  const [pending, setPending] = useState(false)
  const [effectiveDate, setEffectiveDate] = useState('')
  const [notes, setNotes] = useState('')
  const [priorRef, setPriorRef] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    onError(null)
    setPending(true)
    try {
      await createLifecycleEvent(companyId, employeeId, {
        event_type: LIFECYCLE_REHIRE,
        effective_date: effectiveDate || null,
        notes: notes || null,
        payload_json: {
          prior_period_or_code: priorRef || undefined,
        },
      })
      await onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={styles.hrLifecycleForm} onSubmit={(e) => void submit(e)}>
      <label className={styles.labelBlock}>
        Rehire effective date
        <input className={styles.input} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
      </label>
      <label className={styles.labelBlock}>
        Prior employment reference (optional)
        <input
          className={styles.input}
          placeholder="e.g. previous stint dates or notes"
          value={priorRef}
          onChange={(e) => setPriorRef(e.target.value)}
        />
      </label>
      <label className={styles.labelBlock}>
        Notes
        <textarea className={styles.textarea} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className={styles.inline}>
        <button type="submit" className={styles.btnSm} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={styles.btnSm} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
