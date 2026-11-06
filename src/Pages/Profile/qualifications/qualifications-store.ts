import { createContext, useContext } from "react"
import type { Entry, EntryDocument, EntryValues } from "./sections"

export type SaveMode = "draft" | "submit"

export type QualificationsStore = {
  entries: Record<string, Entry[]>
  /** Creates (entryId = null) or updates an entry. Returns the entry id. */
  saveEntry: (sectionId: string, entryId: string | null, values: EntryValues, documents: EntryDocument[], mode: SaveMode) => string
  deleteEntry: (sectionId: string, entryId: string) => void
  /** Replaces every entry of a section at once (used by the Languages table) */
  replaceSection: (sectionId: string, entries: Entry[]) => void
  /** One-off confirmation shown on the list page ("Patent submitted for review.") */
  notice: string | null
  flash: (message: string) => void
}

export const QualificationsContext = createContext<QualificationsStore | null>(null)

export function useQualifications() {
  const store = useContext(QualificationsContext)
  if (!store) throw new Error("useQualifications must be used inside <QualificationsProvider>")
  return store
}
