import { useEffect, useState } from "react"
import { Link } from "react-router"
import { LoaderCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import { fetchMyDocuments, shortAuthor, type AuthorDocuments, type WosArticle } from "@/lib/wos"
import { emptyPublication, type PublicationType } from "./cv-model"
import { publicationKey, type PublicationDraft } from "./importers"

/** Web of Science document types → CV publication types */
const TYPES: [RegExp, PublicationType][] = [
  [/proceedings|meeting/i, "Conference paper"],
  [/book chapter/i, "Book chapter"],
  [/^book$/i, "Book"],
  [/early access|preprint/i, "Preprint"],
]

export function toPublication(article: WosArticle): PublicationDraft {
  const kinds = article.document_types.join(" ")
  const type = TYPES.find(([pattern]) => pattern.test(kinds))?.[1] ?? "Journal article"
  return {
    ...emptyPublication(),
    type,
    status: type === "Preprint" ? "Preprint" : "Published",
    authors: article.authors.map(author => shortAuthor(author.name)).join("; "),
    title: article.title ?? "",
    venue: titleCase(article.source_title ?? ""),
    year: article.year ? String(article.year) : "",
    volume: article.volume ?? "", issue: article.issue ?? "", pages: article.pages ?? "",
    doi: article.doi, url: article.doi ? "" : article.record_url ?? "",
  }
}

/** Web of Science writes journal names in capitals: "PLANT GENETIC RESOURCES" → "Plant Genetic Resources" */
function titleCase(name: string) {
  if (name !== name.toUpperCase()) return name
  const small = new Set(["of", "and", "the", "in", "for", "on", "at", "to", "a", "an", "&"])
  return name.toLowerCase().split(" ").map((word, index) => index > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

type State = { status: "loading" } | { status: "error"; message: string; noIdentifier: boolean } | { status: "ready"; result: AuthorDocuments }

/** Lists the researcher's Web of Science documents; they pick which to add to the CV. */
export function WosImportSheet({ open, onOpenChange, existingKeys, onImport }: {
  open: boolean; onOpenChange: (open: boolean) => void; existingKeys: Set<string>; onImport: (drafts: PublicationDraft[]) => void
}) {
  const [state, setState] = useState<State>({ status: "loading" })
  // Everything not on the CV yet starts ticked; this holds what the researcher unticked
  const [unticked, setUnticked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchMyDocuments()
      .then(result => { if (!cancelled) setState({ status: "ready", result }) })
      .catch((cause: unknown) => {
        if (cancelled) return
        setState({ status: "error", message: cause instanceof ApiError ? cause.message : "Web of Science couldn't be reached. Try again later.", noIdentifier: cause instanceof ApiError && cause.code === "no_researcher_id" })
      })
    return () => { cancelled = true }
  }, [open])

  const documents = state.status === "ready" ? state.result.documents.map(article => ({ article, draft: toPublication(article), key: publicationKey(toPublication(article)) })) : []
  const selected = documents.filter(doc => !unticked.has(doc.key) && !existingKeys.has(doc.key))
  const toggle = (key: string) => setUnticked(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })

  return (
    <Sheet open={open} onOpenChange={next => { onOpenChange(next); if (!next) { setState({ status: "loading" }); setUnticked(new Set()) } }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>Import from Web of Science</SheetTitle>
            <SheetDescription>Your documents in Web of Science, found by the ResearcherID and ORCID iD on your profile. Pick the ones to add.</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <div className="form-sheet-body cv-wos-body">
          {state.status === "loading" && <p className="cv-wos-status" role="status"><LoaderCircle className="cv-spin" aria-hidden="true" />Searching Web of Science…</p>}
          {state.status === "error" && <div className="cv-wos-status" role="alert">
            <p>{state.message}</p>
            {state.noIdentifier && <Link to="/profile#identifiers" className="text-action">Add them in My profile → Research identifiers</Link>}
          </div>}
          {state.status === "ready" && (documents.length === 0
            ? <p className="cv-wos-status" role="status">Web of Science has no documents for {[state.result.researcher_id, state.result.orcid].filter(Boolean).join(" or ")}.</p>
            : <>
              <p className="cv-wos-status" role="status">
                {state.result.total} {state.result.total === 1 ? "document" : "documents"} for {[state.result.researcher_id, state.result.orcid].filter(Boolean).join(" / ")}
                {state.result.total > documents.length && ` (showing the newest ${documents.length})`}.
              </p>
              <ul className="cv-wos-list">
                {documents.map(({ article, draft, key }) => {
                  const already = existingKeys.has(key)
                  return (
                    <li key={key}>
                      <label className={already ? "cv-wos-item cv-wos-item-done" : "cv-wos-item"}>
                        <input type="checkbox" checked={already || !unticked.has(key)} disabled={already} onChange={() => toggle(key)} />
                        <span>
                          <span className="cv-wos-title">{draft.title}</span>
                          <small>{[draft.venue, draft.year, draft.type].filter(Boolean).join(" · ")}{article.times_cited !== null && ` · cited ${article.times_cited}`}{already && " · already on your CV"}</small>
                          {article.includes_you === false && <small className="cv-wos-warn">Your family name isn't among the authors. Check this is yours.</small>}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </>)}
        </div>
        <div className="form-sheet-footer">
          <Button variant="outline" className="dashboard-button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="dashboard-button" disabled={selected.length === 0} onClick={() => onImport(selected.map(doc => doc.draft))}>
            {selected.length ? `Add ${selected.length} ${selected.length === 1 ? "publication" : "publications"}` : "Add"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
