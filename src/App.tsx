import { Route, Routes } from "react-router"
import { LoginPage } from "./Pages/Login/LoginPage"
import { HomePage } from "./Pages/MainPage/HomePage"


function App() {

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  )
}

export default App
