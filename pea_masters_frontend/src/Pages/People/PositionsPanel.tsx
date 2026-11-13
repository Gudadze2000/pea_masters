import { useState, type FormEvent } from "react"
import { Pencil, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { localName, positionsApi, type Position } from "@/lib/people"

type Props = {
  orgId: string
  positions: Position[]
  onChanged: (message: string) => void
}

/** Academic positions of the organization (Professor, Associate Professor, ...), with how many people hold each. */
export function PositionsPanel({ orgId, positions, onChanged }: Props) {
  const { language } = useLanguage()
  const [editing, setEditing] = useState<Position | "new" | null>(null)
  const sorted = [...positions].sort((a, b) => localName(a.name, language).localeCompare(localName(b.name, language)))

  return (
    <section className="dashboard-card" aria-labelledby="positions-heading">
      <div className="card-heading structure-heading">
        <div>
          <h2 id="positions-heading">Academic positions</h2>
          <p className="card-subtitle">Each person can hold one position in their department. Set it when editing them on the People tab.</p>
        </div>
        <Button variant="outline" className="dashboard-button" onClick={() => setEditing("new")}><Plus />Add position</Button>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr><th scope="col">Position</th><th scope="col">People</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {sorted.length === 0
              ? <tr><td colSpan={3} className="data-table-empty">No positions yet, e.g. Professor, Associate Professor, Assistant Professor.</td></tr>
              : sorted.map(position => (
                <tr key={position.id}>
                  <td className="font-medium">{localName(position.name, language)}</td>
                  <td>{position.holder_count}</td>
                  <td>
                    <div className="row-actions">
                      <Button variant="outline" size="icon" className="icon-button" aria-label={`Rename ${localName(position.name, language)}`}
                        onClick={() => setEditing(position)}><Pencil /></Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <PositionSheet orgId={orgId} position={editing === "new" ? null : editing}
          onClose={() => setEditing(null)} onSaved={message => { setEditing(null); onChanged(message) }} />
      )}
    </section>
  )
}

function PositionSheet({ orgId, position, onClose, onSaved }: { orgId: string; position: Position | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [nameEn, setNameEn] = useState(position?.name.en ?? "")
  const [nameKa, setNameKa] = useState(position?.name.ka ?? "")
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
      if (position) await positionsApi.rename(orgId, position.id, name)
      else await positionsApi.create(orgId, name)
      onSaved(position ? `Renamed to ${name.name_en}.` : `${name.name_en} was added.`)
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
            <SheetTitle>{position ? "Rename position" : "Add position"}</SheetTitle>
            <SheetDescription>An academic position, e.g. Associate Professor.</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit} aria-busy={saving}>
          <div className="form-sheet-body">
            <div className="form-grid">
              {failure && <div className="form-error-summary form-field span-4" role="alert">{failure}</div>}
              <div className="form-field span-4">
                <label htmlFor="position-en">Name in English *</label>
                <input id="position-en" className="form-control" value={nameEn} maxLength={200} placeholder="Associate Professor"
                  aria-invalid={error ? true : undefined} aria-describedby={error ? "position-en-error" : undefined}
                  onChange={event => { setNameEn(event.target.value); setError("") }} />
                {error && <p id="position-en-error" className="field-error">{error}</p>}
              </div>
              <div className="form-field span-4">
                <label htmlFor="position-ka">Name in Georgian</label>
                <input id="position-ka" className="form-control" lang="ka" value={nameKa} maxLength={200} placeholder="ასოცირებული პროფესორი"
                  onChange={event => setNameKa(event.target.value)} />
              </div>
            </div>
          </div>
          <div className="form-sheet-footer">
            <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="dashboard-button" disabled={saving}>{saving ? "Saving…" : position ? "Save" : "Add position"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
