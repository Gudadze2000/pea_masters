import { useSyncExternalStore } from "react"
import { api } from "./api"
import { shortAuthor, type OrcidWork, type WosArticle } from "./wos"

/*
 * Research outputs on the profile (app/research_outputs.py): publications, datasets, and software and code. Kept
 * all year; the CV builder and the evaluation form read them from here.
 */

export type OutputKind = "publication" | "dataset" | "software"
export type OutputSource = "manual" | "doi" | "wos" | "orcid" | "bibtex" | "cv"

export type ResearchOutput = {
  id: string
  kind: OutputKind
  subtype: string
  status: string
  title: string
  /** "Beridze N; Schulz K": family name and initials, separated by semicolons */
  authors: string
  /** Journal, conference or book; for datasets and software, the repository or publisher */
  venue: string
  year: number | null
  volume: string
  issue: string
  pages: string
  version: string
  license: string
  doi: string
  url: string
  description: string
  source: OutputSource
  created_at: string
  updated_at: string
}

export type OutputDraft = Omit<ResearchOutput, "id" | "created_at" | "updated_at">

export const OUTPUT_KINDS: Record<OutputKind, { label: string; plural: string; subtypes: string[] }> = {
  publication: { label: "Publication", plural: "Publications", subtypes: ["Journal article", "Conference paper", "Book", "Book chapter", "Preprint", "Thesis", "Report"] },
  dataset: { label: "Dataset", plural: "Datasets", subtypes: ["Dataset", "Database"] },
  software: { label: "Software or code", plural: "Software and code", subtypes: ["Software", "Code", "Model"] },
}
export const STATUSES = ["Published", "In press", "Under review", "Preprint"]

export function emptyDraft(kind: OutputKind): OutputDraft {
  return {
    kind, subtype: OUTPUT_KINDS[kind].subtypes[0], status: "Published", title: "", authors: "", venue: "", year: null,
    volume: "", issue: "", pages: "", version: "", license: "", doi: "", url: "", description: "", source: "manual",
  }
}

/** What makes two outputs the same: their DOI, or (without one) their title and year. The server uses the same rule. */
export const outputKey = (output: Pick<OutputDraft, "doi" | "title" | "year">) =>
  output.doi ? `doi:${cleanDoi(output.doi)}` : `title:${output.title.toLowerCase().replace(/[\W_]+/g, "")}:${output.year ?? ""}`

/** "https://doi.org/10.1000/ABC" → "10.1000/abc" */
export const cleanDoi = (value: string) => value.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "").toLowerCase()
export const isDoi = (value: string) => /^10\.\d{4,9}\/\S+$/.test(cleanDoi(value))

const URL_BASE = "/me/research-outputs"

export const outputsApi = {
  list: () => api<ResearchOutput[]>(URL_BASE),
  add: (draft: OutputDraft) => api<ResearchOutput>(URL_BASE, { method: "POST", body: draft }),
  import: (items: OutputDraft[]) => api<{ added: ResearchOutput[]; skipped: number }>(`${URL_BASE}/import`, { method: "POST", body: { items } }),
  update: (id: string, draft: OutputDraft) => api<ResearchOutput>(`${URL_BASE}/${id}`, { method: "PUT", body: draft }),
  remove: (id: string) => api<null>(`${URL_BASE}/${id}`, { method: "DELETE" }),
}

/* ---------- a shared store: the profile page and its section see the same list ---------- */

type State = { status: "loading" | "ready" | "error"; outputs: ResearchOutput[] }
let state: State = { status: "loading", outputs: [] }
const listeners = new Set<() => void>()
let loading: Promise<void> | null = null

function set(next: State) {
  state = next
  listeners.forEach(listener => listener())
}

const sorted = (outputs: ResearchOutput[]) => [...outputs].sort((a, b) =>
  (b.year ?? 9999) - (a.year ?? 9999) || b.created_at.localeCompare(a.created_at))

export function loadOutputs(): Promise<void> {
  loading ??= outputsApi.list()
    .then(outputs => set({ status: "ready", outputs: sorted(outputs) }))
    .catch(() => set({ ...state, status: "error" }))
    .finally(() => { loading = null })
  return loading
}

