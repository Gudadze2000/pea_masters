import { useEffect, useRef, useState } from "react"
import { Check, Info, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { useQualifications } from "./qualifications-store"
import { LANGUAGES, LEVELS } from "./languages"
import type { Entry } from "./sections"
import "@/components/forms/forms.css"
import "./QualificationsPage.css"
import "./LanguagesPage.css"

const SECTION_ID = "languages"
const SKILLS = [
  { key: "read", label: "Read" },
  { key: "write", label: "Write" },
  { key: "speak", label: "Speak" },
] as const

type Skill = (typeof SKILLS)[number]["key"]
type Row = { id: string; language: string } & Record<Skill, string>
type RowErrors = Partial<Record<keyof Row, boolean>>

const emptyRow = (): Row => ({ id: crypto.randomUUID(), language: "", read: "", write: "", speak: "" })
const toRow = (entry: Entry): Row => ({ id: entry.id, language: entry.values.language ?? "", read: entry.values.read ?? "", write: entry.values.write ?? "", speak: entry.values.speak ?? "" })
const isBlank = (row: Row) => !row.language && SKILLS.every(skill => !row[skill.key])
const sameRow = (a: Row, b: Row) => a.language === b.language && SKILLS.every(skill => a[skill.key] === b[skill.key])

/** /profile/qualifications/languages — all languages edited at once in a table */
export function LanguagesPage() {
  const { entries, replaceSection, notice, flash } = useQualifications()
  const saved = entries[SECTION_ID] ?? []
  const [rows, setRows] = useState<Row[]>(() => saved.length ? saved.map(toRow) : [emptyRow()])
  const [errors, setErrors] = useState<Record<string, RowErrors>>({})
  const [dirty, setDirty] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)
  const focusRowId = useRef<string | null>(null)

  // Move focus to the language select of a newly added row
  useEffect(() => {
    if (!focusRowId.current) return
    tableRef.current?.querySelector<HTMLSelectElement>(`#language-${focusRowId.current}`)?.focus()
    focusRowId.current = null
  }, [rows])

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const update = (id: string, key: keyof Row, value: string) => {
    setRows(current => current.map(row => row.id === id ? { ...row, [key]: value } : row))
    setDirty(true)
    if (errors[id]?.[key]) setErrors(current => ({ ...current, [id]: { ...current[id], [key]: false } }))
  }

  const addRow = () => {
    const row = emptyRow()
    focusRowId.current = row.id
    setRows(current => [...current, row])
  }

  const removeRow = (id: string) => {
    setRows(current => current.length === 1 ? [emptyRow()] : current.filter(row => row.id !== id))
    setErrors(current => { const next = { ...current }; delete next[id]; return next })
    setDirty(true)
  }

  const save = () => {
    const filled = rows.filter(row => !isBlank(row))
    const found: Record<string, RowErrors> = {}
    for (const row of filled) {
      const rowErrors: RowErrors = {}
      if (!row.language) rowErrors.language = true
      for (const skill of SKILLS) if (!row[skill.key]) rowErrors[skill.key] = true
      if (Object.keys(rowErrors).length) found[row.id] = rowErrors
    }
    setErrors(found)
    const firstInvalid = filled.find(row => found[row.id])
    if (firstInvalid) {
      const key = (["language", "read", "write", "speak"] as const).find(name => found[firstInvalid.id][name])
      tableRef.current?.querySelector<HTMLElement>(`#${key}-${firstInvalid.id}`)?.focus()
      return
    }

    // Unchanged rows keep their review status; new or changed rows go back to review.
    // TODO: send to the API once the back end exists
    const next: Entry[] = filled.map(row => {
      const previous = saved.find(entry => entry.id === row.id)
      const unchanged = previous && sameRow(toRow(previous), row)
      return {
        id: row.id,
        status: unchanged ? previous.status : "submitted",
        values: { language: row.language, read: row.read, write: row.write, speak: row.speak },
        documents: previous?.documents ?? [],
      }
    })
    replaceSection(SECTION_ID, next)
    setRows(next.length ? next.map(toRow) : [emptyRow()])
    setDirty(false)
    flash("Languages saved.")
  }

  const errorCount = Object.values(errors).filter(rowErrors => Object.values(rowErrors).some(Boolean)).length
  const chosenLanguages = new Set(rows.map(row => row.language).filter(Boolean))

  return (
    <WorkspaceLayout breadcrumb={[
      { label: "My profile", to: "/profile/general" },
      { label: "Professional & qualifications", to: "/profile/qualifications" },
      { label: "Languages" },
    ]}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>Languages</h1>
              <p>Add every language you read, write or speak, with your level for each skill.</p>
            </div>
            <div className="page-actions">
              <Button variant="outline" className="dashboard-button" onClick={addRow}><Plus />Add language</Button>
              <Button className="dashboard-button" disabled={!dirty} onClick={save}><Save />Save</Button>
            </div>
          </div>

          {(notice || errorCount > 0) && (
            <p className={errorCount > 0 ? "form-error-summary" : "section-notice"} role={errorCount > 0 ? "alert" : "status"}>
              {errorCount > 0
                ? `Complete the highlighted ${errorCount === 1 ? "row" : "rows"}: each language needs a level for reading, writing and speaking.`
                : <><Check aria-hidden="true" />{notice}</>}
            </p>
          )}

          <section className="dashboard-card languages-card" aria-label="Languages">
            <div ref={tableRef} className="languages-table" role="table" aria-label="Your languages">
              <div className="languages-row languages-head" role="row">
                <span role="columnheader">Language</span>
                {SKILLS.map(skill => <span key={skill.key} role="columnheader">{skill.label}</span>)}
                <span role="columnheader"><span className="sr-only">Actions</span></span>
              </div>

              {rows.map((row, index) => {
                const rowErrors = errors[row.id] ?? {}
                const name = row.language || `row ${index + 1}`
                return (
                  <div key={row.id} className="languages-row" role="row">
                    <div role="cell" className="languages-cell" data-label="Language">
                      <select
                        id={`language-${row.id}`}
                        className="form-control"
                        aria-label={`Language, row ${index + 1}`}
                        aria-invalid={rowErrors.language || undefined}
                        data-empty={!row.language || undefined}
                        value={row.language}
                        onChange={e => update(row.id, "language", e.target.value)}
                      >
                        <option value="" disabled>Select language…</option>
                        {LANGUAGES.map(language => (
                          // A language can only be listed once
                          <option key={language} value={language} disabled={language !== row.language && chosenLanguages.has(language) && language !== "Other"}>{language}</option>
                        ))}
                      </select>
                    </div>
                    {SKILLS.map(skill => (
                      <div key={skill.key} role="cell" className="languages-cell" data-label={skill.label}>
                        <select
                          id={`${skill.key}-${row.id}`}
                          className="form-control"
                          aria-label={`${skill.label} level for ${name}`}
                          aria-invalid={rowErrors[skill.key] || undefined}
                          data-empty={!row[skill.key] || undefined}
                          value={row[skill.key]}
                          onChange={e => update(row.id, skill.key, e.target.value)}
                        >
                          <option value="" disabled>Level…</option>
                          {LEVELS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
                        </select>
                      </div>
                    ))}
                    <div role="cell" className="languages-cell languages-remove">
                      <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Remove ${name}`} onClick={() => removeRow(row.id)}><Trash2 /></Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="languages-note"><Info aria-hidden="true" />Levels follow the CEFR scale (A1–C2). Choose “Native” for your first language.</p>
          </section>
        </div>
      )}
    </WorkspaceLayout>
  )
}
