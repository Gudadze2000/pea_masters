import { api } from "./api"
import type { Role } from "./auth"

/* People and organization structure (pea_masters_backend/app/people.py and units.py).
   Structure: organization → faculties (schools) → departments (programs). People belong to a department;
   each department has one Coordinator, its head. The "member" role is shown as "Researcher". */

export type LocalizedName = Record<string, string> // { en, ka? }

export type UnitRef = { id: string; name: LocalizedName }

export type UnitKind = "faculty" | "department"

export type Unit = UnitRef & {
  kind: UnitKind
  /** A department's faculty */
  parent_id: string | null
  /** Departments only: their head */
  coordinator: { id: string; display_name: string } | null
  /** A faculty counts the people of all its departments */
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
  faculty: UnitRef | null
  /** The department this person heads */
  coordinates: UnitRef | null
  last_login_at: string | null
}

export type PeopleList = {
  people: Person[]
  /** Admins, and Coordinators for their own department */
  can_register: boolean
  /** Admins: roles, moving people between departments, structure */
  can_manage_roles: boolean
}

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

export const roleLabels: Record<Role, string> = { admin: "Admin", coordinator: "Coordinator", member: "Researcher" }
export const roleHints: Record<Role, string> = {
  admin: "The organization's responsible person: manages people, roles and structure.",
  coordinator: "Head of a department: registers and manages its Researchers.",
  member: "Keeps a researcher profile and submits evaluations.",
}
export const statusLabels: Record<PersonStatus, string> = { invited: "Invited", active: "Active", deactivated: "Deactivated" }

export type FacultyGroup = { faculty: Unit | null; departments: Unit[] }

/** Departments grouped under their faculty, sorted by name; departments without a faculty come last. */
export function groupByFaculty(units: Unit[], language: "KA" | "EN"): FacultyGroup[] {
  const byName = (a: Unit, b: Unit) => localName(a.name, language).localeCompare(localName(b.name, language))
  const faculties = units.filter(unit => unit.kind === "faculty").sort(byName)
  const departments = units.filter(unit => unit.kind === "department").sort(byName)
  const groups: FacultyGroup[] = faculties.map(faculty => ({ faculty, departments: departments.filter(d => d.parent_id === faculty.id) }))
  const orphans = departments.filter(d => !faculties.some(f => f.id === d.parent_id))
  if (orphans.length) groups.push({ faculty: null, departments: orphans })
  return groups
}

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

export type UnitInput = { name_en: string; name_ka: string | null; parent_id: string | null }

export const structureApi = {
  list: (orgId: string) => api<Unit[]>(`${base(orgId)}/units`),
  create: (orgId: string, kind: UnitKind, input: UnitInput) =>
    api<Unit>(`${base(orgId)}/units`, { method: "POST", body: { kind, ...input } }),
  update: (orgId: string, unitId: string, input: UnitInput) =>
    api<Unit>(`${base(orgId)}/units/${unitId}`, { method: "PATCH", body: input }),
}
