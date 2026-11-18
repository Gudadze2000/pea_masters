import { useEffect, useState } from "react"
import { Link } from "react-router"
import { LoaderCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import { useIdentity } from "@/lib/profile"
import { fetchMyDocuments, fetchOrcidWorks, shortAuthor, type OrcidWork, type WosArticle } from "@/lib/wos"
import { emptyPublication, type PublicationType } from "./cv-model"
import { publicationKey, type PublicationDraft } from "./importers"

/* ---------- Web of Science ---------- */

/** Web of Science document types → CV publication types */
const WOS_TYPES: [RegExp, PublicationType][] = [
  [/proceedings|meeting/i, "Conference paper"],
  [/book chapter/i, "Book chapter"],
  [/^book$/i, "Book"],
  [/early access|preprint/i, "Preprint"],
]

/** Web of Science writes journal names in capitals: "PLANT GENETIC RESOURCES" → "Plant Genetic Resources" */
function titleCase(name: string) {
  if (name !== name.toUpperCase()) return name
  const small = new Set(["of", "and", "the", "in", "for", "on", "at", "to", "a", "an", "&"])
  return name.toLowerCase().split(" ").map((word, index) => index > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

export function fromWos(article: WosArticle): PublicationDraft {
  const type = WOS_TYPES.find(([pattern]) => pattern.test(article.document_types.join(" ")))?.[1] ?? "Journal article"
  return {
    ...emptyPublication(),
    type, status: type === "Preprint" ? "Preprint" : "Published",
    authors: article.authors.map(author => shortAuthor(author.name)).join("; "),
    title: article.title ?? "", venue: titleCase(article.source_title ?? ""), year: article.year ? String(article.year) : "",
    volume: article.volume ?? "", issue: article.issue ?? "", pages: article.pages ?? "",
    doi: article.doi, url: article.doi ? "" : article.record_url ?? "",
  }
}

/* ---------- ORCID ---------- */

const ORCID_TYPES: Record<string, PublicationType> = {
  "journal-article": "Journal article", "conference-paper": "Conference paper", "conference-abstract": "Conference paper",
  "conference-poster": "Conference paper", "book": "Book", "edited-book": "Book", "book-chapter": "Book chapter",
  "preprint": "Preprint", "dissertation-thesis": "Thesis", "report": "Report", "working-paper": "Report",
}

/** ORCID's work summaries have no co-authors, so the researcher is listed as author until they check */
export function fromOrcid(work: OrcidWork, ownAuthor: string): PublicationDraft {
  const type = ORCID_TYPES[work.type ?? ""] ?? "Journal article"
  return {
    ...emptyPublication(),
    type, status: type === "Preprint" ? "Preprint" : "Published", authors: ownAuthor,
    title: work.title, venue: work.journal ?? "", year: work.year ? String(work.year) : "",
    doi: work.doi ?? "", url: work.doi ? "" : work.url ?? "",
  }
}

/* ---------- the sheet ---------- */

type Item = { key: string; draft: PublicationDraft; detail?: string; warning?: string }
type Loaded = { summary: string; items: Item[] }
export type ImportSource = "wos" | "orcid"

const SOURCES: Record<ImportSource, { title: string; description: string; searching: string; missingCode: string; missingText: string; failed: string }> = {
  wos: {
    title: "Import from Web of Science",
    description: "Your documents in Web of Science, found by the ResearcherID and ORCID iD on your profile. Pick the ones to add.",
    searching: "Searching Web of Science…", missingCode: "no_researcher_id",
    missingText: "Add them in My profile → Research identifiers", failed: "Web of Science couldn't be reached. Try again later.",
  },
  orcid: {
    title: "Import from ORCID",
    description: "The public works on your ORCID record. ORCID doesn't list co-authors here, so check the authors of each one after adding.",
    searching: "Reading your ORCID record…", missingCode: "no_orcid",
    missingText: "Connect your ORCID iD in My profile → Research identifiers", failed: "ORCID couldn't be reached. Try again later.",
  },
}

type State = { status: "loading" } | { status: "error"; message: string; missing: boolean } | { status: "ready"; loaded: Loaded }

/** Lists the researcher's publications from Web of Science or ORCID; they pick which to add to the CV. */
export function ImportSheet({ source, open, onOpenChange, existingKeys, onImport }: {
  source: ImportSource; open: boolean; onOpenChange: (open: boolean) => void; existingKeys: Set<string>; onImport: (drafts: PublicationDraft[]) => void
}) {
  const text = SOURCES[source]
  const person = useIdentity()
  const ownAuthor = person.fullName ? shortAuthor(`${person.familyName}, ${person.fullName.split(/\s+/).slice(0, -1).join(" ")}`) : ""
  const [state, setState] = useState<State>({ status: "loading" })
  // Everything not on the CV yet starts ticked; this holds what the researcher unticked
  const [unticked, setUnticked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
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
              key: publicationKey(draft), draft, detail: article.times_cited !== null ? `cited ${article.times_cited}` : undefined,
              warning: article.includes_you === false ? "Your family name isn't among the authors. Check this is yours." : undefined,
            }
          }),
        }
      }
      const result = await fetchOrcidWorks()
      return {
        summary: result.works.length === 0 ? `Your ORCID record ${result.orcid} has no public works.`
          : `${result.works.length} public ${result.works.length === 1 ? "work" : "works"} on ORCID record ${result.orcid}${result.verified ? "" : ". This iD isn't verified yet: connect it on your profile to prove it's yours"}.`,
        items: result.works.map(work => { const draft = fromOrcid(work, ownAuthor); return { key: publicationKey(draft), draft } }),
      }
    }
    load()
      .then(loaded => { if (!cancelled) setState({ status: "ready", loaded }) })
      .catch((cause: unknown) => {
        if (!cancelled) setState({ status: "error", message: cause instanceof ApiError ? cause.message : text.failed, missing: cause instanceof ApiError && cause.code === text.missingCode })
      })
    return () => { cancelled = true }
  }, [open, source, ownAuthor, text])

  const items = state.status === "ready" ? state.loaded.items : []
  const selected = items.filter(item => !unticked.has(item.key) && !existingKeys.has(item.key))
  const toggle = (key: string) => setUnticked(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })

  return (
    <Sheet open={open} onOpenChange={next => { onOpenChange(next); if (!next) { setState({ status: "loading" }); setUnticked(new Set()) } }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>{text.title}</SheetTitle>
            <SheetDescription>{text.description}</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <div className="form-sheet-body cv-wos-body">
          {state.status === "loading" && <p className="cv-wos-status" role="status"><LoaderCircle className="cv-spin" aria-hidden="true" />{text.searching}</p>}
          {state.status === "error" && <div className="cv-wos-status" role="alert">
            <p>{state.message}</p>
            {state.missing && <Link to="/profile#identifiers" className="text-action">{text.missingText}</Link>}
          </div>}
          {state.status === "ready" && <>
            <p className="cv-wos-status" role="status">{state.loaded.summary}</p>
            {items.length > 0 && <ul className="cv-wos-list">
              {items.map(({ key, draft, detail, warning }) => {
                const already = existingKeys.has(key)
                return (
                  <li key={key}>
                    <label className={already ? "cv-wos-item cv-wos-item-done" : "cv-wos-item"}>
                      <input type="checkbox" checked={already || !unticked.has(key)} disabled={already} onChange={() => toggle(key)} />
                      <span>
                        <span className="cv-wos-title">{draft.title}</span>
                        <small>{[draft.venue, draft.year, draft.type, detail].filter(Boolean).join(" · ")}{already && " · already on your CV"}</small>
                        {warning && <small className="cv-wos-warn">{warning}</small>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>}
          </>}
        </div>
        <div className="form-sheet-footer">
          <Button variant="outline" className="dashboard-button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="dashboard-button" disabled={selected.length === 0} onClick={() => onImport(selected.map(item => item.draft))}>
            {selected.length ? `Add ${selected.length} ${selected.length === 1 ? "publication" : "publications"}` : "Add"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
