import { Route, Routes } from "react-router"
import { LoginPage } from "./Pages/Login/LoginPage"


function App() {

  return (
    <Routes>
      <Route index element={<LoginPage />} />
    </Routes>
  )
}

export default App
