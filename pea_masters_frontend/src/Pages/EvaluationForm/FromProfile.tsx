import { useState } from 'react'
import { Link } from 'react-router'
import { BookOpen, ChevronDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cleanDoi, OUTPUT_KINDS, useOutputs, type ResearchOutput } from '@/lib/research-outputs'
import { findDoi, titleKey } from '@/lib/wos'
import type { EvaluationEntry } from './evaluation-model'

const DISMISSED_KEY = 'pea-evaluation-dismissed-outputs-v1'
const SHOWN = 5

function readDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

/** Whether a research output is already somewhere in the form: by DOI, or its title inside an entry's description */
export function outputInForm(output: ResearchOutput, entries: EvaluationEntry[]) {
  const title = titleKey(output.title)
  return entries.some(entry => {
    const doi = entry.wos?.doi ?? findDoi(entry.detail) ?? findDoi(entry.description)
    if (output.doi && doi && cleanDoi(doi) === output.doi) return true
    if (output.url && entry.detail.trim() === output.url) return true
    return title.length > 8 && titleKey(entry.description).includes(title)
  })
}

/**
 * "From your profile": the research outputs on My profile from the evaluation's publication years that aren't in any
 * entry yet. Adding one opens a filled-in entry; "Not for this form" hides it (in this browser).
 */
export function FromProfile({ entries, years: { from, to }, locked, onAdd }: {
  entries: EvaluationEntry[]
  /** The publication years that count for the evaluation period */
  years: { from: number; to: number }
  locked: boolean
  onAdd: (output: ResearchOutput) => void
}) {
  const { status, outputs } = useOutputs()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [expanded, setExpanded] = useState(false)

  if (status !== 'ready') return null
  const years = from === to ? String(from) : `${from}–${to}`
  if (outputs.length === 0) {
    return <p className="missing-card missing-quiet"><BookOpen aria-hidden="true" /><span>Keep your publications, datasets and software in <Link to="/profile#outputs" className="text-action">My profile → Research outputs</Link>, and add them to forms like this in one click.</span></p>
  }

  const missing = outputs.filter(output => output.year !== null && output.year >= from && output.year <= to
    && !dismissed.has(output.id) && !outputInForm(output, entries))
  if (missing.length === 0) return null
  const shown = expanded ? missing : missing.slice(0, SHOWN)
  const dismiss = (output: ResearchOutput) => {
    const next = new Set(dismissed).add(output.id)
    setDismissed(next)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])) } catch { /* only for this visit */ }
  }

  return <section className="missing-card" aria-labelledby="from-profile-heading">
    <div className="missing-heading">
      <BookOpen aria-hidden="true" />
      <div>
        <h2 id="from-profile-heading">{missing.length} {missing.length === 1 ? 'research output' : 'research outputs'} from {years} on your profile {missing.length === 1 ? "isn't" : "aren't"} in your form</h2>
        <p>From My profile → Research outputs. Add the ones that count for this evaluation{locked ? ' (use “Update submission” first)' : ''}.</p>
      </div>
    </div>
    <ul className="missing-list">
      {shown.map(output => <li key={output.id}>
        <div>
          <p>{output.title}</p>
          <small>{[output.kind === 'publication' ? output.subtype : OUTPUT_KINDS[output.kind].label, output.venue, output.year, output.doi].filter(Boolean).join(' · ')}</small>
        </div>
        <div className="missing-actions">
          {!locked && <Button variant="outline" size="sm" aria-label={`Add ${output.title}`} onClick={() => onAdd(output)}><Plus aria-hidden="true" />Add</Button>}
          <Button variant="ghost" size="sm" aria-label={`Not for this form: hide ${output.title}`} title="Doesn't count for this evaluation: hide it" onClick={() => dismiss(output)}><X aria-hidden="true" />Not for this form</Button>
        </div>
      </li>)}
    </ul>
    {missing.length > SHOWN && <button type="button" className="text-action missing-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      <ChevronDown aria-hidden="true" className={expanded ? 'missing-chevron-open' : undefined} />{expanded ? 'Show fewer' : `Show all ${missing.length}`}
    </button>}
  </section>
}
