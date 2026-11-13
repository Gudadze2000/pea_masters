import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import "@/components/forms/forms.css"
import { initials, peopleOrganizations, useSession, type Role } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { groupByFaculty, localName, peopleApi, positionsApi, roleLabels, statusLabels, structureApi, type Person, type PersonStatus, type Position, type Unit } from "@/lib/people"
import { ConfirmSheet } from "./ConfirmSheet"
import { PersonSheet } from "./PersonSheet"
import { PositionsPanel } from "./PositionsPanel"
import { StructurePanel } from "./StructurePanel"
import "./PeoplePage.css"

type Tab = "people" | "structure"
type Dialog = { kind: "add" } | { kind: "edit"; person: Person } | { kind: "deactivate"; person: Person } | { kind: "reactivate"; person: Person }

const statusClass: Record<PersonStatus, string> = { active: "status-active", invited: "status-submitted", deactivated: "status-draft" }

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Never"
}

/**
 * People and structure of the organization.
 * Admins manage everyone, roles, faculties and departments. Heads of department (Coordinators) register and
 * manage the Researchers of their own department. The backend enforces the same rules.
 */
export function PeoplePage() {
  const session = useSession()
  const { language } = useLanguage()
  const organizations = session ? peopleOrganizations(session) : []
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "")
  const org = organizations.find(item => item.id === orgId) ?? organizations[0]

  const [tab, setTab] = useState<Tab>("people")
  const [people, setPeople] = useState<Person[]>([])
  const [canRegister, setCanRegister] = useState(false)
  const [canManageRoles, setCanManageRoles] = useState(false)
  const [units, setUnits] = useState<Unit[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [notice, setNotice] = useState("")
  const noticeTimer = useRef<number | undefined>(undefined)
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<Role | "">("")
  const [statusFilter, setStatusFilter] = useState<PersonStatus | "">("")
  const [departmentFilter, setDepartmentFilter] = useState("")

  const load = useCallback(async () => {
    if (!org) return
    try {
      const [list, structure, positionList] = await Promise.all([peopleApi.list(org.id), structureApi.list(org.id), positionsApi.list(org.id)])
      setPeople(list.people)
      setCanRegister(list.can_register)
      setCanManageRoles(list.can_manage_roles)
      setUnits(structure)
      setPositions(positionList)
      setLoadError("")
    } catch (cause) {
      setLoadError(cause instanceof ApiError ? cause.message : "Couldn't load people. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [org])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  function announce(message: string) {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(""), 5000)
  }

  function finish(message: string) {
    setDialog(null)
    announce(message)
    void load()
  }

  const breadcrumb = [{ label: "People" }]
  if (!session || !org) {
    return (
      <WorkspaceLayout breadcrumb={breadcrumb}>
        {() => (
          <div className="dashboard-content">
            <div className="page-heading"><div><h1>People</h1></div></div>
            <div className="dashboard-card"><p>This page is for Admins and heads of department. Ask your organization's PEA administrator if you need access.</p></div>
          </div>
        )}
      </WorkspaceLayout>
    )
  }

  const isHead = !canManageRoles
  const headedDepartments = org.coordinates.map(unit => unit.id)
  const headedNames = org.coordinates.map(unit => localName(unit.name, language)).join(", ")
  /** Heads of department act on Researchers only, never on Admins or other heads */
  const canEdit = (person: Person) => canManageRoles || person.roles.every(role => role === "member")

  const search = query.trim().toLowerCase()
  const visible = people.filter(person =>
    (!search || person.display_name.toLowerCase().includes(search) || person.email.includes(search))
    && (!roleFilter || person.roles.includes(roleFilter))
    && (!statusFilter || person.status === statusFilter)
    && (!departmentFilter || person.department?.id === departmentFilter || person.faculty?.id === departmentFilter))
  const filtered = search !== "" || roleFilter !== "" || statusFilter !== "" || departmentFilter !== ""
  const domainHint = session.email.split("@")[1] ?? "iliauni.edu.ge"
  const groups = groupByFaculty(units, language)

  return (
    <WorkspaceLayout breadcrumb={breadcrumb}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>People</h1>
              <p>
                {isHead
                  ? `Researchers of ${headedNames || "your department"}. You can register them, correct their names, and deactivate or reactivate them.`
                  : `Everyone in ${localName(org.name, language)}: who can sign in, their roles, faculties and departments.`}
              </p>
            </div>
            <div className="page-actions">
              <span className="save-status" role="status">{notice && <><Check aria-hidden="true" />{notice}</>}</span>
              {organizations.length > 1 && (
                <select className="form-control org-select" aria-label="Organization" value={org.id} onChange={event => { setLoading(true); setOrgId(event.target.value) }}>
                  {organizations.map(item => <option key={item.id} value={item.id}>{localName(item.name, language)}</option>)}
                </select>
              )}
              {canRegister && tab === "people" && (
                <Button className="dashboard-button" onClick={() => setDialog({ kind: "add" })}><Plus />{isHead ? "Add researcher" : "Add person"}</Button>
              )}
            </div>
          </div>

          {canManageRoles && (
            <div className="segmented people-tabs" role="tablist" aria-label="People sections">
              <button type="button" role="tab" aria-selected={tab === "people"} aria-checked={tab === "people"} onClick={() => setTab("people")}>People ({people.length})</button>
              <button type="button" role="tab" aria-selected={tab === "structure"} aria-checked={tab === "structure"} onClick={() => setTab("structure")}>Structure</button>
            </div>
          )}

          {loadError && (
            <div className="form-error-summary people-load-error" role="alert">
              {loadError} <Button variant="link" onClick={() => { setLoading(true); void load() }}>Try again</Button>
            </div>
          )}

          {tab === "structure" && canManageRoles ? (
            <>
              <StructurePanel orgId={org.id} units={units} onChanged={finish} />
              <PositionsPanel orgId={org.id} positions={positions} onChanged={finish} />
            </>
          ) : (
            <section className="dashboard-card" aria-labelledby="people-heading">
              <div className="card-heading">
                <h2 id="people-heading">{isHead ? "Researchers" : "People"}</h2>
              </div>

              <div className="people-filters">
                <div className="people-search">
                  <Search aria-hidden="true" />
                  <input className="form-control" type="search" placeholder="Search by name or email" aria-label="Search people"
                    value={query} onChange={event => setQuery(event.target.value)} />
                </div>
                <select className="form-control" aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as PersonStatus | "")}>
                  <option value="">All statuses</option>
                  {(Object.keys(statusLabels) as PersonStatus[]).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
                {!isHead && (
                  <>
                    <select className="form-control" aria-label="Filter by role" value={roleFilter} onChange={event => setRoleFilter(event.target.value as Role | "")}>
                      <option value="">All roles</option>
                      {(Object.keys(roleLabels) as Role[]).map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </select>
                    <select className="form-control" aria-label="Filter by faculty or department" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}>
                      <option value="">All faculties and departments</option>
                      {groups.map(group => (
                        <optgroup key={group.faculty?.id ?? "none"} label={group.faculty ? localName(group.faculty.name, language) : "Not in a faculty"}>
                          {group.faculty && <option value={group.faculty.id}>All of {localName(group.faculty.name, language)}</option>}
                          {group.departments.map(unit => <option key={unit.id} value={unit.id}>{localName(unit.name, language)}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div className="data-table-wrap">
                <table className="data-table people-table">
                  <thead>
                    <tr>
                      <th scope="col">Person</th><th scope="col">Department</th><th scope="col">Roles</th>
                      <th scope="col">Status</th><th scope="col">Last sign-in</th>
                      {canRegister && <th scope="col"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="data-table-empty">Loading…</td></tr>
                    ) : visible.length === 0 ? (
                      <tr><td colSpan={6} className="data-table-empty">{filtered ? "No one matches these filters." : isHead ? "No Researchers in your department yet. Use “Add researcher”." : "No people yet."}</td></tr>
                    ) : visible.map(person => (
                      <tr key={person.id} data-inactive={person.status === "deactivated" || undefined}>
                        <td>
                          <span className="researcher">
                            <span className="researcher-avatar" aria-hidden="true">{initials(person.display_name)}</span>
                            <span className="person-name">
                              {person.display_name}
                              <small>{person.email}</small>
                              {person.position && <small>{localName(person.position.name, language)}</small>}
                            </span>
                          </span>
                        </td>
                        <td>
                          {person.department
                            ? <span className="person-name">{localName(person.department.name, language)}{person.faculty && <small>{localName(person.faculty.name, language)}</small>}</span>
                            : <span className="muted">None</span>}
                        </td>
                        <td>
                          <div className="role-chips">
                            {person.roles.map(role => (
                              <span key={role} className={`role-chip role-${role}`}>
                                {role === "coordinator" && person.coordinates ? `Head: ${localName(person.coordinates.name, language)}` : roleLabels[role]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td><span className={`status-badge ${statusClass[person.status]}`}>{statusLabels[person.status]}</span></td>
                        <td className="nowrap">{formatDate(person.last_login_at)}</td>
                        {canRegister && (
                          <td>
                            {canEdit(person) && (
                              <div className="row-actions">
                                <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${person.display_name}`}
                                  onClick={() => setDialog({ kind: "edit", person })}><Pencil /></Button>
                                {person.status === "deactivated" ? (
                                  <Button variant="outline" size="icon" className="icon-button" aria-label={`Reactivate ${person.display_name}`}
                                    onClick={() => setDialog({ kind: "reactivate", person })}><UserCheck /></Button>
                                ) : (
                                  <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Deactivate ${person.display_name}`}
                                    disabled={person.id === session.id} title={person.id === session.id ? "You can't deactivate yourself" : undefined}
                                    onClick={() => setDialog({ kind: "deactivate", person })}><UserX /></Button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(dialog?.kind === "add" || dialog?.kind === "edit") && (
            <PersonSheet
              orgId={org.id}
              person={dialog.kind === "edit" ? dialog.person : null}
              units={units}
              positions={positions}
              domainHint={domainHint}
              canManageRoles={canManageRoles}
              headedDepartments={headedDepartments}
              onClose={() => setDialog(null)}
              onSaved={(_, message) => finish(message)}
              onAddDepartment={() => { setDialog(null); setTab("structure") }}
            />
          )}
          {dialog?.kind === "deactivate" && (
            <ConfirmSheet
              title={`Deactivate ${dialog.person.display_name}?`}
              description="They'll be signed out right away and won't be able to sign in. Their data and history are kept, and they can be reactivated later. A head of department stops heading it."
              confirmLabel="Deactivate"
              destructive
              askReason
              onClose={() => setDialog(null)}
              onConfirm={async reason => {
                await peopleApi.deactivate(org.id, dialog.person.id, reason)
                finish(`${dialog.person.display_name} was deactivated.`)
              }}
            />
          )}
          {dialog?.kind === "reactivate" && (
            <ConfirmSheet
              title={`Reactivate ${dialog.person.display_name}?`}
              description="They'll be able to sign in again with their previous roles. A former head of department needs to be made head again by an Admin."
              confirmLabel="Reactivate"
              onClose={() => setDialog(null)}
              onConfirm={async () => {
                await peopleApi.reactivate(org.id, dialog.person.id)
                finish(`${dialog.person.display_name} was reactivated.`)
              }}
            />
          )}
        </div>
      )}
    </WorkspaceLayout>
  )
}
