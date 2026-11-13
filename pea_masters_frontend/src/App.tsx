import { Navigate, Route, Routes } from "react-router"
import { RequireAuth } from "./components/RequireAuth"
import { LoginPage } from "./Pages/Login/LoginPage"
import { HomePage } from "./Pages/MainPage/HomePage"
import { LegacyProfileRedirect, ProfilePage } from "./Pages/Profile/ProfilePage"
import { QualificationsProvider } from "./Pages/Profile/qualifications/QualificationsProvider"
import { CvBuilderPage } from "./Pages/CvBuilder/CvBuilderPage"
import { EvaluationForm } from "./Pages/EvaluationForm/EvaluationForm"
import { SettingsPage } from "./Pages/Settings/SettingsPage"
import { PeoplePage } from "./Pages/People/PeoplePage"


function App() {

  return (
    // Qualification entries live above the routes so they survive moving between pages
    <QualificationsProvider>
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
        <Route path="/admin/people" element={<PeoplePage />} />
        </Route>
      </Routes>
    </QualificationsProvider>
  )
}

export default App
