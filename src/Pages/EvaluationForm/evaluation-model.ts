export type EvaluationEntry = {
  id: string
  description: string
  detail: string
  files: string[]
  status: 'Draft' | 'Approved' | 'Rejected' | 'Submitted'
  comment?: string
}
export const records = [
  { id: 'article', name: 'Article — Scopus / WoS indexed', georgian: 'სტატია (Scopus / WoS)', points: 10, icon: 'imgIconFile1', required: true },
  { id: 'monograph', name: 'Monograph', georgian: 'მონოგრაფია', points: 20, icon: 'imgIconBook1', required: false },
  { id: 'conference', name: 'Conference presentation', georgian: 'კონფერენციაზე მოხსენება', points: 3, icon: 'imgIconUsers', required: true },
  { id: 'grant', name: 'Research grant — international', georgian: 'საერთაშორისო გრანტი', points: 15, icon: 'imgIconFlask', required: false },
  { id: 'supervision', name: 'Doctoral student supervision', georgian: 'დოქტორანტის ხელმძღვანელობა', points: 8, icon: 'imgIconGrad', required: false },
  { id: 'patent', name: 'Patent', georgian: 'პატენტი', points: 12, icon: 'imgIconAward', required: false },
] as const
export type RecordId = typeof records[number]['id']
export type EvaluationEntries = Record<RecordId, EvaluationEntry[]>
export const initialEntries: EvaluationEntries = {
  article: [
    { id: 'article-1', description: 'Drought-responsive transcription factors in wheat', detail: 'DOI 10.1007/s00425-023-04102', files: ['article-2023.pdf'], status: 'Approved' },
    { id: 'article-2', description: 'Allelic diversity of Caucasian landraces', detail: 'DOI 10.1111/tpj.16221', files: ['landraces.pdf'], status: 'Rejected', comment: '“DOI does not match the attached PDF. Please upload the correct file.” — G. Kapanadze' },
    { id: 'article-3', description: 'Transcriptomics of heat stress response', detail: 'DOI pending', files: [], status: 'Draft' },
  ],
  monograph: [{ id: 'monograph-1', description: 'Plant Genomics of the Caucasus (Springer, 2024)', detail: 'ISBN 978-3-031-12345-6', files: ['monograph-title-page.pdf'], status: 'Draft' }],
  conference: [
    { id: 'conference-1', description: 'EPSO Plant Science Conference 2025 — oral', detail: 'Vienna, 12 Sept 2025', files: ['programme.png'], status: 'Draft' },
    { id: 'conference-2', description: 'FESPB Congress 2024 — poster', detail: 'Seville, 3 Jul 2024', files: [], status: 'Draft' },
  ],
  grant: [{ id: 'grant-1', description: 'Horizon Europe GENDROUGHT (PI)', detail: '2022–2025', files: ['grant-agreement.pdf'], status: 'Submitted' }],
  supervision: [], patent: [],
}
export const draftKey = 'pea-evaluation-draft-v1'
export function readDraft(): EvaluationEntries {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(draftKey) ?? 'null')
    if (value && typeof value === 'object' && records.every(record => {
      const entries = (value as Record<string, unknown>)[record.id]
      return Array.isArray(entries) && entries.every(e => e && typeof e.id === 'string' && typeof e.description === 'string' && typeof e.detail === 'string' && Array.isArray(e.files) && e.files.every((file: unknown) => typeof file === 'string') && ['Draft', 'Approved', 'Rejected', 'Submitted'].includes(e.status))
    })) return value as EvaluationEntries
  } catch { /* Storage may be unavailable. Keep the form usable in memory. */ }
  return initialEntries
}
