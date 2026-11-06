import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { QualificationsContext, type QualificationsStore } from "./qualifications-store"
import { sections, type Entry } from "./sections"

/**
 * In-memory store for qualification entries, shared by the list and form pages.
 * TODO: replace the state updates with API calls once the back end exists.
 */
export function QualificationsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Entry[]>>(() => Object.fromEntries(sections.map(section => [section.id, section.entries])))
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), 5000)
  }, [])

  const saveEntry = useCallback<QualificationsStore["saveEntry"]>((sectionId, entryId, values, documents, mode) => {
    const id = entryId ?? crypto.randomUUID()
    const saved: Entry = { id, status: mode === "draft" ? "draft" : "submitted", values, documents }
    setEntries(current => {
      const list = current[sectionId] ?? []
      const next = entryId ? list.map(entry => entry.id === entryId ? saved : entry) : [saved, ...list]
      return { ...current, [sectionId]: next }
    })
    return id
  }, [])

  const deleteEntry = useCallback((sectionId: string, entryId: string) => {
    setEntries(current => ({ ...current, [sectionId]: (current[sectionId] ?? []).filter(entry => entry.id !== entryId) }))
  }, [])

  const replaceSection = useCallback((sectionId: string, sectionEntries: Entry[]) => {
    setEntries(current => ({ ...current, [sectionId]: sectionEntries }))
  }, [])

  const value = useMemo(() => ({ entries, saveEntry, deleteEntry, replaceSection, notice, flash }), [entries, saveEntry, deleteEntry, replaceSection, notice, flash])
  return <QualificationsContext.Provider value={value}>{children}</QualificationsContext.Provider>
}
