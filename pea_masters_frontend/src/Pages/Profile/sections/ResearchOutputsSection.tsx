import { useRef, useState, type FormEvent } from "react"
import { BookOpen, Calendar, Code2, Database, Download, FileUp, Hash, Link2, LoaderCircle, Pencil, Plus, Scale, Search, Tag, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RecordSheet } from "@/components/forms/RecordSheet"
import type { FieldDef } from "@/components/forms/field-types"
import "@/components/forms/forms.css"
import { ApiError } from "@/lib/api"
import {
  emptyDraft, isDoi, lookupDoi, OUTPUT_KINDS, outputKey, outputsApi, STATUSES, storeOutputs, useOutputs,
  type OutputDraft, type OutputKind, type ResearchOutput,
} from "@/lib/research-outputs"
import { ConfirmDialog } from "@/Pages/CvBuilder/cv-ui"
import { BibtexSheet } from "./BibtexSheet"
import { OutputImportSheet, type ImportSource } from "./OutputImportSheet"
import { SectionLoading } from "./SectionLoading"
import "../qualifications/QualificationsPage.css"
import "../research/ResearchPage.css"
import "./ResearchOutputs.css"

const KIND_ORDER: OutputKind[] = ["publication", "dataset", "software"]
const KIND_ICONS = { publication: BookOpen, dataset: Database, software: Code2 }

/** The form for each kind: publications have journal details, datasets and software a version and licence */
function fieldsFor(kind: OutputKind): FieldDef[] {
  const common = {
    subtype: { name: "subtype", label: "Type", type: "select", required: true, span: 2, options: OUTPUT_KINDS[kind].subtypes } as FieldDef,
    year: { name: "year", label: "Year", type: "text", span: kind === "publication" ? 1 : 2, placeholder: String(new Date().getFullYear()) } as FieldDef,
    doi: { name: "doi", label: "DOI", type: "text", span: 2, placeholder: "10.1000/xyz123" } as FieldDef,
  }
  if (kind === "publication") return [
    common.subtype,
    { name: "status", label: "Status", type: "select", required: true, span: 2, options: STATUSES },
    { name: "title", label: "Title", type: "textarea", required: true, rows: 2 },
    { name: "authors", label: "Authors", type: "text", required: true, hint: "Family name and initials, separated by semicolons: Beridze N; Schulz K." },
    { name: "venue", label: "Journal, conference or book", type: "text" },
    common.year,
    { name: "volume", label: "Volume", type: "text", span: 1 },
    { name: "issue", label: "Issue", type: "text", span: 1 },
    { name: "pages", label: "Pages", type: "text", span: 1, placeholder: "145-158" },
    common.doi,
    { name: "url", label: "Link (if no DOI)", type: "url", span: 2, placeholder: "https://" },
  ]
  const software = kind === "software"
  return [
    common.subtype,
    common.year,
    { name: "title", label: software ? "Name" : "Title", type: "text", required: true },
    { name: "authors", label: software ? "Authors or contributors" : "Authors", type: "text", required: true, hint: "Family name and initials, separated by semicolons: Beridze N; Schulz K." },
    { name: "venue", label: software ? "Where it's published" : "Repository or publisher", type: "text", placeholder: software ? "GitHub, GitLab, Zenodo, PyPI…" : "Zenodo, Figshare, Dryad…" },
    { name: "version", label: "Version", type: "text", span: 2, placeholder: software ? "1.0.0" : "2.1" },
    { name: "license", label: "Licence", type: "text", span: 2, placeholder: software ? "MIT, GPL-3.0…" : "CC BY 4.0…" },
    common.doi,
    { name: "url", label: software ? "Repository link" : "Link", type: "url", span: 2, placeholder: "https://" },
    { name: "description", label: "Description", type: "textarea", rows: 3, hint: "What it is and what it's for, in a sentence or two." },
  ]
}

const toValues = (draft: OutputDraft): Record<string, string> =>
  Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value === null ? "" : String(value)]))

function toDraft(base: OutputDraft, values: Record<string, string>): OutputDraft {
  const year = values.year?.trim()
  return { ...base, ...values, year: year ? Number(year) : null, doi: values.doi?.trim() ?? "", url: values.url?.trim() ?? "" } as OutputDraft
}

