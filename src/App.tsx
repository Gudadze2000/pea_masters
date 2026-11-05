import { Navigate, Route, Routes } from "react-router"
import { LoginPage } from "./Pages/Login/LoginPage"
import { HomePage } from "./Pages/MainPage/HomePage"
import { GeneralInformationPage } from "./Pages/Profile/GeneralInformationPage"
import { QualificationsPage } from "./Pages/Profile/qualifications/QualificationsPage"
import { EntryFormPage } from "./Pages/Profile/qualifications/EntryFormPage"
import { LanguagesPage } from "./Pages/Profile/qualifications/LanguagesPage"
import { TeachingPage } from "./Pages/Profile/teaching/TeachingPage"
import { ResearchPage } from "./Pages/Profile/research/ResearchPage"
import { QualificationsProvider } from "./Pages/Profile/qualifications/QualificationsProvider"


function App() {

  return (
    // Qualification entries live above the routes so they survive moving between pages
    <QualificationsProvider>
        <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/profile" element={<Navigate to="/profile/general" replace />} />
        <Route path="/profile/general" element={<GeneralInformationPage />} />
        <Route path="/profile/teaching" element={<TeachingPage />} />
        <Route path="/profile/research" element={<ResearchPage />} />
        <Route path="/profile/qualifications/languages" element={<LanguagesPage />} />
        <Route path="/profile/qualifications/:sectionId?" element={<QualificationsPage />} />
        <Route path="/profile/qualifications/:sectionId/new" element={<EntryFormPage />} />
        <Route path="/profile/qualifications/:sectionId/:entryId/edit" element={<EntryFormPage />} />
      </Routes>
    </QualificationsProvider>
  )
}

export default App
