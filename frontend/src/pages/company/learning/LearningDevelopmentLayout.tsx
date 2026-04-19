import { Outlet } from 'react-router-dom'
import styles from '../CompanyWorkspacePage.module.css'

/** Routes render here; subtabs are only in the sidebar (nav). */
export function LearningDevelopmentLayout() {
  return (
    <div className={styles.org}>
      <Outlet />
    </div>
  )
}
