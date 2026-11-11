import type { Entry } from "@/Pages/Profile/qualifications/sections"
import { initialResearch } from "@/Pages/Profile/research/researchMock"
import { programmes, students } from "@/Pages/Profile/teaching/teachingMock"
import { formatCitation, type CitationPart } from "./citations"
import { SECTION_META, type CvData, type PublicationType, type SectionId } from "./cv-model"

/**
 * Turns the researcher's profile (qualifications, research, teaching) plus the
 * CV builder's own data into the sections shown in the preview.
 * The profile data is read-only here: it is edited on the My profile pages.
 */

export type CvItem = {
  key: string
  title: string
  /** Institution, venue, etc. */
  subtitle?: string
  /** Right-hand date column */
  when?: string
  detail?: string
  citation?: CitationPart[]
}

export type CvSection =
  | { id: SectionId; label: string; kind: "text"; text: string }
  | { id: SectionId; label: string; kind: "chips"; chips: string[] }
  | { id: SectionId; label: string; kind: "list"; items: CvItem[] }
  | { id: SectionId; label: string; kind: "publications"; groups: { label: string; items: CvItem[] }[] }
  | { id: SectionId; label: string; kind: "facts"; facts: { label: string; value: string }[]; note?: string }

export type ViewOptions = {
  /** Visitor view: applies the public field settings */
  asVisitor: boolean
  ownFamilyName: string
}

const year = (date: string | undefined) => date?.slice(0, 4) ?? ""
const yearRange = (start: string | undefined, end: string | undefined) => {
  if (!start) return year(end)
  const from = year(start)
  const to = end ? year(end) : "present"
  return from === to ? from : `${from} - ${to}`
}
const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(", ")

/** "2024-07" → "Jul 2024" */
function monthYear(value: string) {
  const [y, m] = value.split("-").map(Number)
  if (!y) return value
  if (!m) return String(y)
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
}

/** Most recent first, by an ISO-like date string */
const byDateDesc = <T,>(date: (item: T) => string | undefined) => (a: T, b: T) => (date(b) ?? "").localeCompare(date(a) ?? "")

const PUBLICATION_GROUPS: { label: string; types: PublicationType[] }[] = [
  { label: "Journal articles", types: ["Journal article"] },
  { label: "Conference papers", types: ["Conference paper"] },
  { label: "Books & book chapters", types: ["Book", "Book chapter"] },
  { label: "Preprints & reports", types: ["Preprint", "Report", "Thesis"] },
]

