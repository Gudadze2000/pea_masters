import { useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import "@/components/forms/forms.css"
import type { Role } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { localName, peopleApi, roleLabels, type Department, type Person } from "@/lib/people"

const allRoles: Role[] = ["admin", "coordinator", "member"]
const roleHints: Record<Role, string> = {
  admin: "Manages people, roles and departments of the organization.",
  coordinator: "Reviews the Members of one department.",
  member: "Keeps a researcher profile and submits evaluations.",
}

type Props = {
  orgId: string
  /** null: add a new person */
  person: Person | null
  departments: Department[]
  domainHint: string
  onClose: () => void
  onSaved: (person: Person, message: string) => void
  /** Closes the panel and opens the Departments tab */
  onAddDepartment: () => void
}

/** Side panel to register someone or change their name, department and roles. */
export function PersonSheet({ orgId, person, departments, domainHint, onClose, onSaved, onAddDepartment }: Props) {
  const { language } = useLanguage()
  const editing = person !== null
  const [email, setEmail] = useState("")
  const [name, setName] = useState(person?.display_name ?? "")
  const [departmentId, setDepartmentId] = useState(person?.department?.id ?? "")
  const [roles, setRoles] = useState<Set<Role>>(new Set(person?.roles ?? ["member"]))
  const [coordinatesId, setCoordinatesId] = useState(person?.coordinates?.id ?? "")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState("")
  const [saving, setSaving] = useState(false)

  const removesRole = editing && person.roles.some(role => !roles.has(role))
  const sortedDepartments = [...departments].sort((a, b) => localName(a.name, language).localeCompare(localName(b.name, language)))

  function toggleRole(role: Role) {
    setRoles(current => {
      const next = new Set(current)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
    setErrors(current => ({ ...current, roles: "", coordinates: "" }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const found: Record<string, string> = {}
    if (!editing && !email.trim()) found.email = "Email is required."
    if (!name.trim()) found.name = "Name is required."
    if (roles.size === 0) found.roles = "Choose at least one role."
    if (roles.has("coordinator") && !coordinatesId) found.coordinates = "Choose the department they coordinate."
    setErrors(found)
    setFailure("")
    if (Object.keys(found).length) return

    const roleList = allRoles.filter(role => roles.has(role))
    setSaving(true)
    try {
      if (!editing) {
        const created = await peopleApi.register(orgId, {
          email: email.trim(), display_name: name.trim(), roles: roleList,
          department_id: departmentId || null, coordinates_unit_id: roles.has("coordinator") ? coordinatesId : null,
        })
        onSaved(created, `${created.display_name} was registered. They can now sign in with Google.`)
        return
      }
      let saved = person
      const changes: { display_name?: string; department_id?: string | null } = {}
      if (name.trim() !== person.display_name) changes.display_name = name.trim()
      if ((departmentId || null) !== (person.department?.id ?? null)) changes.department_id = departmentId || null
      if (Object.keys(changes).length) saved = await peopleApi.update(orgId, person.id, changes)

      const wantedCoordinates = roles.has("coordinator") ? coordinatesId : null
      const rolesChanged = roleList.join() !== person.roles.join() || wantedCoordinates !== (person.coordinates?.id ?? null)
      if (rolesChanged) {
        saved = await peopleApi.setRoles(orgId, person.id, { roles: roleList, coordinates_unit_id: wantedCoordinates, reason: reason.trim() || null })
      }
      onSaved(saved, `Changes to ${saved.display_name} were saved.`)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>{editing ? `Edit ${person.display_name}` : "Add person"}</SheetTitle>
            <SheetDescription>
              {editing ? person.email : "They'll be able to sign in with this Google account once you save."}
            </SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit} aria-busy={saving}>
          <div className="form-sheet-body">
            <div className="form-grid">
              {failure && <div className="form-error-summary form-field span-4" role="alert">{failure}</div>}

              {!editing && (
                <div className="form-field span-4">
                  <label htmlFor="person-email">University email *</label>
                  <input id="person-email" className="form-control" type="email" autoComplete="off" value={email}
                    placeholder={`name.surname@${domainHint}`} aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? "person-email-error" : undefined}
                    onChange={event => { setEmail(event.target.value); setErrors(current => ({ ...current, email: "" })) }} />
                  {errors.email && <p id="person-email-error" className="field-error">{errors.email}</p>}
                </div>
              )}

              <div className="form-field span-4">
                <label htmlFor="person-name">Full name *</label>
                <input id="person-name" className="form-control" type="text" autoComplete="off" value={name}
                  placeholder="Name Surname" aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? "person-name-error" : undefined}
                  onChange={event => { setName(event.target.value); setErrors(current => ({ ...current, name: "" })) }} />
                {errors.name && <p id="person-name-error" className="field-error">{errors.name}</p>}
              </div>

              <div className="form-field span-4">
                <label htmlFor="person-department">Department</label>
                {departments.length === 0 ? (
                  <div className="empty-departments">
                    <p>There are no departments yet. Add them first, then come back to choose one.</p>
                    <Button type="button" variant="outline" className="dashboard-button" onClick={onAddDepartment}>Go to Departments</Button>
                  </div>
                ) : (
                  <select id="person-department" className="form-control" value={departmentId} data-empty={departmentId ? undefined : true}
                    onChange={event => setDepartmentId(event.target.value)}>
                    <option value="">No department</option>
                    {sortedDepartments.map(unit => <option key={unit.id} value={unit.id}>{localName(unit.name, language)}</option>)}
                  </select>
                )}
              </div>

              <fieldset className="form-field span-4 role-fieldset" aria-describedby={errors.roles ? "person-roles-error" : undefined}>
                <legend>Roles *</legend>
                {allRoles.map(role => (
                  <label key={role} className="role-option">
                    <input type="checkbox" className="form-checkbox" checked={roles.has(role)} onChange={() => toggleRole(role)} />
                    <span><strong>{roleLabels[role]}</strong><small>{roleHints[role]}</small></span>
                  </label>
                ))}
                {errors.roles && <p id="person-roles-error" className="field-error">{errors.roles}</p>}
              </fieldset>

              {roles.has("coordinator") && departments.length > 0 && (
                <div className="form-field span-4">
                  <label htmlFor="person-coordinates">Coordinates department *</label>
                  <select id="person-coordinates" className="form-control" value={coordinatesId} data-empty={coordinatesId ? undefined : true}
                    aria-invalid={errors.coordinates ? true : undefined}
                    aria-describedby={errors.coordinates ? "person-coordinates-error" : "person-coordinates-hint"}
                    onChange={event => { setCoordinatesId(event.target.value); setErrors(current => ({ ...current, coordinates: "" })) }}>
                    <option value="">Choose a department</option>
                    {sortedDepartments.map(unit => {
                      const takenBy = unit.coordinator && unit.coordinator.id !== person?.id ? unit.coordinator.display_name : null
                      return (
                        <option key={unit.id} value={unit.id} disabled={takenBy !== null}>
                          {localName(unit.name, language)}{takenBy ? ` (coordinated by ${takenBy})` : ""}
                        </option>
                      )
                    })}
                  </select>
                  {errors.coordinates
                    ? <p id="person-coordinates-error" className="field-error">{errors.coordinates}</p>
                    : <p id="person-coordinates-hint" className="field-hint">Each department has one Coordinator, who sees its Members.</p>}
                </div>
              )}

              {removesRole && (
                <div className="form-field span-4">
                  <label htmlFor="person-reason">Reason for removing a role</label>
                  <input id="person-reason" className="form-control" type="text" value={reason} maxLength={500}
                    placeholder="Optional, kept in the audit log" onChange={event => setReason(event.target.value)} />
                </div>
              )}
            </div>
          </div>
          <div className="form-sheet-footer">
            <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="dashboard-button" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add person"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