export function useOutputs(): State {
  return useSyncExternalStore(listener => {
    listeners.add(listener)
    if (state.status !== "ready" && !loading) void loadOutputs()
    return () => { listeners.delete(listener) }
  }, () => state)
}

/** After a change on the server: put the saved outputs into the list (replacing ones with the same id) */
export function storeOutputs(saved: ResearchOutput[], removedId?: string) {
  const ids = new Set(saved.map(output => output.id))
  set({ status: "ready", outputs: sorted([...state.outputs.filter(o => !ids.has(o.id) && o.id !== removedId), ...saved]) })
}

/* ---------- from Web of Science, ORCID and DOIs ---------- */

/** Web of Science writes journal names in capitals: "PLANT GENETIC RESOURCES" → "Plant Genetic Resources" */
export function titleCase(name: string) {
  if (name !== name.toUpperCase()) return name
  const small = new Set(["of", "and", "the", "in", "for", "on", "at", "to", "a", "an", "&"])
  return name.toLowerCase().split(" ").map((word, i) => (i > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))).join(" ")
}

const WOS_TYPES: [RegExp, string][] = [
  [/proceedings|meeting/i, "Conference paper"], [/book chapter/i, "Book chapter"], [/^book$/i, "Book"],
  [/early access|preprint/i, "Preprint"], [/data ?set|data paper/i, "Dataset"], [/software/i, "Software"],
]

export function fromWos(article: WosArticle): OutputDraft {
  const subtype = WOS_TYPES.find(([pattern]) => pattern.test(article.document_types.join(" ")))?.[1] ?? "Journal article"
  const kind: OutputKind = subtype === "Dataset" ? "dataset" : subtype === "Software" ? "software" : "publication"
  return {
    ...emptyDraft(kind), subtype, status: subtype === "Preprint" ? "Preprint" : "Published", source: "wos",
    authors: article.authors.map(author => shortAuthor(author.name)).join("; "),
    title: article.title ?? "", venue: titleCase(article.source_title ?? ""), year: article.year,
    volume: article.volume ?? "", issue: article.issue ?? "", pages: article.pages ?? "",
    doi: article.doi, url: article.doi ? "" : article.record_url ?? "",
  }
}

const ORCID_TYPES: Record<string, [OutputKind, string]> = {
  "journal-article": ["publication", "Journal article"], "conference-paper": ["publication", "Conference paper"],
  "conference-abstract": ["publication", "Conference paper"], "conference-poster": ["publication", "Conference paper"],
  "book": ["publication", "Book"], "edited-book": ["publication", "Book"], "book-chapter": ["publication", "Book chapter"],
  "preprint": ["publication", "Preprint"], "dissertation-thesis": ["publication", "Thesis"], "report": ["publication", "Report"],
  "working-paper": ["publication", "Report"], "data-set": ["dataset", "Dataset"], "data-management-plan": ["dataset", "Dataset"],
  "software": ["software", "Software"],
}

/** ORCID's work summaries have no co-authors, so the researcher is listed as author until they check */
export function fromOrcid(work: OrcidWork, ownAuthor: string): OutputDraft {
  const [kind, subtype] = ORCID_TYPES[work.type ?? ""] ?? ["publication", work.type ? "Report" : "Journal article"]
  return {
    ...emptyDraft(kind), subtype, status: subtype === "Preprint" ? "Preprint" : "Published", source: "orcid",
    authors: ownAuthor, title: work.title, venue: work.journal ?? "", year: work.year,
    doi: work.doi ?? "", url: work.doi ? "" : work.url ?? "",
  }
}

const CROSSREF_TYPES: Record<string, [OutputKind, string]> = {
  "journal-article": ["publication", "Journal article"], "proceedings-article": ["publication", "Conference paper"],
  "book": ["publication", "Book"], "monograph": ["publication", "Book"], "edited-book": ["publication", "Book"],
  "book-chapter": ["publication", "Book chapter"], "posted-content": ["publication", "Preprint"],
  "dissertation": ["publication", "Thesis"], "report": ["publication", "Report"], "dataset": ["dataset", "Dataset"],
  "database": ["dataset", "Database"],
}

