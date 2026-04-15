import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  getMyEmployee,
  listMyEmployeeDocuments,
  patchMyEmployee,
  uploadMyEmployeeDocument,
  type Employee,
  type EmployeeDocumentRow,
} from '../../../api/employeesApi'
import { invalidateInboxBadge } from '../../../api/inboxApi'
import styles from '../CompanyWorkspacePage.module.css'

type EmergencyRow = { name: string; phone: string; relation: string }

type ProfileForm = {
  phone: string
  address: string
  emergencyContacts: EmergencyRow[]
}

const EMPTY_CONTACT: EmergencyRow = { name: '', phone: '', relation: '' }

const PRIMARY_DOC_LABELS: { doc_type: string; label: string; accept: string; hint: string }[] = [
  { doc_type: 'photo', label: 'Photo', accept: 'image/*', hint: 'Image file. Upload while status is not submitted; then locked — contact HR to replace.' },
  {
    doc_type: 'gov_id',
    label: 'Government-approved ID',
    accept: 'image/*',
    hint: 'Image of your ID. Upload while not submitted; then locked — contact HR to replace.',
  },
  {
    doc_type: 'offer_letter',
    label: 'Offer letter',
    accept: '.pdf,application/pdf',
    hint: 'PDF only. Upload while not submitted; then locked — contact HR to replace.',
  },
]

function parseEmergencyContacts(info: Record<string, unknown>): EmergencyRow[] {
  const raw = info.emergencyContacts
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((x) => {
      const o = x as Record<string, unknown>
      return {
        name: String(o.name ?? ''),
        phone: String(o.phone ?? ''),
        relation: String(o.relation ?? ''),
      }
    })
  }
  const legacy = String(info.emergencyContact ?? '').trim()
  if (legacy) return [{ name: legacy, phone: '', relation: '' }]
  return [{ ...EMPTY_CONTACT }]
}

function displayFullName(emp: Employee): string {
  const info = (emp.personal_info_json ?? {}) as Record<string, unknown>
  return String(info.fullName ?? '').trim() || emp.employee_code
}

function hydrateForm(data: Employee): ProfileForm {
  const info = (data.personal_info_json ?? {}) as Record<string, unknown>
  const ec = parseEmergencyContacts(info)
  return {
    phone: String(info.phone ?? ''),
    address: String(info.address ?? ''),
    emergencyContacts: ec.length > 0 ? ec : [{ ...EMPTY_CONTACT }],
  }
}

