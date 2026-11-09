import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/forms/FormField'
import { EvaluationIcon as Icon, EvaluationModal } from './EvaluationModal'
import { findRecord, type EvaluationEntry, type RecordId } from './evaluation-model'

export function EntryModal({ recordId, entry, onClose, onSave }: {
  recordId: RecordId; entry?: EvaluationEntry; onClose: () => void; onSave: (entry: EvaluationEntry) => void
}) {
  const record = findRecord(recordId)!
  const [description, setDescription] = useState(entry?.description ?? '')
  const [points, setPoints] = useState(entry?.points !== undefined ? String(entry.points) : '')
  const [detail, setDetail] = useState(entry?.detail ?? '')
  const [files, setFiles] = useState(entry?.files ?? [])
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  function addFiles(selected: FileList | null) {
    if (!selected) return
    const next: string[] = []
    const problems: string[] = []
    for (const file of Array.from(selected)) {
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) problems.push('Choose a PDF, JPG or PNG file.')
      else if (file.size > 10 * 1024 * 1024) problems.push('Each file must be 10 MB or smaller.')
      else next.push(file.name)
    }
    setFiles(current => [...new Set([...current, ...next])])
    setError(problems.join(' '))
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const asDraft = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'draft'
    if (!description.trim()) { setError('Description is required.'); return }
    const claimed = Number(points)
    if (record.variablePoints && (points.trim() === '' || !Number.isFinite(claimed) || claimed < 0)) { setError('Enter the points for this entry (0 or more).'); return }
    if (!asDraft && files.length === 0) { setError('Attach an evidence file, or save this entry as a draft.'); return }
    onSave({ id: entry?.id ?? crypto.randomUUID(), description: description.trim(), detail: detail.trim(), files, status: 'Draft', ...(record.variablePoints ? { points: claimed } : {}) })
  }
  const title = record.code ? `${record.code} ${record.name}` : record.name
  const scoring = record.variablePoints ? 'Points stated per entry' : `${record.points} points per approved entry`
  const descriptionHint = record.hint ?? (recordId === 'article' ? 'Full citation with journal, year and DOI.' : 'Describe the activity and include the relevant year and details.')
  return <EvaluationModal open onClose={onClose} wide title={`${entry ? 'Edit' : 'Add'} entry — ${title}`} description={`${scoring} · ${record.georgian}`}>
    <form onSubmit={save}>
      <div className="evaluation-modal-body evaluation-entry-fields">
        <FormField idPrefix="evaluation" field={{ name: 'description', label: record.code ? 'Performance indicator' : 'Description', type: 'textarea', required: true, hint: descriptionHint }} value={description} onChange={setDescription} />
        {record.variablePoints && <FormField idPrefix="evaluation" field={{ name: 'points', label: 'Points for this entry', type: 'text', required: true, hint: record.variablePoints }} value={points} onChange={setPoints} />}
        <FormField idPrefix="evaluation" field={{ name: 'detail', label: recordId === 'article' ? 'DOI' : 'Additional details', type: 'text' }} value={detail} onChange={setDetail} />
        <div className="form-field">
          <label htmlFor="evaluation-evidence">Evidence file *</label>
          <label className={`evaluation-dropzone${dragging ? ' dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}>
            <Icon name="imgIconUpload" /><span>Drag &amp; drop or <span className="text-action">browse</span></span><small>PDF, JPG or PNG · max 10 MB</small>
            <input id="evaluation-evidence" type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={event => { addFiles(event.target.files); event.target.value = '' }} />
          </label>
          {files.map(file => <div className="evaluation-file" key={file}><span className="evaluation-file-icon"><Icon name="imgIconFile2" /></span><div><p>{file}</p><small>Selected locally</small></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file}`} onClick={() => setFiles(files.filter(name => name !== file))}><Icon name="imgIconX" /></Button></div>)}
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="evaluation-entry-note"><Icon name="imgIconInfo" /><p>Entries can be edited until you submit the form. After submission the form is locked.</p></div>
      </div>
      <div className="evaluation-modal-footer"><Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button><Button type="submit" value="draft" variant="outline" className="dashboard-button">Save as draft</Button><Button type="submit" value="save" className="dashboard-button">Save entry</Button></div>
    </form>
  </EvaluationModal>
}
