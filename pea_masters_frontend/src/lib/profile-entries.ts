import { api } from "./api"

/*
 * The person's profile sections on the server (app/profile_entries.py): qualification entries with their supporting
 * documents, the Languages table, and the Research and Teaching parts.
 */

export type ServerDocument = { id: string; name: string; size: number; type: string; url: string }

export type ServerEntry = {
  id: string
  section: string
  values: Record<string, string>
  documents: ServerDocument[]
  updated_at: string
}

const ENTRIES = "/me/profile/entries"

export const entriesApi = {
  list: () => api<Record<string, ServerEntry[]>>(ENTRIES),
  create: (section: string, values: Record<string, string>, documentIds: string[]) =>
    api<ServerEntry>(ENTRIES, { method: "POST", body: { section, values, document_ids: documentIds } }),
  update: (id: string, values: Record<string, string>, documentIds: string[]) =>
    api<ServerEntry>(`${ENTRIES}/${id}`, { method: "PUT", body: { values, document_ids: documentIds } }),
  remove: (id: string) => api<null>(`${ENTRIES}/${id}`, { method: "DELETE" }),
  /** The Languages table: rows with an id are updated, the rest added, missing ones removed */
  replaceSection: (section: string, rows: { id?: string; values: Record<string, string> }[]) =>
    api<ServerEntry[]>(`/me/profile/sections/${section}`, { method: "PUT", body: { entries: rows } }),
  uploadDocument: (file: File) => {
    const form = new FormData()
    form.append("file", file, file.name)
    return api<ServerDocument>("/me/documents", { method: "POST", body: form })
  },
}

export type Project = { id: string; title: string; donor: string; startYear: string; endYear: string; type: "International" | "Local"; role: string }
export type Collaboration = { id: string; name: string; institution: string; topic: string }
export type ResearchOverview = { interests: string[]; projects: Project[]; collaborations: Collaboration[]; organisations: string[] }

export const researchApi = {
  get: () => api<ResearchOverview>("/me/profile/research"),
  save: (research: ResearchOverview) => api<ResearchOverview>("/me/profile/research", { method: "PUT", body: research }),
}

export const teachingApi = {
  get: () => api<{ interests: string[] }>("/me/profile/teaching"),
  save: (interests: string[]) => api<{ interests: string[] }>("/me/profile/teaching", { method: "PUT", body: { interests } }),
}
