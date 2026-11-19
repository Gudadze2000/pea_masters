import { lazy, Suspense, useEffect, useState, type ComponentType } from "react"
import { Navigate, Route, Routes } from "react-router"
import { RequireAuth } from "./components/RequireAuth"
import { RequireStaff } from "./components/RequireStaff"
import { LoginPage } from "./Pages/Login/LoginPage"
import { QualificationsProvider } from "./Pages/Profile/qualifications/QualificationsProvider"

/*
 * Each page is its own file, loaded the first time it's opened, so the first visit only downloads the app's frame and
 * the page in front of you. The login page stays in the main file: it's the first screen for anyone signed out.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then(module => ({ default: module[name] })))
}

const HomePage = page(() => import("./Pages/MainPage/HomePage"), "HomePage")
const ProfilePage = page(() => import("./Pages/Profile/ProfilePage"), "ProfilePage")
const LegacyProfileRedirect = lazy(() => import("./Pages/Profile/ProfilePage").then(module => ({ default: module.LegacyProfileRedirect })))
const CvBuilderPage = page(() => import("./Pages/CvBuilder/CvBuilderPage"), "CvBuilderPage")
const EvaluationForm = page(() => import("./Pages/EvaluationForm/EvaluationForm"), "EvaluationForm")
const SettingsPage = page(() => import("./Pages/Settings/SettingsPage"), "SettingsPage")
const PeoplePage = page(() => import("./Pages/People/PeoplePage"), "PeoplePage")
const EvaluationFormsPage = page(() => import("./Pages/EvaluationForms/EvaluationFormsPage"), "EvaluationFormsPage")
const FormEditorPage = page(() => import("./Pages/EvaluationForms/FormEditorPage"), "FormEditorPage")
const SendEvaluationsPage = page(() => import("./Pages/Evaluations/SendEvaluationsPage"), "SendEvaluationsPage")
const ReviewEvaluationPage = page(() => import("./Pages/Evaluations/ReviewEvaluationPage"), "ReviewEvaluationPage")

/** Shown while a page's file loads: nothing at first, so a quick load doesn't flash a message */
function PageLoading() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 400)
    return () => window.clearTimeout(timer)
  }, [])
  return <p className="page-loading" role="status">{visible ? "Loading…" : ""}</p>
}

function App() {

  return (
    // Qualification entries live above the routes so they survive moving between pages
    <QualificationsProvider>
      <Suspense fallback={<PageLoading />}>
        <Routes>
        {/* Landing page is the login screen; it forwards to /home when already signed in. */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        {/* Accounts are created by an organization's Admin, not by self-registration */}
        <Route path="/register" element={<Navigate to="/login" replace />} />
        {/* Everything below needs a signed-in user */}
        <Route element={<RequireAuth />}>
        <Route path="/home" element={<HomePage />} />
        {/* The whole profile is one page; the old sub-page addresses lead to the matching part of it */}
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/general" element={<LegacyProfileRedirect to="general" />} />
        <Route path="/profile/teaching" element={<LegacyProfileRedirect to="teaching" />} />
        <Route path="/profile/research" element={<LegacyProfileRedirect to="research" />} />
        <Route path="/profile/qualifications" element={<LegacyProfileRedirect to="education" />} />
        <Route path="/profile/qualifications/:sectionId" element={<LegacyProfileRedirect />} />
        <Route path="/profile/qualifications/:sectionId/new" element={<LegacyProfileRedirect />} />
        <Route path="/profile/qualifications/:sectionId/:entryId/edit" element={<LegacyProfileRedirect />} />
        <Route path="/cv-builder" element={<CvBuilderPage />} />
        <Route path="/evaluation-form" element={<EvaluationForm />} />
        <Route path="/settings/:sectionId?" element={<SettingsPage />} />
        {/* Administration: Admins and Coordinators only */}
        <Route element={<RequireStaff />}>
        <Route path="/admin/people" element={<PeoplePage />} />
        <Route path="/admin/evaluations" element={<SendEvaluationsPage />} />
        <Route path="/admin/evaluations/:evaluationId" element={<ReviewEvaluationPage />} />
        <Route path="/admin/evaluation-forms" element={<EvaluationFormsPage />} />
        {/* "new" for a new form; ?copy=<id> starts it as a copy of another */}
        <Route path="/admin/evaluation-forms/:formId" element={<FormEditorPage />} />
        </Route>
        </Route>
        </Routes>
      </Suspense>
    </QualificationsProvider>
  )
}

export default App
