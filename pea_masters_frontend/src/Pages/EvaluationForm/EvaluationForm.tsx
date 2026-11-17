import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useSession } from '@/lib/auth'
import { useIdentity } from '@/lib/profile'
import { ContactCoordinator, type ContactTopic } from './ContactCoordinator'
import { EntryModal } from './EntryModal'
import { EvaluationIcon as Icon, EvaluationModal } from './EvaluationModal'
import {
  allRecords, changesSince, DEADLINE, deadlineLabel, draftKey, isSent, partScore, readDraft, readSubmission, recordScore, records,
  writeSubmission, type EvaluationEntries, type EvaluationEntry, type EvaluationLinkState, type RecordDef, type RecordId, type Submission,
} from './evaluation-model'
import { parts, TOTAL_MINIMUM, type PartId } from './self-assessment'
import '@/components/forms/forms.css'
import './EvaluationForm.css'

type Tab = 'records' | PartId

function Badge({ status }: { status: string }) {
  return <span className={`evaluation-badge evaluation-badge-${status.toLowerCase().replace(' ', '-')}`}><Icon name={status === 'Approved' ? 'imgDot1' : status === 'Rejected' ? 'imgDot2' : status === 'Submitted' || status === 'In review' ? 'imgDot3' : 'imgDot'} />{status}</span>
}

const pts = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} pts`
const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function RecordCard({ record, entries, locked, compact, onAdd, onEdit, onToggleHidden, onAsk }: {
  record: RecordDef; entries: EvaluationEntry[]
  /** Submitted and not being updated, or past the deadline */
  locked: boolean
  /** ISU items: no "No entries yet" row, so a part with ~45 items stays scannable */
  compact?: boolean
  onAdd: () => void; onEdit: (entry: EvaluationEntry) => void; onToggleHidden: (entry: EvaluationEntry) => void; onAsk: (entry: EvaluationEntry) => void
}) {
  const sent = entries.filter(isSent)
  const hiddenCount = entries.length - sent.length
  const full = record.maxEntries !== undefined && sent.length >= record.maxEntries
  const rate = record.variablePoints ? 'Points per entry' : `${pts(record.points)} per entry`
  const limit = record.maxPoints !== undefined ? ` · max ${pts(record.maxPoints)}` : ''
  const counts = `${sent.length} ${sent.length === 1 ? 'entry' : 'entries'}${hiddenCount ? ` · ${hiddenCount} hidden` : ''}`
  return <section className={`evaluation-record${compact && !entries.length ? ' evaluation-record-empty' : ''}`} aria-labelledby={`record-${record.id}`}>
    <div className="evaluation-record-header">
      <span className="evaluation-record-icon"><Icon name={record.icon} /></span>
      <div className="evaluation-record-title"><h2 id={`record-${record.id}`}>{record.code && <span className="evaluation-record-code">{record.code}</span>}{record.name}</h2><small lang="ka">{record.georgian}</small></div>
      <div className="evaluation-subtotal"><p>{record.code ? `${rate}${limit}` : `${record.points} pts per entry · ${counts}`}</p><strong>Subtotal: {record.code ? pts(recordScore(record, entries)) : `${record.points * sent.length} pts`}</strong></div>
      {!locked && <Button variant="outline" className="evaluation-add" disabled={full} title={full ? `This item counts at most ${record.maxEntries} entries` : undefined} onClick={onAdd}><Icon name="imgIconPlus" />Add entry</Button>}
    </div>
    {entries.map((entry, index) => {
      const hidden = !isSent(entry)
      return <div className={`evaluation-entry${hidden ? ' evaluation-entry-hidden' : ''}`} key={entry.id}>
        <div className="evaluation-entry-row">
          <span className="evaluation-entry-number">{index + 1}</span>
          <div className="evaluation-entry-description"><p>{entry.description}</p><small>{hidden ? 'Hidden: not sent with your form' : [entry.detail, record.variablePoints && entry.points !== undefined ? pts(entry.points) : ''].filter(Boolean).join(' · ')}</small></div>
          <div className="evaluation-attachment">{entry.files.length ? <><Icon name="imgIconClip" /><span title={entry.files.join(', ')}>{entry.files[0]}{entry.files.length > 1 && ` +${entry.files.length - 1}`}</span></> : <span className="evaluation-no-file">No file attached</span>}</div>
          <div className="evaluation-status"><Badge status={hidden ? 'Hidden' : entry.status} /></div>
          <div className="evaluation-entry-actions">{locked ? <Icon name="imgIconLock" /> : <>
            {!hidden && <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${entry.description}`} onClick={() => onEdit(entry)}><Icon name="imgIconEdit" /></Button>}
            <Button variant="outline" size="icon" className="icon-button" aria-label={hidden ? `Show ${entry.description} again` : `Hide ${entry.description}`} title={hidden ? 'Show again: send it with your form' : "Hide: don't send it with your form"} onClick={() => onToggleHidden(entry)}>{hidden ? <Eye /> : <EyeOff />}</Button>
          </>}</div>
        </div>
        {!hidden && entry.status === 'Rejected' && entry.comment && <div className="evaluation-rejection"><Icon name="imgIconAlert1" /><p>{entry.comment}</p><button type="button" className="evaluation-ask" onClick={() => onAsk(entry)}><Mail aria-hidden="true" />Ask coordinator</button></div>}
      </div>
    })}
    {entries.length === 0 && !compact && <div className="evaluation-empty">No entries yet.{!locked && <button className="text-action" onClick={onAdd}>Add your first entry</button>}</div>}
  </section>
}