const DATACITE_TYPES: Record<string, [OutputKind, string]> = {
  Dataset: ["dataset", "Dataset"], Software: ["software", "Software"], ComputationalNotebook: ["software", "Code"],
  Model: ["software", "Model"], JournalArticle: ["publication", "Journal article"], Preprint: ["publication", "Preprint"],
  Book: ["publication", "Book"], BookChapter: ["publication", "Book chapter"], ConferencePaper: ["publication", "Conference paper"],
  Dissertation: ["publication", "Thesis"], Report: ["publication", "Report"], Text: ["publication", "Report"],
}

/** Crossref and DataCite titles sometimes contain markup such as <i>…</i> */
function plain(text: string) {
  return new DOMParser().parseFromString(text, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`the lookup answered with an error (${response.status})`)
  return response.json()
}

type CrossrefWork = {
  type?: string; title?: string[]; author?: { given?: string; family?: string; name?: string }[]
  "container-title"?: string[]; publisher?: string; issued?: { "date-parts"?: number[][] }
  volume?: string; issue?: string; page?: string; DOI?: string
}

type DataciteAttributes = {
  titles?: { title?: string }[]; creators?: { name?: string; givenName?: string; familyName?: string }[]
  publisher?: string | { name?: string }; publicationYear?: number | string; version?: string
  rightsList?: { rights?: string }[]; types?: { resourceTypeGeneral?: string }; descriptions?: { description?: string }[]
}

const author = (family?: string, given?: string, name?: string) => (family ? shortAuthor(`${family}, ${given ?? ""}`) : name ?? "")

/**
 * Looks a DOI up: Crossref first (journals, books, conferences), then DataCite (datasets, software, repositories
 * such as Zenodo). Both are public and need no key. Throws an Error with a message people can read.
 */
export async function lookupDoi(input: string, signal?: AbortSignal): Promise<OutputDraft> {
  const doi = cleanDoi(input)
  try {
    const crossref = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, signal) as { message: CrossrefWork } | null
    if (crossref) {
      const work = crossref.message
      const [kind, subtype] = CROSSREF_TYPES[work.type ?? ""] ?? ["publication", "Journal article"]
      return {
        ...emptyDraft(kind), subtype, status: subtype === "Preprint" ? "Preprint" : "Published", source: "doi", doi,
        authors: (work.author ?? []).map(a => author(a.family, a.given, a.name)).filter(Boolean).join("; "),
        title: plain(work.title?.[0] ?? ""),
        venue: plain(work["container-title"]?.[0] ?? (kind === "publication" ? "" : work.publisher ?? "")),
        year: work.issued?.["date-parts"]?.[0]?.[0] ?? null,
        volume: work.volume ?? "", issue: work.issue ?? "", pages: (work.page ?? "").replace(/\s*[-–]+\s*/g, "-"),
      }
    }
    const datacite = await getJson(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`, signal) as { data: { attributes: DataciteAttributes } } | null
    if (datacite) {
      const record = datacite.data.attributes
      const [kind, subtype] = DATACITE_TYPES[record.types?.resourceTypeGeneral ?? ""] ?? ["dataset", "Dataset"]
      const publisher = typeof record.publisher === "string" ? record.publisher : record.publisher?.name ?? ""
      return {
        ...emptyDraft(kind), subtype, source: "doi", doi,
        authors: (record.creators ?? []).map(c => author(c.familyName, c.givenName, c.name)).filter(Boolean).join("; "),
        title: plain(record.titles?.[0]?.title ?? ""), venue: publisher,
        year: record.publicationYear ? Number(record.publicationYear) || null : null,
        version: record.version ?? "", license: record.rightsList?.[0]?.rights ?? "",
        description: plain(record.descriptions?.[0]?.description ?? "").slice(0, 2000),
      }
    }
  } catch (cause) {
    if ((cause as Error).name === "AbortError") throw cause
    throw new Error(`Couldn't look the DOI up: ${(cause as Error).message || "check your connection and try again"}.`, { cause })
  }
  throw new Error("Nothing was found for this DOI in Crossref or DataCite. Check it for typos.")
}
