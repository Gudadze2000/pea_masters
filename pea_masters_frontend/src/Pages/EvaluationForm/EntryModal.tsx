import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/forms/FormField'
import { ApiError } from '@/lib/api'
import type { EntryInput } from '@/lib/evaluations'
import { outputCitation, type ResearchOutput } from '@/lib/research-outputs'
import { entriesApi, type ServerDocument } from '@/lib/profile-entries'
import { useIdentity } from '@/lib/profile'
import { findDoi } from '@/lib/wos'
import { EvaluationIcon as Icon, EvaluationModal } from './EvaluationModal'
import type { EvaluationEntry, RecordDef } from './evaluation-model'
import { toWosCheck, useDoiCheck, WosPanel } from './WosCheck'

/** Where a DOI is already used in the form, so the same article isn't counted twice */
export type UsedDoi = { recordId: string; description: string }

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024

const label = (record: RecordDef) => (record.code ? `${record.code} ${record.name}` : record.name)

/**
 * Adds or edits one entry. Evidence files upload as soon as they're chosen; the entry itself is saved on the server
 * when the dialog is saved (onSave returns the server's error message, if any, and the dialog stays open).
 */
export function EntryModal({ record: startRecord, entry, initial, itemChoices, profileOutputs, usedDois, recordName, onClose, onSave }: {
  record: RecordDef; entry?: EvaluationEntry
  /** Starting values for a new entry, e.g. from "Missing from your form" */
  initial?: { description: string; detail: string }
  /** Lets the person choose which item the entry belongs to (a new entry from "Missing from your form") */
  itemChoices?: RecordDef[]
  /** Research outputs on My profile not in the form yet: a new entry can be filled in from one */
  profileOutputs?: ResearchOutput[]
  /** DOIs in the other entries of the form */
  usedDois: Map<string, UsedDoi>
  recordName: (id: string) => string
  onClose: () => void; onSave: (input: EntryInput) => Promise<string | null>
}) {
  const [record, setRecord] = useState(startRecord)
  const [description, setDescription] = useState(entry?.description ?? initial?.description ?? '')
  const [points, setPoints] = useState(entry?.points !== null && entry?.points !== undefined ? String(entry.points) : '')
  const [detail, setDetail] = useState(entry?.detail ?? initial?.detail ?? '')
  const [files, setFiles] = useState<ServerDocument[]>(entry?.files ?? [])
  const [uploading, setUploading] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const { familyName } = useIdentity()
  // Any entry with a DOI (in the DOI/details field, or pasted into the description) is checked in Web of Science
  const doi = findDoi(detail) ?? findDoi(description)
  const wos = useDoiCheck(doi)
  const used = doi ? usedDois.get(doi) : undefined
  const sameItem = used?.recordId === record.id

  async function addFiles(selected: FileList | null) {
    if (!selected) return
    const problems: string[] = []
    const chosen = Array.from(selected).filter(file => {
      if (!ACCEPTED.includes(file.type)) problems.push(`${file.name}: choose a PDF, JPG or PNG file.`)
      else if (file.size > MAX_BYTES) problems.push(`${file.name}: files must be 10 MB or smaller.`)
      else return true
      return false
    })
    setError(problems.join(' '))
    setUploading(count => count + chosen.length)
    await Promise.all(chosen.map(async file => {
      try {
        const uploaded = await entriesApi.uploadDocument(file)
        setFiles(current => [...current, uploaded])
      } catch (cause) {
        setError(current => [current, `${file.name}: ${cause instanceof ApiError ? cause.message : "couldn't be uploaded."}`].filter(Boolean).join(' '))
      } finally {
        setUploading(count => count - 1)
      }
    }))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || uploading) return
    const withoutEvidence = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'draft'
    if (!description.trim()) { setError('Description is required.'); return }
    if (sameItem) { setError(`This article is already in this item as “${used?.description}”. An article counts once.`); return }
    const claimed = Number(points)
    if (record.variablePoints && (points.trim() === '' || !Number.isFinite(claimed) || claimed < 0)) { setError('Enter the points for this entry (0 or more).'); return }
    if (!withoutEvidence && files.length === 0) { setError('Attach an evidence file, or save this entry as a draft.'); return }
    // Keep the check that matches the DOI being saved: the fresh one, or the one saved before if it's still running
    const check = wos.check && wos.check.article.doi === doi ? toWosCheck(wos.check) : entry?.wos?.doi === doi ? entry?.wos ?? null : null
    setSaving(true)
    setError('')
    const failure = await onSave({
      item_id: record.id, description: description.trim(), detail: detail.trim(),
      points: record.variablePoints ? claimed : null, wos: check, file_ids: files.map(file => file.id),
    })
    if (failure) { setError(failure); setSaving(false) }
  }

  const scoring = record.variablePoints ? 'Points stated per entry' : `${record.points} points per approved entry`
  return <EvaluationModal open onClose={onClose} wide title={`${entry ? 'Edit' : 'Add'} entry - ${label(record)}`} description={[scoring, record.georgian].filter(Boolean).join(' · ')}>
    <form onSubmit={save} aria-busy={saving}>
      <div className="evaluation-modal-body evaluation-entry-fields">
        {itemChoices && itemChoices.length > 1 && (
          <div className="form-field">
            <label htmlFor="evaluation-item">Form item</label>
            <select id="evaluation-item" className="form-control" value={record.id} onChange={event => setRecord(itemChoices.find(item => item.id === event.target.value) ?? record)}>
              {itemChoices.map(item => <option key={item.id} value={item.id}>{label(item)}</option>)}
            </select>
            <p className="field-hint">Which item of the form this article counts for.</p>
          </div>
        )}
        {profileOutputs && profileOutputs.length > 0 && (
          <div className="form-field">
            <label htmlFor="evaluation-from-profile">Fill in from my profile</label>
            <select id="evaluation-from-profile" className="form-control" defaultValue="" onChange={event => {
              const output = profileOutputs.find(item => item.id === event.target.value)
              if (output) { setDescription(outputCitation(output)); setDetail(output.doi || output.url) }
            }}>
              <option value="" disabled>Choose one of your research outputs…</option>
              {profileOutputs.map(output => <option key={output.id} value={output.id}>{output.title}{output.year ? ` (${output.year})` : ''}</option>)}
            </select>
            <p className="field-hint">From My profile → Research outputs. You can still change the text below.</p>
          </div>
        )}
        <FormField idPrefix="evaluation" field={{ name: 'description', label: record.code ? 'Performance indicator' : 'Description', type: 'textarea', required: true, hint: record.hint ?? 'Describe the activity and include the relevant year and details.' }} value={description} onChange={setDescription} />
        {record.variablePoints && <FormField idPrefix="evaluation" field={{ name: 'points', label: 'Points for this entry', type: 'text', required: true, hint: record.variablePoints }} value={points} onChange={setPoints} />}
        <FormField idPrefix="evaluation" field={{ name: 'detail', label: 'DOI or other details', type: 'text', hint: 'A DOI is checked in Web of Science as you type, e.g. 10.1038/nature14539.' }} value={detail} onChange={setDetail} />
        <WosPanel doi={doi} checking={wos.checking} check={wos.check} error={wos.error} familyName={familyName}
          onUseCitation={description.trim() ? undefined : setDescription} />
        {used && <p className={sameItem ? 'field-error' : 'evaluation-duplicate'} role="status">
          {sameItem ? `This DOI is already in this item: “${used.description}”. An article counts once.` : `This DOI is also in “${recordName(used.recordId)}”: “${used.description}”. That's fine only if both items count it.`}
        </p>}
        <div className="form-field">
          <label htmlFor="evaluation-evidence">Evidence file *</label>
          <label className={`evaluation-dropzone${dragging ? ' dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files) }}>
            <Icon name="imgIconUpload" /><span>Drag &amp; drop or <span className="text-action">browse</span></span><small>PDF, JPG or PNG · max 10 MB</small>
            <input id="evaluation-evidence" type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={event => { void addFiles(event.target.files); event.target.value = '' }} />
          </label>
          {files.map(file => <div className="evaluation-file" key={file.id}><span className="evaluation-file-icon"><Icon name="imgIconFile2" /></span><div><p><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a></p><small>{Math.max(1, Math.round(file.size / 1024))} KB · uploaded</small></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter(other => other.id !== file.id))}><Icon name="imgIconX" /></Button></div>)}
          {uploading > 0 && <p className="evaluation-uploading" role="status"><LoaderCircle className="wos-spin" aria-hidden="true" />Uploading {uploading === 1 ? 'a file' : `${uploading} files`}…</p>}
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="evaluation-entry-note"><Icon name="imgIconInfo" /><p>Entries are saved as you save them here, and you can change them until you submit. After that, use “Update submission” to add or change entries and resubmit before the deadline.</p></div>
      </div>
      <div className="evaluation-modal-footer">
        <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
        <Button type="submit" value="draft" variant="outline" className="dashboard-button" disabled={saving || uploading > 0}>Save as draft</Button>
        <Button type="submit" value="save" className="dashboard-button" disabled={saving || uploading > 0}>{saving ? 'Saving…' : 'Save entry'}</Button>
      </div>
    </form>
  </EvaluationModal>
}
