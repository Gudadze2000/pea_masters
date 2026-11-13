import { useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import "@/components/forms/forms.css"
import type { Role } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { nameFromEmail } from "@/lib/names"
import { useLanguage } from "@/lib/language-context"
import { groupByFaculty, localName, peopleApi, roleHints, roleLabels, type Person, type Position, type Unit } from "@/lib/people"

const allRoles: Role[] = ["admin", "coordinator", "member"]

type Props = {
  orgId: string
  /** null: add a new person */
  person: Person | null
  units: Unit[]
  positions: Position[]
  domainHint: string
  /** Admins: full form. Heads of department: Researchers in their own department only. */
  canManageRoles: boolean
  /** Departments the signed-in head of department heads */
  headedDepartments: string[]
  onClose: () => void
  onSaved: (person: Person, message: string) => void
  /** Closes the panel and opens the Structure tab */
  onAddDepartment: () => void
}

/** Side panel to register someone or change their name, department and roles. */
export function PersonSheet({ orgId, person, units, positions, domainHint, canManageRoles, headedDepartments, onClose, onSaved, onAddDepartment }: Props) {
  const { language } = useLanguage()
  const editing = person !== null
  const ownDepartments = units.filter(unit => headedDepartments.includes(unit.id))
  const [email, setEmail] = useState("")
  const [name, setName] = useState(person?.display_name ?? "")
  /** While false, the name follows the email ("giorgi.kekelidze.3@…" → "Giorgi Kekelidze") */
  const [nameEdited, setNameEdited] = useState(false)
  const [departmentId, setDepartmentId] = useState(person?.department?.id ?? (canManageRoles ? "" : ownDepartments[0]?.id ?? ""))
  const [positionId, setPositionId] = useState(person?.position?.id ?? "")
  const [roles, setRoles] = useState<Set<Role>>(new Set(person?.roles ?? ["member"]))
  const [coordinatesId, setCoordinatesId] = useState(person?.coordinates?.id ?? "")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState("")
  const [saving, setSaving] = useState(false)

  const groups = groupByFaculty(units, language)
  const hasDepartments = groups.some(group => group.departments.length > 0)
  const removesRole = editing && person.roles.some(role => !roles.has(role))
  const facultyLabel = (group: (typeof groups)[number]) => (group.faculty ? localName(group.faculty.name, language) : "Not in a faculty")

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
    if (canManageRoles && roles.size === 0) found.roles = "Choose at least one role."
    if (canManageRoles && roles.has("coordinator") && !coordinatesId) found.coordinates = "Choose the department they head."
    if (!canManageRoles && !editing && !departmentId) found.department = "You don't head a department yet. Ask an Admin."
    setErrors(found)
    setFailure("")
    if (Object.keys(found).length) return

    const roleList = canManageRoles ? allRoles.filter(role => roles.has(role)) : (["member"] as Role[])
    setSaving(true)
    try {
      if (!editing) {
        const created = await peopleApi.register(orgId, {
          email: email.trim(), display_name: name.trim(), roles: roleList, department_id: departmentId || null,
          position_id: canManageRoles && departmentId ? positionId || null : null,
          coordinates_unit_id: canManageRoles && roles.has("coordinator") ? coordinatesId : null,
        })
        onSaved(created, `${created.display_name} was registered. They can now sign in with Google.`)
        return
      }
      let saved = person
      const changes: { display_name?: string; department_id?: string | null; position_id?: string | null } = {}
      if (name.trim() !== person.display_name) changes.display_name = name.trim()
      if (canManageRoles && (departmentId || null) !== (person.department?.id ?? null)) changes.department_id = departmentId || null
      const wantedPosition = departmentId ? positionId || null : null
      if (canManageRoles && wantedPosition !== (person.position?.id ?? null)) changes.position_id = wantedPosition
      if (Object.keys(changes).length) saved = await peopleApi.update(orgId, person.id, changes)

      if (canManageRoles) {
        const wantedCoordinates = roles.has("coordinator") ? coordinatesId : null
        const rolesChanged = roleList.join() !== person.roles.join() || wantedCoordinates !== (person.coordinates?.id ?? null)
        if (rolesChanged) {
          saved = await peopleApi.setRoles(orgId, person.id, { roles: roleList, coordinates_unit_id: wantedCoordinates, reason: reason.trim() || null })
        }
      }
      onSaved(saved, `Changes to ${saved.display_name} were saved.`)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  /** Departments grouped by faculty, for a <select> */
  const departmentOptions = (disable?: (unit: Unit) => string | null) => groups.filter(group => group.departments.length > 0).map(group => (
    <optgroup key={group.faculty?.id ?? "none"} label={facultyLabel(group)}>
      {group.departments.map(unit => {
        const note = disable?.(unit) ?? null
        return <option key={unit.id} value={unit.id} disabled={note !== null}>{localName(unit.name, language)}{note ? ` (${note})` : ""}</option>
      })}
    </optgroup>
  ))

  const fixedDepartment = units.find(unit => unit.id === departmentId)
  const nameHint = !editing
    ? "Filled in from the email. Replaced by their official Google name when they first sign in."
    : name.trim() !== person.display_name
      ? "Your correction will be kept: Google won't change it."
      : person.name_source === "google"
        ? "Official name from their Google account. If you change it, your version is kept."
        : person.name_source === "manual"
          ? "Corrected in PEA. Google won't change it."
          : "Will be replaced by their official Google name when they first sign in."

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>{editing ? `Edit ${person.display_name}` : canManageRoles ? "Add person" : "Add researcher"}</SheetTitle>
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
                    onChange={event => {
                      setEmail(event.target.value)
                      if (!nameEdited) setName(nameFromEmail(event.target.value) ?? "")
                      setErrors(current => ({ ...current, email: "", name: "" }))
                    }} />
                  {errors.email && <p id="person-email-error" className="field-error">{errors.email}</p>}
                </div>
              )}

              <div className="form-field span-4">
                <label htmlFor="person-name">Full name *</label>
                <input id="person-name" className="form-control" type="text" autoComplete="off" value={name}
                  placeholder="Name Surname" aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? "person-name-error" : "person-name-hint"}
                  onChange={event => { setName(event.target.value); setNameEdited(true); setErrors(current => ({ ...current, name: "" })) }} />
                {errors.name
                  ? <p id="person-name-error" className="field-error">{errors.name}</p>
                  : <p id="person-name-hint" className="field-hint">{nameHint}</p>}
              </div>

              <div className="form-field span-4">
                <label htmlFor="person-department">Department</label>
                {!canManageRoles && (editing || ownDepartments.length <= 1) ? (
                  <>
                    <p id="person-department" className="read-only-value">
                      {fixedDepartment ? localName(fixedDepartment.name, language) : person?.department ? localName(person.department.name, language) : "None"}
                    </p>
                    <p className="field-hint">{editing ? "Only Admins can move people to another department." : "Researchers you add join your department."}</p>
                    {errors.department && <p className="field-error">{errors.department}</p>}
                  </>
                ) : !canManageRoles ? (
                  <select id="person-department" className="form-control" value={departmentId} onChange={event => setDepartmentId(event.target.value)}>
                    {ownDepartments.map(unit => <option key={unit.id} value={unit.id}>{localName(unit.name, language)}</option>)}
                  </select>
                ) : !hasDepartments ? (
                  <div className="empty-departments">
                    <p>There are no departments yet. Add faculties and departments first, then come back to choose one.</p>
                    <Button type="button" variant="outline" className="dashboard-button" onClick={onAddDepartment}>Go to Structure</Button>
                  </div>
                ) : (
                  <select id="person-department" className="form-control" value={departmentId} data-empty={departmentId ? undefined : true}
                    onChange={event => setDepartmentId(event.target.value)}>
                    <option value="">No department</option>
                    {departmentOptions()}
                  </select>
                )}
              </div>

              {canManageRoles && (
                <div className="form-field span-4">
                  <label htmlFor="person-position">Academic position</label>
                  <select id="person-position" className="form-control" value={departmentId ? positionId : ""} disabled={!departmentId}
                    data-empty={positionId && departmentId ? undefined : true} aria-describedby="person-position-hint"
                    onChange={event => setPositionId(event.target.value)}>
                    <option value="">No position</option>
                    {[...positions].sort((a, b) => localName(a.name, language).localeCompare(localName(b.name, language)))
                      .map(position => <option key={position.id} value={position.id}>{localName(position.name, language)}</option>)}
                  </select>
                  <p id="person-position-hint" className="field-hint">
                    {!departmentId ? "Choose a department first: the position is held in a department."
                      : positions.length === 0 ? "Add academic positions in the Structure tab." : "For example Professor or Associate Professor."}
                  </p>
                </div>
              )}

              {canManageRoles ? (
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
              ) : !editing && (
                <p className="form-field span-4 field-hint">They'll be registered as a <strong>Researcher</strong>. Admins assign other roles.</p>
              )}

              {canManageRoles && roles.has("coordinator") && hasDepartments && (
                <div className="form-field span-4">
                  <label htmlFor="person-coordinates">Head of department *</label>
                  <select id="person-coordinates" className="form-control" value={coordinatesId} data-empty={coordinatesId ? undefined : true}
                    aria-invalid={errors.coordinates ? true : undefined}
                    aria-describedby={errors.coordinates ? "person-coordinates-error" : "person-coordinates-hint"}
                    onChange={event => { setCoordinatesId(event.target.value); setErrors(current => ({ ...current, coordinates: "" })) }}>
                    <option value="">Choose a department</option>
                    {departmentOptions(unit => unit.coordinator && unit.coordinator.id !== person?.id ? `head: ${unit.coordinator.display_name}` : null)}
                  </select>
                  {errors.coordinates
                    ? <p id="person-coordinates-error" className="field-error">{errors.coordinates}</p>
                    : <p id="person-coordinates-hint" className="field-hint">Each department has one head, who registers and manages its Researchers.</p>}
                </div>
              )}

              {canManageRoles && removesRole && (
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
              {saving ? "Saving…" : editing ? "Save changes" : canManageRoles ? "Add person" : "Add researcher"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
