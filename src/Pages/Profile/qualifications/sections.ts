import { Award, Briefcase, BriefcaseBusiness, Building2, Calendar, FileText, Globe, GraduationCap, Hash, Languages, List, MapPin, Paperclip, Star, UserRound, Users, type LucideIcon } from "lucide-react"
import type { FieldDef } from "@/components/forms/field-types"
import { COUNTRIES } from "./countries"
import { LANGUAGES, LEVELS, levelLabel } from "./languages"

/**
 * Configuration for every "Professional & qualifications" sub-section.
 * One generic list page and one generic form page render all of them,
 * so adding a field or a section only means editing this file.
 */

export type EntryStatus = "draft" | "submitted" | "approved" | "rejected"
export type EntryValues = Record<string, string>
export type EntryDocument = { id: string; name: string; size: number; type: string }

export type Entry = {
  id: string
  status: EntryStatus
  values: EntryValues
  documents: EntryDocument[]
  /** Reviewer comment shown when the entry is rejected */
  adminComment?: string
  reviewer?: string
}

export type { FieldDef }

export type FieldGroup = { title: string; fields: FieldDef[] }

export type MetaItem = { icon: LucideIcon; text: string; href?: string }

export type SectionDef = {
  id: string
  label: string
  /** Shorter label for the breadcrumb, e.g. "Patents" */
  shortLabel: string
  icon: LucideIcon
  /** Shown under the list heading */
  description: string
  /** Shown under the form page title */
  formDescription: string
  /** Lower-case singular noun: "Add award", "New award" */
  noun: string
  groups: FieldGroup[]
  /** Field a draft needs so it can be found again in the list */
  titleField: string
  /** Pairs of date fields where the second can't be before the first */
  dateOrder?: [string, string][]
  /** Wording on the upload box, e.g. "Upload certificate" */
  documentLabel: string
  titleOf: (values: EntryValues) => string
  metaOf: (values: EntryValues) => MetaItem[]
  descriptionOf: (values: EntryValues) => string | undefined
  entries: Entry[]
}

/* ---------- formatting helpers ---------- */

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "2021-03-12" → "12 Mar 2021" */
export function formatDate(value: string | undefined) {
  if (!value) return ""
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatPeriod(start: string | undefined, end: string | undefined) {
  if (!start && !end) return ""
  return `${formatDate(start) || "?"} - ${end ? formatDate(end) : "present"}`
}

/** "https://gnsf.ge/x" → "gnsf.ge/x" */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "")

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const allFields = (section: SectionDef) => section.groups.flatMap(group => group.fields)

const meta = (items: (MetaItem | false | undefined)[]) => items.filter((item): item is MetaItem => !!item && !!item.text)
const urlMeta = (url: string | undefined): MetaItem | undefined => url ? { icon: Globe, text: displayUrl(url), href: url } : undefined
const dateMeta = (value: string | undefined): MetaItem => ({ icon: Calendar, text: formatDate(value) })
const periodMeta = (v: EntryValues): MetaItem => ({ icon: Calendar, text: formatPeriod(v.start, v.end) })
const placeMeta = (...parts: (string | undefined)[]): MetaItem => ({ icon: MapPin, text: parts.filter(Boolean).join(", ") })

/* ---------- shared fields ---------- */

const country = (label = "Country", required = false): FieldDef => ({ name: "country", label, type: "select", required, span: 2, options: COUNTRIES })
const startDate: FieldDef = { name: "start", label: "Start date", type: "date", required: true, span: 1 }
const endDate: FieldDef = { name: "end", label: "End date", type: "date", span: 1, hint: "Leave empty if ongoing." }
/** Every form ends with a remark for the reviewer and a URL, as in the patents design */
const reviewFields: FieldDef[] = [
  { name: "comment", label: "Comment", type: "textarea", span: 2, rows: 3, placeholder: "Optional remarks for the reviewer" },
  { name: "url", label: "URL", type: "url", span: 2, placeholder: "https://" },
]

let seed = 0
const entry = (status: EntryStatus, values: EntryValues, extra: { documents?: Omit<EntryDocument, "id">[]; comment?: string; reviewer?: string } = {}): Entry => ({
  id: `seed-${++seed}`,
  status,
  values,
  documents: (extra.documents ?? []).map(doc => ({ ...doc, id: `doc-${seed}-${doc.name}` })),
  adminComment: extra.comment,
  reviewer: extra.reviewer,
})
const pdf = (name: string, size: number) => ({ name, size, type: "application/pdf" })

/* ---------- sections ---------- */

