import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/forms/FormField'
import { EvaluationIcon as Icon, EvaluationModal } from './EvaluationModal'
import { useIdentity } from '@/lib/profile'
import { findDoi } from '@/lib/wos'
import { findRecord, type EvaluationEntry, type RecordId } from './evaluation-model'
import { toWosCheck, useDoiCheck, WosPanel } from './WosCheck'

/** Where a DOI is already used in the form, so the same article isn't counted twice */
export type UsedDoi = { recordId: RecordId; description: string }

export function EntryModal({ recordId, entry, initial, usedDois, onClose, onSave }: {
  recordId: RecordId; entry?: EvaluationEntry
  /** Starting values for a new entry, e.g. from "Missing from your form" */
  initial?: { description: string; detail: string }
  /** DOIs in the other entries of the form */
  usedDois: Map<string, UsedDoi>
  onClose: () => void; onSave: (entry: EvaluationEntry) => void
}) {
  const record = findRecord(recordId)!
  const [description, setDescription] = useState(entry?.description ?? initial?.description ?? '')
  const [points, setPoints] = useState(entry?.points !== undefined ? String(entry.points) : '')
  const [detail, setDetail] = useState(entry?.detail ?? initial?.detail ?? '')
  const [files, setFiles] = useState(entry?.files ?? [])
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const { familyName } = useIdentity()
  // Any entry with a DOI (in the DOI/details field, or pasted into the citation) is checked in Web of Science
  const doi = findDoi(detail) ?? findDoi(description)
  const wos = useDoiCheck(doi)
  const used = doi ? usedDois.get(doi) : undefined
  const sameSection = used?.recordId === recordId
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
    if (sameSection) { setError(`This article is already in this section as “${used?.description}”. An article counts once.`); return }
    const claimed = Number(points)
    if (record.variablePoints && (points.trim() === '' || !Number.isFinite(claimed) || claimed < 0)) { setError('Enter the points for this entry (0 or more).'); return }
    if (!asDraft && files.length === 0) { setError('Attach an evidence file, or save this entry as a draft.'); return }
    // Keep the check that matches the DOI being saved: the fresh one, or the one saved before if it's still running
    const check = wos.check && wos.check.article.doi === doi ? toWosCheck(wos.check) : entry?.wos?.doi === doi ? entry?.wos : undefined
    onSave({ id: entry?.id ?? crypto.randomUUID(), description: description.trim(), detail: detail.trim(), files, status: 'Draft', ...(record.variablePoints ? { points: claimed } : {}), ...(check ? { wos: check } : {}) })
  }
  const title = record.code ? `${record.code} ${record.name}` : record.name
  const scoring = record.variablePoints ? 'Points stated per entry' : `${record.points} points per approved entry`
  const descriptionHint = record.hint ?? (recordId === 'article' ? 'Full citation with journal, year and DOI.' : 'Describe the activity and include the relevant year and details.')
  return <EvaluationModal open onClose={onClose} wide title={`${entry ? 'Edit' : 'Add'} entry - ${title}`} description={`${scoring} · ${record.georgian}`}>
    <form onSubmit={save}>
      <div className="evaluation-modal-body evaluation-entry-fields">
        <FormField idPrefix="evaluation" field={{ name: 'description', label: record.code ? 'Performance indicator' : 'Description', type: 'textarea', required: true, hint: descriptionHint }} value={description} onChange={setDescription} />
        {record.variablePoints && <FormField idPrefix="evaluation" field={{ name: 'points', label: 'Points for this entry', type: 'text', required: true, hint: record.variablePoints }} value={points} onChange={setPoints} />}
        <FormField idPrefix="evaluation" field={{ name: 'detail', label: recordId === 'article' ? 'DOI' : 'Additional details', type: 'text', hint: recordId === 'article' ? 'Checked in Web of Science as you type, e.g. 10.1038/nature14539.' : undefined }} value={detail} onChange={setDetail} />
        <WosPanel doi={doi} checking={wos.checking} check={wos.check} error={wos.error} familyName={familyName}
          onUseCitation={description.trim() ? undefined : setDescription} />
        {used && <p className={sameSection ? 'field-error' : 'evaluation-duplicate'} role="status">
          {sameSection ? `This DOI is already in this section: “${used.description}”. An article counts once.` : `This DOI is also in “${findRecord(used.recordId)?.name ?? 'another item'}”: “${used.description}”. That's fine only if both items count it.`}
        </p>}
        <div className="form-field">
          <label htmlFor="evaluation-evidence">Evidence file *</label>
          <label className={`evaluation-dropzone${dragging ? ' dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}>
            <Icon name="imgIconUpload" /><span>Drag &amp; drop or <span className="text-action">browse</span></span><small>PDF, JPG or PNG · max 10 MB</small>
            <input id="evaluation-evidence" type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={event => { addFiles(event.target.files); event.target.value = '' }} />
          </label>
          {files.map(file => <div className="evaluation-file" key={file}><span className="evaluation-file-icon"><Icon name="imgIconFile2" /></span><div><p>{file}</p><small>Selected locally</small></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file}`} onClick={() => setFiles(files.filter(name => name !== file))}><Icon name="imgIconX" /></Button></div>)}
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="evaluation-entry-note"><Icon name="imgIconInfo" /><p>You can edit entries until you submit. After that, use “Update submission” to add or change entries and resubmit before the deadline.</p></div>
      </div>
      <div className="evaluation-modal-footer"><Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button><Button type="submit" value="draft" variant="outline" className="dashboard-button">Save as draft</Button><Button type="submit" value="save" className="dashboard-button">Save entry</Button></div>
    </form>
  </EvaluationModal>
}
