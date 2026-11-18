import { useEffect, useState } from 'react'
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, Loader2, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { citationOf, crossrefCitation, crossrefType, lookupCrossref, lookupDoi, lookupJournal, type CrossrefWork, type WosArticle, type WosJournal } from '@/lib/wos'
import type { WosCheck } from './evaluation-model'

const WAIT_MS = 600 // after the last keystroke

/** What PEA found out about a DOI: Web of Science first; if it isn't there, Crossref and the journal's indexing */
export type DoiCheck = { article: WosArticle; work?: CrossrefWork; journal?: WosJournal | null }

/**
 * Checks the DOI once typing stops: is the article in Web of Science? If not, is the DOI registered (Crossref), and is
 * its journal in Web of Science's journal list? The server caches every answer, so repeats are cheap.
 */
export function useDoiCheck(doi: string | null) {
  const [result, setResult] = useState<{ doi: string; check?: DoiCheck; error?: string } | null>(null)
  useEffect(() => {
    if (!doi) return
    let cancelled = false
    const run = async (): Promise<DoiCheck> => {
      const article = await lookupDoi(doi)
      if (article.found) return { article }
      // Not indexed: the extra details are a bonus, so their failures don't hide the Web of Science answer
      const work = await lookupCrossref(doi).catch(() => undefined)
      let journal: WosJournal | null | undefined
      if (work?.found && work.issns.length) {
        for (const issn of work.issns) {
          journal = await lookupJournal(issn).catch(() => undefined)
          if (journal?.found) break
        }
      }
      return { article, work, journal: journal ?? (work?.found && work.issns.length ? undefined : null) }
    }
    const timer = window.setTimeout(() => {
      run()
        .then(check => { if (!cancelled) setResult({ doi, check }) })
        .catch((cause: unknown) => { if (!cancelled) setResult({ doi, error: cause instanceof ApiError ? cause.message : "Web of Science couldn't be checked." }) })
    }, WAIT_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [doi])
  const current = doi && result?.doi === doi ? result : null
  return { checking: !!doi && !current, check: current?.check, error: current?.error }
}

/** What's kept with the entry, so the list and the reviewer see the check without asking again */
export function toWosCheck({ article, work, journal }: DoiCheck): WosCheck {
  if (!article.found) return {
    doi: article.doi, found: false, checkedAt: article.checked_at,
    ...(work ? { registered: work.found } : {}),
    ...(journal ? { journalInWos: journal.found, journal: journal.name ?? work?.container_title ?? undefined } : {}),
  }
  return {
    doi: article.doi, found: true, checkedAt: article.checked_at,
    title: article.title ?? undefined, source: article.source_title ?? undefined, year: article.year ?? undefined,
    timesCited: article.times_cited ?? undefined, recordUrl: article.record_url ?? undefined,
    ...(article.includes_you === false ? { includesYou: false } : {}),
  }
}

const cited = (count: number | null | undefined) => count === null || count === undefined ? '' : ` · cited ${count.toLocaleString('en-GB')} ${count === 1 ? 'time' : 'times'}`

/** Under the DOI field of the entry dialog */
export function WosPanel({ doi, checking, check, error, familyName, onUseCitation }: {
  doi: string | null; checking: boolean; check?: DoiCheck; error?: string; familyName: string
  /** Offered when the description is still empty */
  onUseCitation?: (citation: string) => void
}) {
  if (!doi) return null
  if (checking) return <p className="wos-panel wos-checking" role="status"><Loader2 aria-hidden="true" className="wos-spin" />Checking {doi}…</p>
  if (error) return <p className="wos-panel wos-error" role="status"><AlertTriangle aria-hidden="true" />{error} You can still save the entry.</p>
  if (!check) return null
  const { article, work, journal } = check

  if (article.found) return <div className="wos-panel wos-found" role="status">
    <CheckCircle2 aria-hidden="true" />
    <div>
      <p>Indexed in Web of Science</p>
      <small><cite>{article.title}</cite></small>
      <small>{[article.source_title, article.year].filter(Boolean).join(', ')}{cited(article.times_cited)}</small>
      {article.includes_you === false && <small className="wos-warning"><AlertTriangle aria-hidden="true" />{familyName ? `${familyName} isn't` : "You aren't"} among the {article.author_count} {article.author_count === 1 ? 'author' : 'authors'}. Check that this DOI is for your article.</small>}
      <div className="wos-actions">
        {onUseCitation && <Button type="button" variant="outline" size="sm" onClick={() => onUseCitation(citationOf(article))}>Use this citation</Button>}
        {article.record_url && <a href={article.record_url} target="_blank" rel="noopener noreferrer">View in Web of Science<ExternalLink aria-hidden="true" /></a>}
      </div>
    </div>
  </div>

  // Not in Web of Science, and not registered anywhere: almost certainly a typo
  if (work && !work.found) return <div className="wos-panel wos-unknown" role="status">
    <SearchX aria-hidden="true" />
    <div><p>This DOI isn't registered</p><small>It's in neither Web of Science nor Crossref, the DOI registry. Check it for typos.</small></div>
  </div>

  return <div className="wos-panel wos-missing" role="status">
    {work?.found ? <BookOpen aria-hidden="true" /> : <SearchX aria-hidden="true" />}
    <div>
      <p>Not found in Web of Science</p>
      {work?.found ? <>
        <small>Registered DOI · {crossrefType(work.type)}: <cite>{work.title}</cite>{[work.container_title, work.year].filter(Boolean).length ? ` · ${[work.container_title, work.year].filter(Boolean).join(', ')}` : ''}</small>
        {journal?.found && <small className="wos-good">The journal {journal.iso_title ?? journal.name} is in Web of Science's journal list, so the article may be indexed in a few weeks. Attach proof of publication meanwhile.</small>}
        {journal && !journal.found && <small>The journal isn't in Web of Science's journal list. If it's indexed in Scopus, attach proof of indexing.</small>}
        {journal === null && <small>Books and chapters aren't in Web of Science's journal list. Attach the title page or proof of publication.</small>}
      </> : <small>Check the DOI for typos. If the journal is indexed in Scopus instead, attach proof of indexing. Newly published articles can take a few weeks to appear.</small>}
      <div className="wos-actions">
        {work?.found && onUseCitation && <Button type="button" variant="outline" size="sm" onClick={() => onUseCitation(crossrefCitation(work))}>Use this citation</Button>}
        {journal?.found && journal.jcr_url && <a href={journal.jcr_url} target="_blank" rel="noopener noreferrer">Journal in JCR<ExternalLink aria-hidden="true" /></a>}
        <a href={`https://doi.org/${article.doi}`} target="_blank" rel="noopener noreferrer">Open DOI<ExternalLink aria-hidden="true" /></a>
      </div>
    </div>
  </div>
}

/** Next to an entry in the list */
export function WosBadge({ check }: { check: WosCheck }) {
  if (!check.found) {
    if (check.registered === false) return <span className="wos-badge wos-badge-bad" title={`DOI ${check.doi} isn't registered: check it for typos`}>DOI not registered</span>
    if (check.journalInWos) return <span className="wos-badge wos-badge-missing" title={`${check.journal ?? 'The journal'} is in Web of Science; the article isn't indexed yet`}>Not in WoS yet · journal indexed</span>
    return <span className="wos-badge wos-badge-missing" title={`DOI ${check.doi} wasn't found in Web of Science`}>Not in WoS</span>
  }
  const label = `WoS ✓${cited(check.timesCited)}`
  const title = `Indexed in Web of Science${check.source ? `: ${check.source}${check.year ? `, ${check.year}` : ''}` : ''}${check.includesYou === false ? ". You aren't listed as an author" : ''}`
  return check.recordUrl
    ? <a className={`wos-badge${check.includesYou === false ? ' wos-badge-warn' : ''}`} href={check.recordUrl} target="_blank" rel="noopener noreferrer" title={title}>{label}{check.includesYou === false && ' · not your name?'}</a>
    : <span className="wos-badge" title={title}>{label}</span>
}