function check(kind: OutputKind, values: Record<string, string>) {
  const errors: Record<string, string> = {}
  const year = values.year?.trim()
  if (year && !(/^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= 2100)) errors.year = "Enter a year such as 2024."
  if (values.doi?.trim() && !isDoi(values.doi)) errors.doi = "A DOI looks like 10.1038/nature14539."
  if (values.url?.trim() && !/^https?:\/\//i.test(values.url.trim())) errors.url = "Start the link with https://"
  if (kind === "software" && !values.url?.trim() && !values.doi?.trim()) errors.url = "Add a repository link or a DOI, so people can find it."
  return errors
}

type Editor = { output: ResearchOutput | null; draft: OutputDraft; session: number }

/** In the CV builder: which outputs this CV shows */
export type CvChoice = { hidden: Set<string>; onToggle: (id: string, shown: boolean) => void }

function OutputCard({ output, onEdit, onDelete, cv }: { output: ResearchOutput; onEdit: () => void; onDelete: () => void; cv?: CvChoice }) {
  const authors = output.authors.split(";").map(name => name.trim()).filter(Boolean).join(", ")
  return (
    <li className="entry-card output-card">
      <div className="entry-card-heading">
        <h4>{output.title}</h4>
        <div className="entry-card-actions">
          {cv && (
            <label className="output-on-cv">
              <input type="checkbox" checked={!cv.hidden.has(output.id)} onChange={event => cv.onToggle(output.id, event.target.checked)} />
              On this CV
            </label>
          )}
          {output.status !== "Published" && output.kind === "publication" && <span className="status-badge status-submitted">{output.status}</span>}
          <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${output.title}`} onClick={onEdit}><Pencil /></Button>
          <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Delete ${output.title}`} onClick={onDelete}><Trash2 /></Button>
        </div>
      </div>
      {authors && <p className="entry-description">{authors}</p>}
      <ul className="entry-meta">
        <li><Tag aria-hidden="true" />{[output.subtype, output.venue].filter(Boolean).join(" · ")}</li>
        {output.year && <li><Calendar aria-hidden="true" />{output.year}</li>}
        {output.version && <li><Hash aria-hidden="true" />Version {output.version}</li>}
        {output.license && <li><Scale aria-hidden="true" />{output.license}</li>}
        {output.doi && <li><Link2 aria-hidden="true" /><a href={`https://doi.org/${output.doi}`} target="_blank" rel="noopener noreferrer">{output.doi}</a></li>}
        {!output.doi && output.url && <li><Link2 aria-hidden="true" /><a href={output.url} target="_blank" rel="noopener noreferrer">{output.url.replace(/^https?:\/\//, "")}</a></li>}
      </ul>
      {output.description && <p className="output-description">{output.description}</p>}
    </li>
  )
}

/**
 * Research outputs on My profile: publications, datasets, and software and code, kept all year. Added by DOI
 * (Crossref, then DataCite), by hand, or imported from Web of Science or ORCID.
 */
export function ResearchOutputsSection({ onEmptied, cv }: {
  onEmptied?: () => void
  /** Shown in the CV builder: each output gets an "On this CV" tick */
  cv?: CvChoice
}) {
  const { status, outputs } = useOutputs()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [choosingKind, setChoosingKind] = useState(false)
  const [importFrom, setImportFrom] = useState<ImportSource | "bibtex" | null>(null)
  const [deleting, setDeleting] = useState<ResearchOutput | null>(null)
  const [notice, setNotice] = useState("")
  const session = useRef(0)

  if (status !== "ready") return <SectionLoading id="outputs" title="Research outputs" status={status === "error" ? "error" : "loading"} onRetry={() => window.location.reload()} />

  const keys = new Set(outputs.map(outputKey))
  const open = (output: ResearchOutput | null, draft: OutputDraft) => {
    session.current += 1
    setEditor({ output, draft, session: session.current })
    setSheetOpen(true)
    setChoosingKind(false)
  }

  async function save(values: Record<string, string>) {
    if (!editor) return null
    const draft = toDraft(editor.draft, values)
    try {
      const saved = editor.output ? await outputsApi.update(editor.output.id, draft) : await outputsApi.add(draft)
      storeOutputs([saved])
      setNotice(editor.output ? "Saved." : `“${saved.title}” was added to your profile.`)
      setSheetOpen(false)
      return null
    } catch (cause) {
      return cause instanceof ApiError ? cause.message : "It couldn't be saved. Try again."
    }
  }

  async function importDrafts(drafts: OutputDraft[]) {
    const result = await outputsApi.import(drafts)
    storeOutputs(result.added)
    setImportFrom(null)
    setNotice(`${result.added.length} ${result.added.length === 1 ? "output was" : "outputs were"} added to your profile.${result.skipped ? ` ${result.skipped} ${result.skipped === 1 ? "was" : "were"} already there.` : ""}`)
  }

  const kind = editor?.draft.kind ?? "publication"
  const counts = KIND_ORDER.map(k => ({ kind: k, items: outputs.filter(o => o.kind === k) }))

  return (
    <section id="outputs" className="dashboard-card outputs-section" aria-labelledby="outputs-heading">
      <div className="card-heading outputs-heading">
        <div>
          <h2 id="outputs-heading">Research outputs {outputs.length > 0 && <span className="count-badge">{outputs.length}</span>}</h2>
          <p className="outputs-subtitle">{cv
            ? "These are kept on My profile: adding or changing one here changes your profile too. Untick any this CV shouldn't show."
            : "Your publications, datasets, and software and code, kept here all year. Your CV and evaluation forms take them from here."}</p>
        </div>
        <div className="outputs-actions">
          <Button variant="outline" className="dashboard-button compact" onClick={() => setImportFrom("wos")}><Download />Import from Web of Science</Button>
          <Button variant="outline" className="dashboard-button compact" onClick={() => setImportFrom("orcid")}><Download />Import from ORCID</Button>
          <Button variant="outline" className="dashboard-button compact" onClick={() => setImportFrom("bibtex")}><FileUp />Import BibTeX</Button>
          <Button className="dashboard-button compact" aria-expanded={choosingKind} onClick={() => setChoosingKind(value => !value)}><Plus />Add by hand</Button>
        </div>
      </div>

      {choosingKind && (
        <div className="outputs-kind-choice" role="group" aria-label="What would you like to add?">
          {KIND_ORDER.map(k => {
            const Icon = KIND_ICONS[k]
            return <Button key={k} variant="outline" className="dashboard-button compact" onClick={() => open(null, emptyDraft(k))}><Icon />{OUTPUT_KINDS[k].label}</Button>
          })}
        </div>
      )}

      <DoiLookup isDuplicate={doi => keys.has(`doi:${doi}`)} onFound={draft => open(null, draft)} />

      <p className="section-notice" role="status">{notice}</p>

      {outputs.length === 0 ? (
        <div className="empty-state">
          <BookOpen aria-hidden="true" />
          <p>No research outputs yet</p>
          <small>Look one up by DOI, import your publications from Web of Science or ORCID, or add one by hand.</small>
        </div>
      ) : counts.filter(group => group.items.length).map(group => (
        <div key={group.kind} className="outputs-group">
          <h3>{OUTPUT_KINDS[group.kind].plural} <span className="count-badge">{group.items.length}</span></h3>
          <ul className="entry-list">
            {group.items.map(output => (
              <OutputCard key={output.id} output={output} cv={cv} onEdit={() => open(output, output)} onDelete={() => setDeleting(output)} />
            ))}
          </ul>
        </div>
      ))}

      {editor && (
        <RecordSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          formKey={editor.session}
          idPrefix="output"
          title={`${editor.output ? "Edit" : editor.draft.source === "doi" ? "Check" : "Add"} ${OUTPUT_KINDS[kind].label.toLowerCase()}`}
          description={editor.draft.source === "doi" && !editor.output ? "Details found for this DOI. Check them, then add it." : kind === "publication" ? "Journal articles, conference papers, books, chapters, preprints and reports." : kind === "dataset" ? "Data you've published, e.g. on Zenodo, Figshare or Dryad." : "Software, code or models you've released."}
          fields={fieldsFor(kind)}
          initialValues={toValues(editor.draft)}
          submitLabel={editor.output ? "Save" : "Add to my profile"}
          validate={values => check(kind, values)}
          onSave={save}
        />
      )}

      {importFrom === "bibtex" && <BibtexSheet existingKeys={keys} onImport={importDrafts} onClose={() => setImportFrom(null)} />}
      {importFrom && importFrom !== "bibtex" && <OutputImportSheet source={importFrom} existingKeys={keys} onImport={importDrafts} onClose={() => setImportFrom(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.title ?? ""}”?`}
        description={cv ? "It's removed from your profile, and so from this CV. To keep it on your profile but not on this CV, untick “On this CV” instead." : "It's removed from your profile and from your CV. Evaluation forms keep what they already have."}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          const target = deleting
          setDeleting(null)
          if (!target) return
          outputsApi.remove(target.id)
            .then(() => { storeOutputs([], target.id); setNotice(`“${target.title}” was deleted.`); if (outputs.length === 1) onEmptied?.() })
            .catch(() => setNotice("It couldn't be deleted. Try again."))
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  )
}

/** A DOI field: looks the DOI up and opens the form filled in, for the person to check */
function DoiLookup({ isDuplicate, onFound }: { isDuplicate: (doi: string) => boolean; onFound: (draft: OutputDraft) => void }) {
  const [doi, setDoi] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function find(event: FormEvent) {
    event.preventDefault()
    if (!isDoi(doi)) { setError("A DOI looks like 10.1038/nature14539, or a doi.org link."); return }
    const clean = doi.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "").toLowerCase()
    if (isDuplicate(clean)) { setError("This DOI is already on your profile."); return }
    setBusy(true)
    setError("")
    try {
      onFound(await lookupDoi(clean))
      setDoi("")
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="outputs-doi" onSubmit={event => void find(event)}>
      <label htmlFor="outputs-doi-input">Add by DOI</label>
      <div className="outputs-doi-row">
        <input id="outputs-doi-input" className="form-control" value={doi} placeholder="10.1038/nature14539 or https://doi.org/…" aria-describedby="outputs-doi-hint"
          aria-invalid={error ? true : undefined} onChange={event => { setDoi(event.target.value); setError("") }} />
        <Button type="submit" variant="outline" className="dashboard-button" disabled={busy || !doi.trim()}>
          {busy ? <LoaderCircle className="wos-spin" /> : <Search />}Look up
        </Button>
      </div>
      <p id="outputs-doi-hint" className={error ? "field-error" : "field-hint"} role={error ? "alert" : undefined}>
        {error || "Articles and books are looked up in Crossref; datasets and software (e.g. on Zenodo) in DataCite."}
      </p>
    </form>
  )
}
