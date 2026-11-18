import { useEffect, useRef, useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DocumentUpload } from "./DocumentUpload"
import { FormField } from "@/components/forms/FormField"
import { ApiError } from "@/lib/api"
import { useQualifications } from "./qualifications-store"
import { allFields, capitalize, type Entry, type EntryDocument, type EntryValues, type SectionDef } from "./sections"
import { cleanValues, validateEntry } from "./validate"
import "./QualificationsPage.css"

/** Shared inline editor for all qualification lists. */
export function ProfileEntryForm({ section, entry, onClose }: { section: SectionDef; entry: Entry | null; onClose: () => void }) {
  const { saveEntry, flash } = useQualifications()
  const [values, setValues] = useState<EntryValues>(() => ({ ...entry?.values }))
  const [documents, setDocuments] = useState<EntryDocument[]>(() => entry?.documents ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    formRef.current?.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true })
  }, [])

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const setValue = (name: string, value: string) => {
    setValues(current => ({ ...current, [name]: value }))
    setDirty(true)
    if (errors[name]) setErrors(current => { const next = { ...current }; delete next[name]; return next })
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (saving || uploading) return
    const found = validateEntry(section, values)
    setErrors(found)
    const firstInvalid = allFields(section).find(field => found[field.name])
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#field-${firstInvalid.name}`)?.focus()
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await saveEntry(section.id, entry?.id ?? null, cleanValues(section, values), documents)
      flash(`${capitalize(section.noun)} saved.`)
      onClose()
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : "It couldn't be saved. Check your connection and try again.")
      setSaving(false)
    }
  }

  const errorCount = Object.keys(errors).length
  const title = `${entry ? "Edit" : "New"} ${section.noun}`

  return (
    <section className="inline-record-form profile-entry-editor">
      <div className="inline-record-heading">
        <div><h3 id="profile-entry-editor-title">{title}</h3><p>{section.formDescription}</p></div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel editing" onClick={onClose}><X /></Button>
      </div>
          <form ref={formRef} className="profile-entry-fields" aria-labelledby="profile-entry-editor-title" noValidate onSubmit={event => void save(event)}>
            <div className="entry-page-main">
              {errorCount > 0 && (
                <p className="form-error-summary" role="alert">
                  {errorCount === 1 ? "1 field needs your attention." : `${errorCount} fields need your attention.`}
                </p>
              )}
              {section.groups.map(group => (
                <section key={group.title} className="dashboard-card form-card" aria-label={group.title}>
                  <div className="card-heading"><h2>{group.title}</h2></div>
                  <div className="form-grid">
                    {group.fields.map(field => (
                      <FormField key={field.name} field={field} value={values[field.name] ?? ""} error={errors[field.name]} onChange={value => setValue(field.name, value)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <section className="profile-entry-documents" aria-labelledby="document-heading">
              <div className="card-heading"><h2 id="document-heading">Supporting document</h2></div>
              <DocumentUpload label={section.documentLabel} documents={documents} onChange={next => { setDocuments(next); setDirty(true) }} onBusyChange={setUploading} />
            </section>
            {saveError && <p className="form-error-summary" role="alert">{saveError}</p>}
            <div className="inline-record-actions">
              <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="dashboard-button" disabled={saving || uploading}>{saving ? "Saving…" : uploading ? "Uploading…" : "Save entry"}</Button>
            </div>
          </form>
    </section>
  )
}