export function buildCvSections(cv: CvData, qualifications: Record<string, Entry[]>, options: ViewOptions): CvSection[] {
  const visible = (sectionId: string) =>
    (qualifications[sectionId] ?? [])
      .filter(entry => entry.status === "approved" || (cv.includeSubmitted && entry.status === "submitted"))
      .map(entry => entry.values)

  const build = (id: SectionId): CvSection | null => {
    const label = SECTION_META[id].label
    switch (id) {
      case "summary":
        return cv.personal.summary.trim() ? { id, label, kind: "text", text: cv.personal.summary.trim() } : null
      case "interests":
        return cv.interests.length ? { id, label, kind: "chips", chips: cv.interests } : null
      case "appointments":
        return list(id, label, visible("employment").sort(byDateDesc(v => v.start)).map((v, i) => ({
          key: `emp-${i}`, title: v.position, subtitle: joined(v.employer, v.city, v.country), when: yearRange(v.start, v.end),
        })))
      case "education":
        return list(id, label, visible("education").sort(byDateDesc(v => v.end)).map((v, i) => ({
          key: `edu-${i}`,
          title: joined(v.degree?.replace(/\s*\(.*\)$/, ""), v.field),
          subtitle: joined(v.institution, v.city, v.country),
          when: yearRange(v.start, v.end),
          detail: [v.thesis && `Thesis: “${v.thesis}”`, v.supervisor && `Supervisor: ${v.supervisor}`].filter(Boolean).join(" · ") || undefined,
        })))
      case "publications": {
        const sorted = [...cv.publications].sort((a, b) => (b.year || "9999").localeCompare(a.year || "9999"))
        const groups = PUBLICATION_GROUPS
          .map(group => ({
            label: group.label,
            items: sorted.filter(pub => group.types.includes(pub.type)).map(pub => ({
              key: pub.id, title: pub.title, citation: formatCitation(pub, cv.citationStyle, options.ownFamilyName),
            })),
          }))
          .filter(group => group.items.length)
        return groups.length ? { id, label, kind: "publications", groups } : null
      }
      case "grants":
        return list(id, label, [...initialResearch.projects].sort(byDateDesc(p => p.startYear)).map(p => ({
          key: p.id, title: p.title, subtitle: joined(p.donor, `${p.role}`, p.type === "International" ? "international" : undefined),
          when: p.endYear ? (p.startYear === p.endYear ? p.startYear : `${p.startYear} - ${p.endYear}`) : `${p.startYear} - present`,
        })))
      case "talks":
        return list(id, label, [...cv.talks].sort(byDateDesc(t => t.date)).map(t => ({
          key: t.id, title: t.title, subtitle: joined(t.type, t.event, t.location), when: monthYear(t.date),
        })))
      case "teaching":
        return list(id, label, programmes.map(p => ({
          key: p.id, title: p.name, subtitle: `${p.level} · ${p.ects} ECTS · Ilia State University`, when: p.year,
        })))
      case "supervision":
        return list(id, label, students.filter(s => s.status !== "Withdrawn").map(s => ({
          key: s.id, title: s.name, subtitle: `${s.level} thesis: “${s.thesis}”`, when: s.status === "Completed" ? "Completed" : "Ongoing",
        })))
      case "awards":
        return list(id, label, visible("awards").sort(byDateDesc(v => v.date)).map((v, i) => ({
          key: `award-${i}`, title: v.title, subtitle: joined(v.body, v.country), when: year(v.date),
        })))
      case "memberships":
        return list(id, label, visible("memberships").sort(byDateDesc(v => v.start)).map((v, i) => ({
          key: `mem-${i}`, title: v.organisation, subtitle: v.role, when: yearRange(v.start, v.end),
        })))
      case "service":
        return list(id, label, [
          ...visible("committees").map(v => ({ title: `${v.role}, ${v.name}`, subtitle: v.organisation, start: v.start, when: yearRange(v.start, v.end) })),
          ...visible("other").map(v => ({ title: v.title, subtitle: joined(v.category, v.organisation), start: v.start, when: v.end ? yearRange(v.start, v.end) : year(v.start) })),
        ].sort(byDateDesc(v => v.start)).map((v, i) => ({ key: `svc-${i}`, title: v.title, subtitle: v.subtitle, when: v.when })))
      case "patents":
        return list(id, label, visible("patents").map((v, i) => ({
          key: `pat-${i}`, title: v.title, subtitle: joined(v.kind, v.number, v.country), when: year(v.grantDate || v.submissionDate),
        })))
      case "languages": {
        const items = visible("languages")
        if (!items.length) return null
        return {
          id, label, kind: "facts",
          facts: items.map(v => ({
            label: v.language,
            value: v.read === "Native" && v.write === "Native" && v.speak === "Native"
              ? "Native"
              : `Reading ${v.read} · Writing ${v.write} · Speaking ${v.speak}`,
          })),
        }
      }
      case "metrics": {
        if (options.asVisitor && !cv.publicFields.metrics) return null
        const facts = [
          cv.metrics.hIndex && { label: "h-index", value: cv.metrics.hIndex },
          cv.metrics.citations && { label: "Citations", value: Number(cv.metrics.citations).toLocaleString("en-GB") },
        ].filter((fact): fact is { label: string; value: string } => !!fact)
        if (!facts.length) return null
        const note = ["Self-reported", cv.metrics.source && `source: ${cv.metrics.source}`, cv.metrics.asOf && `as of ${monthYear(cv.metrics.asOf)}`].filter(Boolean).join(", ")
        return { id, label, kind: "facts", facts, note: `${note}.` }
      }
    }
  }

  return cv.sections.filter(section => section.enabled).map(section => build(section.id)).filter((section): section is CvSection => section !== null)
}

function list(id: SectionId, label: string, items: CvItem[]): CvSection | null {
  return items.length ? { id, label, kind: "list", items } : null
}

/** How many entries each section would show, for the "Sections & layout" list */
export function sectionCounts(cv: CvData, qualifications: Record<string, Entry[]>) {
  const all = buildCvSections({ ...cv, sections: cv.sections.map(section => ({ ...section, enabled: true })) }, qualifications, { asVisitor: false, ownFamilyName: "" })
  const counts: Partial<Record<SectionId, number>> = {}
  for (const section of all) {
    counts[section.id] =
      section.kind === "list" ? section.items.length
        : section.kind === "publications" ? section.groups.reduce((sum, group) => sum + group.items.length, 0)
          : section.kind === "chips" ? section.chips.length
            : section.kind === "facts" ? section.facts.length
              : 1
  }
  return counts
}
