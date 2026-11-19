import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-georgian'
import './index.css'
import { createBrowserRouter, RouterProvider } from 'react-router'
import App from './App'
import { LanguageProvider } from './lib/LanguageProvider'
import { applyDisplaySettings, loadSettings } from './lib/settings'

applyDisplaySettings(loadSettings())

// Pages load their own files (App.tsx). After a new version is deployed, an open tab may ask for a page file that no
// longer exists: reload once to get the new version, but never twice in a row (if it still fails, the error shows).
window.addEventListener('vite:preloadError', event => {
  const key = 'pea.reloaded-for-new-version'
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch { /* storage unavailable: still worth one reload */ }
  event.preventDefault()
  window.location.reload()
})

// One catch-all route renders the app, whose own <Routes> pick the page. A data router (rather than <BrowserRouter>)
// lets a page ask before navigating away from unsaved changes (useBlocker).
const router = createBrowserRouter([
  { path: '*', element: <LanguageProvider><App/></LanguageProvider> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
