import { api } from "./api"
import type { Person } from "./people"
import type { ServerDocument } from "./profile-entries"

/*
 * Evaluations (app/evaluations.py): periods set up by an organization's Admins, and the forms coordinators send to
 * their researchers. The ISU self-assessment form is built in.
 */

export type PeriodStatus = "upcoming" | "open" | "closed"

export type EvaluationPeriod = {
  id: string
  name: string
  /** ISO dates; the period is open from the start of starts_on to the end of ends_on (Tbilisi time) */
  starts_on: string
  ends_on: string
  publication_from: number
  publication_to: number
  status: PeriodStatus
}

export type PeriodInput = Omit<EvaluationPeriod, "id" | "status">

const periods = (orgId: string) => `/orgs/${orgId}/evaluation-periods`

export const periodsApi = {
  list: (orgId: string) => api<EvaluationPeriod[]>(periods(orgId)),
  create: (orgId: string, input: PeriodInput) => api<EvaluationPeriod>(periods(orgId), { method: "POST", body: input }),
  update: (orgId: string, id: string, input: PeriodInput) => api<EvaluationPeriod>(`${periods(orgId)}/${id}`, { method: "PUT", body: input }),
  archive: (orgId: string, id: string) => api<null>(`${periods(orgId)}/${id}`, { method: "DELETE" }),
}

export type Localized = { en: string; ka: string }

/** One line of a form: researchers add entries to it, each worth `points` (or what the entry states) */
export type FormItem = {
  id: string
  /** e.g. "2.1" */
  code: string
  name: Localized
  points: number
  /** Most this item can add to the total; null: no limit */
  max_points: number | null
  max_entries: number | null
  /** Set when each entry states its own points: the rule for working them out */
  variable_points: string | null
  /** What to write in an entry */
  hint: string
  icon: string
}

export type FormPart = {
  id: string
  /** e.g. "I" */
  numeral: string
  name: Localized
  /** Shown under the part's heading */
  rule: string
  /** Points needed in this part */
  min: number | null
  /** Points above this don't count */
  cap: number | null
  items: FormItem[]
}

export type FormStructure = { version: 1; total_minimum: number | null; parts: FormPart[] }

export type FormSummary = {
  /** A built-in form's key, or a custom form's id */
  id: string
  built_in: boolean
  name: Localized
  description: string
  parts: number
  items: number
  owner: { id: string; name: string } | null
  updated_at: string | null
  /** Built-in forms never; custom ones by their owner and the organization's Admins */
  can_edit: boolean
}

export type EvaluationFormDetail = FormSummary & { structure: FormStructure }

export type FormInput = { name: Localized; description: string; structure: FormStructure }

const forms = (orgId: string) => `/orgs/${orgId}/evaluation-forms`

export const formsApi = {
  list: (orgId: string) => api<FormSummary[]>(forms(orgId)),
  get: (orgId: string, id: string) => api<EvaluationFormDetail>(`${forms(orgId)}/${encodeURIComponent(id)}`),
  create: (orgId: string, input: FormInput) => api<EvaluationFormDetail>(forms(orgId), { method: "POST", body: input }),
  update: (orgId: string, id: string, input: FormInput) => api<EvaluationFormDetail>(`${forms(orgId)}/${id}`, { method: "PUT", body: input }),
  archive: (orgId: string, id: string) => api<null>(`${forms(orgId)}/${id}`, { method: "DELETE" }),
}

/* ---------- sending forms (coordinators and Admins) ---------- */

export type EvaluationState = "draft" | "submitted" | "updating"

export type EvaluationBrief = {
  id: string
  form_ref: string
  form_name: Localized
  state: EvaluationState
  /** The researcher has added an entry: the form can't be replaced or withdrawn any more */
  started: boolean
  sent_at: string
  submitted_at: string | null
  /** Entries that will be sent (not hidden) */
  entries: number
}

export type RosterRow = { person: Person; evaluation: EvaluationBrief | null }

export type SendResult = { sent: number; replaced: number; unchanged: number; skipped: string[] }

const sent = (orgId: string, periodId: string) => `/orgs/${orgId}/evaluation-periods/${periodId}/evaluations`

