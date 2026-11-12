import { api } from "./api"
import type { Role } from "./auth"

/* People and departments of an organization (pea_masters_backend/app/people.py and units.py). */

export type LocalizedName = Record<string, string> // { en, ka? }

export type UnitRef = { id: string; name: LocalizedName }

export type Department = UnitRef & {
  coordinator: { id: string; display_name: string } | null
  member_count: number
}

export type PersonStatus = "invited" | "active" | "deactivated"

export type Person = {
  id: string
  email: string
  display_name: string
  status: PersonStatus
  roles: Role[]
  department: UnitRef | null
  /** The department this person coordinates */
  coordinates: UnitRef | null
  last_login_at: string | null
}

export type PeopleList = { people: Person[]; can_manage: boolean }

export type PersonInput = {
  email: string
  display_name: string
  roles: Role[]
  department_id: string | null
  coordinates_unit_id: string | null
}

/** Picks the name in the interface language, falling back to the other one */
export function localName(name: LocalizedName, language: "KA" | "EN") {
  return (language === "KA" ? name.ka || name.en : name.en || name.ka) ?? ""
}

export const roleLabels: Record<Role, string> = { admin: "Admin", coordinator: "Coordinator", member: "Member" }
export const statusLabels: Record<PersonStatus, string> = { invited: "Invited", active: "Active", deactivated: "Deactivated" }

const base = (orgId: string) => `/orgs/${orgId}`

export const peopleApi = {
  list: (orgId: string) => api<PeopleList>(`${base(orgId)}/people`),
  register: (orgId: string, input: PersonInput) => api<Person>(`${base(orgId)}/people`, { method: "POST", body: input }),
  update: (orgId: string, userId: string, changes: { display_name?: string; department_id?: string | null }) =>
    api<Person>(`${base(orgId)}/people/${userId}`, { method: "PATCH", body: changes }),
  setRoles: (orgId: string, userId: string, body: { roles: Role[]; coordinates_unit_id: string | null; reason: string | null }) =>
    api<Person>(`${base(orgId)}/people/${userId}/roles`, { method: "PUT", body }),
  deactivate: (orgId: string, userId: string, reason: string | null) =>
    api<Person>(`${base(orgId)}/people/${userId}/deactivate`, { method: "POST", body: { reason } }),
  reactivate: (orgId: string, userId: string) =>
    api<Person>(`${base(orgId)}/people/${userId}/reactivate`, { method: "POST", body: { reason: null } }),
}

export const departmentsApi = {
  list: (orgId: string) => api<Department[]>(`${base(orgId)}/units`),
  create: (orgId: string, name: { name_en: string; name_ka: string | null }) =>
    api<UnitRef>(`${base(orgId)}/units`, { method: "POST", body: name }),
  rename: (orgId: string, unitId: string, name: { name_en: string; name_ka: string | null }) =>
    api<UnitRef>(`${base(orgId)}/units/${unitId}`, { method: "PATCH", body: name }),
}
