/**
 * CV builder data model, sample data and browser storage.
 * Everything the researcher types on the CV builder page lives in one `CvData` object,
 * so the back end can later store it as-is (TODO: replace loadCv/saveCv with API calls).
 */

export type Visibility = "private" | "public"
export type Template = "classic" | "modern" | "compact"
export type CitationStyle = "APA" | "IEEE" | "Harvard"

export type PublicationType = "Journal article" | "Conference paper" | "Book" | "Book chapter" | "Preprint" | "Thesis" | "Report"
export type PublicationStatus = "Published" | "In press" | "Under review" | "Preprint"

export type Publication = {
  id: string
  type: PublicationType
  status: PublicationStatus
  /** "Beridze N; Schulz K" — family name then initials, separated by semicolons */
  authors: string
  title: string
  venue: string
  year: string
  volume: string
  issue: string
  pages: string
  doi: string
  url: string
}

export type TalkType = "Invited talk" | "Keynote" | "Contributed talk" | "Poster" | "Seminar"
export type Talk = { id: string; title: string; event: string; location: string; date: string; type: TalkType }

export type ProfileLinks = {
  orcid: string
  scopus: string
  researcherId: string
  scholar: string
  researchGate: string
  semanticScholar: string
  website: string
  github: string
}

/** Sections of the CV, in the order the researcher chose */
export type SectionId =
  | "summary" | "interests" | "appointments" | "education" | "publications" | "grants" | "talks"
  | "teaching" | "supervision" | "awards" | "memberships" | "service" | "patents" | "languages" | "metrics"

export type CvData = {
  version: 1
  visibility: Visibility
  /** What visitors see on the public CV; the owner always sees everything */
  publicFields: { email: boolean; phone: boolean; metrics: boolean }
  template: Template
  citationStyle: CitationStyle
  /** Also show qualification entries that are still waiting for review */
  includeSubmitted: boolean
  sections: { id: SectionId; enabled: boolean }[]
  personal: { headline: string; phone: string; summary: string }
  profiles: ProfileLinks
  interests: string[]
  publications: Publication[]
  talks: Talk[]
  metrics: { hIndex: string; citations: string; source: string; asOf: string }
}

export const PUBLICATION_TYPES: readonly PublicationType[] = ["Journal article", "Conference paper", "Book", "Book chapter", "Preprint", "Thesis", "Report"]
export const PUBLICATION_STATUSES: readonly PublicationStatus[] = ["Published", "In press", "Under review", "Preprint"]
export const TALK_TYPES: readonly TalkType[] = ["Invited talk", "Keynote", "Contributed talk", "Poster", "Seminar"]
export const CITATION_STYLES: readonly CitationStyle[] = ["APA", "IEEE", "Harvard"]

export type SectionMeta = { label: string; source: string }

/** Where each section's content comes from, shown in "Sections & layout" */
export const SECTION_META: Record<SectionId, SectionMeta> = {
  summary: { label: "Research statement", source: "CV builder" },
  interests: { label: "Research interests", source: "CV builder" },
  appointments: { label: "Academic appointments", source: "Qualifications → Employment" },
  education: { label: "Education", source: "Qualifications → Education" },
  publications: { label: "Publications", source: "CV builder" },
  grants: { label: "Grants & research projects", source: "Research overview" },
  talks: { label: "Talks & presentations", source: "CV builder" },
  teaching: { label: "Teaching", source: "Teaching" },
  supervision: { label: "Student supervision", source: "Teaching" },
  awards: { label: "Awards & honours", source: "Qualifications → Awards" },
  memberships: { label: "Memberships", source: "Qualifications → Memberships" },
  service: { label: "Professional service", source: "Qualifications → Committees, Other" },
  patents: { label: "Patents", source: "Qualifications → Patents" },
  languages: { label: "Languages", source: "Qualifications → Languages" },
  metrics: { label: "Research metrics", source: "CV builder" },
}

const DEFAULT_ORDER: SectionId[] = [
  "summary", "interests", "appointments", "education", "publications", "grants", "talks",
  "teaching", "supervision", "awards", "memberships", "service", "patents", "languages", "metrics",
]

export const emptyPublication = (): Omit<Publication, "id"> => ({
  type: "Journal article", status: "Published", authors: "", title: "", venue: "", year: "", volume: "", issue: "", pages: "", doi: "", url: "",
})

