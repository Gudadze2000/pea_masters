import { useEffect, useState } from "react"
import { Link } from "react-router"
import { LoaderCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import { useIdentity } from "@/lib/profile"
import { fromOrcid, fromWos, OUTPUT_KINDS, outputKey, type OutputDraft } from "@/lib/research-outputs"
import { fetchMyDocuments, fetchOrcidWorks, shortAuthor } from "@/lib/wos"

export type ImportSource = "wos" | "orcid"

type Item = { key: string; draft: OutputDraft; detail?: string; warning?: string }
type Loaded = { summary: string; items: Item[] }
type State = { status: "loading" } | { status: "error"; message: string; missing: boolean } | { status: "ready"; loaded: Loaded }

const SOURCES: Record<ImportSource, { title: string; description: string; searching: string; missingCode: string; missingText: string; failed: string }> = {
  wos: {
    title: "Import from Web of Science",
    description: "Your documents in Web of Science, found by the ResearcherID and ORCID iD on your profile. Pick the ones to add.",
    searching: "Searching Web of Science…", missingCode: "no_researcher_id",
    missingText: "Add one under Research identifiers above", failed: "Web of Science couldn't be reached. Try again later.",
  },
  orcid: {
    title: "Import from ORCID",
    description: "The public works on your ORCID record: publications, datasets and software. ORCID doesn't list co-authors here, so check the authors of each one after adding.",
    searching: "Reading your ORCID record…", missingCode: "no_orcid",
    missingText: "Connect your ORCID iD under Research identifiers above", failed: "ORCID couldn't be reached. Try again later.",
  },
}

/** Lists the researcher's outputs in Web of Science or on ORCID; they pick which to add to their profile. */
export function OutputImportSheet({ source, onClose, existingKeys, onImport }: {
  source: ImportSource; onClose: () => void; existingKeys: Set<string>; onImport: (drafts: OutputDraft[]) => Promise<void>
}) {
  const text = SOURCES[source]
  const person = useIdentity()
  const ownAuthor = person.fullName ? shortAuthor(`${person.familyName}, ${person.fullName.split(/\s+/).slice(0, -1).join(" ")}`) : ""
  const [state, setState] = useState<State>({ status: "loading" })
  // Everything not on the profile yet starts ticked; this holds what the researcher unticked
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [failure, setFailure] = useState("")

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<Loaded> => {
      if (source === "wos") {
        const result = await fetchMyDocuments()
        const ids = [result.researcher_id, result.orcid].filter(Boolean).join(" / ")
        return {
          summary: result.documents.length === 0 ? `Web of Science has no documents for ${ids}.`
            : `${result.total} ${result.total === 1 ? "document" : "documents"} for ${ids}${result.total > result.documents.length ? ` (showing the newest ${result.documents.length})` : ""}.`,
          items: result.documents.map(article => {
            const draft = fromWos(article)
            return {
              key: outputKey(draft), draft, detail: article.times_cited !== null ? `cited ${article.times_cited}` : undefined,
              warning: article.includes_you === false ? "Your family name isn't among the authors. Check this is yours." : undefined,
            }
          }),
        }
      }
      const result = await fetchOrcidWorks()
      return {
        summary: result.works.length === 0 ? `Your ORCID record ${result.orcid} has no public works.`
          : `${result.works.length} public ${result.works.length === 1 ? "work" : "works"} on ORCID record ${result.orcid}${result.verified ? "" : ". This iD isn't verified yet: connect it to prove it's yours"}.`,
        items: result.works.map(work => { const draft = fromOrcid(work, ownAuthor); return { key: outputKey(draft), draft } }),
      }
    }
    load()
      .then(loaded => { if (!cancelled) setState({ status: "ready", loaded }) })
      .catch((cause: unknown) => {
        if (!cancelled) setState({ status: "error", message: cause instanceof ApiError ? cause.message : text.failed, missing: cause instanceof ApiError && cause.code === text.missingCode })
      })
    return () => { cancelled = true }
  }, [source, ownAuthor, text])

  const items = state.status === "ready" ? state.loaded.items : []
  const selected = items.filter(item => !unticked.has(item.key) && !existingKeys.has(item.key))
  const toggle = (key: string) => setUnticked(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })

  async function add() {
    setAdding(true)
    setFailure("")
    try {
      await onImport(selected.map(item => item.draft))
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
            <SheetTitle>{text.title}</SheetTitle>
            <SheetDescription>{text.description}</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <div className="form-sheet-body outputs-import-body">
          {failure && <p className="form-error-summary" role="alert">{failure}</p>}
          {state.status === "loading" && <p className="outputs-import-status" role="status"><LoaderCircle className="wos-spin" aria-hidden="true" />{text.searching}</p>}
          {state.status === "error" && <div className="outputs-import-status" role="alert">
            <p>{state.message}</p>
            {state.missing && <Link to="/profile#identifiers" className="text-action" onClick={onClose}>{text.missingText}</Link>}
          </div>}
          {state.status === "ready" && <>
            <p className="outputs-import-status" role="status">{state.loaded.summary}</p>
            {items.length > 0 && <ul className="outputs-import-list">
              {items.map(({ key, draft, detail, warning }) => {
                const already = existingKeys.has(key)
                return (
                  <li key={key}>
                    <label className={already ? "outputs-import-item done" : "outputs-import-item"}>
                      <input type="checkbox" checked={already || !unticked.has(key)} disabled={already} onChange={() => toggle(key)} />
                      <span>
                        <span className="outputs-import-title">{draft.title}</span>
                        <small>{[draft.kind === "publication" ? draft.subtype : OUTPUT_KINDS[draft.kind].label, draft.venue, draft.year, detail].filter(Boolean).join(" · ")}{already && " · already on your profile"}</small>
                        {warning && <small className="outputs-import-warn">{warning}</small>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>}
          </>}
        </div>
        <div className="form-sheet-footer">
          <Button variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
          <Button className="dashboard-button" disabled={selected.length === 0 || adding} onClick={() => void add()}>
            {adding ? "Adding…" : selected.length ? `Add ${selected.length} to my profile` : "Add"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
