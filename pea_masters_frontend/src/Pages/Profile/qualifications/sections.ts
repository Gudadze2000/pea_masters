import { Award, Briefcase, BriefcaseBusiness, Building2, Calendar, FileText, Globe, GraduationCap, Hash, Languages, List, MapPin, MonitorPlay, Paperclip, Star, UserRound, Users, Video, type LucideIcon } from "lucide-react"
import { PLAYABLE_SITES } from "@/lib/video"
import type { FieldDef } from "@/components/forms/field-types"
import { COUNTRIES } from "./countries"
import { LANGUAGES, LEVELS, levelLabel } from "./languages"

/**
 * Configuration for every "Professional & qualifications" sub-section.
 * One generic list page and one generic form page render all of them,
 * so adding a field or a section only means editing this file.
 */

export type EntryValues = Record<string, string>
/** An uploaded supporting document; url opens it (the owner, their Admins and Coordinator) */
export type EntryDocument = { id: string; name: string; size: number; type: string; url?: string }

/** One entry of a profile section. The profile is the person's own: saved entries are on it, with no review. */
export type Entry = {
  id: string
  values: EntryValues
  documents: EntryDocument[]
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
  /** Field holding a video link: the entry shows a player (Video lectures) */
  videoField?: string
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
/** Most forms end with a link to more information */
const reviewFields: FieldDef[] = [
  { name: "url", label: "URL", type: "url", span: 2, placeholder: "https://" },
]


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
  },
  {
    id: "videos",
    label: "Video lectures",
    shortLabel: "Video lectures",
    icon: MonitorPlay,
    description: "Recorded lectures, talks and courses from anywhere on the web. They play right on your profile.",
    formDescription: "A recorded lecture, talk or course",
    noun: "video lecture",
    titleField: "title",
    documentLabel: "Upload slides or materials (optional)",
    groups: [
      { title: "Video", fields: [
        { name: "title", label: "Title", type: "text", required: true },
        { name: "url", label: "Video link", type: "url", required: true, placeholder: "https://www.youtube.com/watch?v=…", hint: `${PLAYABLE_SITES} play on PEA. Links to other sites open there.` },
        { name: "kind", label: "Type", type: "select", span: 2, options: ["Lecture", "Course or lecture series", "Conference talk", "Seminar or webinar", "Interview", "Other"] },
        { name: "language", label: "Language", type: "select", span: 2, options: LANGUAGES },
        { name: "event", label: "Course, event or channel", type: "text", span: 2 },
        { name: "date", label: "Date recorded", type: "date", span: 2 },
      ] },
      { title: "Description", fields: [
        { name: "description", label: "Description", type: "textarea", placeholder: "What the video covers and who it is for" },
      ] },
    ],
    titleOf: v => v.title,
    metaOf: v => meta([
      { icon: Video, text: v.kind },
      v.date ? dateMeta(v.date) : undefined,
      { icon: Users, text: v.event },
      { icon: Languages, text: v.language },
    ]),  // the player links to the video itself
    descriptionOf: v => v.description,
    videoField: "url",
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
  },
]

export const findSection = (id: string | undefined) => sections.find(section => section.id === id)

/** Paperclip meta item for cards with attachments */
export const attachmentMeta = (count: number): MetaItem | undefined =>
  count > 0 ? { icon: Paperclip, text: count === 1 ? "1 document" : `${count} documents` } : undefined

/** Order on the profile: background first, then achievements, then service and other activities */
const PROFILE_ORDER = ["education", "employment", "languages", "awards", "patents", "memberships", "committees", "consultancy", "creative", "videos", "other"]
export const profileSections: SectionDef[] = PROFILE_ORDER.map(id => sections.find(section => section.id === id)).filter((s): s is SectionDef => !!s)
