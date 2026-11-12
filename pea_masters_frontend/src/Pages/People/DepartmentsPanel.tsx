import { useState, type FormEvent } from "react"
import { Pencil, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { departmentsApi, localName, type Department } from "@/lib/people"

type Props = {
  orgId: string
  departments: Department[]
  canManage: boolean
  onChanged: (message: string) => void
}

/** Departments of the organization, with their Coordinator and number of Members. */
export function DepartmentsPanel({ orgId, departments, canManage, onChanged }: Props) {
  const { language } = useLanguage()
  const [editing, setEditing] = useState<Department | "new" | null>(null)
  const sorted = [...departments].sort((a, b) => localName(a.name, language).localeCompare(localName(b.name, language)))

  return (
    <section className="dashboard-card" aria-labelledby="departments-heading">
      <div className="card-heading">
        <h2 id="departments-heading">Departments</h2>
        {canManage && <Button className="dashboard-button" onClick={() => setEditing("new")}><Plus />Add department</Button>}
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Department</th><th scope="col">Coordinator</th><th scope="col">Members</th>
              {canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0
              ? <tr><td colSpan={canManage ? 4 : 3} className="data-table-empty">No departments yet. Add one, then assign people and a Coordinator to it.</td></tr>
              : sorted.map(unit => (
                <tr key={unit.id}>
                  <td className="font-medium">{localName(unit.name, language)}</td>
                  <td>{unit.coordinator?.display_name ?? <span className="muted">No Coordinator</span>}</td>
                  <td>{unit.member_count}</td>
                  {canManage && (
                    <td>
                      <div className="row-actions">
                        <Button variant="outline" size="icon" className="icon-button" aria-label={`Rename ${localName(unit.name, language)}`} onClick={() => setEditing(unit)}><Pencil /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <DepartmentSheet
          orgId={orgId}
          department={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={message => { setEditing(null); onChanged(message) }}
        />
      )}
    </section>
  )
}

function DepartmentSheet({ orgId, department, onClose, onSaved }: { orgId: string; department: Department | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [nameEn, setNameEn] = useState(department?.name.en ?? "")
  const [nameKa, setNameKa] = useState(department?.name.ka ?? "")
  const [error, setError] = useState("")
  const [failure, setFailure] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!nameEn.trim()) { setError("English name is required."); return }
    setSaving(true)
    setFailure("")
    const name = { name_en: nameEn.trim(), name_ka: nameKa.trim() || null }
    try {
      if (department) await departmentsApi.rename(orgId, department.id, name)
      else await departmentsApi.create(orgId, name)
      onSaved(department ? `Renamed to ${name.name_en}.` : `${name.name_en} was added.`)
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
            <SheetTitle>{department ? "Rename department" : "Add department"}</SheetTitle>
            <SheetDescription>The name is shown in the interface language people choose.</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit} aria-busy={saving}>
          <div className="form-sheet-body">
            <div className="form-grid">
              {failure && <div className="form-error-summary form-field span-4" role="alert">{failure}</div>}
              <div className="form-field span-4">
                <label htmlFor="department-en">Name in English *</label>
                <input id="department-en" className="form-control" value={nameEn} maxLength={200} placeholder="Department of Physics"
                  aria-invalid={error ? true : undefined} aria-describedby={error ? "department-en-error" : undefined}
                  onChange={event => { setNameEn(event.target.value); setError("") }} />
                {error && <p id="department-en-error" className="field-error">{error}</p>}
              </div>
              <div className="form-field span-4">
                <label htmlFor="department-ka">Name in Georgian</label>
                <input id="department-ka" className="form-control" lang="ka" value={nameKa} maxLength={200} placeholder="ფიზიკის დეპარტამენტი"
                  onChange={event => setNameKa(event.target.value)} />
              </div>
            </div>
          </div>
          <div className="form-sheet-footer">
            <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="dashboard-button" disabled={saving}>{saving ? "Saving…" : department ? "Save" : "Add department"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
