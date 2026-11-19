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

export type FormSummary = { id: string; built_in: boolean; name: { en: string; ka: string }; description: string; parts: number; items: number }

export const formsApi = {
  list: (orgId: string) => api<FormSummary[]>(`/orgs/${orgId}/evaluation-forms`),
}
