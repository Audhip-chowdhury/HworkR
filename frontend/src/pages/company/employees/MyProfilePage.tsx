import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getMyEmployee, patchMyEmployee, type Employee } from '../../../api/employeesApi'
import styles from '../CompanyWorkspacePage.module.css'

type PersonalInfo = {
  fullName: string
  phone: string
  address: string
  emergencyContact: string
}

export function MyProfilePage() {
  const { companyId = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [form, setForm] = useState<PersonalInfo>({
    fullName: '',
    phone: '',
    address: '',
    emergencyContact: '',
  })

  function hydrate(data: Employee) {
    const info = (data.personal_info_json ?? {}) as Record<string, unknown>
    setForm({
      fullName: String(info.fullName ?? ''),
      phone: String(info.phone ?? ''),
      address: String(info.address ?? ''),
      emergencyContact: String(info.emergencyContact ?? ''),
    })
  }

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void getMyEmployee(companyId)
      .then((r) => {
        setEmployee(r)
        hydrate(r)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No employee record linked to your account yet.'))
      .finally(() => setLoading(false))
  }, [companyId])

  async function onSave() {
    if (!form.fullName.trim()) {
      setError('Full name is required.')
      return
    }
    setPending(true)
    setSaved(false)
    setError(null)
    try {
      const next = await patchMyEmployee(companyId, {
        personal_info_json: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          emergencyContact: form.emergencyContact.trim(),
        },
      })
      setEmployee(next)
      hydrate(next)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setPending(false)
    }
  }

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
          <div className={styles.positionForm}>
            <label className={styles.labelBlock}>Full name<input className={styles.input} value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} /></label>
            <label className={styles.labelBlock}>Phone<input className={styles.input} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label>
            <label className={styles.labelBlock}>Address<input className={styles.input} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></label>
            <label className={styles.labelBlock}>Emergency contact<input className={styles.input} value={form.emergencyContact} onChange={(e) => setForm((p) => ({ ...p, emergencyContact: e.target.value }))} /></label>
            <button className={styles.btnSm} disabled={pending} onClick={() => void onSave()}>{pending ? 'Saving…' : 'Save profile'}</button>
            {saved ? <p className={styles.muted}>Saved!</p> : null}
          </div>
        </>
      )}
    </section>
  )
}
