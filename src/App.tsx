import { Navigate, Route, Routes } from "react-router"
import { LoginPage } from "./Pages/Login/LoginPage"
import { HomePage } from "./Pages/MainPage/HomePage"
import { GeneralInformationPage } from "./Pages/Profile/GeneralInformationPage"
import { QualificationsPage } from "./Pages/Profile/qualifications/QualificationsPage"
import { LanguagesPage } from "./Pages/Profile/qualifications/LanguagesPage"
import { TeachingPage } from "./Pages/Profile/teaching/TeachingPage"
import { ResearchPage } from "./Pages/Profile/research/ResearchPage"
import { QualificationsProvider } from "./Pages/Profile/qualifications/QualificationsProvider"
import { CvBuilderPage } from "./Pages/CvBuilder/CvBuilderPage"
import { EvaluationForm } from "./Pages/EvaluationForm/EvaluationForm"
import { SettingsPage } from "./Pages/Settings/SettingsPage"


function App() {

  return (
    // Qualification entries live above the routes so they survive moving between pages
    <QualificationsProvider>
        <Routes>
        {/* Landing page is the login screen; it forwards to /home when already signed in. No route is restricted yet. */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<LoginPage mode="register" />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/profile" element={<Navigate to="/profile/general" replace />} />
        <Route path="/profile/general" element={<GeneralInformationPage />} />
        <Route path="/profile/teaching" element={<TeachingPage />} />
        <Route path="/profile/research" element={<ResearchPage />} />
        <Route path="/profile/qualifications/languages" element={<LanguagesPage />} />
        <Route path="/profile/qualifications/:sectionId?" element={<QualificationsPage />} />
        <Route path="/profile/qualifications/:sectionId/new" element={<QualificationsPage />} />
        <Route path="/profile/qualifications/:sectionId/:entryId/edit" element={<QualificationsPage />} />
        <Route path="/cv-builder" element={<CvBuilderPage />} />
        <Route path="/evaluation-form" element={<EvaluationForm />} />
        <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
        <Route path="/settings/:sectionId" element={<SettingsPage />} />
      </Routes>
    </QualificationsProvider>
  )
}

export default App
