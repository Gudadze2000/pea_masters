import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { ApiError } from '@/lib/api'
import { myEvaluationsApi, type EntryInput, type MyEvaluation, type MyEvaluationBrief } from '@/lib/evaluations'
import { useSession } from '@/lib/auth'
import { citationOf, findDoi, type WosArticle } from '@/lib/wos'
import { ContactCoordinator, type ContactTopic } from './ContactCoordinator'
import { EntryModal, type UsedDoi } from './EntryModal'
import { EvaluationIcon as Icon, EvaluationModal } from './EvaluationModal'
import { WosBadge } from './WosCheck'
import { MissingFromForm } from './MissingFromForm'
import {
  byItem, changesSince, dayLabel, daysUntil, formScore, isSent, recordScore, toForm,
  type EvaluationEntry, type EvaluationLinkState, type RecordDef,
} from './evaluation-model'
import '@/components/forms/forms.css'
import './EvaluationForm.css'

const statusLabels = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' } as const

function Badge({ status }: { status: string }) {
  return <span className={`evaluation-badge evaluation-badge-${status.toLowerCase().replace(' ', '-')}`}><Icon name={status === 'Approved' ? 'imgDot1' : status === 'Rejected' ? 'imgDot2' : status === 'Submitted' || status === 'In review' ? 'imgDot3' : 'imgDot'} />{status}</span>
}

const pts = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} pts`
const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const recordLabel = (record: RecordDef) => (record.code ? `${record.code} ${record.name}` : record.name)
const message = (cause: unknown, fallback: string) => (cause instanceof ApiError ? cause.message : fallback)

function RecordCard({ record, entries, locked, onAdd, onEdit, onToggleHidden, onAsk }: {
  record: RecordDef; entries: EvaluationEntry[]
  /** Submitted and not being updated, or outside the period */
  locked: boolean
  onAdd: () => void; onEdit: (entry: EvaluationEntry) => void; onToggleHidden: (entry: EvaluationEntry) => void; onAsk: (entry: EvaluationEntry) => void
}) {
  const sent = entries.filter(isSent)
  const full = record.maxEntries !== undefined && sent.length >= record.maxEntries
  const rate = record.variablePoints ? 'Points per entry' : `${pts(record.points)} per entry`
  const limit = record.maxPoints !== undefined ? ` · max ${pts(record.maxPoints)}` : record.maxEntries !== undefined ? ` · up to ${record.maxEntries} entries` : ''
  return <section className={`evaluation-record${!entries.length ? ' evaluation-record-empty' : ''}`} aria-labelledby={`record-${record.id}`}>
    <div className="evaluation-record-header">
      <span className="evaluation-record-icon"><Icon name={record.icon} /></span>
      <div className="evaluation-record-title"><h2 id={`record-${record.id}`}>{record.code && <span className="evaluation-record-code">{record.code}</span>}{record.name}</h2>{record.georgian && <small lang="ka">{record.georgian}</small>}</div>
      <div className="evaluation-subtotal"><p>{rate}{limit}</p><strong>Subtotal: {pts(recordScore(record, entries))}</strong></div>
      {!locked && <Button variant="outline" className="evaluation-add" disabled={full} title={full ? `This item counts at most ${record.maxEntries} entries` : undefined} onClick={onAdd}><Icon name="imgIconPlus" />Add entry</Button>}
    </div>
    {entries.map((entry, index) => {
      const hidden = !isSent(entry)
      return <div className={`evaluation-entry${hidden ? ' evaluation-entry-hidden' : ''}`} key={entry.id}>
        <div className="evaluation-entry-row">
          <span className="evaluation-entry-number">{index + 1}</span>
          <div className="evaluation-entry-description"><p>{entry.description}</p><small>{hidden ? 'Hidden: not sent with your form' : [entry.detail, record.variablePoints && entry.points !== null ? pts(entry.points) : ''].filter(Boolean).join(' · ')}</small>{!hidden && entry.wos && <WosBadge check={entry.wos} />}</div>
          <div className="evaluation-attachment">{entry.files.length ? <><Icon name="imgIconClip" /><a href={entry.files[0].url} target="_blank" rel="noreferrer" title={entry.files.map(file => file.name).join(', ')}>{entry.files[0].name}{entry.files.length > 1 && ` +${entry.files.length - 1}`}</a></> : <span className="evaluation-no-file">No file attached</span>}</div>
          <div className="evaluation-status"><Badge status={hidden ? 'Hidden' : statusLabels[entry.status]} /></div>
          <div className="evaluation-entry-actions">{locked ? <Icon name="imgIconLock" /> : <>
            {!hidden && <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${entry.description}`} onClick={() => onEdit(entry)}><Icon name="imgIconEdit" /></Button>}
            <Button variant="outline" size="icon" className="icon-button" aria-label={hidden ? `Show ${entry.description} again` : `Hide ${entry.description}`} title={hidden ? 'Show again: send it with your form' : "Hide: don't send it with your form"} onClick={() => onToggleHidden(entry)}>{hidden ? <Eye /> : <EyeOff />}</Button>
          </>}</div>
        </div>
        {!hidden && entry.status === 'rejected' && entry.review_comment && <div className="evaluation-rejection"><Icon name="imgIconAlert1" /><p>{entry.review_comment}</p><button type="button" className="evaluation-ask" onClick={() => onAsk(entry)}><Mail aria-hidden="true" />Ask coordinator</button></div>}
      </div>
    })}
  </section>
}

