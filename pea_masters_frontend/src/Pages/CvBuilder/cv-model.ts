import { api } from "@/lib/api"

/**
 * CV builder data model and storage. Everything the researcher types on the CV builder page lives in one `CvData`
 * object, saved on the server as a whole (app/cv.py). Qualifications, research and teaching come from the profile.
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
  /** "Beridze N; Schulz K" - family name then initials, separated by semicolons */
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
  | "summary" | "interests" | "appointments" | "education" | "publications" | "outputs" | "grants" | "talks"
  | "teaching" | "supervision" | "awards" | "memberships" | "service" | "patents" | "languages" | "metrics"

export type CvData = {
  version: 1
  visibility: Visibility
  /** What visitors see on the public CV; the owner always sees everything */
  publicFields: { email: boolean; phone: boolean; metrics: boolean }
  template: Template
  citationStyle: CitationStyle
  sections: { id: SectionId; enabled: boolean }[]
  personal: { headline: string; phone: string; summary: string }
  profiles: ProfileLinks
  /** Show the research interests from My profile → Research instead of the CV's own list */
  useProfileInterests: boolean
  interests: string[]
  /** Research outputs (kept on My profile) this CV leaves out; everything else is shown */
  hiddenOutputs: string[]
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
  interests: { label: "Research interests", source: "My profile → Research, or CV builder" },
  appointments: { label: "Academic appointments", source: "Qualifications → Employment" },
  education: { label: "Education", source: "Qualifications → Education" },
  publications: { label: "Publications", source: "My profile → Research outputs" },
  outputs: { label: "Datasets & software", source: "My profile → Research outputs" },
  grants: { label: "Grants & research projects", source: "My profile → Research" },
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
  "summary", "interests", "appointments", "education", "publications", "outputs", "grants", "talks",
  "teaching", "supervision", "awards", "memberships", "service", "patents", "languages", "metrics",
]

export const emptyPublication = (): Omit<Publication, "id"> => ({
  type: "Journal article", status: "Published", authors: "", title: "", venue: "", year: "", volume: "", issue: "", pages: "", doi: "", url: "",
})

/** A new, empty CV: the researcher fills it in; publications come from My profile → Research outputs */
export const initialCv: CvData = {
  version: 1,
  visibility: "private",
  publicFields: { email: true, phone: false, metrics: true },
  template: "classic",
  citationStyle: "APA",
  sections: DEFAULT_ORDER.map(id => ({ id, enabled: id !== "metrics" && id !== "patents" })),
  personal: { headline: "", phone: "", summary: "" },
  profiles: { orcid: "", scopus: "", researcherId: "", scholar: "", researchGate: "", semanticScholar: "", website: "", github: "" },
  useProfileInterests: true,
  interests: [],
  hiddenOutputs: [],
  talks: [],
  metrics: { hIndex: "", citations: "", source: "Web of Science", asOf: "" },
}

/* ---------- storage ---------- */

/** The sample interests older CVs started with: not something the researcher chose */
const LEGACY_SAMPLE_INTERESTS = "Plant molecular genetics|Climate adaptation|Caucasian flora|Landraces"

const STORAGE_KEY = "pea.cv-builder.v1"

/** Fills in anything missing from older or hand-edited data, so the page never crashes on load. */
export function normaliseCv(raw: unknown): CvData | null {
  if (!raw || typeof raw !== "object") return null
  const data = raw as Partial<CvData>
  if (data.version !== 1) return null
  const known = new Set(DEFAULT_ORDER)
  // No section list at all: the default layout. Otherwise the researcher's order, with any new sections added, off.
  const sections = Array.isArray(data.sections) ? data.sections.filter(section => known.has(section?.id)) : initialCv.sections.map(section => ({ ...section }))
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
    // CVs saved before this option: keep a list the researcher wrote themselves, otherwise follow the profile
    useProfileInterests: typeof data.useProfileInterests === "boolean" ? data.useProfileInterests
      : !(Array.isArray(data.interests) && data.interests.length > 0 && data.interests.join("|") !== LEGACY_SAMPLE_INTERESTS),
    hiddenOutputs: Array.isArray(data.hiddenOutputs) ? data.hiddenOutputs.filter(id => typeof id === "string") : [],
    talks: Array.isArray(data.talks) ? data.talks.map(talk => ({ ...talk, id: talk.id || crypto.randomUUID() })) : [],
  }
}

/** The CV on the server; data is null until the person saves one */
export const cvApi = {
  get: () => api<{ data: unknown; updated_at: string | null }>("/me/cv"),
  save: (data: CvData) => api<{ data: unknown; updated_at: string }>("/me/cv", { method: "PUT", body: { data } }),
}

/* CVs used to be kept in the browser and started from a sample CV. The first time someone opens the CV builder after
   the move, their browser copy goes to the server, without the sample items. */
const SAMPLE_PUBLICATIONS = new Set(["pub1", "pub2", "pub3", "pub4"])
const SAMPLE_TALKS = new Set(["talk1", "talk2"])
const SAMPLE_HEADLINE = "Associate Professor of Biology"
const SAMPLE_SUMMARY = "I study how plants adapt to drought and climate change"

/** A CV kept in a browser, with the publications CVs used to hold (the server moves them to the profile when saved) */
export type BrowserCv = CvData & { publications: Publication[] }

/** The CV this browser kept before CVs moved to the server, minus the sample items; null when there is none */
export function browserCv(): BrowserCv | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const raw = stored ? (JSON.parse(stored) as { data: { publications?: Partial<Publication>[] } }).data : null
    const data = raw ? normaliseCv(raw) : null
    if (!data) return null
    const publications = Array.isArray(raw?.publications) ? raw.publications : []
    return {
      ...data,
      personal: {
        ...data.personal,
        headline: data.personal.headline === SAMPLE_HEADLINE ? "" : data.personal.headline,
        summary: data.personal.summary.startsWith(SAMPLE_SUMMARY) ? "" : data.personal.summary,
      },
      publications: publications.filter(pub => !SAMPLE_PUBLICATIONS.has(pub.id ?? "")).map(pub => ({ ...emptyPublication(), ...pub, id: pub.id || crypto.randomUUID() })),
      talks: data.talks.filter(talk => !SAMPLE_TALKS.has(talk.id)),
    }
  } catch {
    return null
  }
}

export function forgetBrowserCv() {
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* nothing to remove */ }
}
