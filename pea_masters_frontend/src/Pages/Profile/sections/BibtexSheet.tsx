import { useState } from "react"
import { FileUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import { emptyDraft, outputKey, type OutputDraft } from "@/lib/research-outputs"
import { parseBibtex } from "@/Pages/CvBuilder/importers"

/** BibTeX entries (from Zotero, Mendeley, Google Scholar…) as research outputs to add to the profile */
function fromBibtex(text: string): OutputDraft[] {
  return parseBibtex(text).map(entry => ({
    ...emptyDraft("publication"), subtype: entry.type, status: entry.status, title: entry.title, authors: entry.authors,
    venue: entry.venue, year: /^\d{4}$/.test(entry.year) ? Number(entry.year) : null, volume: entry.volume,
    issue: entry.issue, pages: entry.pages, doi: entry.doi, url: entry.url, source: "bibtex",
  }))
}

export function BibtexSheet({ existingKeys, onImport, onClose }: {
  existingKeys: Set<string>; onImport: (drafts: OutputDraft[]) => Promise<void>; onClose: () => void
}) {
  const [text, setText] = useState("")
  const [fileError, setFileError] = useState("")
  const [adding, setAdding] = useState(false)
  const [failure, setFailure] = useState("")

  const parsed = text.trim() ? fromBibtex(text) : []
  const fresh = parsed.filter((draft, index) => !existingKeys.has(outputKey(draft)) && parsed.findIndex(other => outputKey(other) === outputKey(draft)) === index)
  const skipped = parsed.length - fresh.length

  async function readFile(file: File | undefined) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setFileError("This file is larger than 2 MB. Export fewer entries and try again."); return }
    setFileError("")
    setText(await file.text())
  }

  async function add() {
    setAdding(true)
    setFailure("")
    try {
      await onImport(fresh)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "They couldn't be added. Try again.")
      setAdding(false)
    }
  }

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>Import BibTeX</SheetTitle>
            <SheetDescription>Export a .bib file from Zotero, Mendeley, Google Scholar or your ORCID record, then upload or paste it here.</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <div className="form-sheet-body outputs-import-body">
          {failure && <p className="form-error-summary" role="alert">{failure}</p>}
          <label className="outputs-dropzone">
            <FileUp aria-hidden="true" />
            <span className="outputs-dropzone-title">Choose a .bib file</span>
            <span className="outputs-dropzone-hint">or paste the entries below</span>
            <input type="file" accept=".bib,.bibtex,.txt,text/plain" className="sr-only" onChange={event => { void readFile(event.target.files?.[0]); event.target.value = "" }} />
          </label>
          {fileError && <p className="field-error" role="alert">{fileError}</p>}
          <div className="form-field">
            <label htmlFor="outputs-bibtex">BibTeX entries</label>
            <textarea id="outputs-bibtex" className="form-control outputs-mono" rows={12} spellCheck={false} value={text}
              placeholder={"@article{beridze2024,\n  author = {Beridze, Nino and Schulz, Karl},\n  title = {…},\n  journal = {…},\n  year = {2024}\n}"}
              onChange={event => setText(event.target.value)} />
          </div>
          <p className="outputs-import-status" role="status">
            {text.trim() && (parsed.length === 0
              ? "No entries found. Each one should start with @article{, @inproceedings{ or similar."
              : `Found ${parsed.length} ${parsed.length === 1 ? "entry" : "entries"}${skipped ? `, ${skipped} already on your profile or repeated` : ""}.`)}
          </p>
        </div>
        <div className="form-sheet-footer">
          <Button variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
          <Button className="dashboard-button" disabled={fresh.length === 0 || adding} onClick={() => void add()}>
            {adding ? "Adding…" : fresh.length ? `Add ${fresh.length} to my profile` : "Add"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
