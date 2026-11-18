import { api } from "./api"

/** GET /api/v1/wos/lookup: an article as Web of Science Core Collection knows it (app/wos.py) */
export type WosArticle = {
  doi: string
  found: boolean
  title: string | null
  document_types: string[]
  source_title: string | null
  year: number | null
  volume: string | null
  issue: string | null
  pages: string | null
  authors: { name: string; researcher_id: string | null }[]
  author_count: number
  /** Whether the signed-in person's family name is among the authors; null when unknown */
  includes_you: boolean | null
  times_cited: number | null
  record_url: string | null
  citing_url: string | null
  checked_at: string
}

const DOI = /\b10\.\d{4,9}\/[^\s"<>]+/i

/** The first DOI in a piece of text ("DOI 10.1007/s00425-023-04102", a doi.org link, a full citation) */
export function findDoi(text: string): string | null {
  const match = text.match(DOI)
  return match ? match[0].replace(/[.,;]+$/, "").toLowerCase() : null
}

export const lookupDoi = (doi: string) => api<WosArticle>(`/wos/lookup?doi=${encodeURIComponent(doi)}`)

/** "Schulz K, Beridze N (2023). Title. PLANTA 258(4), 71-84. doi:…" from what Web of Science returned */
export function citationOf(article: WosArticle) {
  const names = article.authors.slice(0, 6).map(author => author.name)
  const authors = names.join("; ") + (article.author_count > names.length ? " et al." : "")
  const where = [article.source_title, article.volume && `${article.volume}${article.issue ? `(${article.issue})` : ""}`, article.pages].filter(Boolean).join(", ")
  return `${authors}${article.year ? ` (${article.year})` : ""}. ${article.title ?? ""}. ${where}.`.replace(/\s+/g, " ").trim()
}

/** GET /api/v1/wos/me/documents: the signed-in person's Web of Science documents, by ResearcherID / ORCID iD */
export type AuthorDocuments = {
  researcher_id: string | null
  orcid: string | null
  /** All matches; documents holds at most 1000 */
  total: number
  /** Newest first */
  documents: WosArticle[]
  metrics: { documents: number; times_cited: number; h_index: number }
  checked_at: string
}

export function fetchMyDocuments(years?: { from: number; to: number }) {
  const query = years ? `?from_year=${years.from}&to_year=${years.to}` : ""
  return api<AuthorDocuments>(`/wos/me/documents${query}`)
}

/** "LeCun, Yann" → "LeCun Y", the CV builder's author style */
export function shortAuthor(name: string) {
  const [family, given = ""] = name.split(",").map(part => part.trim())
  const initials = given.split(/[\s-]+/).filter(Boolean).map(word => word[0].toUpperCase()).join("")
  return initials ? `${family} ${initials}` : family
}

/** Normalized title, for spotting the same article typed slightly differently */
export const titleKey = (title: string) => title.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]+/gu, "")

/** GET /api/v1/crossref/lookup: is the DOI registered at all, and what is it (app/crossref.py) */
export type CrossrefWork = {
  doi: string
  found: boolean
  type: string | null
  title: string | null
  container_title: string | null
  issns: string[]
  publisher: string | null
  year: number | null
  authors: string[]
  checked_at: string
}

/** GET /api/v1/wos/journal: is the journal in Web of Science's journal list (JCR) */
export type WosJournal = { issn: string; found: boolean; name: string | null; iso_title: string | null; jcr_url: string | null; checked_at: string }

export const lookupCrossref = (doi: string) => api<CrossrefWork>(`/crossref/lookup?doi=${encodeURIComponent(doi)}`)
export const lookupJournal = (issn: string) => api<WosJournal>(`/wos/journal?issn=${encodeURIComponent(issn)}`)

const CROSSREF_TYPES: Record<string, string> = {
  "journal-article": "Journal article", "book-chapter": "Book chapter", "book": "Book", "monograph": "Book",
  "edited-book": "Edited book", "proceedings-article": "Conference paper", "posted-content": "Preprint",
  "dissertation": "Thesis", "report": "Report",
}
export const crossrefType = (type: string | null) => (type && CROSSREF_TYPES[type]) || "Publication"

export function crossrefCitation(work: CrossrefWork) {
  const names = work.authors.slice(0, 6)
  const authors = names.join("; ") + (work.authors.length > names.length ? " et al." : "")
  return `${authors}${work.year ? ` (${work.year})` : ""}. ${work.title ?? ""}. ${work.container_title ?? work.publisher ?? ""}.`.replace(/\s+/g, " ").replace(/^\. /, "").trim()
}

/** GET /api/v1/orcid/me/works: public works on the person's ORCID record (app/orcid.py) */
export type OrcidWork = { put_code: number; title: string; type: string | null; year: number | null; journal: string | null; doi: string | null; url: string | null }
export type OrcidWorks = { orcid: string; verified: boolean; works: OrcidWork[]; checked_at: string }
export const fetchOrcidWorks = () => api<OrcidWorks>("/orcid/me/works")
