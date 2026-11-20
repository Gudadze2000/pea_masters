import { useRef, useState, type DragEvent } from "react"
import { Check, FileText, Image as ImageIcon, LoaderCircle, Upload, X } from "lucide-react"
import { ApiError } from "@/lib/api"
import { entriesApi } from "@/lib/profile-entries"
import { formatFileSize, type EntryDocument } from "./sections"

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"]
const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 5

type Props = {
  label: string
  documents: EntryDocument[]
  onChange: (documents: EntryDocument[]) => void
  /** Uploads in progress, so the form can wait before saving */
  onBusyChange?: (busy: boolean) => void
}

/**
 * Supporting documents: each file is uploaded as soon as it's chosen (PDF, JPG or PNG, up to 10 MB) and attached to
 * the entry when the entry is saved. Only the owner, their organization's Admins and their Coordinator can
 * open them.
 */
export function DocumentUpload({ label, documents, onChange, onBusyChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string[]>([])
  // The latest list, so uploads that finish one after another all land in it
  const latest = useRef(documents)
  latest.current = documents

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const chosen: File[] = []
    const problems: string[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type)) problems.push(`${file.name}: use a PDF, JPG or PNG file.`)
      else if (file.size > MAX_BYTES) problems.push(`${file.name}: larger than 10 MB.`)
      else chosen.push(file)
    }
    const room = MAX_FILES - documents.length - uploading.length
    if (chosen.length > room) problems.push(`You can attach up to ${MAX_FILES} files.`)
    const batch = chosen.slice(0, Math.max(0, room))
    setError(problems.length ? problems.join(" ") : null)
    if (!batch.length) return

    setUploading(current => [...current, ...batch.map(file => file.name)])
    onBusyChange?.(true)
    for (const file of batch) {
      try {
        const uploaded = await entriesApi.uploadDocument(file)
        onChange([...latest.current, uploaded])
      } catch (cause) {
        problems.push(`${file.name}: ${cause instanceof ApiError ? cause.message : "couldn't be uploaded."}`)
        setError(problems.join(" "))
      } finally {
        setUploading(current => { const next = [...current]; next.splice(next.indexOf(file.name), 1); return next })
      }
    }
    onBusyChange?.(false)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    void addFiles(event.dataTransfer.files)
  }

  return (
    <div className="document-upload">
      <button
        type="button"
        className={`dropzone${dragging ? " dragging" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={event => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Upload aria-hidden="true" />
        <span className="dropzone-title">{label}</span>
        <span className="dropzone-hint">PDF, JPG or PNG · max 10 MB</span>
      </button>
      <input ref={input} type="file" accept={ACCEPTED.join(",")} multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = "" }} />
      {error && <p className="field-error" role="alert">{error}</p>}
      {(documents.length > 0 || uploading.length > 0) && (
        <ul className="document-list" aria-label="Attached documents">
          {documents.map(doc => {
            const Icon = doc.type.startsWith("image/") ? ImageIcon : FileText
            return (
              <li key={doc.id} className="document-row">
                <span className="document-icon"><Icon aria-hidden="true" /></span>
                <div>
                  <p title={doc.name}>{doc.url ? <a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.name}</a> : doc.name}</p>
                  <small>{formatFileSize(doc.size)} · uploaded</small>
                </div>
                <Check className="document-ok" aria-label="Uploaded" />
                <button type="button" className="document-remove" aria-label={`Remove ${doc.name}`} onClick={() => onChange(documents.filter(item => item.id !== doc.id))}><X /></button>
              </li>
            )
          })}
          {uploading.map((name, index) => (
            <li key={`${name}-${index}`} className="document-row" role="status">
              <span className="document-icon"><LoaderCircle className="document-spin" aria-hidden="true" /></span>
              <div><p title={name}>{name}</p><small>Uploading…</small></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
