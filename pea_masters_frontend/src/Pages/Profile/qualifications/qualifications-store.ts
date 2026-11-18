import { createContext, useContext } from "react"
import type { Entry, EntryDocument, EntryValues } from "./sections"

export type LoadStatus = "loading" | "ready" | "error"

export type QualificationsStore = {
  entries: Record<string, Entry[]>
  /** Whether the entries have been loaded from the server */
  status: LoadStatus
  reload: () => void
  /** Creates (entryId = null) or updates an entry on the server. Resolves to the entry id; throws ApiError. */
  saveEntry: (sectionId: string, entryId: string | null, values: EntryValues, documents: EntryDocument[]) => Promise<string>
  deleteEntry: (sectionId: string, entryId: string) => Promise<void>
  /** Saves a whole section at once (the Languages table) */
  replaceSection: (sectionId: string, rows: { id?: string; values: EntryValues }[]) => Promise<Entry[]>
  /** One-off confirmation shown on the profile ("Patent saved.") */
  notice: string | null
  flash: (message: string) => void
}

export const QualificationsContext = createContext<QualificationsStore | null>(null)

export function useQualifications() {
  const store = useContext(QualificationsContext)
  if (!store) throw new Error("useQualifications must be used inside <QualificationsProvider>")
  return store
}
