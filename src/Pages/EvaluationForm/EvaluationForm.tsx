import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { EntryModal } from './EntryModal'
import { EvaluationIcon as Icon, EvaluationModal } from './EvaluationModal'
import { draftKey, readDraft, records, type EvaluationEntry, type RecordId } from './evaluation-model'
import '@/components/forms/forms.css'
import './EvaluationForm.css'

function Badge({ status }: { status: string }) {
  return <span className={`evaluation-badge evaluation-badge-${status.toLowerCase().replace(' ', '-')}`}><Icon name={status === 'Approved' ? 'imgDot1' : status === 'Rejected' ? 'imgDot2' : status === 'Submitted' || status === 'In review' ? 'imgDot3' : 'imgDot'} />{status}</span>
}

export function EvaluationForm() {
  const [entries, setEntries] = useState(readDraft)
  const [editing, setEditing] = useState<{ recordId: RecordId; entry?: EvaluationEntry } | null>(null)
  const [deleting, setDeleting] = useState<{ recordId: RecordId; entry: EvaluationEntry } | null>(null)
  const [preview, setPreview] = useState(false)
  const [review, setReview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [daysLeft] = useState(() => Math.max(0, Math.ceil((new Date('2026-11-30T23:59:59+04:00').getTime() - Date.now()) / 86400000)))
  const allEntries = Object.values(entries).flat()
  const missingFiles = allEntries.filter(entry => !entry.files.length).length
  const rejected = allEntries.filter(entry => entry.status === 'Rejected').length
  const requiredComplete = records.filter(record => record.required).every(record => entries[record.id].length > 0)
  // Local preview estimate. The backend will provide the authoritative score and available points.
  const score = records.reduce((total, record) => total + entries[record.id].filter(entry => entry.status !== 'Rejected').length * record.points, 0)
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
    setEntries(current => ({ ...current, [recordId]: editing.entry ? current[recordId].map(item => item.id === entry.id ? entry : item) : [...current[recordId], entry] }))
    setDirty(true); setNotice(''); setEditing(null)
  }
  return <WorkspaceLayout breadcrumb={[{ label: 'Evaluation form' }]}>{() => <div className="dashboard-content evaluation-page">
    <div className="page-heading"><div><h1>Evaluation form</h1><p>Annual evaluation 2025–2026 · Faculty of Natural Sciences and Medicine</p></div><div className="evaluation-actions"><Badge status={submitted ? 'Submitted' : 'Draft'} />{!submitted && <Button variant="outline" className="dashboard-button" onClick={saveDraft}><Icon name="imgIconSave" />Save draft</Button>}<Button variant="outline" className="dashboard-button" onClick={() => setPreview(true)}><Icon name="imgIconEye" />Preview</Button></div></div>
    {notice && <p className="evaluation-notice" role="status">{notice}</p>}
    {submitted ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconLock" /><div><p>Form submitted — editing is locked</p><small>This is a local UI preview. No information has been sent to an admin.</small></div></div> : rejected > 0 && <div className="evaluation-banner"><Icon name="imgIconAlert" /><div><p>{rejected} {rejected === 1 ? 'entry was' : 'entries were'} rejected</p><small>Annual evaluation 2025–2026 · Article #2: fix the file and resubmit. You will also receive an email for every rejection.</small></div></div>}
    <div className="evaluation-columns">
      <div className="evaluation-records">{records.map(record => <section className="evaluation-record" key={record.id} aria-labelledby={`record-${record.id}`}>
        <div className="evaluation-record-header"><span className="evaluation-record-icon"><Icon name={record.icon} /></span><div className="evaluation-record-title"><h2 id={`record-${record.id}`}>{record.name}</h2><small lang="ka">{record.georgian}</small></div><div className="evaluation-subtotal"><p>{record.points} pts per entry · {entries[record.id].length} {entries[record.id].length === 1 ? 'entry' : 'entries'}</p><strong>Subtotal: {record.points * entries[record.id].length} pts</strong></div>{!submitted && <Button variant="outline" className="evaluation-add" onClick={() => setEditing({ recordId: record.id })}><Icon name="imgIconPlus" />Add entry</Button>}</div>
        {entries[record.id].map((entry, index) => <div className="evaluation-entry" key={entry.id}><div className="evaluation-entry-row"><span className="evaluation-entry-number">{index + 1}</span><div className="evaluation-entry-description"><p>{entry.description}</p><small>{entry.detail}</small></div><div className="evaluation-attachment">{entry.files.length ? <><Icon name="imgIconClip" /><span title={entry.files.join(', ')}>{entry.files[0]}{entry.files.length > 1 && ` +${entry.files.length - 1}`}</span></> : <span className="evaluation-no-file">No file attached</span>}</div><div className="evaluation-status"><Badge status={submitted && entry.status === 'Draft' ? 'Submitted' : entry.status} /></div><div className="evaluation-entry-actions">{submitted ? <Icon name="imgIconLock" /> : <><Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${entry.description}`} onClick={() => setEditing({ recordId: record.id, entry })}><Icon name="imgIconEdit" /></Button><Button variant="outline" size="icon" className="icon-button danger" aria-label={`Delete ${entry.description}`} onClick={() => setDeleting({ recordId: record.id, entry })}><Icon name="imgIconTrash" /></Button></>}</div></div>{entry.status === 'Rejected' && entry.comment && <p className="evaluation-rejection"><Icon name="imgIconAlert1" />{entry.comment}</p>}</div>)}
        {entries[record.id].length === 0 && <div className="evaluation-empty">No entries yet.{!submitted && <button className="text-action" onClick={() => setEditing({ recordId: record.id })}>Add your first entry</button>}</div>}
      </section>)}</div>
      <aside className="evaluation-summary" aria-label="Evaluation summary">
        <section className="dashboard-card"><h2>Your score</h2><div className="evaluation-score"><strong>{score}</strong><span>/ 128 pts available</span></div><progress value={score} max={128} aria-label="Provisional score" /><small>Only approved entries count towards your final score. Provisional score includes submitted entries.</small></section>
        <section className="dashboard-card">{submitted ? <><h2>Review status</h2><div className="evaluation-check"><span>Status</span><Badge status="In review" /></div><small>Local preview · awaiting backend integration</small><Button variant="outline" className="dashboard-button" onClick={() => { setSubmitted(false); setNotice('Returned to the local draft.'); }}>Return to draft</Button></> : <><h2>Before you submit</h2><p className="evaluation-check"><Icon name={requiredComplete ? 'imgIconCheck' : 'imgIconAlert2'} />{requiredComplete ? 'All required records have at least one entry' : 'Add an article and a conference presentation'}</p>{missingFiles > 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />{missingFiles} {missingFiles === 1 ? 'entry has' : 'entries have'} no attachment</p>}{rejected > 0 && <p className="evaluation-check"><Icon name="imgIconAlert2" />{rejected} {rejected === 1 ? 'entry was rejected and needs' : 'entries were rejected and need'} a fix</p>}<hr /><Button className="dashboard-button" onClick={() => { setConfirmed(false); setReview(true) }}><Icon name="imgIconSend" />Review &amp; submit</Button><Button variant="outline" className="dashboard-button" onClick={saveDraft}>Save draft</Button></>}</section>
        <section className="dashboard-card"><h2>Deadline</h2><div className="evaluation-deadline"><span><Icon name="imgIconClock" /></span><div><p>30 Nov 2026</p><small>{daysLeft} days left · set by your admin</small></div></div><small className="evaluation-check"><Icon name="imgIconMail" />Reminder emails are sent if the form is still a draft.</small></section>
      </aside>
    </div>
    {editing && <EntryModal recordId={editing.recordId} entry={editing.entry} onClose={() => setEditing(null)} onSave={saveEntry} />}
    <EvaluationModal open={review} onClose={() => setReview(false)} title="Submit evaluation for review?" description="The form will be locked and sent to your faculty admin.">
      <div className="evaluation-modal-body"><dl className="evaluation-review-stats"><div><dt>Records with entries</dt><dd>{records.filter(record => entries[record.id].length).length} of {records.length}</dd></div><div><dt>Total entries</dt><dd>{allEntries.length}</dd></div><div><dt>Provisional score</dt><dd>{score} pts</dd></div></dl>{missingFiles > 0 && <div className="evaluation-warning"><Icon name="imgIconAlert2" /><div><p>{missingFiles} entries have no attachment</p><small>They can still be submitted, but the admin may reject them.</small></div></div>}<label className="evaluation-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm that the information I provided is accurate.</label><small className="evaluation-demo-note">UI preview only. This will not send data to an admin.</small></div>
      <div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setReview(false)}>Go back</Button><Button className="dashboard-button" disabled={!confirmed || !requiredComplete} onClick={() => { setSubmitted(true); setDirty(false); setReview(false); setNotice('Submission preview — no data was sent.'); }}><Icon name="imgIconSend" />Submit for review</Button></div>
    </EvaluationModal>
    <EvaluationModal open={preview} onClose={() => setPreview(false)} wide title="Evaluation preview" description="Annual evaluation 2025–2026 · Nino Beridze">
      <div className="evaluation-modal-body evaluation-preview">{records.map(record => <section key={record.id}><h2>{record.name}</h2>{entries[record.id].length ? entries[record.id].map(entry => <div key={entry.id}><p>{entry.description}</p><small>{entry.detail} · {entry.files.length ? entry.files.join(', ') : 'No file attached'}</small><Badge status={entry.status} /></div>) : <small>No entries yet.</small>}</section>)}</div><div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setPreview(false)}>Close preview</Button></div>
    </EvaluationModal>
    <EvaluationModal open={!!deleting} onClose={() => setDeleting(null)} title="Delete entry?" description="This will remove the entry from your local draft."><div className="evaluation-modal-body"><p>{deleting?.entry.description}</p></div><div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" className="dashboard-button" onClick={() => { if (deleting) { setEntries(current => ({ ...current, [deleting.recordId]: current[deleting.recordId].filter(entry => entry.id !== deleting.entry.id) })); setDirty(true); setNotice(''); setDeleting(null) } }}>Delete entry</Button></div></EvaluationModal>
  </div>}</WorkspaceLayout>
}
