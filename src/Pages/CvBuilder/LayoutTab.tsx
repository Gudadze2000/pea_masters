import { useState } from "react"
import { ArrowDown, ArrowUp, Download, RotateCcw, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SECTION_META, initialCv, normaliseCv, type CvData, type SectionId, type Template } from "./cv-model"
import { ConfirmDialog } from "./cv-ui"
import { downloadText, type ChangeCv } from "./form-utils"

const TEMPLATES: { value: Template; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Serif headings, centred header. The traditional academic look." },
  { value: "modern", label: "Modern", description: "Clean sans-serif with ISU red accents." },
  { value: "compact", label: "Compact", description: "Smaller type and spacing for long publication lists." },
]

type Props = {
  cv: CvData
  change: ChangeCv
  counts: Partial<Record<SectionId, number>>
  /** Replaces the whole CV (import / reset) */
  replace: (cv: CvData, message: string) => void
}

/** "Sections & layout" tab: template, which sections to show and in what order, backup. */
export function LayoutTab({ cv, change, counts, replace }: Props) {
  const [pending, setPending] = useState<{ kind: "import"; data: CvData } | { kind: "reset" } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const move = (index: number, step: -1 | 1) => change(current => {
    const sections = [...current.sections]
    const target = index + step
    if (target < 0 || target >= sections.length) return current
    ;[sections[index], sections[target]] = [sections[target], sections[index]]
    return { ...current, sections }
  })

  const toggle = (id: SectionId) => change(current => ({
    ...current,
    sections: current.sections.map(section => section.id === id ? { ...section, enabled: !section.enabled } : section),
  }))

  const readBackup = async (file: File | undefined) => {
    if (!file) return
    setImportError(null)
    try {
      const data = normaliseCv(JSON.parse(await file.text()))
      if (!data) throw new Error("not a CV backup")
      setPending({ kind: "import", data })
    } catch {
      setImportError("This file isn't a CV backup from this page. Choose a file exported with “Export backup”.")
    }
  }

  return (
    <div className="cv-tab-panel">
      <section className="dashboard-card cv-card" aria-labelledby="cv-template-heading">
        <div className="card-heading"><h2 id="cv-template-heading">Template</h2></div>
        <div className="cv-templates" role="radiogroup" aria-labelledby="cv-template-heading">
          {TEMPLATES.map(template => (
            <label key={template.value} className="cv-template-option">
              <input type="radio" name="cv-template" className="sr-only" checked={cv.template === template.value} onChange={() => change(current => ({ ...current, template: template.value }))} />
              <span className={`cv-template-thumb thumb-${template.value}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <span className="cv-template-name">{template.label}</span>
              <span className="cv-template-description">{template.description}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="dashboard-card cv-card" aria-labelledby="cv-sections-heading">
        <div className="card-heading">
          <div>
            <h2 id="cv-sections-heading">Sections</h2>
            <p className="card-subtitle">Choose what goes on your CV and in which order. Sections from your profile update when you edit them there.</p>
          </div>
        </div>
        <ol className="cv-section-list">
          {cv.sections.map((section, index) => {
            const meta = SECTION_META[section.id]
            const count = counts[section.id] ?? 0
            const id = `cv-section-${section.id}`
            return (
              <li key={section.id} className={section.enabled ? "" : "is-off"}>
                <input id={id} type="checkbox" className="cv-switch" checked={section.enabled} onChange={() => toggle(section.id)} aria-describedby={`${id}-source`} />
                <label htmlFor={id} className="cv-section-label">
                  <span>{meta.label}</span>
                  <small id={`${id}-source`}>{count === 0 ? `Nothing to show yet · ${meta.source}` : meta.source}</small>
                </label>
                <span className="count-badge" aria-label={`${count} entries`}>{count}</span>
                <div className="cv-move">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${meta.label} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${meta.label} down`} disabled={index === cv.sections.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                </div>
              </li>
            )
          })}
        </ol>
        <label className="cv-checkbox">
          <input type="checkbox" checked={cv.includeSubmitted} onChange={e => change(current => ({ ...current, includeSubmitted: e.target.checked }))} />
          <span>
            Include qualification entries that are still waiting for review
            <small>By default the CV only shows entries your faculty admin has approved.</small>
          </span>
        </label>
      </section>

      <section className="dashboard-card cv-card" aria-labelledby="cv-backup-heading">
        <div className="card-heading">
          <div>
            <h2 id="cv-backup-heading">Backup</h2>
            <p className="card-subtitle">Your CV is saved in this browser only. Export a backup to move it to another computer.</p>
          </div>
        </div>
        <div className="cv-backup-actions">
          <Button variant="outline" className="dashboard-button compact" onClick={() => downloadText(`cv-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(cv, null, 2))}><Download />Export backup</Button>
          <label className="dashboard-button compact cv-file-button">
            <Upload aria-hidden="true" />Import backup
            <input type="file" accept="application/json,.json" className="sr-only" onChange={e => { void readBackup(e.target.files?.[0]); e.target.value = "" }} />
          </label>
          <Button variant="ghost" className="dashboard-button compact cv-reset" onClick={() => setPending({ kind: "reset" })}><RotateCcw />Start over</Button>
        </div>
        {importError && <p className="field-error" role="alert">{importError}</p>}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "reset" ? "Start over?" : "Replace your CV with this backup?"}
        description={pending?.kind === "reset"
          ? "Your publications, talks, links and layout choices on this page will be replaced with the sample CV. Your profile pages aren't affected."
          : "Everything on this page will be replaced with the backup. Export a backup first if you want to keep the current version."}
        confirmLabel={pending?.kind === "reset" ? "Start over" : "Replace"}
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          // Visibility never changes through an import: going public always needs the explicit confirmation
          if (pending?.kind === "import") replace({ ...pending.data, visibility: cv.visibility }, "Backup imported.")
          else replace(initialCv, "CV reset to the sample data. It is private again.")
          setPending(null)
        }}
      />
    </div>
  )
}
