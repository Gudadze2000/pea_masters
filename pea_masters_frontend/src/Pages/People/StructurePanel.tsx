import { useState, type FormEvent } from "react"
import { Pencil, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { groupByFaculty, localName, structureApi, type Unit, type UnitKind } from "@/lib/people"

type Props = {
  orgId: string
  units: Unit[]
  onChanged: (message: string) => void
}

type Editing = { kind: UnitKind; unit: Unit | null; facultyId?: string }

/** Faculties (schools) and their departments (programs), with each department's head and Researcher count. */
export function StructurePanel({ orgId, units, onChanged }: Props) {
  const { language } = useLanguage()
  const [editing, setEditing] = useState<Editing | null>(null)
  const groups = groupByFaculty(units, language)
  const faculties = units.filter(unit => unit.kind === "faculty")

  return (
    <>
      <section className="dashboard-card" aria-labelledby="structure-heading">
        <div className="card-heading structure-heading">
          <div>
            <h2 id="structure-heading">Faculties and departments</h2>
            <p className="card-subtitle">Researchers belong to a department. Each department has one head (Coordinator).</p>
          </div>
          <div className="structure-actions">
            <Button variant="outline" className="dashboard-button" onClick={() => setEditing({ kind: "faculty", unit: null })}><Plus />Add faculty</Button>
            <Button className="dashboard-button" disabled={faculties.length === 0} title={faculties.length === 0 ? "Add a faculty first" : undefined}
              onClick={() => setEditing({ kind: "department", unit: null })}><Plus />Add department</Button>
          </div>
        </div>

        {groups.length === 0 && (
          <p className="data-table-empty structure-empty">No faculties yet. Start with <strong>Add faculty</strong>, for example “School of Business, Technology and Education”, then add its departments.</p>
        )}

        <div className="structure-list">
          {groups.map(group => {
            const facultyName = group.faculty ? localName(group.faculty.name, language) : "Departments not in a faculty"
            return (
              <div key={group.faculty?.id ?? "none"} className="faculty-block">
                <div className="faculty-heading">
                  <div>
                    <h3>{facultyName}</h3>
                    <small>
                      {group.faculty
                        ? `${group.departments.length} ${group.departments.length === 1 ? "department" : "departments"} · ${group.faculty.member_count} ${group.faculty.member_count === 1 ? "researcher" : "researchers"}`
                        : "Edit each one to choose its faculty."}
                    </small>
                  </div>
                  {group.faculty && (
                    <div className="row-actions">
                      <Button variant="outline" className="dashboard-button small-button" onClick={() => setEditing({ kind: "department", unit: null, facultyId: group.faculty?.id })}>
                        <Plus />Department
                      </Button>
                      <Button variant="outline" size="icon" className="icon-button" aria-label={`Rename ${facultyName}`} onClick={() => setEditing({ kind: "faculty", unit: group.faculty })}><Pencil /></Button>
                    </div>
                  )}
                </div>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th scope="col">Department</th><th scope="col">Head (Coordinator)</th><th scope="col">Researchers</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                    </thead>
                    <tbody>
                      {group.departments.length === 0
                        ? <tr><td colSpan={4} className="data-table-empty">No departments yet.</td></tr>
                        : group.departments.map(unit => (
                          <tr key={unit.id}>
                            <td className="font-medium">{localName(unit.name, language)}</td>
                            <td>{unit.coordinator?.display_name ?? <span className="muted">No head yet</span>}</td>
                            <td>{unit.member_count}</td>
                            <td>
                              <div className="row-actions">
                                <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${localName(unit.name, language)}`}
                                  onClick={() => setEditing({ kind: "department", unit })}><Pencil /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      {editing && (
        <UnitSheet orgId={orgId} editing={editing} faculties={faculties}
          onClose={() => setEditing(null)} onSaved={message => { setEditing(null); onChanged(message) }} />
      )}
    </>
  )
}

function UnitSheet({ orgId, editing, faculties, onClose, onSaved }: {
  orgId: string; editing: Editing; faculties: Unit[]; onClose: () => void; onSaved: (message: string) => void
}) {
  const { language } = useLanguage()
  const { kind, unit } = editing
  const [nameEn, setNameEn] = useState(unit?.name.en ?? "")
  const [nameKa, setNameKa] = useState(unit?.name.ka ?? "")
  const [facultyId, setFacultyId] = useState(unit?.parent_id ?? editing.facultyId ?? (faculties.length === 1 ? faculties[0].id : ""))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState("")
  const [saving, setSaving] = useState(false)
  const noun = kind === "faculty" ? "faculty" : "department"

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const found: Record<string, string> = {}
    if (!nameEn.trim()) found.en = "English name is required."
    if (kind === "department" && !facultyId) found.faculty = "Choose the faculty it belongs to."
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setFailure("")
    const input = { name_en: nameEn.trim(), name_ka: nameKa.trim() || null, parent_id: kind === "department" ? facultyId : null }
    try {
      if (unit) await structureApi.update(orgId, unit.id, input)
      else await structureApi.create(orgId, kind, input)
      onSaved(unit ? `${input.name_en} was saved.` : `${input.name_en} was added.`)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  const sortedFaculties = [...faculties].sort((a, b) => localName(a.name, language).localeCompare(localName(b.name, language)))

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>{unit ? `Edit ${noun}` : `Add ${noun}`}</SheetTitle>
            <SheetDescription>
              {kind === "faculty" ? "A faculty or school, e.g. School of Business, Technology and Education." : "A department or program inside a faculty, e.g. Computer Science."}
            </SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit} aria-busy={saving}>
          <div className="form-sheet-body">
            <div className="form-grid">
              {failure && <div className="form-error-summary form-field span-4" role="alert">{failure}</div>}
              {kind === "department" && (
                <div className="form-field span-4">
                  <label htmlFor="unit-faculty">Faculty *</label>
                  <select id="unit-faculty" className="form-control" value={facultyId} data-empty={facultyId ? undefined : true}
                    aria-invalid={errors.faculty ? true : undefined} aria-describedby={errors.faculty ? "unit-faculty-error" : undefined}
                    onChange={event => { setFacultyId(event.target.value); setErrors(current => ({ ...current, faculty: "" })) }}>
                    <option value="">Choose a faculty</option>
                    {sortedFaculties.map(faculty => <option key={faculty.id} value={faculty.id}>{localName(faculty.name, language)}</option>)}
                  </select>
                  {errors.faculty && <p id="unit-faculty-error" className="field-error">{errors.faculty}</p>}
                </div>
              )}
              <div className="form-field span-4">
                <label htmlFor="unit-en">Name in English *</label>
                <input id="unit-en" className="form-control" value={nameEn} maxLength={200}
                  placeholder={kind === "faculty" ? "School of Business, Technology and Education" : "Computer Science"}
                  aria-invalid={errors.en ? true : undefined} aria-describedby={errors.en ? "unit-en-error" : undefined}
                  onChange={event => { setNameEn(event.target.value); setErrors(current => ({ ...current, en: "" })) }} />
                {errors.en && <p id="unit-en-error" className="field-error">{errors.en}</p>}
              </div>
              <div className="form-field span-4">
                <label htmlFor="unit-ka">Name in Georgian</label>
                <input id="unit-ka" className="form-control" lang="ka" value={nameKa} maxLength={200}
                  placeholder={kind === "faculty" ? "ბიზნესის, ტექნოლოგიისა და განათლების სკოლა" : "კომპიუტერული მეცნიერება"}
                  onChange={event => setNameKa(event.target.value)} />
                <p className="field-hint">Shown when the interface is in Georgian.</p>
              </div>
            </div>
          </div>
          <div className="form-sheet-footer">
            <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="dashboard-button" disabled={saving}>{saving ? "Saving…" : unit ? "Save" : `Add ${noun}`}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
