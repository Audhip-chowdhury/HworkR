import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { CertificationPage } from './pages/company/certification/CertificationPage'
import { CompanyLayout } from './pages/company/CompanyLayout'
import { CompanyOrgPage } from './pages/company/CompanyOrgPage'
import { ExportsPage } from './pages/company/exports/ExportsPage'
import { RecruitmentPage } from './pages/company/recruitment/RecruitmentPage'
import { JobPostingsPage } from './pages/company/recruitment/JobPostingsPage'
import { CandidatePipelinePage } from './pages/company/recruitment/CandidatePipelinePage'
import { InterviewsPage } from './pages/company/recruitment/InterviewsPage'
import { OffersPage } from './pages/company/recruitment/OffersPage'
import { CandidatePortalPage } from './pages/company/recruitment/CandidatePortalPage'
import { ScenariosPage } from './pages/company/scenarios/ScenariosPage'
import { TrackingPage } from './pages/company/tracking/TrackingPage'
import { WebhooksPage } from './pages/company/webhooks/WebhooksPage'
import { WorkflowInstancePage } from './pages/company/workflows/WorkflowInstancePage'
import { WorkflowsPage } from './pages/company/workflows/WorkflowsPage'
import { SsoPage } from './pages/company/integrations/SsoPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { PlatformCompaniesPage } from './pages/platform/PlatformCompaniesPage'
import { RegisterCompanyPage } from './pages/RegisterCompanyPage'
import { WorkspaceDashboardPage } from './pages/company/dashboard/WorkspaceDashboardPage'
import { EmployeesPage } from './pages/company/employees/EmployeesPage'
import { EmployeeDetailPage } from './pages/company/employees/EmployeeDetailPage'
import { MembersPage } from './pages/company/members/MembersPage'
import { HrOpsPage } from './pages/company/hr-ops/HrOpsPage'
import { PerformancePage } from './pages/company/performance/PerformancePage'
import { EmployeeMyGoalsPage } from './pages/company/performance/EmployeeMyGoalsPage'
import { ManagerTeamGoalsPage } from './pages/company/performance/ManagerTeamGoalsPage'
import { LearningPage } from './pages/company/learning/LearningPage'
import { PayrollPage } from './pages/company/payroll/PayrollPage'
import { BenefitsPage } from './pages/company/benefits/BenefitsPage'
import { SurveysPage } from './pages/company/surveys/SurveysPage'
import { InboxPage } from './pages/company/inbox/InboxPage'
import { AnalyticsPage } from './pages/company/analytics/AnalyticsPage'
import { MyProfilePage } from './pages/company/employees/MyProfilePage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PlatformAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    )
  }
  if (!user?.is_platform_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/register-company"
        element={
          <ProtectedRoute>
            <RegisterCompanyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/platform"
        element={
          <ProtectedRoute>
            <PlatformAdminRoute>
              <PlatformCompaniesPage />
            </PlatformAdminRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/company/:companyId"
        element={
          <ProtectedRoute>
            <CompanyLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<WorkspaceDashboardPage />} />
        <Route path="org" element={<CompanyOrgPage />} />
        <Route path="my-profile" element={<MyProfilePage />} />
        <Route path="my-goals" element={<EmployeeMyGoalsPage />} />
        <Route path="team-goals" element={<ManagerTeamGoalsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:employeeId" element={<EmployeeDetailPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="hr-ops" element={<HrOpsPage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="workflows/:instanceId" element={<WorkflowInstancePage />} />
        <Route path="recruitment" element={<RecruitmentPage />} />
        <Route path="recruitment/postings" element={<JobPostingsPage />} />
        <Route path="recruitment/pipeline" element={<CandidatePipelinePage />} />
        <Route path="recruitment/interviews" element={<InterviewsPage />} />
        <Route path="recruitment/offers" element={<OffersPage />} />
        <Route path="recruitment/candidate-portal" element={<CandidatePortalPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="learning" element={<LearningPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="benefits" element={<BenefitsPage />} />
        <Route path="surveys" element={<SurveysPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="tracking" element={<TrackingPage />} />
        <Route path="certification" element={<CertificationPage />} />
        <Route path="exports" element={<ExportsPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="scenarios" element={<ScenariosPage />} />
        <Route path="integrations/sso" element={<SsoPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
