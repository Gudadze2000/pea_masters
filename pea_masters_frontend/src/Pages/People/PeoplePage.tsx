import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import "@/components/forms/forms.css"
import { initials, peopleOrganizations, useSession, type Role } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { departmentsApi, localName, peopleApi, roleLabels, statusLabels, type Department, type Person, type PersonStatus } from "@/lib/people"
import { ConfirmSheet } from "./ConfirmSheet"
import { DepartmentsPanel } from "./DepartmentsPanel"
import { PersonSheet } from "./PersonSheet"
import "./PeoplePage.css"

type Tab = "people" | "departments"
type Dialog = { kind: "add" } | { kind: "edit"; person: Person } | { kind: "deactivate"; person: Person } | { kind: "reactivate"; person: Person }

const statusClass: Record<PersonStatus, string> = { active: "status-active", invited: "status-submitted", deactivated: "status-draft" }

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Never"
}

/** People and departments of the organization. Admins manage them; Coordinators see their department's Members. */
export function PeoplePage() {
  const session = useSession()
  const { language } = useLanguage()
  const organizations = session ? peopleOrganizations(session) : []
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "")
  const org = organizations.find(item => item.id === orgId) ?? organizations[0]

  const [tab, setTab] = useState<Tab>("people")
  const [people, setPeople] = useState<Person[]>([])
  const [canManage, setCanManage] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
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
      const [list, units] = await Promise.all([peopleApi.list(org.id), departmentsApi.list(org.id)])
      setPeople(list.people)
      setCanManage(list.can_manage)
      setDepartments(units)
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
            <div className="dashboard-card"><p>This page is for Admins and Coordinators. Ask your organization's PEA administrator if you need access.</p></div>
          </div>
        )}
      </WorkspaceLayout>
    )
  }

  const coordinatorOnly = !canManage
  const search = query.trim().toLowerCase()
  const visible = people.filter(person =>
    (!search || person.display_name.toLowerCase().includes(search) || person.email.includes(search))
    && (!roleFilter || person.roles.includes(roleFilter))
    && (!statusFilter || person.status === statusFilter)
    && (!departmentFilter || person.department?.id === departmentFilter))
  const filtered = search !== "" || roleFilter !== "" || statusFilter !== "" || departmentFilter !== ""
  const domainHint = session.email.split("@")[1] ?? "iliauni.edu.ge"
  const coordinated = org.coordinates.map(unit => localName(unit.name, language)).join(", ")

  return (
    <WorkspaceLayout breadcrumb={breadcrumb}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>People</h1>
              <p>
                {coordinatorOnly
                  ? `Members of ${coordinated || "your department"}.`
                  : `Everyone in ${localName(org.name, language)}: who can sign in, their roles and departments.`}
              </p>
            </div>
            <div className="page-actions">
              <span className="save-status" role="status">{notice && <><Check aria-hidden="true" />{notice}</>}</span>
              {organizations.length > 1 && (
                <select className="form-control org-select" aria-label="Organization" value={org.id} onChange={event => { setLoading(true); setOrgId(event.target.value) }}>
                  {organizations.map(item => <option key={item.id} value={item.id}>{localName(item.name, language)}</option>)}
                </select>
              )}
              {canManage && tab === "people" && (
                <Button className="dashboard-button" onClick={() => setDialog({ kind: "add" })}><Plus />Add person</Button>
              )}
            </div>
          </div>

          {canManage && (
            <div className="segmented people-tabs" role="tablist" aria-label="People sections">
              {(["people", "departments"] as const).map(id => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} aria-checked={tab === id} onClick={() => setTab(id)}>
                  {id === "people" ? `People (${people.length})` : `Departments (${departments.length})`}
                </button>
              ))}
            </div>
          )}

          {loadError && (
            <div className="form-error-summary people-load-error" role="alert">
              {loadError} <Button variant="link" onClick={() => { setLoading(true); void load() }}>Try again</Button>
            </div>
          )}

          {tab === "departments" && canManage ? (
            <DepartmentsPanel orgId={org.id} departments={departments} canManage={canManage} onChanged={finish} />
          ) : (
            <section className="dashboard-card" aria-labelledby="people-heading">
              <div className="card-heading">
                <h2 id="people-heading">{coordinatorOnly ? "Members" : "People"}</h2>
              </div>

              <div className="people-filters">
                <div className="people-search">
                  <Search aria-hidden="true" />
                  <input className="form-control" type="search" placeholder="Search by name or email" aria-label="Search people"
                    value={query} onChange={event => setQuery(event.target.value)} />
                </div>
                {!coordinatorOnly && (
                  <>
                    <select className="form-control" aria-label="Filter by role" value={roleFilter} onChange={event => setRoleFilter(event.target.value as Role | "")}>
                      <option value="">All roles</option>
                      {(Object.keys(roleLabels) as Role[]).map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </select>
                    <select className="form-control" aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as PersonStatus | "")}>
                      <option value="">All statuses</option>
                      {(Object.keys(statusLabels) as PersonStatus[]).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                    <select className="form-control" aria-label="Filter by department" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}>
                      <option value="">All departments</option>
                      {departments.map(unit => <option key={unit.id} value={unit.id}>{localName(unit.name, language)}</option>)}
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
                      {canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="data-table-empty">Loading…</td></tr>
                    ) : visible.length === 0 ? (
                      <tr><td colSpan={6} className="data-table-empty">{filtered ? "No one matches these filters." : coordinatorOnly ? "No Members in your department yet." : "No people yet."}</td></tr>
                    ) : visible.map(person => (
                      <tr key={person.id} data-inactive={person.status === "deactivated" || undefined}>
                        <td>
                          <span className="researcher">
                            <span className="researcher-avatar" aria-hidden="true">{initials(person.display_name)}</span>
                            <span className="person-name">{person.display_name}<small>{person.email}</small></span>
                          </span>
                        </td>
                        <td>{person.department ? localName(person.department.name, language) : <span className="muted">None</span>}</td>
                        <td>
                          <div className="role-chips">
                            {person.roles.map(role => (
                              <span key={role} className={`role-chip role-${role}`}
                                title={role === "coordinator" && person.coordinates ? `Coordinates ${localName(person.coordinates.name, language)}` : undefined}>
                                {roleLabels[role]}{role === "coordinator" && person.coordinates ? `: ${localName(person.coordinates.name, language)}` : ""}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td><span className={`status-badge ${statusClass[person.status]}`}>{statusLabels[person.status]}</span></td>
                        <td className="nowrap">{formatDate(person.last_login_at)}</td>
                        {canManage && (
                          <td>
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
              departments={departments}
              domainHint={domainHint}
              onClose={() => setDialog(null)}
              onSaved={(_, message) => finish(message)}
              onAddDepartment={() => { setDialog(null); setTab("departments") }}
            />
          )}
          {dialog?.kind === "deactivate" && (
            <ConfirmSheet
              title={`Deactivate ${dialog.person.display_name}?`}
              description="They'll be signed out right away and won't be able to sign in. Their data and history are kept, and you can reactivate them later. If they coordinate a department, they stop coordinating it."
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
              description="They'll be able to sign in again with their previous roles. A former Coordinator needs their Coordinator role and department set again."
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