export const sendingApi = {
  roster: (orgId: string, periodId: string) => api<RosterRow[]>(sent(orgId, periodId)),
  send: (orgId: string, periodId: string, formId: string, userIds: string[]) =>
    api<SendResult>(sent(orgId, periodId), { method: "POST", body: { form_id: formId, user_ids: userIds } }),
  withdraw: (orgId: string, evaluationId: string) => api<null>(`/orgs/${orgId}/evaluations/${evaluationId}`, { method: "DELETE" }),
}

/* ---------- the signed-in person's own evaluations ---------- */

export type EntryStatus = "draft" | "submitted" | "approved" | "rejected"

/** What PEA found about an entry's DOI in Web of Science (and Crossref) when it was saved */
export type WosCheck = {
  doi: string
  found: boolean
  checkedAt: string
  title?: string
  source?: string
  year?: number
  timesCited?: number
  recordUrl?: string
  /** False when the researcher's family name isn't among the authors */
  includesYou?: boolean
  /** Not in Web of Science: whether Crossref knows the DOI at all */
  registered?: boolean
  /** Not in Web of Science: whether its journal is in Web of Science's journal list, and the journal's name */
  journalInWos?: boolean
  journal?: string
}

export type EvaluationEntry = {
  id: string
  item_id: string
  description: string
  detail: string
  /** Only on items whose entries state their own points */
  points: number | null
  /** Kept, but not sent with the form and not counted */
  hidden: boolean
  status: EntryStatus
  review_comment: string | null
  wos: WosCheck | null
  files: ServerDocument[]
  updated_at: string
}

/** An entry as it was last submitted */
export type SubmittedEntry = Pick<EvaluationEntry, "id" | "item_id" | "description" | "detail" | "points" | "hidden" | "status"> & { file_ids: string[] }

export type EntryInput = {
  item_id: string
  description: string
  detail: string
  points: number | null
  wos: WosCheck | null
  file_ids: string[]
}

export type EntryRef = { item_id: string; entry_id: string }

export type MyEvaluationBrief = {
  id: string
  period: EvaluationPeriod
  form_name: Localized
  state: EvaluationState
  submitted_at: string | null
  entries: number
  rejected: number
  missing_files: number
  first_rejected: EntryRef | null
  first_missing_file: EntryRef | null
}

export type MyEvaluation = {
  id: string
  period: EvaluationPeriod
  form_name: Localized
  structure: FormStructure
  state: EvaluationState
  /** The period is open and the form isn't submitted (or is being updated) */
  can_edit: boolean
  sent_at: string
  submitted_at: string | null
  entries: EvaluationEntry[]
  submission: SubmittedEntry[] | null
}

const me = (id: string) => `/me/evaluations/${id}`

export const myEvaluationsApi = {
  list: () => api<MyEvaluationBrief[]>("/me/evaluations"),
  get: (id: string) => api<MyEvaluation>(me(id)),
  addEntry: (id: string, input: EntryInput) => api<EvaluationEntry>(`${me(id)}/entries`, { method: "POST", body: input }),
  updateEntry: (id: string, entryId: string, input: EntryInput) => api<EvaluationEntry>(`${me(id)}/entries/${entryId}`, { method: "PUT", body: input }),
  setHidden: (id: string, entryId: string, hidden: boolean) => api<EvaluationEntry>(`${me(id)}/entries/${entryId}/hidden`, { method: "PUT", body: { hidden } }),
  submit: (id: string) => api<MyEvaluation>(`${me(id)}/submit`, { method: "POST", body: { confirm: true } }),
  reopen: (id: string) => api<MyEvaluation>(`${me(id)}/reopen`, { method: "POST" }),
  discard: (id: string) => api<MyEvaluation>(`${me(id)}/discard`, { method: "POST" }),
}

/**
 * Where a dashboard or notification "Fix" link goes: the first entry of the current evaluation (the open period's,
 * or the newest) that was rejected or has no evidence. Null when there's none, or the server can't be reached.
 */
export async function entryNeedingAttention(kind: "rejected" | "missing-file"): Promise<{ recordId: string; entryId: string } | null> {
  try {
    const list = await myEvaluationsApi.list()
    const current = list.find(item => item.period.status === "open") ?? list[0]
    const ref = kind === "rejected" ? current?.first_rejected : current?.first_missing_file
    return ref ? { recordId: ref.item_id, entryId: ref.entry_id } : null
  } catch {
    return null
  }
}
