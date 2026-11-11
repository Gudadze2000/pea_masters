import { createContext, useContext } from "react"

export type Language = "KA" | "EN"

export const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void } | null>(null)

/** Interface/content language chosen in the top bar. Shared across pages. */
export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error("useLanguage must be used inside <LanguageProvider>")
  return context
}
