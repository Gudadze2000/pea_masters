import { parts, type Part } from './self-assessment'

export type EvaluationEntry = {
  id: string
  description: string
  detail: string
  files: string[]
  status: 'Draft' | 'Approved' | 'Rejected' | 'Submitted'
  comment?: string
  /** Points claimed for this entry, only on record types scored per entry (RecordDef.variablePoints) */
  points?: number
}

/** One kind of scored activity: the original records below and every item of the ISU self-assessment form */
export type RecordDef = {
  id: string
  /** Item number on the ISU form, e.g. "2.1" */
  code?: string
  name: string
  georgian: string
  /** Points per entry (the form's "unit points") */
  points: number
  icon: string
  required: boolean
  /** Most entries that can count (from the form's answer options) */
  maxEntries?: number
  /** Most points this record can contribute */
  maxPoints?: number
  /** Set when each entry states its own points; the text explains the rule */
  variablePoints?: string
  /** What to write in the description (the form's "performance indicator") */
  hint?: string
}

export const records = [
  { id: 'article', name: 'Article - Scopus / WoS indexed', georgian: 'სტატია (Scopus / WoS)', points: 10, icon: 'imgIconFile1', required: true },
  { id: 'monograph', name: 'Monograph', georgian: 'მონოგრაფია', points: 20, icon: 'imgIconBook1', required: false },
  { id: 'conference', name: 'Conference presentation', georgian: 'კონფერენციაზე მოხსენება', points: 3, icon: 'imgIconUsers', required: true },
  { id: 'grant', name: 'Research grant - international', georgian: 'საერთაშორისო გრანტი', points: 15, icon: 'imgIconFlask', required: false },
  { id: 'supervision', name: 'Doctoral student supervision', georgian: 'დოქტორანტის ხელმძღვანელობა', points: 8, icon: 'imgIconGrad', required: false },
  { id: 'patent', name: 'Patent', georgian: 'პატენტი', points: 12, icon: 'imgIconAward', required: false },
] as const satisfies readonly RecordDef[]
/** Router state for linking to one entry: navigate("/evaluation-form", { state: { edit: { recordId, entryId } } }) */
export type EvaluationLinkState = { edit?: { recordId: string; entryId: string } }

/** The first entry that needs action (rejected, or missing its evidence file), for links from other pages */
export function findEntryNeedingAttention(entries: Record<string, EvaluationEntry[]>, kind: 'rejected' | 'missing-file', preferRecordId?: string) {
  const needs = (entry: EvaluationEntry) => kind === 'rejected' ? entry.status === 'Rejected' : entry.files.length === 0 && entry.status !== 'Rejected'
  const ids = preferRecordId ? [preferRecordId, ...Object.keys(entries).filter(id => id !== preferRecordId)] : Object.keys(entries)
  for (const recordId of ids) {
    const entry = entries[recordId]?.find(needs)
    if (entry) return { recordId, entryId: entry.id }
  }
  return null
}

/** Any record id: one of the original records above or an ISU form item ("isu-2-1") */
export type RecordId = string
export type EvaluationEntries = Record<RecordId, EvaluationEntry[]>

/** The original records followed by every item of the ISU self-assessment form */
export const allRecords: readonly RecordDef[] = [...records, ...parts.flatMap(part => part.items)]
export const findRecord = (id: RecordId) => allRecords.find(record => record.id === id)

/** Entries that count: everything except rejected ones (the backend will only count approved ones) */
export function recordScore(record: RecordDef, entries: EvaluationEntry[] = []) {
  const sum = entries.filter(entry => entry.status !== 'Rejected').reduce((total, entry) => total + (record.variablePoints ? entry.points ?? 0 : record.points), 0)
  return record.maxPoints === undefined ? sum : Math.min(sum, record.maxPoints)
}

/** A part's score as entered, and the amount that counts towards the total (social impact is capped at 20) */
export function partScore(part: Part, entries: EvaluationEntries) {
  const raw = part.items.reduce((total, record) => total + recordScore(record, entries[record.id]), 0)
  return { raw, counted: part.cap === undefined ? raw : Math.min(raw, part.cap) }
}
export const initialEntries: EvaluationEntries = {
  article: [
    { id: 'article-1', description: 'Drought-responsive transcription factors in wheat', detail: 'DOI 10.1007/s00425-023-04102', files: ['article-2023.pdf'], status: 'Approved' },
    { id: 'article-2', description: 'Allelic diversity of Caucasian landraces', detail: 'DOI 10.1111/tpj.16221', files: ['landraces.pdf'], status: 'Rejected', comment: '“DOI does not match the attached PDF. Please upload the correct file.” - G. Kapanadze' },
    { id: 'article-3', description: 'Transcriptomics of heat stress response', detail: 'DOI pending', files: [], status: 'Draft' },
  ],
  monograph: [{ id: 'monograph-1', description: 'Plant Genomics of the Caucasus (Springer, 2024)', detail: 'ISBN 978-3-031-12345-6', files: ['monograph-title-page.pdf'], status: 'Draft' }],
  conference: [
    { id: 'conference-1', description: 'EPSO Plant Science Conference 2025 - oral', detail: 'Vienna, 12 Sept 2025', files: ['programme.png'], status: 'Draft' },
    { id: 'conference-2', description: 'FESPB Congress 2024 - poster', detail: 'Seville, 3 Jul 2024', files: [], status: 'Draft' },
  ],
  grant: [{ id: 'grant-1', description: 'Horizon Europe GENDROUGHT (PI)', detail: '2022-2025', files: ['grant-agreement.pdf'], status: 'Submitted' }],
  supervision: [], patent: [],
  // Every ISU form item starts empty
  ...Object.fromEntries(parts.flatMap(part => part.items).map(record => [record.id, []])),
}
export const draftKey = 'pea-evaluation-draft-v1'

const isEntry = (e: unknown): e is EvaluationEntry => {
  if (!e || typeof e !== 'object') return false
  const entry = e as Record<string, unknown>
  return typeof entry.id === 'string' && typeof entry.description === 'string' && typeof entry.detail === 'string'
    && Array.isArray(entry.files) && entry.files.every(file => typeof file === 'string')
    && ['Draft', 'Approved', 'Rejected', 'Submitted'].includes(entry.status as string)
    && (entry.points === undefined || (typeof entry.points === 'number' && Number.isFinite(entry.points)))
}

export function readDraft(): EvaluationEntries {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(draftKey) ?? 'null')
    if (value && typeof value === 'object') {
      const saved = value as Record<string, unknown>
      // The original records must be valid; ISU items missing from drafts saved before they existed start empty
      if (records.every(record => Array.isArray(saved[record.id]) && (saved[record.id] as unknown[]).every(isEntry))) {
        return Object.fromEntries(allRecords.map(record => {
          const list = saved[record.id]
          return [record.id, Array.isArray(list) ? list.filter(isEntry) : []]
        }))
      }
    }
  } catch { /* Storage may be unavailable. Keep the form usable in memory. */ }
  return initialEntries
}
