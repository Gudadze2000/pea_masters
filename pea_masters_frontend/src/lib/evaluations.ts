import { api } from "./api"

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
