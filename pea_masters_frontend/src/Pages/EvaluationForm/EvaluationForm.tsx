import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useSession } from '@/lib/auth'
import { useIdentity } from '@/lib/profile'
import { EntryModal } from './EntryModal'
import { EvaluationIcon as Icon, EvaluationModal } from './EvaluationModal'
import { allRecords, draftKey, partScore, readDraft, recordScore, records, type EvaluationEntries, type EvaluationEntry, type EvaluationLinkState, type RecordDef, type RecordId } from './evaluation-model'
import { parts, TOTAL_MINIMUM, type PartId } from './self-assessment'
import '@/components/forms/forms.css'
import './EvaluationForm.css'

type Tab = 'records' | PartId

function Badge({ status }: { status: string }) {
  return <span className={`evaluation-badge evaluation-badge-${status.toLowerCase().replace(' ', '-')}`}><Icon name={status === 'Approved' ? 'imgDot1' : status === 'Rejected' ? 'imgDot2' : status === 'Submitted' || status === 'In review' ? 'imgDot3' : 'imgDot'} />{status}</span>
}

const pts = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} pts`

function RecordCard({ record, entries, submitted, compact, onAdd, onEdit, onDelete }: {
  record: RecordDef; entries: EvaluationEntry[]; submitted: boolean
  /** ISU items: no "No entries yet" row, so a part with ~45 items stays scannable */
  compact?: boolean
  onAdd: () => void; onEdit: (entry: EvaluationEntry) => void; onDelete: (entry: EvaluationEntry) => void
}) {
  const full = record.maxEntries !== undefined && entries.length >= record.maxEntries
  const rate = record.variablePoints ? 'Points per entry' : `${pts(record.points)} per entry`
  const limit = record.maxPoints !== undefined ? ` · max ${pts(record.maxPoints)}` : ''
  return <section className={`evaluation-record${compact && !entries.length ? ' evaluation-record-empty' : ''}`} aria-labelledby={`record-${record.id}`}>
    <div className="evaluation-record-header">
      <span className="evaluation-record-icon"><Icon name={record.icon} /></span>
      <div className="evaluation-record-title"><h2 id={`record-${record.id}`}>{record.code && <span className="evaluation-record-code">{record.code}</span>}{record.name}</h2><small lang="ka">{record.georgian}</small></div>
      <div className="evaluation-subtotal"><p>{record.code ? `${rate}${limit}` : `${record.points} pts per entry · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}</p><strong>Subtotal: {record.code ? pts(recordScore(record, entries)) : `${record.points * entries.length} pts`}</strong></div>
      {!submitted && <Button variant="outline" className="evaluation-add" disabled={full} title={full ? `This item counts at most ${record.maxEntries} entries` : undefined} onClick={onAdd}><Icon name="imgIconPlus" />Add entry</Button>}
    </div>
    {entries.map((entry, index) => <div className="evaluation-entry" key={entry.id}><div className="evaluation-entry-row"><span className="evaluation-entry-number">{index + 1}</span><div className="evaluation-entry-description"><p>{entry.description}</p><small>{[entry.detail, record.variablePoints && entry.points !== undefined ? pts(entry.points) : ''].filter(Boolean).join(' · ')}</small></div><div className="evaluation-attachment">{entry.files.length ? <><Icon name="imgIconClip" /><span title={entry.files.join(', ')}>{entry.files[0]}{entry.files.length > 1 && ` +${entry.files.length - 1}`}</span></> : <span className="evaluation-no-file">No file attached</span>}</div><div className="evaluation-status"><Badge status={submitted && entry.status === 'Draft' ? 'Submitted' : entry.status} /></div><div className="evaluation-entry-actions">{submitted ? <Icon name="imgIconLock" /> : <><Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${entry.description}`} onClick={() => onEdit(entry)}><Icon name="imgIconEdit" /></Button><Button variant="outline" size="icon" className="icon-button danger" aria-label={`Delete ${entry.description}`} onClick={() => onDelete(entry)}><Icon name="imgIconTrash" /></Button></>}</div></div>{entry.status === 'Rejected' && entry.comment && <p className="evaluation-rejection"><Icon name="imgIconAlert1" />{entry.comment}</p>}</div>)}
    {entries.length === 0 && !compact && <div className="evaluation-empty">No entries yet.{!submitted && <button className="text-action" onClick={onAdd}>Add your first entry</button>}</div>}
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
  // Other pages can link straight to one entry (e.g. the dashboard's "Fix"): open its tab and its edit dialog
  const location = useLocation()
  const navigate = useNavigate()
  const [linked] = useState(() => {
    const target = (location.state as EvaluationLinkState | null)?.edit
    const entry = target && entries[target.recordId]?.find(item => item.id === target.entryId)
    return target && entry ? { recordId: target.recordId, entry } : null
  })
  const [tab, setTab] = useState<Tab>(() => parts.find(part => part.items.some(item => item.id === linked?.recordId))?.id ?? 'records')
  const [editing, setEditing] = useState<{ recordId: RecordId; entry?: EvaluationEntry } | null>(linked)
  const linkHandled = useRef(false)
  useEffect(() => {
    if (linkHandled.current || !location.state) return
    linkHandled.current = true
    // Show the entry behind the dialog, then drop the link state so a reload doesn't reopen the dialog
    if (linked) document.getElementById(`record-${linked.recordId}`)?.scrollIntoView({ block: 'center' })
    navigate(location.pathname, { replace: true, state: null })
  }, [linked, location.pathname, location.state, navigate])
  const [deleting, setDeleting] = useState<{ recordId: RecordId; entry: EvaluationEntry } | null>(null)
  const [preview, setPreview] = useState(false)
  const [review, setReview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [daysLeft] = useState(() => Math.max(0, Math.ceil((new Date('2026-11-30T23:59:59+04:00').getTime() - Date.now()) / 86400000)))
  const listOf = (id: RecordId) => entries[id] ?? []
  const allEntries = Object.values(entries).flat()
  const missingFiles = allEntries.filter(entry => !entry.files.length).length
  const rejected = allEntries.filter(entry => entry.status === 'Rejected').length
  const requiredComplete = records.filter(record => record.required).every(record => listOf(record.id).length > 0)
  // Local preview estimate. The backend will provide the authoritative score and available points.
  const score = records.reduce((total, record) => total + listOf(record.id).filter(entry => entry.status !== 'Rejected').length * record.points, 0)
  const isu = selfAssessment(entries)
  const isuShortfalls = isu.scores.filter(({ part, counted }) => part.min !== undefined && counted < part.min)
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
  function saveEntry(entry: EvaluationEntry) {
    if (!editing) return
    const { recordId } = editing
    setEntries(current => ({ ...current, [recordId]: editing.entry ? (current[recordId] ?? []).map(item => item.id === entry.id ? entry : item) : [...(current[recordId] ?? []), entry] }))
    setDirty(true); setNotice(''); setEditing(null)
  }
  const card = (record: RecordDef, compact = false) => <RecordCard key={record.id} record={record} entries={listOf(record.id)} submitted={submitted} compact={compact}
    onAdd={() => setEditing({ recordId: record.id })} onEdit={entry => setEditing({ recordId: record.id, entry })} onDelete={entry => setDeleting({ recordId: record.id, entry })} />
  const activePart = parts.find(part => part.id === tab)
  const activeScore = isu.scores.find(score => score.part.id === tab)
  const tabs: { id: Tab; label: string }[] = [{ id: 'records', label: 'Scored records' }, ...parts.map(part => ({ id: part.id, label: `${part.numeral} · ${part.name}` }))]

  return <WorkspaceLayout breadcrumb={[{ label: 'Evaluation form' }]}>{() => <div className="dashboard-content evaluation-page">
    <div className="page-heading"><div><h1>Evaluation form</h1><p>{['Annual evaluation 2025-2026', identity.faculty].filter(Boolean).join(' · ')}</p></div><div className="evaluation-actions"><Badge status={submitted ? 'Submitted' : 'Draft'} />{!submitted && <Button variant="outline" className="dashboard-button" onClick={saveDraft}><Icon name="imgIconSave" />Save draft</Button>}<Button variant="outline" className="dashboard-button" onClick={() => setPreview(true)}><Icon name="imgIconEye" />Preview</Button></div></div>
    {notice && <p className="evaluation-notice" role="status">{notice}</p>}
    {submitted ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconLock" /><div><p>Form submitted - editing is locked</p><small>This is a local UI preview. No information has been sent to an admin.</small></div></div> : rejected > 0 && <div className="evaluation-banner"><Icon name="imgIconAlert" /><div><p>{rejected} {rejected === 1 ? 'entry was' : 'entries were'} rejected</p><small>Annual evaluation 2025-2026 · Article #2: fix the file and resubmit. You will also receive an email for every rejection.</small></div></div>}
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
        <section className="dashboard-card"><h2>Your score</h2><div className="evaluation-score"><strong>{score}</strong><span>/ 128 pts available</span></div><progress value={score} max={128} aria-label="Provisional score" /><small>Only approved entries count towards your final score. Provisional score includes submitted entries.</small></section>
        <section className="dashboard-card"><h2>ISU self-assessment</h2>
          <dl className="evaluation-parts">{isu.scores.map(({ part, raw, counted }) => {
            const ok = part.min === undefined || counted >= part.min
            return <div key={part.id}><dt><button type="button" className="text-action" onClick={() => setTab(part.id)}>{part.numeral}. {part.name}</button></dt><dd><span className={ok ? undefined : 'evaluation-short'}>{pts(part.cap !== undefined ? counted : raw)}</span><small>{part.min !== undefined ? `min ${part.min}` : `max ${part.cap}`}</small></dd></div>
          })}<div className="evaluation-parts-total"><dt>Total</dt><dd><span className={isu.total >= TOTAL_MINIMUM ? undefined : 'evaluation-short'}>{pts(isu.total)}</span><small>min {TOTAL_MINIMUM}</small></dd></div></dl>
          <progress value={Math.min(isu.total, TOTAL_MINIMUM)} max={TOTAL_MINIMUM} aria-label="Self-assessment total towards the 200-point minimum" />
          <small>Two academic years: at least {TOTAL_MINIMUM} points in total, with at least 80 in teaching and 60 in research. Social impact counts up to 20.</small>
        </section>
        <section className="dashboard-card">{submitted ? <><h2>Review status</h2><div className="evaluation-check"><span>Status</span><Badge status="In review" /></div><small>Local preview · awaiting backend integration</small><Button variant="outline" className="dashboard-button" onClick={() => { setSubmitted(false); setNotice('Returned to the local draft.'); }}>Return to draft</Button></> : <><h2>Before you submit</h2><p className="evaluation-check"><Icon name={requiredComplete ? 'imgIconCheck' : 'imgIconAlert2'} />{requiredComplete ? 'All required records have at least one entry' : 'Add an article and a conference presentation'}</p>{isuShortfalls.map(({ part, counted }) => <p className="evaluation-check" key={part.id}><Icon name="imgIconAlert2" />{part.name}: {pts(counted)} of the required {part.min}</p>)}{isu.total < TOTAL_MINIMUM && <p className="evaluation-check"><Icon name="imgIconAlert2" />Self-assessment total: {pts(isu.total)} of the required {TOTAL_MINIMUM}</p>}{missingFiles > 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />{missingFiles} {missingFiles === 1 ? 'entry has' : 'entries have'} no attachment</p>}{rejected > 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />{rejected} {rejected === 1 ? 'entry was rejected and needs' : 'entries were rejected and need'} a fix</p>}<hr /><Button className="dashboard-button" onClick={() => { setConfirmed(false); setReview(true) }}><Icon name="imgIconSend" />Review &amp; submit</Button><Button variant="outline" className="dashboard-button" onClick={saveDraft}>Save draft</Button></>}</section>
        <section className="dashboard-card"><h2>Deadline</h2><div className="evaluation-deadline"><span><Icon name="imgIconClock" /></span><div><p>30 Nov 2026</p><small>{daysLeft} days left · set by your admin</small></div></div><small className="evaluation-check"><Icon name="imgIconMail" />Reminder emails are sent if the form is still a draft.</small></section>
      </aside>
    </div>
    {editing && <EntryModal recordId={editing.recordId} entry={editing.entry} onClose={() => setEditing(null)} onSave={saveEntry} />}
    <EvaluationModal open={review} onClose={() => setReview(false)} title="Submit evaluation for review?" description="The form will be locked and sent to your faculty admin.">
      <div className="evaluation-modal-body"><dl className="evaluation-review-stats"><div><dt>Records with entries</dt><dd>{allRecords.filter(record => listOf(record.id).length).length} of {allRecords.length}</dd></div><div><dt>Total entries</dt><dd>{allEntries.length}</dd></div><div><dt>Provisional score</dt><dd>{score} pts</dd></div><div><dt>Self-assessment total</dt><dd>{pts(isu.total)} of {TOTAL_MINIMUM}</dd></div></dl>{missingFiles > 0 && <div className="evaluation-warning"><Icon name="imgIconAlert2" /><div><p>{missingFiles} entries have no attachment</p><small>They can still be submitted, but the admin may reject them.</small></div></div>}<label className="evaluation-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm that the information I provided is accurate.</label><small className="evaluation-demo-note">UI preview only. This will not send data to an admin.</small></div>
      <div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setReview(false)}>Go back</Button><Button className="dashboard-button" disabled={!confirmed || !requiredComplete} onClick={() => { setSubmitted(true); setDirty(false); setReview(false); setNotice('Submission preview - no data was sent.'); }}><Icon name="imgIconSend" />Submit for review</Button></div>
    </EvaluationModal>
    <EvaluationModal open={preview} onClose={() => setPreview(false)} wide title="Evaluation preview" description={`Annual evaluation 2025-2026 · ${session?.name ?? ""}`}>
      <div className="evaluation-modal-body evaluation-preview">
        {records.map(record => <section key={record.id}><h2>{record.name}</h2>{listOf(record.id).length ? listOf(record.id).map(entry => <div key={entry.id}><p>{entry.description}</p><small>{entry.detail} · {entry.files.length ? entry.files.join(', ') : 'No file attached'}</small><Badge status={entry.status} /></div>) : <small>No entries yet.</small>}</section>)}
        {isu.scores.map(({ part, raw }) => <section key={part.id}><h2>{part.numeral}. {part.name} · {pts(raw)}</h2>{part.items.some(record => listOf(record.id).length) ? part.items.flatMap(record => listOf(record.id).map(entry => <div key={entry.id}><p>{record.code} · {entry.description}</p><small>{[entry.detail, entry.files.length ? entry.files.join(', ') : 'No file attached'].filter(Boolean).join(' · ')}</small><Badge status={entry.status} /></div>)) : <small>No entries yet.</small>}</section>)}
      </div><div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setPreview(false)}>Close preview</Button></div>
    </EvaluationModal>
    <EvaluationModal open={!!deleting} onClose={() => setDeleting(null)} title="Delete entry?" description="This will remove the entry from your local draft."><div className="evaluation-modal-body"><p>{deleting?.entry.description}</p></div><div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" className="dashboard-button" onClick={() => { if (deleting) { setEntries(current => ({ ...current, [deleting.recordId]: (current[deleting.recordId] ?? []).filter(entry => entry.id !== deleting.entry.id) })); setDirty(true); setNotice(''); setDeleting(null) } }}>Delete entry</Button></div></EvaluationModal>
  </div>}</WorkspaceLayout>
}
