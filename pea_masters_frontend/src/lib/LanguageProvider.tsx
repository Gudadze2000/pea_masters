import { useState, type ReactNode } from "react"
import { LanguageContext, type Language } from "./language-context"
import { loadSettings, saveSettings } from "./settings"

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => loadSettings().language)
  // Remember the choice (top bar or Settings) for the next visit
  const setLanguage = (next: Language) => {
    setLanguageState(next)
    saveSettings({ ...loadSettings(), language: next })
  }
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}