export function MyProfilePage() {
  const { companyId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const focusParam = searchParams.get('focus')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([])
  const [docLoading, setDocLoading] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [form, setForm] = useState<ProfileForm>({
    phone: '',
    address: '',
    emergencyContacts: [{ ...EMPTY_CONTACT }],
  })

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void getMyEmployee(companyId)
      .then((r) => {
        setEmployee(r)
        setForm(hydrateForm(r))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No employee record linked to your account yet.'))
      .finally(() => setLoading(false))
  }, [companyId])

  useEffect(() => {
    if (!companyId || !employee) return
    setDocLoading(true)
    void listMyEmployeeDocuments(companyId)
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setDocLoading(false))
  }, [companyId, employee])

  const focusHighlightRemoveRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!focusParam || loading || docLoading) return
    const id = `profile-${focusParam}`
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add(styles.focusHighlight)
      focusHighlightRemoveRef.current = window.setTimeout(() => {
        el.classList.remove(styles.focusHighlight)
        focusHighlightRemoveRef.current = undefined
      }, 2400)
    }, 150)
    return () => {
      window.clearTimeout(scrollTimer)
      if (focusHighlightRemoveRef.current !== undefined) {
        window.clearTimeout(focusHighlightRemoveRef.current)
        focusHighlightRemoveRef.current = undefined
      }
      document.getElementById(id)?.classList.remove(styles.focusHighlight)
    }
  }, [focusParam, loading, docLoading])

  async function onSave() {
    setPending(true)
    setSaved(false)
    setError(null)
    try {
      const contacts = form.emergencyContacts
        .map((c) => ({
          name: c.name.trim(),
          phone: c.phone.trim(),
          relation: c.relation.trim(),
        }))
        .filter((c) => c.name || c.phone || c.relation)

      const next = await patchMyEmployee(companyId, {
        personal_info_json: {
          ...(employee?.personal_info_json ?? {}),
          phone: form.phone.trim(),
          address: form.address.trim(),
          emergencyContacts: contacts,
        },
      })
      setEmployee(next)
      setForm(hydrateForm(next))
      setSaved(true)
      invalidateInboxBadge()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setPending(false)
    }
  }

  async function onDocUpload(docType: string, fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || !companyId) return
    setUploading(docType)
    setError(null)
    try {
      const row = await uploadMyEmployeeDocument(companyId, docType, file)
      setDocuments((prev) => {
        const ix = prev.findIndex((d) => d.doc_type === docType)
        if (ix < 0) return [...prev, row]
        const next = [...prev]
        next[ix] = row
        return next
      })
      invalidateInboxBadge()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  function setContact(i: number, patch: Partial<EmergencyRow>) {
    setForm((p) => {
      const next = [...p.emergencyContacts]
      next[i] = { ...next[i], ...patch }
      return { ...p, emergencyContacts: next }
    })
  }

  function addContactRow() {
    setForm((p) => ({ ...p, emergencyContacts: [...p.emergencyContacts, { ...EMPTY_CONTACT }] }))
  }

  function removeContactRow(i: number) {
    setForm((p) => ({
      ...p,
      emergencyContacts: p.emergencyContacts.filter((_, j) => j !== i),
    }))
  }

  const govSubmitted = documents.find((d) => d.doc_type === 'gov_id')?.status === 'submitted'
  const gov2 = documents.find((d) => d.doc_type === 'gov_id_2')

  if (loading) return <p className={styles.muted}>Loading…</p>

  return (
    <section className={styles.card}>
      <h3 className={styles.h3}>My profile</h3>
      {error ? <p className={styles.error}>{error}</p> : null}
      {!employee ? (
        <p className={styles.muted}>No employee record linked to your account yet.</p>
      ) : (
        <>
          <p>Employee code: {employee.employee_code}</p>
          <div className={styles.hint} style={{ marginBottom: '0.75rem' }}>
            Full name
            <div style={{ fontWeight: 500, color: 'var(--text, inherit)', marginTop: '0.2rem' }}>{displayFullName(employee)}</div>
            <div className={styles.muted} style={{ marginTop: '0.25rem' }}>
              Name is set by HR and cannot be changed here.
            </div>
          </div>

          <div className={styles.positionForm}>
            <label className={styles.labelBlock} id="profile-phone">
              Phone (contact)
              <input
                className={styles.input}
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </label>
            <label className={styles.labelBlock} id="profile-address">
              Address
              <input
                className={styles.input}
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </label>

            <div id="profile-emergency">
            <div className={styles.hint} style={{ marginBottom: '0.35rem' }}>
              Emergency contacts
            </div>
            {form.emergencyContacts.map((row, i) => (
              <div
                key={i}
                className={styles.inline}
                style={{ alignItems: 'flex-end', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}
              >
                <label className={styles.labelBlock} style={{ minWidth: '140px' }}>
                  Name
                  <input className={styles.input} value={row.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                </label>
                <label className={styles.labelBlock} style={{ minWidth: '120px' }}>
                  Phone
                  <input className={styles.input} value={row.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
                </label>
                <label className={styles.labelBlock} style={{ minWidth: '120px' }}>
                  Relation
                  <input
                    className={styles.input}
                    value={row.relation}
                    onChange={(e) => setContact(i, { relation: e.target.value })}
                  />
                </label>
                {form.emergencyContacts.length > 1 ? (
                  <button type="button" className={styles.btnSm} onClick={() => removeContactRow(i)}>
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <button type="button" className={styles.btnSm} onClick={addContactRow}>
              Add emergency contact
            </button>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button className={styles.btnSm} disabled={pending} onClick={() => void onSave()}>
                {pending ? 'Saving…' : 'Save profile'}
              </button>
              {saved ? <p className={styles.muted}>Saved!</p> : null}
            </div>
          </div>

          <div className={styles.employeesSection} style={{ marginTop: '1.5rem' }} id="profile-documents">
            <h4 className={styles.employeesSectionHeading}>Documents</h4>
            <p className={styles.hint}>
              Upload photo, ID, and offer letter here until each is submitted. After submission, changes go through HR. Missing
              items also appear as tasks in your Inbox. After your primary ID is submitted, you may add one additional ID image
              below.
            </p>
            {docLoading ? (
              <p className={styles.muted}>Loading documents…</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Status</th>
                      <th>Your upload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRIMARY_DOC_LABELS.map((spec) => {
                      const row = documents.find((d) => d.doc_type === spec.doc_type)
                      const submitted = row?.status === 'submitted'
                      return (
                        <tr key={spec.doc_type}>
                          <td>
                            {spec.label}
                            <div className={styles.hint} style={{ marginTop: '0.25rem', fontWeight: 400 }}>
                              {spec.hint}
                            </div>
                          </td>
                          <td>{submitted ? 'Submitted' : 'Not submitted'}</td>
                          <td>
                            {submitted ? (
                              <span className={styles.muted}>Locked — contact HR to replace</span>
                            ) : (
                              <>
                                <label className={styles.inline} style={{ cursor: 'pointer' }}>
                                  <input
                                    type="file"
                                    accept={spec.accept}
                                    style={{ maxWidth: '200px' }}
                                    disabled={uploading === spec.doc_type}
                                    onChange={(e) => void onDocUpload(spec.doc_type, e.target.files)}
                                  />
                                </label>
                                {uploading === spec.doc_type ? <span className={styles.muted}> Uploading…</span> : null}
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {govSubmitted ? (
                      <tr key="gov_id_2">
                        <td>
                          Additional government ID (optional)
                          <div className={styles.hint} style={{ marginTop: '0.25rem', fontWeight: 400 }}>
                            You may upload a second ID image after the primary ID is on file.
                          </div>
                        </td>
                        <td>{gov2 ? (gov2.status === 'submitted' ? 'Submitted' : 'Not submitted') : 'Not added yet'}</td>
                        <td>
                          <label className={styles.inline} style={{ cursor: 'pointer' }}>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ maxWidth: '200px' }}
                              disabled={uploading === 'gov_id_2'}
                              onChange={(e) => void onDocUpload('gov_id_2', e.target.files)}
                            />
                          </label>
                          {uploading === 'gov_id_2' ? <span className={styles.muted}> Uploading…</span> : null}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
