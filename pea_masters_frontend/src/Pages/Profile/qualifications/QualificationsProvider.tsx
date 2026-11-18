import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSession } from "@/lib/auth"
import { entriesApi, type ServerEntry } from "@/lib/profile-entries"
import { QualificationsContext, type LoadStatus, type QualificationsStore } from "./qualifications-store"
import type { Entry } from "./sections"

const toEntry = (entry: ServerEntry): Entry => ({ id: entry.id, values: entry.values, documents: entry.documents })

/**
 * The signed-in person's profile entries, loaded from the server and shared by every page that shows them
 * (My profile, the CV builder, the public profile preview). Every change is saved on the server first.
 */
export function QualificationsProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const userId = session?.id ?? null
  const [entries, setEntries] = useState<Record<string, Entry[]>>({})
  const [status, setStatus] = useState<LoadStatus>("loading")
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async (forUser: string) => {
    setStatus("loading")
    try {
      const listed = await entriesApi.list()
      setEntries(Object.fromEntries(Object.entries(listed).map(([section, list]) => [section, list.map(toEntry)])))
      setStatus("ready")
    } catch {
      setStatus("error")
    }
    setLoadedFor(forUser)
  }, [])

  // Load for whoever signs in; forget it all when they sign out
  useEffect(() => {
    if (userId && loadedFor !== userId) void load(userId)
    if (!userId && loadedFor) { setEntries({}); setLoadedFor(null); setStatus("loading") }
  }, [userId, loadedFor, load])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), 5000)
  }, [])

  const saveEntry = useCallback<QualificationsStore["saveEntry"]>(async (sectionId, entryId, values, documents) => {
    const ids = documents.map(doc => doc.id)
    const saved = toEntry(entryId ? await entriesApi.update(entryId, values, ids) : await entriesApi.create(sectionId, values, ids))
    setEntries(current => {
      const list = current[sectionId] ?? []
      return { ...current, [sectionId]: entryId ? list.map(entry => entry.id === entryId ? saved : entry) : [saved, ...list] }
    })
    return saved.id
  }, [])

  const deleteEntry = useCallback(async (sectionId: string, entryId: string) => {
    await entriesApi.remove(entryId)
    setEntries(current => ({ ...current, [sectionId]: (current[sectionId] ?? []).filter(entry => entry.id !== entryId) }))
  }, [])

  const replaceSection = useCallback<QualificationsStore["replaceSection"]>(async (sectionId, rows) => {
    const saved = (await entriesApi.replaceSection(sectionId, rows)).map(toEntry)
    setEntries(current => ({ ...current, [sectionId]: saved }))
    return saved
  }, [])

  const reload = useCallback(() => { if (userId) void load(userId) }, [userId, load])

  const value = useMemo<QualificationsStore>(() => ({ entries, status, reload, saveEntry, deleteEntry, replaceSection, notice, flash }),
    [entries, status, reload, saveEntry, deleteEntry, replaceSection, notice, flash])
  return <QualificationsContext.Provider value={value}>{children}</QualificationsContext.Provider>
}
