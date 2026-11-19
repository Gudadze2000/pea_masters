import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, LoaderCircle, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { fetchMyDocuments, findDoi, titleKey, type WosArticle } from '@/lib/wos'
import type { EvaluationEntry } from './evaluation-model'

const DISMISSED_KEY = 'pea-evaluation-dismissed-wos-v1'
const SHOWN = 5

const articleKey = (article: WosArticle) => article.doi || `title:${titleKey(article.title ?? '')}`

function readDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

/** Whether an article is already somewhere in the form: by DOI, or its title inside an entry's citation */
function inForm(article: WosArticle, entries: EvaluationEntry[]) {
  const title = titleKey(article.title ?? '')
  return entries.some(entry => {
    const doi = entry.wos?.doi ?? findDoi(entry.detail) ?? findDoi(entry.description)
    if (article.doi && doi === article.doi) return true
    return title.length > 12 && titleKey(entry.description).includes(title)
  })
}

type State = { status: 'loading' } | { status: 'ready'; documents: WosArticle[] } | { status: 'no-identifier' } | { status: 'off' } | { status: 'error'; message: string }

/**
 * "Missing from your form": the researcher's Web of Science documents from the evaluation years that aren't in any
 * entry yet, found by the ResearcherID / ORCID iD on their profile. Adding one opens a filled-in entry.
 */
export function MissingFromForm({ entries, years: { from, to }, locked, onAdd }: {
  entries: EvaluationEntry[]
  /** The publication years that count for the evaluation period */
  years: { from: number; to: number }
  locked: boolean; onAdd: (article: WosArticle) => void
}) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [dismissed, setDismissed] = useState(readDismissed)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMyDocuments({ from, to })
      .then(result => { if (!cancelled) setState({ status: 'ready', documents: result.documents }) })
      .catch((cause: unknown) => {
        if (cancelled) return
        if (cause instanceof ApiError && cause.code === 'no_researcher_id') setState({ status: 'no-identifier' })
        else if (cause instanceof ApiError && cause.code === 'wos_not_configured') setState({ status: 'off' })
        else setState({ status: 'error', message: cause instanceof ApiError ? cause.message : "Web of Science couldn't be reached." })
      })
    return () => { cancelled = true }
  }, [from, to])

  const dismiss = (article: WosArticle) => {
    const next = new Set(dismissed).add(articleKey(article))
    setDismissed(next)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])) } catch { /* only for this visit */ }
  }

  const years = from === to ? String(from) : `${from}–${to}`
  if (state.status === 'off') return null
  if (state.status === 'loading') return <p className="missing-card missing-quiet" role="status"><LoaderCircle className="wos-spin" aria-hidden="true" />Looking for your {years} articles in Web of Science…</p>
  if (state.status === 'error') return <p className="missing-card missing-quiet" role="status"><Search aria-hidden="true" />Couldn't look for your articles in Web of Science: {state.message}</p>
  if (state.status === 'no-identifier') return <p className="missing-card missing-quiet"><Search aria-hidden="true" /><span>Let PEA find your Web of Science articles: add your ResearcherID or ORCID iD in <Link to="/profile#identifiers" className="text-action">My profile → Research identifiers</Link>.</span></p>

  const missing = state.documents.filter(article => !dismissed.has(articleKey(article)) && !inForm(article, entries))
  if (missing.length === 0) return null
  const shown = expanded ? missing : missing.slice(0, SHOWN)

  return <section className="missing-card" aria-labelledby="missing-heading">
    <div className="missing-heading">
      <Search aria-hidden="true" />
      <div>
        <h2 id="missing-heading">{missing.length} Web of Science {missing.length === 1 ? 'article' : 'articles'} from {years} {missing.length === 1 ? "isn't" : "aren't"} in your form</h2>
        <p>Found by the identifiers on your profile. Add the ones that count for this evaluation{locked ? ' (use “Update submission” first)' : ''}.</p>
      </div>
    </div>
    <ul className="missing-list">
      {shown.map(article => <li key={articleKey(article)}>
        <div>
          <p>{article.title}</p>
          <small>{[article.source_title, article.year].filter(Boolean).join(', ')}{article.times_cited !== null && ` · cited ${article.times_cited}`}{article.doi && ` · ${article.doi}`}</small>
          {article.includes_you === false && <small className="missing-warn">Your family name isn't among its authors.</small>}
        </div>
        <div className="missing-actions">
          {!locked && <Button variant="outline" size="sm" onClick={() => onAdd(article)}><Plus aria-hidden="true" />Add</Button>}
          <Button variant="ghost" size="sm" aria-label={`Not mine or doesn't count: hide ${article.title}`} title="Not mine, or doesn't count: hide it" onClick={() => dismiss(article)}><X aria-hidden="true" />Not mine</Button>
        </div>
      </li>)}
    </ul>
    {missing.length > SHOWN && <button type="button" className="text-action missing-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      <ChevronDown aria-hidden="true" className={expanded ? 'missing-chevron-open' : undefined} />{expanded ? 'Show fewer' : `Show all ${missing.length}`}
    </button>}
  </section>
}