export const sections: SectionDef[] = [
  {
    id: "awards",
    label: "Awards",
    shortLabel: "Awards",
    icon: Award,
    description: "Honours, prizes and distinctions. You can add several entries.",
    formDescription: "Honours, prizes and distinctions",
    noun: "award",
    titleField: "title",
    documentLabel: "Upload award certificate",
    groups: [
      { title: "Award details", fields: [
        { name: "title", label: "Award title", type: "text", required: true },
        { name: "body", label: "Award body", type: "text", required: true, span: 2 },
        country(),
      ] },
      { title: "Dates", fields: [{ name: "date", label: "Award date", type: "date", required: true, span: 1 }] },
      { title: "Description", fields: [
        { name: "reason", label: "Reason", type: "textarea", hint: "Briefly describe why the award was granted." },
        ...reviewFields,
      ] },
    ],
    titleOf: v => v.title,
    metaOf: v => meta([dateMeta(v.date), { icon: Building2, text: v.body }, urlMeta(v.url)]),
    descriptionOf: v => v.reason,
    entries: [
      entry("approved", { title: "Young Scientist Award", date: "2023-06-15", body: "Georgian National Science Foundation", country: "Georgia", url: "https://gnsf.ge/awards/2023", reason: "Awarded for outstanding contribution to plant molecular genetics by an early-career researcher." }, { documents: [pdf("young-scientist-award.pdf", 840_000)] }),
      entry("submitted", { title: "Best Poster - European Plant Science Conference", date: "2022-09-08", body: "EPSO", country: "Italy", reason: "Poster on drought-response genes in Caucasian wheat landraces." }),
      entry("rejected", { title: "Faculty Teaching Excellence Prize", date: "2021-03-20", body: "Ilia State University", country: "Georgia", reason: "Recognition for innovative teaching in bioinformatics." }, { comment: "Please add a supporting document or URL.", reviewer: "Giorgi Kapanadze" }),
    ],
  },
  {
    id: "memberships",
    label: "Memberships",
    shortLabel: "Memberships",
    icon: Users,
    description: "Professional associations, academies and societies you belong to.",
    formDescription: "Associations, academies and professional societies",
    noun: "membership",
    titleField: "organisation",
    dateOrder: [["start", "end"]],
    documentLabel: "Upload membership confirmation",
    groups: [
      { title: "Membership details", fields: [
        { name: "organisation", label: "Organisation", type: "text", required: true },
        { name: "role", label: "Membership type / role", type: "text", required: true, span: 2, placeholder: "e.g. Full member, Board member" },
        country(),
      ] },
      { title: "Dates", fields: [startDate, endDate] },
      { title: "Additional information", fields: reviewFields },
    ],
    titleOf: v => v.organisation,
    metaOf: v => meta([{ icon: UserRound, text: v.role }, periodMeta(v), urlMeta(v.url)]),
    descriptionOf: () => undefined,
    entries: [
      entry("approved", { organisation: "Federation of European Societies of Plant Biology", role: "Full member", country: "Belgium", start: "2018-01-10" }),
      entry("approved", { organisation: "Georgian Society of Geneticists and Breeders", role: "Board member", country: "Georgia", start: "2020-05-04" }),
      entry("submitted", { organisation: "European Society for Evolutionary Biology", role: "Member", start: "2021-02-01", url: "https://eseb.org" }),
      entry("draft", { organisation: "International Society for Plant Molecular Biology", role: "Member" }),
    ],
  },
  {
    id: "patents",
    label: "Patents & licensing",
    shortLabel: "Patents",
    icon: FileText,
    description: "Patents, utility models and licences for your inventions or results.",
    formDescription: "Patents and licensing agreements",
    noun: "patent",
    titleField: "title",
    dateOrder: [["submissionDate", "grantDate"], ["grantDate", "expiryDate"], ["submissionDate", "expiryDate"]],
    documentLabel: "Upload certificate",
    groups: [
      { title: "Patent details", fields: [
        { name: "kind", label: "Type", type: "select", required: true, span: 2, options: ["Patent", "Patent application", "Utility model", "Licence agreement"] },
        country("Granting country", true),
        { name: "title", label: "Patent title", type: "text", required: true },
        { name: "inventors", label: "Inventor(s)", type: "text", required: true, span: 2 },
        { name: "number", label: "Patent number", type: "text", span: 2 },
      ] },
      { title: "Dates", fields: [
        { name: "submissionDate", label: "Submission date", type: "date", span: 1 },
        { name: "grantDate", label: "Grant date", type: "date", span: 1 },
        { name: "agreementDate", label: "Agreement date", type: "date", span: 1 },
        { name: "expiryDate", label: "Expiry date", type: "date", span: 1 },
      ] },
      { title: "License & description", fields: [
        { name: "licence", label: "License", type: "text" },
        { name: "abstract", label: "Abstract", type: "textarea" },
        ...reviewFields,
      ] },
    ],
    titleOf: v => v.title,
    metaOf: v => meta([{ icon: FileText, text: v.kind }, { icon: Hash, text: v.number }, v.grantDate ? dateMeta(v.grantDate) : dateMeta(v.submissionDate), placeMeta(v.country), urlMeta(v.url)]),
    descriptionOf: v => v.abstract,
    entries: [
      entry("approved", { kind: "Patent", country: "Georgia", title: "Method for detecting drought-response alleles in cereal landraces", inventors: "N. Beridze, D. Mchedlidze", number: "GE P 2023 7421", submissionDate: "2021-03-12", grantDate: "2023-07-04", expiryDate: "2041-03-12", licence: "Exclusive licence - AgroGen Ltd.", abstract: "The invention relates to a PCR-based method for identifying alleles associated with drought tolerance in Caucasian wheat landraces." }, { documents: [pdf("patent-certificate.pdf", 1_250_000)] }),
    ],
  },
  {
    id: "committees",
    label: "Committees",
    shortLabel: "Committees",
    icon: List,
    description: "Scientific, editorial, evaluation or university committees you serve on.",
    formDescription: "Scientific, editorial, evaluation and university committees",
    noun: "committee",
    titleField: "name",
    dateOrder: [["start", "end"]],
    documentLabel: "Upload appointment letter",
    groups: [
      { title: "Committee details", fields: [
        { name: "name", label: "Committee", type: "text", required: true },
        { name: "role", label: "Role", type: "text", required: true, span: 2, placeholder: "e.g. Chair, Member, Secretary" },
        { name: "organisation", label: "Organisation", type: "text", required: true, span: 2 },
        { name: "level", label: "Level", type: "select", span: 2, options: ["University", "National", "International"] },
        country(),
      ] },
      { title: "Dates", fields: [startDate, endDate] },
      { title: "Responsibilities", fields: [
        { name: "description", label: "Responsibilities", type: "textarea" },
        ...reviewFields,
      ] },
    ],
    titleOf: v => v.name,
    metaOf: v => meta([{ icon: UserRound, text: v.role }, { icon: Building2, text: v.organisation }, periodMeta(v)]),
    descriptionOf: v => v.description,
    entries: [
      entry("approved", { name: "Doctoral Programme Committee in Life Sciences", role: "Member", organisation: "Ilia State University", level: "University", country: "Georgia", start: "2021-09-15", description: "Reviews doctoral admissions and thesis proposals." }),
      entry("submitted", { name: "Editorial board, Caucasian Journal of Biology", role: "Associate editor", organisation: "Caucasian Journal of Biology", level: "International", start: "2023-01-01" }),
    ],
  },
  {
    id: "employment",
    label: "Employment",
    shortLabel: "Employment",
    icon: BriefcaseBusiness,
    description: "Academic and non-academic positions you have held.",
    formDescription: "Academic and non-academic positions",
    noun: "position",
    titleField: "position",
    dateOrder: [["start", "end"]],
    documentLabel: "Upload employment confirmation",
    groups: [
      { title: "Position details", fields: [
        { name: "position", label: "Position", type: "text", required: true },
        { name: "employer", label: "Employer", type: "text", required: true, span: 2 },
        { name: "employmentType", label: "Employment type", type: "select", span: 2, options: ["Full-time", "Part-time", "Visiting", "Fixed-term contract"] },
        { name: "city", label: "City", type: "text", span: 2 },
        country(),
      ] },
      { title: "Dates", fields: [startDate, endDate] },
      { title: "Description", fields: [
        { name: "description", label: "Main responsibilities", type: "textarea" },
        ...reviewFields,
      ] },
    ],
    titleOf: v => v.position,
    metaOf: v => meta([{ icon: Building2, text: v.employer }, placeMeta(v.city, v.country), periodMeta(v)]),
    descriptionOf: v => v.description,
    entries: [
      entry("approved", { position: "Associate Professor of Biology", employer: "Ilia State University", employmentType: "Full-time", city: "Tbilisi", country: "Georgia", start: "2019-09-01", description: "Teaching molecular biology and bioinformatics; leading the plant genetics lab." }),
      entry("approved", { position: "Assistant Professor", employer: "Ilia State University", employmentType: "Full-time", city: "Tbilisi", country: "Georgia", start: "2014-09-01", end: "2019-08-31" }),
      entry("approved", { position: "Postdoctoral Researcher", employer: "University of Göttingen", employmentType: "Fixed-term contract", city: "Göttingen", country: "Germany", start: "2012-03-01", end: "2014-07-31" }),
    ],
  },
  {
    id: "education",
    label: "Education",
    shortLabel: "Education",
    icon: GraduationCap,
    description: "Degrees and postdoctoral training, most recent first.",
    formDescription: "Degrees and postdoctoral training",
    noun: "education entry",
    titleField: "field",
    dateOrder: [["start", "end"]],
    documentLabel: "Upload diploma",
    groups: [
      { title: "Degree details", fields: [
        { name: "degree", label: "Degree", type: "select", required: true, span: 2, options: ["Bachelor (BA/BSc)", "Master (MA/MSc)", "Doctorate (PhD)", "Postdoctoral training", "Other"] },
        { name: "field", label: "Field of study", type: "text", required: true, span: 2 },
        { name: "institution", label: "Institution", type: "text", required: true },
        { name: "city", label: "City", type: "text", span: 2 },
        country(),
      ] },
      { title: "Dates", fields: [
        { name: "start", label: "Start date", type: "date", span: 1 },
        { name: "end", label: "Graduation date", type: "date", required: true, span: 1 },
      ] },
      { title: "Thesis", fields: [
        { name: "thesis", label: "Thesis title", type: "text" },
        { name: "supervisor", label: "Supervisor", type: "text", span: 2 },
        { name: "diplomaNumber", label: "Diploma number", type: "text", span: 2 },
        ...reviewFields,
      ] },
    ],
    titleOf: v => [v.degree, v.field].filter(Boolean).join(" · "),
    metaOf: v => meta([{ icon: Building2, text: v.institution }, placeMeta(v.city, v.country), v.start ? periodMeta(v) : dateMeta(v.end)]),
    descriptionOf: v => v.thesis && `Thesis: ${v.thesis}`,
    entries: [
      entry("approved", { degree: "Doctorate (PhD)", field: "Molecular Biology", institution: "Ivane Javakhishvili Tbilisi State University", city: "Tbilisi", country: "Georgia", start: "2008-10-01", end: "2011-12-20", thesis: "Genetic diversity of drought-response genes in Caucasian wheat landraces", supervisor: "Prof. T. Gogoladze" }, { documents: [pdf("phd-diploma.pdf", 1_600_000)] }),
      entry("approved", { degree: "Master (MA/MSc)", field: "Genetics", institution: "Ivane Javakhishvili Tbilisi State University", city: "Tbilisi", country: "Georgia", start: "2006-09-15", end: "2008-07-01" }),
      entry("approved", { degree: "Bachelor (BA/BSc)", field: "Biology", institution: "Ivane Javakhishvili Tbilisi State University", city: "Tbilisi", country: "Georgia", start: "2002-09-15", end: "2006-07-01" }),
    ],
  },
  {
    // Edited in a table on its own page (LanguagesPage), not through the generic form
    id: "languages",
    label: "Languages",
    shortLabel: "Languages",
    icon: Languages,
    description: "Add every language you read, write or speak, with your level for each skill.",
    formDescription: "Add every language you read, write or speak, with your level for each skill.",
    noun: "language",
    titleField: "language",
    documentLabel: "Upload language certificate",
    groups: [
      { title: "Language", fields: [
        { name: "language", label: "Language", type: "select", required: true, options: LANGUAGES },
        ...(["read", "write", "speak"] as const).map(skill => ({ name: skill, label: capitalize(skill), type: "select", required: true, span: 1, options: LEVELS.map(level => level.label) }) satisfies FieldDef),
      ] },
    ],
    titleOf: v => v.language,
    metaOf: v => meta((["read", "write", "speak"] as const).map(skill => ({ icon: Languages, text: v[skill] ? `${capitalize(skill)}: ${levelLabel(v[skill])}` : "" }))),
    descriptionOf: () => undefined,
    entries: [
      entry("approved", { language: "Georgian", read: "Native", write: "Native", speak: "Native" }),
      entry("approved", { language: "English", read: "C1", write: "C1", speak: "B2" }),
      entry("approved", { language: "German", read: "B1", write: "A2", speak: "A2" }),
      entry("approved", { language: "Russian", read: "B2", write: "B1", speak: "B1" }),
    ],
  },
  {
    id: "consultancy",
    label: "Consultancy",
    shortLabel: "Consultancy",
    icon: Briefcase,
    description: "Expert, advisory or consulting work for public or private organisations.",
    formDescription: "Expert, advisory and consulting work",
    noun: "consultancy",
    titleField: "topic",
    dateOrder: [["start", "end"]],
    documentLabel: "Upload contract or letter",
    groups: [
      { title: "Consultancy details", fields: [
        { name: "topic", label: "Topic / role", type: "text", required: true },
        { name: "client", label: "Client", type: "text", required: true, span: 2 },
        { name: "clientType", label: "Client type", type: "select", span: 2, options: ["Government", "Private company", "NGO", "International organisation", "Other"] },
        country(),
      ] },
      { title: "Dates", fields: [startDate, endDate] },
      { title: "Description", fields: [
        { name: "description", label: "Description", type: "textarea" },
        ...reviewFields,
      ] },
    ],
    titleOf: v => v.topic,
    metaOf: v => meta([{ icon: Building2, text: v.client }, periodMeta(v), urlMeta(v.url)]),
    descriptionOf: v => v.description,
    entries: [
      entry("approved", { topic: "Expert on crop genetic resources", client: "Ministry of Environmental Protection and Agriculture of Georgia", clientType: "Government", country: "Georgia", start: "2022-02-01", end: "2022-12-31", description: "Advised on the national strategy for conserving local crop varieties." }),
    ],
  },
  {
    id: "creative",
    label: "Creative activities",
    shortLabel: "Creative activities",
    icon: Star,
    description: "Exhibitions, performances, media and other creative or outreach work.",
    formDescription: "Exhibitions, performances, media and outreach",
    noun: "creative activity",
    titleField: "title",
    dateOrder: [["start", "end"]],
    documentLabel: "Upload programme or evidence",
    groups: [
      { title: "Activity details", fields: [
        { name: "title", label: "Title", type: "text", required: true },
        { name: "kind", label: "Type", type: "select", required: true, span: 2, options: ["Exhibition", "Performance", "Film or media", "Science communication", "Other"] },
        { name: "role", label: "Your role", type: "text", span: 2 },
        { name: "venue", label: "Venue / outlet", type: "text", span: 2 },
        country(),
      ] },
      { title: "Dates", fields: [
        { name: "start", label: "Date", type: "date", required: true, span: 1 },
        { name: "end", label: "End date", type: "date", span: 1, hint: "For events lasting several days." },
      ] },
      { title: "Description", fields: [
        { name: "description", label: "Description", type: "textarea" },
        ...reviewFields,
      ] },
    ],
    titleOf: v => v.title,
    metaOf: v => meta([{ icon: Star, text: v.kind }, v.end ? periodMeta(v) : dateMeta(v.start), placeMeta(v.venue, v.country), urlMeta(v.url)]),
    descriptionOf: v => v.description,
    entries: [],
  },
  {
    id: "other",
    label: "Other activities",
    shortLabel: "Other activities",
    icon: List,
    description: "Anything relevant to your evaluation that does not fit another section.",
    formDescription: "Other activities relevant to your evaluation",
    noun: "activity",
    titleField: "title",
    dateOrder: [["start", "end"]],
    documentLabel: "Upload supporting document",
    groups: [
      { title: "Activity details", fields: [
        { name: "title", label: "Activity", type: "text", required: true },
        { name: "category", label: "Category", type: "select", span: 2, options: ["Peer review", "Event organisation", "Mentoring", "Outreach", "Other"] },
        { name: "organisation", label: "Organisation", type: "text", span: 2 },
      ] },
      { title: "Dates", fields: [
        { name: "start", label: "Start date", type: "date", span: 1 },
        { name: "end", label: "End date", type: "date", span: 1 },
      ] },
      { title: "Description", fields: [
        { name: "description", label: "Description", type: "textarea" },
        ...reviewFields,
      ] },
    ],
    titleOf: v => v.title,
    metaOf: v => meta([{ icon: List, text: v.category }, { icon: Building2, text: v.organisation }, v.end ? periodMeta(v) : dateMeta(v.start), urlMeta(v.url)]),
    descriptionOf: v => v.description,
    entries: [
      entry("approved", { title: "Reviewer for Shota Rustaveli National Science Foundation grant calls", category: "Peer review", organisation: "SRNSF", start: "2023-04-10" }),
      entry("submitted", { title: "Organiser, Summer School in Plant Genomics", category: "Event organisation", organisation: "Ilia State University", start: "2024-07-08", end: "2024-07-14", description: "Week-long summer school for 30 MSc and PhD students." }),
    ],
  },
]

export const findSection = (id: string | undefined) => sections.find(section => section.id === id)

/** Paperclip meta item for cards with attachments */
export const attachmentMeta = (count: number): MetaItem | undefined =>
  count > 0 ? { icon: Paperclip, text: count === 1 ? "1 document" : `${count} documents` } : undefined