function selfAssessment(entries: EvaluationEntries) {
  const scores = parts.map(part => ({ part, ...partScore(part, entries) }))
  const total = scores.reduce((sum, score) => sum + score.counted, 0)
  return { scores, total }
}

export function EvaluationForm() {
  const session = useSession()
  const identity = useIdentity()
  const [entries, setEntries] = useState(readDraft)
  const [submission, setSubmission] = useState<Submission | null>(readSubmission)
  // Reopened after submitting: picks up again after a reload when the saved draft differs from what was sent
  const [updating, setUpdating] = useState(() => { const sent = readSubmission(); return !!sent && changesSince(sent.entries, readDraft()).any })
  const [closed] = useState(() => Date.now() > DEADLINE.getTime())
  const locked = closed || (!!submission && !updating)
  // Other pages can link straight to one entry (e.g. the dashboard's "Fix"): open its tab and its edit dialog
  const location = useLocation()
  const navigate = useNavigate()
  const [linked] = useState(() => {
    const target = (location.state as EvaluationLinkState | null)?.edit
    const entry = target && entries[target.recordId]?.find(item => item.id === target.entryId)
    return target && entry ? { recordId: target.recordId, entry } : null
  })
  const [tab, setTab] = useState<Tab>(() => parts.find(part => part.items.some(item => item.id === linked?.recordId))?.id ?? 'records')
  const [editing, setEditing] = useState<{ recordId: RecordId; entry?: EvaluationEntry } | null>(locked ? null : linked)
  const linkHandled = useRef(false)
  useEffect(() => {
    if (linkHandled.current || !location.state) return
    linkHandled.current = true
    // Show the entry behind the dialog, then drop the link state so a reload doesn't reopen the dialog
    if (linked) document.getElementById(`record-${linked.recordId}`)?.scrollIntoView({ block: 'center' })
    navigate(location.pathname, { replace: true, state: null })
  }, [linked, location.pathname, location.state, navigate])
  const [contact, setContact] = useState<{ topic?: ContactTopic } | null>(null)
  const [preview, setPreview] = useState(false)
  const [review, setReview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [daysLeft] = useState(() => Math.max(0, Math.ceil((DEADLINE.getTime() - Date.now()) / 86400000)))
  const listOf = (id: RecordId) => entries[id] ?? []
  const sentOf = (id: RecordId) => listOf(id).filter(isSent)
  const allEntries = Object.values(entries).flat()
  const sent = allEntries.filter(isSent)
  const hiddenCount = allEntries.length - sent.length
  const missingFiles = sent.filter(entry => !entry.files.length).length
  const rejected = sent.filter(entry => entry.status === 'Rejected').length
  const requiredComplete = records.filter(record => record.required).every(record => sentOf(record.id).length > 0)
  // Local preview estimate. The backend will provide the authoritative score and available points.
  const score = records.reduce((total, record) => total + sentOf(record.id).filter(entry => entry.status !== 'Rejected').length * record.points, 0)
  const isu = selfAssessment(entries)
  const isuShortfalls = isu.scores.filter(({ part, counted }) => part.min !== undefined && counted < part.min)
  const changes = submission ? changesSince(submission.entries, entries) : null
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function saveDraft() {
    try { localStorage.setItem(draftKey, JSON.stringify(entries)); setDirty(false); setNotice('Draft saved in this browser. Evidence files are not uploaded.') }
    catch { setNotice('Browser storage is unavailable. Your changes remain in this session.') }
  }
  const change = (update: (current: EvaluationEntries) => EvaluationEntries) => { setEntries(update); setDirty(true); setNotice('') }
  function saveEntry(entry: EvaluationEntry) {
    if (!editing) return
    const { recordId } = editing
    change(current => ({ ...current, [recordId]: editing.entry ? (current[recordId] ?? []).map(item => item.id === entry.id ? entry : item) : [...(current[recordId] ?? []), entry] }))
    setEditing(null)
  }
  function toggleHidden(recordId: RecordId, entry: EvaluationEntry) {
    // Showing it again removes the flag, so an entry hidden and shown again counts as unchanged
    const next: EvaluationEntry = { ...entry }
    if (isSent(entry)) next.hidden = true
    else delete next.hidden
    change(current => ({ ...current, [recordId]: (current[recordId] ?? []).map(item => item.id === entry.id ? next : item) }))
    setNotice(isSent(entry) ? `“${entry.description}” is hidden and won't be sent with your form. You can show it again at any time.` : `“${entry.description}” will be sent with your form again.`)
  }
  function submit() {
    const wasUpdate = updating
    // Everything sent and not yet reviewed goes to the coordinator; approved and rejected entries keep their status
    const next = Object.fromEntries(Object.entries(entries).map(([id, list]) => [id, list.map(entry => isSent(entry) && entry.status === 'Draft' ? { ...entry, status: 'Submitted' as const } : entry)]))
    const record: Submission = { at: new Date().toISOString(), entries: next }
    const saved = writeSubmission(record)
    setEntries(next); setSubmission(record); setUpdating(false); setDirty(false); setReview(false)
    setNotice(`${wasUpdate ? 'Resubmitted' : 'Submitted'}${saved ? '' : ' for this session only (browser storage is unavailable)'}. This is a preview: nothing is sent to your coordinator yet. You can update it until ${deadlineLabel}.`)
  }
  function startUpdate() {
    setUpdating(true)
    setNotice(`Your form is open again. Add or change entries, then resubmit before ${deadlineLabel}.`)
  }
  function discardUpdate() {
    if (!submission) return
    setEntries(submission.entries); setUpdating(false); setDirty(false)
    try { localStorage.setItem(draftKey, JSON.stringify(submission.entries)) } catch { /* Storage unavailable */ }
    setNotice(`Changes discarded. Your form is as you submitted it on ${formatWhen(submission.at)}.`)
  }
  const ask = (record: RecordDef, entry: EvaluationEntry) => setContact({ topic: { record: record.code ? `${record.code} ${record.name}` : record.name, entry: entry.description, comment: entry.comment } })
  const card = (record: RecordDef, compact = false) => <RecordCard key={record.id} record={record} entries={listOf(record.id)} locked={locked} compact={compact}
    onAdd={() => setEditing({ recordId: record.id })} onEdit={entry => setEditing({ recordId: record.id, entry })}
    onToggleHidden={entry => toggleHidden(record.id, entry)} onAsk={entry => ask(record, entry)} />
  const activePart = parts.find(part => part.id === tab)
  const activeScore = isu.scores.find(score => score.part.id === tab)
  const tabs: { id: Tab; label: string }[] = [{ id: 'records', label: 'Scored records' }, ...parts.map(part => ({ id: part.id, label: `${part.numeral} · ${part.name}` }))]
  const nothingToResubmit = updating && !changes?.any
  const changeSummary = changes && [
    changes.changed && `${changes.changed} new or changed ${changes.changed === 1 ? 'entry' : 'entries'}`,
    changes.hidden && `${changes.hidden} hidden`,
    changes.shown && `${changes.shown} shown again`,
  ].filter(Boolean).join(' · ')

  return <WorkspaceLayout breadcrumb={[{ label: 'Evaluation form' }]}>{() => <div className="dashboard-content evaluation-page">
    <div className="page-heading"><div><h1>Evaluation form</h1><p>{['Annual evaluation 2025-2026', identity.faculty].filter(Boolean).join(' · ')}</p></div>
      <div className="evaluation-actions">
        <Badge status={submission && !updating ? 'Submitted' : 'Draft'} />
        <Button variant="outline" className="dashboard-button" onClick={() => setContact({})}><Mail aria-hidden="true" />Contact coordinator</Button>
        {!locked && <Button variant="outline" className="dashboard-button" onClick={saveDraft}><Icon name="imgIconSave" />Save draft</Button>}
        <Button variant="outline" className="dashboard-button" onClick={() => setPreview(true)}><Icon name="imgIconEye" />Preview</Button>
      </div>
    </div>
    {notice && <p className="evaluation-notice" role="status">{notice}</p>}
    {closed
      ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconLock" /><div><p>The evaluation period has ended</p><small>{submission ? `You submitted your form on ${formatWhen(submission.at)}.` : "Your form wasn't submitted before the deadline."} Contact your coordinator if something needs to change.</small></div></div>
      : submission && !updating
        ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconLock" /><div><p>Submitted on {formatWhen(submission.at)}</p><small>Got a new article or something to fix? You can update and resubmit your form until {deadlineLabel}. Approved entries stay approved unless you change them.</small></div><Button variant="outline" className="dashboard-button evaluation-banner-action" onClick={startUpdate}><Icon name="imgIconUnlock" />Update submission</Button></div>
        : updating && submission
          ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconUnlock" /><div><p>Updating your submitted form</p><small>Your coordinator keeps seeing the version you sent on {formatWhen(submission.at)} until you resubmit.{changeSummary ? ` Changes so far: ${changeSummary}.` : ''}</small></div><Button variant="outline" className="dashboard-button evaluation-banner-action" onClick={discardUpdate}>Discard changes</Button></div>
          : null}
    {!locked && rejected > 0 && <div className="evaluation-banner"><Icon name="imgIconAlert" /><div><p>{rejected} {rejected === 1 ? 'entry was' : 'entries were'} rejected</p><small>Fix the {rejected === 1 ? 'entry' : 'entries'} and {submission ? 'resubmit' : 'submit'}, or hide {rejected === 1 ? 'it' : 'them'} if you'd rather not send {rejected === 1 ? 'it' : 'them'}. Not sure what's wrong? Use “Ask coordinator” on the entry.</small></div></div>}
    <div className="evaluation-tabs" role="tablist" aria-label="Evaluation sections">
      {tabs.map(item => <button key={item.id} type="button" role="tab" id={`evaluation-tab-${item.id}`} aria-selected={tab === item.id} aria-controls="evaluation-tabpanel" onClick={() => setTab(item.id)}>{item.label}{item.id !== 'records' && <span className="evaluation-tab-score">{pts(isu.scores.find(score => score.part.id === item.id)?.raw ?? 0)}</span>}</button>)}
    </div>
    <div className="evaluation-columns">
      <div className="evaluation-records" id="evaluation-tabpanel" role="tabpanel" aria-labelledby={`evaluation-tab-${tab}`}>
        {activePart && activeScore ? <>
          <div className="evaluation-part-header">
            <div><h2>{activePart.numeral}. {activePart.name} <small lang="ka">{activePart.georgian}</small></h2><p>{activePart.rule}. Add one entry per unit (one article, one semester, one grant…) with its performance indicator and proof.</p></div>
            <div className="evaluation-part-score"><strong>{pts(activeScore.raw)}</strong><span>{activePart.min !== undefined ? `of at least ${activePart.min}` : `${pts(activeScore.counted)} counted (max ${activePart.cap})`}</span></div>
          </div>
          {activePart.items.map(record => card(record, true))}
        </> : records.map(record => card(record))}
      </div>
      <aside className="evaluation-summary" aria-label="Evaluation summary">
        <section className="dashboard-card"><h2>Your score</h2><div className="evaluation-score"><strong>{score}</strong><span>/ 128 pts available</span></div><progress value={score} max={128} aria-label="Provisional score" /><small>Only approved entries count towards your final score. Provisional score includes submitted entries.{hiddenCount > 0 && ` Hidden entries don't count.`}</small></section>
        <section className="dashboard-card"><h2>ISU self-assessment</h2>
          <dl className="evaluation-parts">{isu.scores.map(({ part, raw, counted }) => {
            const ok = part.min === undefined || counted >= part.min
            return <div key={part.id}><dt><button type="button" className="text-action" onClick={() => setTab(part.id)}>{part.numeral}. {part.name}</button></dt><dd><span className={ok ? undefined : 'evaluation-short'}>{pts(part.cap !== undefined ? counted : raw)}</span><small>{part.min !== undefined ? `min ${part.min}` : `max ${part.cap}`}</small></dd></div>
          })}<div className="evaluation-parts-total"><dt>Total</dt><dd><span className={isu.total >= TOTAL_MINIMUM ? undefined : 'evaluation-short'}>{pts(isu.total)}</span><small>min {TOTAL_MINIMUM}</small></dd></div></dl>
          <progress value={Math.min(isu.total, TOTAL_MINIMUM)} max={TOTAL_MINIMUM} aria-label="Self-assessment total towards the 200-point minimum" />
          <small>Two academic years: at least {TOTAL_MINIMUM} points in total, with at least 80 in teaching and 60 in research. Social impact counts up to 20.</small>
        </section>
        <section className="dashboard-card">{locked
          ? <><h2>Review status</h2>
            {submission ? <><div className="evaluation-check"><span>Status</span><Badge status="In review" /></div><small>Submitted on {formatWhen(submission.at)}</small></> : <p className="evaluation-check"><Icon name="imgIconAlert2" />Not submitted</p>}
            {!closed && submission && <><Button variant="outline" className="dashboard-button" onClick={startUpdate}><Icon name="imgIconUnlock" />Update submission</Button><small>Add a new entry or fix one, then resubmit before {deadlineLabel}.</small></>}
          </>
          : <><h2>{updating ? 'Before you resubmit' : 'Before you submit'}</h2>
            <p className="evaluation-check"><Icon name={requiredComplete ? 'imgIconCheck' : 'imgIconAlert2'} />{requiredComplete ? 'All required records have at least one entry' : 'Add an article and a conference presentation'}</p>
            {isuShortfalls.map(({ part, counted }) => <p className="evaluation-check" key={part.id}><Icon name="imgIconAlert2" />{part.name}: {pts(counted)} of the required {part.min}</p>)}
            {isu.total < TOTAL_MINIMUM && <p className="evaluation-check"><Icon name="imgIconAlert2" />Self-assessment total: {pts(isu.total)} of the required {TOTAL_MINIMUM}</p>}
            {missingFiles > 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />{missingFiles} {missingFiles === 1 ? 'entry has' : 'entries have'} no attachment</p>}
            {rejected > 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />{rejected} {rejected === 1 ? 'entry was rejected and needs' : 'entries were rejected and need'} a fix</p>}
            {hiddenCount > 0 && <p className="evaluation-check"><EyeOff aria-hidden="true" className="evaluation-check-icon" />{hiddenCount} hidden {hiddenCount === 1 ? 'entry' : 'entries'} won't be sent</p>}
            <hr />
            <Button className="dashboard-button" disabled={nothingToResubmit} onClick={() => { setConfirmed(false); setReview(true) }}><Icon name="imgIconSend" />{updating ? 'Review & resubmit' : 'Review & submit'}</Button>
            {nothingToResubmit && <small>No changes since you submitted.</small>}
            <Button variant="outline" className="dashboard-button" onClick={saveDraft}>Save draft</Button>
          </>}
        </section>
        <section className="dashboard-card"><h2>Deadline</h2><div className="evaluation-deadline"><span><Icon name="imgIconClock" /></span><div><p>{deadlineLabel}</p><small>{closed ? 'The evaluation period has ended' : `${daysLeft} days left · set by your admin`}</small></div></div><small className="evaluation-check"><Icon name="imgIconMail" />Reminder emails are sent if the form is still a draft.</small><small>Until the deadline you can resubmit as often as you need, e.g. when a new article is published.</small></section>
      </aside>
    </div>
    {editing && <EntryModal recordId={editing.recordId} entry={editing.entry} onClose={() => setEditing(null)} onSave={saveEntry} />}
    {contact && <ContactCoordinator topic={contact.topic} onClose={() => setContact(null)} />}
    <EvaluationModal open={review} onClose={() => setReview(false)}
      title={updating ? 'Resubmit evaluation?' : 'Submit evaluation for review?'}
      description={updating && submission
        ? `This replaces the version you sent on ${formatWhen(submission.at)}. New and changed entries go to review; approved entries you didn't change stay approved.`
        : `Your form goes to your coordinator for review. You can still update and resubmit it until ${deadlineLabel}.`}>
      <div className="evaluation-modal-body">
        <dl className="evaluation-review-stats">
          {updating && changeSummary && <div><dt>Changes</dt><dd>{changeSummary}</dd></div>}
          <div><dt>Records with entries</dt><dd>{allRecords.filter(record => sentOf(record.id).length).length} of {allRecords.length}</dd></div>
          <div><dt>Entries sent</dt><dd>{sent.length}</dd></div>
          {hiddenCount > 0 && <div><dt>Hidden (not sent)</dt><dd>{hiddenCount}</dd></div>}
          <div><dt>Provisional score</dt><dd>{score} pts</dd></div>
          <div><dt>Self-assessment total</dt><dd>{pts(isu.total)} of {TOTAL_MINIMUM}</dd></div>
        </dl>
        {missingFiles > 0 && <div className="evaluation-warning"><Icon name="imgIconAlert2" /><div><p>{missingFiles} {missingFiles === 1 ? 'entry has' : 'entries have'} no attachment</p><small>They can still be submitted, but your coordinator may reject them.</small></div></div>}
        <label className="evaluation-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm that the information I provided is accurate.</label>
        <small className="evaluation-demo-note">Preview: the submission is saved in this browser only and isn't sent to your coordinator yet.</small>
      </div>
      <div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setReview(false)}>Go back</Button><Button className="dashboard-button" disabled={!confirmed || !requiredComplete || nothingToResubmit} onClick={submit}><Icon name="imgIconSend" />{updating ? 'Resubmit' : 'Submit for review'}</Button></div>
    </EvaluationModal>
    <EvaluationModal open={preview} onClose={() => setPreview(false)} wide title="Evaluation preview" description={`Annual evaluation 2025-2026 · ${session?.name ?? ""}`}>
      <div className="evaluation-modal-body evaluation-preview">
        {hiddenCount > 0 && <p className="evaluation-entry-note"><EyeOff aria-hidden="true" className="evaluation-check-icon" />{hiddenCount} hidden {hiddenCount === 1 ? 'entry is' : 'entries are'} left out: {hiddenCount === 1 ? "it isn't" : "they aren't"} sent with your form.</p>}
        {records.map(record => <section key={record.id}><h2>{record.name}</h2>{sentOf(record.id).length ? sentOf(record.id).map(entry => <div key={entry.id}><p>{entry.description}</p><small>{entry.detail} · {entry.files.length ? entry.files.join(', ') : 'No file attached'}</small><Badge status={entry.status} /></div>) : <small>No entries yet.</small>}</section>)}
        {isu.scores.map(({ part, raw }) => <section key={part.id}><h2>{part.numeral}. {part.name} · {pts(raw)}</h2>{part.items.some(record => sentOf(record.id).length) ? part.items.flatMap(record => sentOf(record.id).map(entry => <div key={entry.id}><p>{record.code} · {entry.description}</p><small>{[entry.detail, entry.files.length ? entry.files.join(', ') : 'No file attached'].filter(Boolean).join(' · ')}</small><Badge status={entry.status} /></div>)) : <small>No entries yet.</small>}</section>)}
      </div><div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setPreview(false)}>Close preview</Button></div>
    </EvaluationModal>
  </div>}</WorkspaceLayout>
}
