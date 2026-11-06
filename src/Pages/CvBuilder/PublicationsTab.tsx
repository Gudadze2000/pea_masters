import { useEffect, useRef, useState, type FormEvent } from "react"
import { BookOpen, Calendar, FileUp, Hash, Link2, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RecordSheet } from "@/components/forms/RecordSheet"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import type { FieldDef } from "@/components/forms/field-types"
import { CITATION_STYLES, PUBLICATION_STATUSES, PUBLICATION_TYPES, type CitationStyle, type CvData, type Publication } from "./cv-model"
import { ConfirmDialog, Field, Segmented } from "./cv-ui"
import { type ChangeCv, yearError } from "./form-utils"
import { cleanDoi, isDoi, isHttpUrl } from "./identifiers"
import { fetchDoi, parseBibtex, type PublicationDraft } from "./importers"

const publicationFields: FieldDef[] = [
  { name: "type", label: "Type", type: "select", required: true, span: 2, options: PUBLICATION_TYPES },
  { name: "status", label: "Status", type: "select", required: true, span: 2, options: PUBLICATION_STATUSES },
  { name: "title", label: "Title", type: "textarea", required: true, rows: 2 },
  { name: "authors", label: "Authors", type: "text", required: true, hint: "Family name and initials, separated by semicolons: Beridze N; Schulz K. Your name is highlighted on the CV." },
  { name: "venue", label: "Journal, conference or book", type: "text" },
  { name: "year", label: "Year", type: "text", span: 1, placeholder: "2024" },
  { name: "volume", label: "Volume", type: "text", span: 1 },
  { name: "issue", label: "Issue", type: "text", span: 1 },
  { name: "pages", label: "Pages", type: "text", span: 1, placeholder: "145–158" },
  { name: "doi", label: "DOI", type: "text", span: 2, placeholder: "10.1000/xyz123" },
  { name: "url", label: "Link (if no DOI)", type: "url", span: 2, placeholder: "https://" },
]

const publicationKey = (pub: Pick<Publication, "doi" | "title">) => pub.doi ? `doi:${pub.doi.toLowerCase()}` : `title:${pub.title.toLowerCase().replace(/\W+/g, "")}`

type Editor = { id: string | null; initial: Partial<PublicationDraft>; imported: boolean; session: number }