/* DOIs use Crossref's 10.5555 test prefix so the sample data never points at a real paper */
export const initialCv: CvData = {
  version: 1,
  visibility: "private",
  publicFields: { email: true, phone: false, metrics: true },
  template: "classic",
  citationStyle: "APA",
  includeSubmitted: false,
  sections: DEFAULT_ORDER.map(id => ({ id, enabled: id !== "metrics" && id !== "patents" })),
  personal: {
    headline: "Associate Professor of Biology",
    phone: "",
    summary: "I study how plants adapt to drought and climate change, combining molecular genetics with field work on Caucasian wheat landraces. My lab maps drought-response genes and works with seed banks to keep local varieties available for breeding.",
  },
  profiles: { orcid: "", scopus: "", researcherId: "", scholar: "", researchGate: "", semanticScholar: "", website: "", github: "" },
  interests: ["Plant molecular genetics", "Climate adaptation", "Caucasian flora", "Landraces"],
  publications: [
    { id: "pub1", type: "Journal article", status: "Published", authors: "Beridze N; Mchedlidze D; Schulz K", title: "Allelic variation in drought-response genes of Caucasian wheat landraces", venue: "Plant Genetic Resources", year: "2024", volume: "22", issue: "3", pages: "145–158", doi: "10.5555/pea.2024.0145", url: "" },
    { id: "pub2", type: "Conference paper", status: "Published", authors: "Gelashvili A; Beridze N", title: "Root architecture of drought-tolerant wheat accessions under field conditions", venue: "Proceedings of the European Plant Science Conference", year: "2022", volume: "", issue: "", pages: "88–91", doi: "", url: "" },
    { id: "pub3", type: "Journal article", status: "In press", authors: "Beridze N; Tabatadze I; Kapanadze G", title: "A CRISPR screen for osmotic-stress regulators in Arabidopsis", venue: "Journal of Experimental Botany", year: "2025", volume: "", issue: "", pages: "", doi: "", url: "" },
    { id: "pub4", type: "Book chapter", status: "Published", authors: "Beridze N", title: "Wheat landraces of Georgia", venue: "Crop Wild Relatives of the Caucasus", year: "2021", volume: "", issue: "", pages: "201–224", doi: "", url: "" },
  ],
  talks: [
    { id: "talk1", title: "Mining landraces for drought tolerance", event: "Gordon Research Conference on Plant Stress", location: "Waterville Valley, USA", date: "2024-07", type: "Invited talk" },
    { id: "talk2", title: "Seed banks as living genetic archives", event: "Caucasus Biodiversity Forum", location: "Tbilisi, Georgia", date: "2023-10", type: "Keynote" },
  ],
  metrics: { hIndex: "", citations: "", source: "Scopus", asOf: "" },
}

/* ---------- browser storage ---------- */

const STORAGE_KEY = "pea.cv-builder.v1"

/** Fills in anything missing from older or hand-edited data, so the page never crashes on load. */
export function normaliseCv(raw: unknown): CvData | null {
  if (!raw || typeof raw !== "object") return null
  const data = raw as Partial<CvData>
  if (data.version !== 1) return null
  const known = new Set(DEFAULT_ORDER)
  const sections = Array.isArray(data.sections) ? data.sections.filter(section => known.has(section?.id)) : []
  for (const id of DEFAULT_ORDER) if (!sections.some(section => section.id === id)) sections.push({ id, enabled: false })
  return {
    ...initialCv,
    ...data,
    publicFields: { ...initialCv.publicFields, ...data.publicFields },
    personal: { ...initialCv.personal, ...data.personal },
    profiles: { ...initialCv.profiles, ...data.profiles },
    metrics: { ...initialCv.metrics, ...data.metrics },
    sections,
    interests: Array.isArray(data.interests) ? data.interests.filter(item => typeof item === "string") : [],
    publications: Array.isArray(data.publications) ? data.publications.map(pub => ({ ...emptyPublication(), ...pub, id: pub.id || crypto.randomUUID() })) : [],
    talks: Array.isArray(data.talks) ? data.talks.map(talk => ({ ...talk, id: talk.id || crypto.randomUUID() })) : [],
  }
}

export function loadCv(): { data: CvData; savedAt: number | null } {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as { data: unknown; savedAt: number }
      const data = normaliseCv(parsed.data)
      if (data) return { data, savedAt: parsed.savedAt ?? null }
    }
  } catch {
    // Storage blocked or corrupt: start from the sample data
  }
  return { data: initialCv, savedAt: null }
}

/** Returns false when the browser refuses to store data (private mode, quota). */
export function saveCv(data: CvData, savedAt: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, savedAt }))
    return true
  } catch {
    return false
  }
}