/** Picks the evaluation to show: the open period's, or else the newest */
const pick = (list: MyEvaluationBrief[]) => (list.find(item => item.period.status === 'open') ?? list[0])?.id ?? ''

export function EvaluationForm() {
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [list, setList] = useState<MyEvaluationBrief[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [evaluation, setEvaluation] = useState<MyEvaluation | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('')
  const [editing, setEditing] = useState<{ record: RecordDef; entry?: EvaluationEntry; initial?: { description: string; detail: string }; choices?: RecordDef[] } | null>(null)
  const [contact, setContact] = useState<{ topic?: ContactTopic } | null>(null)
  const [preview, setPreview] = useState(false)
  const [review, setReview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const linkHandled = useRef(false)

  useEffect(() => {
    let cancelled = false
    myEvaluationsApi.list()
      .then(found => { if (!cancelled) { setList(found); setSelectedId(current => current || pick(found)) } })
      .catch(cause => { if (!cancelled) setLoadError(message(cause, "Your evaluation couldn't be loaded.")) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    myEvaluationsApi.get(selectedId)
      .then(found => { if (!cancelled) { setEvaluation(found); setLoadError('') } })
      .catch(cause => { if (!cancelled) setLoadError(message(cause, "Your evaluation couldn't be loaded.")) })
    return () => { cancelled = true }
  }, [selectedId])

  const form = useMemo(() => (evaluation ? toForm(evaluation.structure) : null), [evaluation])

  // Other pages can link straight to one entry (e.g. the dashboard's "Fix"): open its part and its edit dialog
  useEffect(() => {
    if (!evaluation || !form || linkHandled.current) return
    linkHandled.current = true
    const target = (location.state as EvaluationLinkState | null)?.edit
    if (!target) return
    navigate(location.pathname, { replace: true, state: null }) // a reload doesn't reopen the dialog
    const entry = evaluation.entries.find(item => item.id === target.entryId)
    const record = form.items.get(target.recordId)
    const part = form.parts.find(item => item.items.some(other => other.id === target.recordId))
    if (part) setTab(part.id)
    if (entry && record && evaluation.can_edit) setEditing({ record, entry })
  }, [evaluation, form, location.pathname, location.state, navigate])

  const breadcrumb = [{ label: 'Evaluation form' }]
  if (!evaluation || !form) {
    return <WorkspaceLayout breadcrumb={breadcrumb}>{() => <div className="dashboard-content evaluation-page">
      <div className="page-heading"><div><h1>Evaluation form</h1></div></div>
      {loadError ? <p className="form-error-summary" role="alert">{loadError}</p>
        : list && list.length === 0 ? <section className="dashboard-card evaluation-empty-state">
          <h2>No evaluation form yet</h2>
          <p>Your coordinator sends you the form when an evaluation period starts, and it appears here.</p>
          <Button variant="outline" className="dashboard-button" onClick={() => setContact({})}><Mail aria-hidden="true" />Contact coordinator</Button>
        </section>
          : <p role="status">Loading your evaluation…</p>}
      {contact && <ContactCoordinator topic={contact.topic} onClose={() => setContact(null)} />}
    </div>}</WorkspaceLayout>
  }

  const { period } = evaluation
  const locked = !evaluation.can_edit
  const closed = period.status === 'closed'
  const upcoming = period.status === 'upcoming'
  const updating = evaluation.state === 'updating'
  const submittedAt = evaluation.submitted_at
  const deadline = dayLabel(period.ends_on)
  const daysLeft = daysUntil(period.ends_on)
  const entries = evaluation.entries
  const grouped = byItem(entries)
  const listOf = (id: string) => grouped[id] ?? []
  const sent = entries.filter(isSent)
  const hiddenCount = entries.length - sent.length
  const missingFiles = sent.filter(entry => !entry.files.length).length
  const rejected = sent.filter(entry => entry.status === 'rejected').length
  const score = formScore(form, grouped)
  const shortfalls = score.scores.filter(({ part, counted }) => part.min !== undefined && counted < part.min)
  const changes = updating && evaluation.submission ? changesSince(evaluation.submission, entries) : null
  const nothingToResubmit = updating && !changes?.any
  const changeSummary = changes && [
    changes.changed && `${changes.changed} new or changed ${changes.changed === 1 ? 'entry' : 'entries'}`,
    changes.hidden && `${changes.hidden} hidden`,
    changes.shown && `${changes.shown} shown again`,
  ].filter(Boolean).join(' · ')
  const activePart = form.parts.find(part => part.id === tab) ?? form.parts[0]
  const activeScore = score.scores.find(item => item.part.id === activePart.id)!
  const allItems = [...form.items.values()]

  const replaceEntry = (entry: EvaluationEntry) => setEvaluation(current => current && ({
    ...current, entries: current.entries.some(item => item.id === entry.id) ? current.entries.map(item => (item.id === entry.id ? entry : item)) : [...current.entries, entry],
  }))

  async function saveEntry(input: EntryInput) {
    if (!editing || !evaluation) return null
    try {
      const saved = editing.entry
        ? await myEvaluationsApi.updateEntry(evaluation.id, editing.entry.id, input)
        : await myEvaluationsApi.addEntry(evaluation.id, input)
      replaceEntry(saved)
      setEditing(null)
      setNotice(editing.entry ? 'Entry saved.' : 'Entry added.')
      setActionError('')
      return null
    } catch (cause) {
      return message(cause, "The entry couldn't be saved. Try again.")
    }
  }

  async function toggleHidden(entry: EvaluationEntry) {
    if (!evaluation) return
    try {
      replaceEntry(await myEvaluationsApi.setHidden(evaluation.id, entry.id, isSent(entry)))
      setNotice(isSent(entry) ? `“${entry.description}” is hidden and won't be sent with your form. You can show it again at any time.` : `“${entry.description}” will be sent with your form again.`)
      setActionError('')
    } catch (cause) {
      setActionError(message(cause, "That didn't work. Try again."))
    }
  }

  async function run(action: (id: string) => Promise<MyEvaluation>, done: (result: MyEvaluation) => string) {
    if (!evaluation || busy) return
    setBusy(true)
    try {
      const result = await action(evaluation.id)
      setEvaluation(result)
      setNotice(done(result))
      setActionError('')
      setReview(false)
    } catch (cause) {
      setActionError(message(cause, "That didn't work. Try again."))
      setReview(false)
    } finally {
      setBusy(false)
    }
  }

  const submit = () => run(myEvaluationsApi.submit, () => `${updating ? 'Resubmitted' : 'Submitted'}. Your coordinator can see it now. You can update it until ${deadline}.`)
  const startUpdate = () => run(myEvaluationsApi.reopen, () => `Your form is open again. Add or change entries, then resubmit before ${deadline}.`)
  const discardUpdate = () => run(myEvaluationsApi.discard, result => `Changes discarded. Your form is as you submitted it on ${formatWhen(result.submitted_at!)}.`)

  const ask = (record: RecordDef, entry: EvaluationEntry) => setContact({ topic: { record: recordLabel(record), entry: entry.description, comment: entry.review_comment ?? undefined } })
  /** DOIs in every entry except the one being edited */
  const usedDois = (except?: string) => {
    const used = new Map<string, UsedDoi>()
    for (const entry of entries) {
      const doi = entry.wos?.doi ?? findDoi(entry.detail) ?? findDoi(entry.description)
      if (doi && entry.id !== except && !used.has(doi)) used.set(doi, { recordId: entry.item_id, description: entry.description })
    }
    return used
  }
  /** "Missing from your form": a new entry for the article, in the item most likely meant for articles */
  const addArticle = (article: WosArticle) => {
    const likely = allItems.find(item => /article/i.test(item.name)) ?? allItems[0]
    setEditing({ record: likely, initial: { description: citationOf(article), detail: article.doi }, choices: allItems })
  }

  return <WorkspaceLayout breadcrumb={breadcrumb}>{() => <div className="dashboard-content evaluation-page">
    <div className="page-heading"><div><h1>Evaluation form</h1><p>{period.name} · {evaluation.form_name.en}</p></div>
      <div className="evaluation-actions">
        {list && list.length > 1 && <select className="form-control evaluation-period-select" aria-label="Evaluation period" value={evaluation.id} onChange={event => { setEvaluation(null); setTab(''); setNotice(''); setSelectedId(event.target.value) }}>
          {list.map(item => <option key={item.id} value={item.id}>{item.period.name}</option>)}
        </select>}
        <Badge status={submittedAt && !updating ? 'Submitted' : 'Draft'} />
        <Button variant="outline" className="dashboard-button" onClick={() => setContact({})}><Mail aria-hidden="true" />Contact coordinator</Button>
        <Button variant="outline" className="dashboard-button" onClick={() => setPreview(true)}><Icon name="imgIconEye" />Preview</Button>
      </div>
    </div>
    {notice && <p className="evaluation-notice" role="status">{notice}</p>}
    {actionError && <p className="form-error-summary" role="alert">{actionError}</p>}
    {upcoming
      ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconClock" /><div><p>This evaluation opens on {dayLabel(period.starts_on)}</p><small>You can fill in and submit your form from then until {deadline}.</small></div></div>
      : closed
        ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconLock" /><div><p>The evaluation period has ended</p><small>{submittedAt ? `You submitted your form on ${formatWhen(submittedAt)}.` : "Your form wasn't submitted before the deadline."} Contact your coordinator if something needs to change.</small></div></div>
        : submittedAt && !updating
          ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconLock" /><div><p>Submitted on {formatWhen(submittedAt)}</p><small>Got a new article or something to fix? You can update and resubmit your form until {deadline}. Approved entries stay approved unless you change them.</small></div><Button variant="outline" className="dashboard-button evaluation-banner-action" disabled={busy} onClick={() => void startUpdate()}><Icon name="imgIconUnlock" />Update submission</Button></div>
          : updating && submittedAt
            ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconUnlock" /><div><p>Updating your submitted form</p><small>Your coordinator keeps seeing the version you sent on {formatWhen(submittedAt)} until you resubmit.{changeSummary ? ` Changes so far: ${changeSummary}.` : ''}</small></div><Button variant="outline" className="dashboard-button evaluation-banner-action" disabled={busy} onClick={() => void discardUpdate()}>Discard changes</Button></div>
            : null}
    {!locked && rejected > 0 && <div className="evaluation-banner"><Icon name="imgIconAlert" /><div><p>{rejected} {rejected === 1 ? 'entry was' : 'entries were'} rejected</p><small>Fix the {rejected === 1 ? 'entry' : 'entries'} and {submittedAt ? 'resubmit' : 'submit'}, or hide {rejected === 1 ? 'it' : 'them'} if you'd rather not send {rejected === 1 ? 'it' : 'them'}. Not sure what's wrong? Use “Ask coordinator” on the entry.</small></div></div>}
    {period.status === 'open' && <MissingFromForm entries={entries} years={{ from: period.publication_from, to: period.publication_to }} locked={locked} onAdd={addArticle} />}
    <div className="evaluation-tabs" role="tablist" aria-label="Evaluation sections">
      {form.parts.map(part => <button key={part.id} type="button" role="tab" id={`evaluation-tab-${part.id}`} aria-selected={activePart.id === part.id} aria-controls="evaluation-tabpanel" onClick={() => setTab(part.id)}>{[part.numeral, part.name].filter(Boolean).join(' · ')}<span className="evaluation-tab-score">{pts(score.scores.find(item => item.part.id === part.id)?.raw ?? 0)}</span></button>)}
    </div>
    <div className="evaluation-columns">
      <div className="evaluation-records" id="evaluation-tabpanel" role="tabpanel" aria-labelledby={`evaluation-tab-${activePart.id}`}>
        <div className="evaluation-part-header">
          <div><h2>{activePart.numeral && `${activePart.numeral}. `}{activePart.name} {activePart.georgian && <small lang="ka">{activePart.georgian}</small>}</h2><p>{activePart.rule ? `${activePart.rule}. ` : ''}Add one entry per unit (one article, one semester, one grant…) with its evidence.</p></div>
          <div className="evaluation-part-score"><strong>{pts(activeScore.raw)}</strong><span>{activePart.min !== undefined ? `of at least ${activePart.min}` : activePart.cap !== undefined ? `${pts(activeScore.counted)} counted (max ${activePart.cap})` : 'entered'}</span></div>
        </div>
        {activePart.items.map(record => <RecordCard key={record.id} record={record} entries={listOf(record.id)} locked={locked}
          onAdd={() => setEditing({ record })} onEdit={entry => setEditing({ record, entry })}
          onToggleHidden={entry => void toggleHidden(entry)} onAsk={entry => ask(record, entry)} />)}
      </div>
      <aside className="evaluation-summary" aria-label="Evaluation summary">
        <section className="dashboard-card"><h2>Your score</h2>
          <div className="evaluation-score"><strong>{Number.isInteger(score.total) ? score.total : score.total.toFixed(1)}</strong><span>{form.totalMinimum !== undefined ? `pts of at least ${form.totalMinimum}` : 'pts'}</span></div>
          {form.totalMinimum !== undefined && <progress value={Math.min(score.total, form.totalMinimum)} max={form.totalMinimum} aria-label={`Total towards the ${form.totalMinimum}-point minimum`} />}
          <dl className="evaluation-parts">{score.scores.map(({ part, raw, counted }) => {
            const ok = part.min === undefined || counted >= part.min
            return <div key={part.id}><dt><button type="button" className="text-action" onClick={() => setTab(part.id)}>{[part.numeral, part.name].filter(Boolean).join('. ')}</button></dt><dd><span className={ok ? undefined : 'evaluation-short'}>{pts(part.cap !== undefined ? counted : raw)}</span><small>{part.min !== undefined ? `min ${part.min}` : part.cap !== undefined ? `max ${part.cap}` : ''}</small></dd></div>
          })}</dl>
          <small>Only approved entries count towards your final score. This total includes entries waiting for review; rejected and hidden entries don't count.</small>
        </section>
        <section className="dashboard-card">{locked
          ? <><h2>Review status</h2>
            {submittedAt ? <><div className="evaluation-check"><span>Status</span><Badge status="In review" /></div><small>Submitted on {formatWhen(submittedAt)}</small></> : <p className="evaluation-check"><Icon name="imgIconAlert2" />Not submitted</p>}
            {period.status === 'open' && submittedAt && <><Button variant="outline" className="dashboard-button" disabled={busy} onClick={() => void startUpdate()}><Icon name="imgIconUnlock" />Update submission</Button><small>Add a new entry or fix one, then resubmit before {deadline}.</small></>}
          </>
          : <><h2>{updating ? 'Before you resubmit' : 'Before you submit'}</h2>
            {sent.length === 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />Add at least one entry</p>}
            {shortfalls.map(({ part, counted }) => <p className="evaluation-check" key={part.id}><Icon name="imgIconAlert2" />{part.name}: {pts(counted)} of the required {part.min}</p>)}
            {form.totalMinimum !== undefined && score.total < form.totalMinimum && <p className="evaluation-check"><Icon name="imgIconAlert2" />Total: {pts(score.total)} of the required {form.totalMinimum}</p>}
            {sent.length > 0 && shortfalls.length === 0 && (form.totalMinimum === undefined || score.total >= form.totalMinimum) && <p className="evaluation-check"><Icon name="imgIconCheck" />Your entries meet the form's minimums</p>}
            {missingFiles > 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />{missingFiles} {missingFiles === 1 ? 'entry has' : 'entries have'} no attachment</p>}
            {rejected > 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />{rejected} {rejected === 1 ? 'entry was rejected and needs' : 'entries were rejected and need'} a fix</p>}
            {hiddenCount > 0 && <p className="evaluation-check"><EyeOff aria-hidden="true" className="evaluation-check-icon" />{hiddenCount} hidden {hiddenCount === 1 ? 'entry' : 'entries'} won't be sent</p>}
            <hr />
            <Button className="dashboard-button" disabled={nothingToResubmit || sent.length === 0} onClick={() => { setConfirmed(false); setReview(true) }}><Icon name="imgIconSend" />{updating ? 'Review & resubmit' : 'Review & submit'}</Button>
            {nothingToResubmit && <small>No changes since you submitted.</small>}
            <small>Entries are saved as soon as you save them; there's nothing else to save.</small>
          </>}
        </section>
        <section className="dashboard-card"><h2>Deadline</h2><div className="evaluation-deadline"><span><Icon name="imgIconClock" /></span><div><p>{deadline}</p><small>{closed ? 'The evaluation period has ended' : upcoming ? `Opens on ${dayLabel(period.starts_on)}` : daysLeft === 0 ? 'Last day today · set by your admin' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left · set by your admin`}</small></div></div><small>Until the deadline you can resubmit as often as you need, e.g. when a new article is published.</small></section>
      </aside>
    </div>
    {editing && <EntryModal record={editing.record} entry={editing.entry} initial={editing.initial} itemChoices={editing.choices} usedDois={usedDois(editing.entry?.id)}
      recordName={id => form.items.get(id)?.name ?? 'another item'} onClose={() => setEditing(null)} onSave={saveEntry} />}
    {contact && <ContactCoordinator topic={contact.topic} onClose={() => setContact(null)} />}
    <EvaluationModal open={review} onClose={() => setReview(false)}
      title={updating ? 'Resubmit evaluation?' : 'Submit evaluation for review?'}
      description={updating && submittedAt
        ? `This replaces the version you sent on ${formatWhen(submittedAt)}. New and changed entries go to review; approved entries you didn't change stay approved.`
        : `Your form goes to your coordinator for review. You can still update and resubmit it until ${deadline}.`}>
      <div className="evaluation-modal-body">
        <dl className="evaluation-review-stats">
          {updating && changeSummary && <div><dt>Changes</dt><dd>{changeSummary}</dd></div>}
          <div><dt>Items with entries</dt><dd>{allItems.filter(record => listOf(record.id).some(isSent)).length} of {allItems.length}</dd></div>
          <div><dt>Entries sent</dt><dd>{sent.length}</dd></div>
          {hiddenCount > 0 && <div><dt>Hidden (not sent)</dt><dd>{hiddenCount}</dd></div>}
          <div><dt>Total</dt><dd>{pts(score.total)}{form.totalMinimum !== undefined && ` of ${form.totalMinimum}`}</dd></div>
        </dl>
        {missingFiles > 0 && <div className="evaluation-warning"><Icon name="imgIconAlert2" /><div><p>{missingFiles} {missingFiles === 1 ? 'entry has' : 'entries have'} no attachment</p><small>They can still be submitted, but your coordinator may reject them.</small></div></div>}
        <label className="evaluation-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm that the information I provided is accurate.</label>
      </div>
      <div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setReview(false)}>Go back</Button><Button className="dashboard-button" disabled={!confirmed || busy || nothingToResubmit || sent.length === 0} onClick={() => void submit()}><Icon name="imgIconSend" />{busy ? 'Sending…' : updating ? 'Resubmit' : 'Submit for review'}</Button></div>
    </EvaluationModal>
    <EvaluationModal open={preview} onClose={() => setPreview(false)} wide title="Evaluation preview" description={`${period.name} · ${session?.name ?? ''}`}>
      <div className="evaluation-modal-body evaluation-preview">
        {hiddenCount > 0 && <p className="evaluation-entry-note"><EyeOff aria-hidden="true" className="evaluation-check-icon" />{hiddenCount} hidden {hiddenCount === 1 ? 'entry is' : 'entries are'} left out: {hiddenCount === 1 ? "it isn't" : "they aren't"} sent with your form.</p>}
        {score.scores.map(({ part, raw }) => <section key={part.id}><h2>{[part.numeral, part.name].filter(Boolean).join('. ')} · {pts(raw)}</h2>{part.items.some(record => listOf(record.id).some(isSent)) ? part.items.flatMap(record => listOf(record.id).filter(isSent).map(entry => <div key={entry.id}><p>{record.code ? `${record.code} · ` : ''}{entry.description}</p><small>{[entry.detail, entry.files.length ? entry.files.map(file => file.name).join(', ') : 'No file attached'].filter(Boolean).join(' · ')}</small><Badge status={statusLabels[entry.status]} /></div>)) : <small>No entries yet.</small>}</section>)}
      </div><div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setPreview(false)}>Close preview</Button></div>
    </EvaluationModal>
  </div>}</WorkspaceLayout>
}
