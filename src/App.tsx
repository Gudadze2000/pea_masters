import { Route, Routes } from "react-router"
import { LoginPage } from "./Pages/Login/LoginPage"


function App() {

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  )
}

export default App
