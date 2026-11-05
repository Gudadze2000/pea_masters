import { useEffect, useRef, useState, type FormEvent } from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { DocumentUpload } from "./DocumentUpload"
import { FormField } from "@/components/forms/FormField"
import { StatusBadge } from "./StatusBadge"
import { useQualifications, type SaveMode } from "./qualifications-store"
import { allFields, capitalize, findSection, type Entry, type EntryDocument, type EntryValues, type SectionDef } from "./sections"
import { cleanValues, validateEntry } from "./validate"
import "./QualificationsPage.css"

/** /profile/qualifications/:sectionId/new and /profile/qualifications/:sectionId/:entryId/edit */
export function EntryFormPage() {
  const { sectionId, entryId } = useParams()
  const { entries } = useQualifications()
  const section = findSection(sectionId)
  if (!section) return <Navigate to="/profile/qualifications" replace />
  // Languages are edited in a table on their own page
  if (section.id === "languages") return <Navigate to="/profile/qualifications/languages" replace />
  const entry = entryId ? entries[section.id]?.find(item => item.id === entryId) : null
  if (entryId && !entry) return <Navigate to={`/profile/qualifications/${section.id}`} replace />
  // Keyed so the form starts fresh when moving between entries
  return <EntryForm key={`${section.id}/${entryId ?? "new"}`} section={section} entry={entry ?? null} />
}

function EntryForm({ section, entry }: { section: SectionDef; entry: Entry | null }) {
  const navigate = useNavigate()
  const { saveEntry, flash } = useQualifications()
  const [values, setValues] = useState<EntryValues>(() => ({ ...entry?.values }))
  const [documents, setDocuments] = useState<EntryDocument[]>(() => entry?.documents ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const listPath = `/profile/qualifications/${section.id}`

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

  const save = (mode: SaveMode, event?: FormEvent) => {
    event?.preventDefault()
    const found = validateEntry(section, values, mode)
    setErrors(found)
    const firstInvalid = allFields(section).find(field => found[field.name])
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#field-${firstInvalid.name}`)?.focus()
      return
    }
    saveEntry(section.id, entry?.id ?? null, cleanValues(section, values), documents, mode)
    flash(mode === "draft" ? `${capitalize(section.noun)} saved as draft.` : `${capitalize(section.noun)} submitted for review.`)
    navigate(listPath)
  }

  const errorCount = Object.keys(errors).length
  const title = `${entry ? "Edit" : "New"} ${section.noun}`

  return (
    <WorkspaceLayout breadcrumb={[
      { label: "My profile", to: "/profile/general" },
      { label: "Professional & qualifications", to: "/profile/qualifications" },
      { label: section.shortLabel, to: listPath },
      { label: entry ? "Edit" : "New" },
    ]}>
      {() => (
        <div className="dashboard-content entry-page-content">
          <div className="page-heading">
            <div>
              <h1>{title}</h1>
              <p>{section.formDescription}</p>
            </div>
          </div>

          <form ref={formRef} className="entry-page" noValidate onSubmit={event => save("submit", event)}>
            <div className="entry-page-main">
              {entry?.status === "rejected" && entry.adminComment && (
                <div className="rejected-banner" role="note">
                  <TriangleAlert aria-hidden="true" />
                  <div>
                    <p>Rejected by {entry.reviewer ?? "your faculty admin"}</p>
                    <small>“{entry.adminComment}” Make the changes and save the entry to resubmit it.</small>
                  </div>
                </div>
              )}
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

            <aside className="entry-page-side">
              <section className="dashboard-card status-card" aria-labelledby="entry-status-heading">
                <div className="card-heading"><h2 id="entry-status-heading">Entry status</h2></div>
                <dl className="status-rows">
                  <div><dt>Status</dt><dd><StatusBadge status={entry?.status ?? "draft"} /></dd></div>
                  <div><dt>Section</dt><dd>{section.label}</dd></div>
                </dl>
                <div className="status-actions">
                  <Button type="submit" className="dashboard-button w-full">Save entry</Button>
                  <Button type="button" variant="outline" className="dashboard-button w-full" onClick={() => save("draft")}>Save as draft</Button>
                  <button type="button" className="text-action cancel-link" onClick={() => navigate(listPath)}>Cancel</button>
                </div>
                <p className="field-hint">Saved entries are sent to your faculty admin for review. Drafts stay private until you save the entry.</p>
              </section>

              <section className="dashboard-card" aria-labelledby="document-heading">
                <div className="card-heading"><h2 id="document-heading">Supporting document</h2></div>
                <DocumentUpload label={section.documentLabel} documents={documents} onChange={next => { setDocuments(next); setDirty(true) }} />
              </section>
            </aside>
          </form>
        </div>
      )}
    </WorkspaceLayout>
  )
}