/** "Publications" tab: DOI lookup, BibTeX import, citation style and the publication list. */
export function PublicationsTab({ cv, change }: { cv: CvData; change: ChangeCv }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [bibtexOpen, setBibtexOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const session = useRef(0)

  const openEditor = (id: string | null, initial: Partial<PublicationDraft> = {}, imported = false) => {
    session.current += 1
    setEditor({ id, initial, imported, session: session.current })
    setSheetOpen(true)
  }

  const existingKeys = new Set(cv.publications.map(publicationKey))
  const deleting = cv.publications.find(pub => pub.id === deleteId)
  const editing = editor?.id ? cv.publications.find(pub => pub.id === editor.id) : undefined

  return (
    <div className="cv-tab-panel">
      <section className="dashboard-card cv-card" aria-labelledby="cv-doi-heading">
        <div className="card-heading">
          <div>
            <h2 id="cv-doi-heading">Add from a DOI</h2>
            <p className="card-subtitle">We look the DOI up on Crossref and fill in the details for you to check.</p>
          </div>
        </div>
        <DoiLookup
          isDuplicate={doi => existingKeys.has(`doi:${doi.toLowerCase()}`)}
          onFound={draft => openEditor(null, draft, true)}
        />
      </section>

      <section className="dashboard-card cv-card" aria-labelledby="cv-publications-heading">
        <div className="card-heading cv-card-heading-wrap">
          <h2 id="cv-publications-heading">Publications <span className="count-badge">{cv.publications.length}</span></h2>
          <div className="cv-card-actions">
            <Button variant="outline" className="dashboard-button compact" onClick={() => setBibtexOpen(true)}><FileUp />Import BibTeX</Button>
            <Button className="dashboard-button compact" onClick={() => openEditor(null)}><Plus />Add publication</Button>
          </div>
        </div>

        <div className="cv-inline-setting">
          <span id="cv-style-label">Citation style</span>
          <Segmented<CitationStyle>
            label="Citation style"
            value={cv.citationStyle}
            options={CITATION_STYLES.map(style => ({ value: style, label: style }))}
            onChange={citationStyle => change(current => ({ ...current, citationStyle }))}
          />
        </div>

        <p className="section-notice" role="status">{notice}</p>

        {cv.publications.length === 0 ? (
          <div className="empty-state">
            <BookOpen aria-hidden="true" />
            <p>No publications yet</p>
            <small>Look one up by DOI, import a BibTeX file from your reference manager, or add one by hand.</small>
          </div>
        ) : (
          <ul className="entry-list">
            {[...cv.publications].sort((a, b) => (b.year || "9999").localeCompare(a.year || "9999")).map(pub => (
              <li key={pub.id} className="entry-card cv-pub-card">
                <div className="entry-card-heading">
                  <h3>{pub.title}</h3>
                  <div className="entry-card-actions">
                    {pub.status !== "Published" && <span className="status-badge status-submitted">{pub.status}</span>}
                    <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${pub.title}`} onClick={() => openEditor(pub.id, pub)}><Pencil /></Button>
                    <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Delete ${pub.title}`} onClick={() => setDeleteId(pub.id)}><Trash2 /></Button>
                  </div>
                </div>
                <p className="entry-description">{pub.authors.split(";").map(name => name.trim()).filter(Boolean).join(", ") || "No authors yet"}</p>
                <ul className="entry-meta">
                  <li><BookOpen aria-hidden="true" />{[pub.type, pub.venue].filter(Boolean).join(" · ")}</li>
                  {pub.year && <li><Calendar aria-hidden="true" />{pub.year}</li>}
                  {pub.doi && <li><Hash aria-hidden="true" /><a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer">{pub.doi}</a></li>}
                  {!pub.doi && pub.url && <li><Link2 aria-hidden="true" /><a href={pub.url} target="_blank" rel="noopener noreferrer">{pub.url.replace(/^https?:\/\//, "")}</a></li>}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editor && (
        <RecordSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          formKey={editor.session}
          idPrefix="publication"
          title={editing ? "Edit publication" : editor.imported ? "Check imported publication" : "Add publication"}
          description={editor.imported ? "Details from Crossref. Check them, then add the publication." : "Journal articles, conference papers, books, chapters and preprints."}
          fields={publicationFields}
          initialValues={{ type: "Journal article", status: "Published", ...Object.fromEntries(Object.entries(editor.initial).filter((pair): pair is [string, string] => pair[0] !== "id" && typeof pair[1] === "string")) }}
          submitLabel={editing ? "Save publication" : "Add publication"}
          validate={values => {
            const errors: Record<string, string> = {}
            const year = yearError(values.year, values.status === "Published")
            if (year) errors.year = year
            const doi = cleanDoi(values.doi ?? "")
            if (doi && !isDoi(doi)) errors.doi = "A DOI starts with 10. followed by a slash, e.g. 10.1000/xyz123."
            else if (doi && !editing && existingKeys.has(`doi:${doi.toLowerCase()}`)) errors.doi = "This DOI is already in your list."
            if (values.url && !isHttpUrl(values.url)) errors.url = "Enter a full web address starting with https://"
            return errors
          }}
          onSave={values => {
            const pub: Publication = {
              id: editing?.id ?? crypto.randomUUID(),
              type: values.type as Publication["type"],
              status: values.status as Publication["status"],
              authors: values.authors.split(";").map(name => name.trim()).filter(Boolean).join("; "),
              title: values.title.replace(/\s+/g, " "),
              venue: values.venue ?? "", year: values.year ?? "", volume: values.volume ?? "", issue: values.issue ?? "",
              pages: (values.pages ?? "").replace(/\s*-+\s*/g, "–"),
              doi: cleanDoi(values.doi ?? ""), url: values.url ?? "",
            }
            change(current => ({
              ...current,
              publications: editing ? current.publications.map(item => item.id === pub.id ? pub : item) : [pub, ...current.publications],
            }))
            setNotice(editing ? "Publication updated." : "Publication added.")
            setSheetOpen(false)
          }}
        />
      )}

      <BibtexSheet
        open={bibtexOpen}
        onOpenChange={setBibtexOpen}
        existingKeys={existingKeys}
        onImport={drafts => {
          change(current => ({ ...current, publications: [...drafts.map(draft => ({ ...draft, id: crypto.randomUUID() })), ...current.publications] }))
          setNotice(drafts.length === 1 ? "1 publication imported." : `${drafts.length} publications imported.`)
          setBibtexOpen(false)
        }}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        title="Delete this publication?"
        description={<>“{deleting?.title}” will be removed from your CV. This can't be undone.</>}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          change(current => ({ ...current, publications: current.publications.filter(pub => pub.id !== deleteId) }))
          setDeleteId(null)
          setNotice("Publication deleted.")
        }}
      />
    </div>
  )
}

function DoiLookup({ isDuplicate, onFound }: { isDuplicate: (doi: string) => boolean; onFound: (draft: PublicationDraft) => void }) {
  const [doi, setDoi] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const lookUp = async (event: FormEvent) => {
    event.preventDefault()
    const clean = cleanDoi(doi)
    if (!clean) return setError("Paste a DOI first.")
    if (!isDoi(clean)) return setError("A DOI starts with 10. followed by a slash, e.g. 10.1000/xyz123.")
    if (isDuplicate(clean)) return setError("This DOI is already in your list.")
    controller.current?.abort()
    controller.current = new AbortController()
    setLoading(true)
    setError(null)
    try {
      onFound(await fetchDoi(clean, controller.current.signal))
      setDoi("")
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError((caught as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="cv-doi-form" onSubmit={lookUp} noValidate>
      <Field id="cv-doi" label="DOI" error={error} hint="For example 10.1038/s41586-020-2649-2 or a doi.org link.">
        <div className="keyword-add">
          <input
            id="cv-doi"
            className="form-control"
            value={doi}
            spellCheck={false}
            placeholder="10.xxxx/…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "cv-doi-error" : "cv-doi-hint"}
            onChange={e => { setDoi(e.target.value); setError(null) }}
          />
          <Button type="submit" variant="outline" className="dashboard-button" disabled={loading}>
            {loading ? <LoaderCircle className="cv-spin" /> : <Search />}{loading ? "Looking up…" : "Look up"}
          </Button>
        </div>
      </Field>
    </form>
  )
}

function BibtexSheet({ open, onOpenChange, existingKeys, onImport }: { open: boolean; onOpenChange: (open: boolean) => void; existingKeys: Set<string>; onImport: (drafts: PublicationDraft[]) => void }) {
  const [text, setText] = useState("")
  const [fileError, setFileError] = useState<string | null>(null)

  const parsed = text.trim() ? parseBibtex(text) : []
  const fresh = parsed.filter((draft, index) => !existingKeys.has(publicationKey(draft)) && parsed.findIndex(other => publicationKey(other) === publicationKey(draft)) === index)
  const skipped = parsed.length - fresh.length

  const readFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return setFileError("This file is larger than 2 MB. Export fewer entries and try again.")
    setFileError(null)
    setText(await file.text())
  }

  return (
    <Sheet open={open} onOpenChange={next => { onOpenChange(next); if (!next) { setText(""); setFileError(null) } }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>Import BibTeX</SheetTitle>
            <SheetDescription>Export a .bib file from Zotero, Mendeley, Google Scholar or your ORCID record, then upload or paste it here.</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <div className="form-sheet-body cv-bibtex-body">
          <label className="dropzone">
            <FileUp aria-hidden="true" />
            <span className="dropzone-title">Choose a .bib file</span>
            <span className="dropzone-hint">or paste the entries below</span>
            <input type="file" accept=".bib,.bibtex,.txt,text/plain" className="sr-only" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = "" }} />
          </label>
          {fileError && <p className="field-error" role="alert">{fileError}</p>}
          <Field id="cv-bibtex" label="BibTeX entries">
            <textarea id="cv-bibtex" className="form-control cv-mono" rows={12} spellCheck={false} value={text} placeholder={"@article{beridze2024,\n  author = {Beridze, Nino and Schulz, Karl},\n  title = {…},\n  journal = {…},\n  year = {2024}\n}"} onChange={e => setText(e.target.value)} />
          </Field>
          <p className="cv-bibtex-summary" role="status">
            {text.trim() && (parsed.length === 0
              ? "No entries found. Each one should start with @article{, @inproceedings{ or similar."
              : `Found ${parsed.length} ${parsed.length === 1 ? "entry" : "entries"}${skipped ? `, ${skipped} already in your list or repeated` : ""}.`)}
          </p>
        </div>
        <div className="form-sheet-footer">
          <Button variant="outline" className="dashboard-button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="dashboard-button" disabled={fresh.length === 0} onClick={() => { onImport(fresh); setText("") }}>
            {fresh.length ? `Import ${fresh.length} ${fresh.length === 1 ? "publication" : "publications"}` : "Import"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
