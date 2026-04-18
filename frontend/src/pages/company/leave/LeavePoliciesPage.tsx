import styles from '../CompanyWorkspacePage.module.css'

export function LeavePoliciesPage() {
  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Company leave policy</h3>
        <p className={styles.hint}>
          This page summarizes how time off works for everyone in the company. Allocations below are the standard annual entitlements;
          your remaining balances appear on the <strong>Leave request</strong> page.
        </p>

        <div style={{ marginTop: '1.25rem', lineHeight: 1.65 }}>
          <h4 className={styles.h4} style={{ marginBottom: '0.5rem' }}>
            Overview
          </h4>
          <p>
            We use a single annual leave year aligned with the calendar year (1 Jan – 31 Dec). Requests should be submitted in
            advance where possible. Managers or HR may approve or decline requests based on coverage and policy. Public holidays
            (see <strong>Holiday calendar</strong>) do not count against your leave balance.
          </p>

          <h4 className={styles.h4} style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
            Leave types
          </h4>
          <ul className={styles.ul}>
            <li>
              <strong>Paid leave</strong> — Planned vacation and general paid time off. Use for pre-approved absences that are not
              due to illness.
            </li>
            <li>
              <strong>Sick leave</strong> — Short-term illness or medical appointments. Short notice is acceptable; longer spans may
              require documentation if requested by HR.
            </li>
            <li>
              <strong>Casual leave</strong> — Short personal matters (e.g. urgent errands). Subject to the same approval process.
            </li>
            <li>
              <strong>Unpaid leave</strong> — Extended time off without pay, subject to approval and business needs.
            </li>
          </ul>

          <h4 className={styles.h4} style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
            Annual allocation (per employee)
          </h4>
          <p className={styles.hint} style={{ marginBottom: '0.5rem' }}>
            Typical yearly grants below; your exact balances are tracked in the system.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Leave type</th>
                  <th>Days per year</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Paid</td>
                  <td>20</td>
                </tr>
                <tr>
                  <td>Sick</td>
                  <td>10</td>
                </tr>
                <tr>
                  <td>Casual</td>
                  <td>7</td>
                </tr>
                <tr>
                  <td>Unpaid</td>
                  <td>As approved (no fixed grant)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className={styles.h4} style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
            Carry forward (year end)
          </h4>
          <p>
            Only <strong>paid</strong> and <strong>sick</strong> leave balances may roll into the next calendar year, and only up
            to the caps below. Other types do not carry forward. Unused amounts above these caps are forfeited unless otherwise
            agreed in writing by HR.
          </p>
          <div className={styles.tableWrap} style={{ marginTop: '0.5rem' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Leave type</th>
                  <th>Maximum carry forward</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Paid</td>
                  <td>Up to 5 days</td>
                </tr>
                <tr>
                  <td>Sick</td>
                  <td>Up to 3 days</td>
                </tr>
                <tr>
                  <td>Casual / Unpaid</td>
                  <td>Not carried forward</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className={styles.muted} style={{ marginTop: '1rem' }}>
            This summary is for information only. HR may update detailed rules; check with your manager for team-specific expectations.
          </p>
        </div>
      </section>
    </div>
  )
}
