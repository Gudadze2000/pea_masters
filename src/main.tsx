import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter } from 'react-router'
import App from './App'
import { LanguageProvider } from './lib/LanguageProvider'
import { applyDisplaySettings, loadSettings } from './lib/settings'

applyDisplaySettings(loadSettings())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <App/>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)
