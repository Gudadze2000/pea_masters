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
