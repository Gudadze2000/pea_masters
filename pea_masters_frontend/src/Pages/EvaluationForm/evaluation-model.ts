import type { EvaluationEntry, FormStructure, SubmittedEntry } from '@/lib/evaluations'

/*
 * The evaluation page works on the form the coordinator sent (a copy of it, kept with the evaluation on the server)
 * and the entries saved there. This file turns the form into what the page shows and works out the scores.
 */

export type { EvaluationEntry, WosCheck } from '@/lib/evaluations'

/** One item of the form: researchers add entries to it, each worth `points` (or what the entry states) */
export type RecordDef = {
  id: string
  /** Item number, e.g. "2.1" */
  code?: string
  name: string
  georgian: string
  /** Points per entry */
  points: number
  icon: string
  /** Most entries that can count */
  maxEntries?: number
  /** Most points this item can contribute */
  maxPoints?: number
  /** Set when each entry states its own points; the text explains the rule */
  variablePoints?: string
  /** What to write in the entry */
  hint?: string
}

export type Part = {
  id: string
  numeral: string
  name: string
  georgian: string
  /** Shown under the part heading */
  rule: string
  min?: number
  /** Points above this don't count towards the total */
  cap?: number
  items: RecordDef[]
}

export type Form = { parts: Part[]; totalMinimum?: number; items: Map<string, RecordDef> }

const optional = <T,>(value: T | null) => value ?? undefined

export function toForm(structure: FormStructure): Form {
  const parts = structure.parts.map(part => ({
    id: part.id, numeral: part.numeral, name: part.name.en, georgian: part.name.ka, rule: part.rule,
    min: optional(part.min), cap: optional(part.cap),
    items: part.items.map(item => ({
      id: item.id, code: item.code || undefined, name: item.name.en, georgian: item.name.ka, points: item.points,
      icon: item.icon, maxEntries: optional(item.max_entries), maxPoints: optional(item.max_points),
      variablePoints: optional(item.variable_points), hint: item.hint || undefined,
    })),
  }))
  return { parts, totalMinimum: optional(structure.total_minimum), items: new Map(parts.flatMap(part => part.items.map(item => [item.id, item]))) }
}

/** Entries that are part of the form; hidden ones are kept but never sent or scored */
export const isSent = (entry: Pick<EvaluationEntry, 'hidden'>) => !entry.hidden

/** Router state for linking to one entry: navigate("/evaluation-form", { state: { edit: { recordId, entryId } } }) */
export type EvaluationLinkState = { edit?: { recordId: string; entryId: string } }

/** Entries by item */
export type EvaluationEntries = Record<string, EvaluationEntry[]>

export function byItem(entries: EvaluationEntry[]): EvaluationEntries {
  const grouped: EvaluationEntries = {}
  for (const entry of entries) (grouped[entry.item_id] ??= []).push(entry)
  return grouped
}

/** Entries that count: everything sent except rejected ones (the final score counts approved ones only) */
export function recordScore(record: RecordDef, entries: EvaluationEntry[] = []) {
  const sum = entries.filter(entry => isSent(entry) && entry.status !== 'rejected').reduce((total, entry) => total + (record.variablePoints ? entry.points ?? 0 : record.points), 0)
  return record.maxPoints === undefined ? sum : Math.min(sum, record.maxPoints)
}

/** A part's score as entered, and the amount that counts towards the total (some parts are capped) */
export function partScore(part: Part, entries: EvaluationEntries) {
  const raw = part.items.reduce((total, record) => total + recordScore(record, entries[record.id]), 0)
  return { raw, counted: part.cap === undefined ? raw : Math.min(raw, part.cap) }
}

export function formScore(form: Form, entries: EvaluationEntries) {
  const scores = form.parts.map(part => ({ part, ...partScore(part, entries) }))
  return { scores, total: scores.reduce((sum, score) => sum + score.counted, 0) }
}

/** What an update changes compared with the last submission: new or edited entries, and entries hidden or shown again */
export function changesSince(submitted: SubmittedEntry[], current: EvaluationEntry[]) {
  const content = (entry: { item_id: string; description: string; detail: string; points: number | null }, files: string[]) =>
    JSON.stringify([entry.item_id, entry.description, entry.detail, entry.points, files])
  const before = new Map(submitted.map(entry => [entry.id, entry]))
  let changed = 0, hidden = 0, shown = 0
  for (const entry of current) {
    const old = before.get(entry.id)
    if (!old) { if (isSent(entry)) changed++; continue }
    if (isSent(old) && !isSent(entry)) hidden++
    else if (!isSent(old) && isSent(entry)) shown++
    else if (isSent(entry) && content(old, old.file_ids) !== content(entry, entry.files.map(file => file.id))) changed++
  }
  return { changed, hidden, shown, any: changed + hidden + shown > 0 }
}

/** "1 Sep 2026" from an ISO date */
export const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Today's date in Tbilisi, where deadlines are set (YYYY-MM-DD) */
export const tbilisiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi' }).format(new Date())

/** Whole days from today (Tbilisi) to the deadline: 0 on the last day */
export function daysUntil(iso: string) {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${tbilisiToday()}T00:00:00Z`)) / 86400000)
}
