import { useRef, useState, type DragEvent } from "react"
import { Check, FileText, Image as ImageIcon, Upload, X } from "lucide-react"
import { formatFileSize, type EntryDocument } from "./sections"

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"]
const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 5

type Props = { label: string; documents: EntryDocument[]; onChange: (documents: EntryDocument[]) => void }

/** Supporting-document drop zone. Front end only: keeps file metadata, nothing is uploaded. */
export function DocumentUpload({ label, documents, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const added: EntryDocument[] = []
    const problems: string[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type)) problems.push(`${file.name}: use a PDF, JPG or PNG file.`)
      else if (file.size > MAX_BYTES) problems.push(`${file.name}: larger than 10 MB.`)
      else added.push({ id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type })
    }
    const room = MAX_FILES - documents.length
    if (added.length > room) problems.push(`You can attach up to ${MAX_FILES} files.`)
    setError(problems.length ? problems.join(" ") : null)
    // TODO: upload the files to the server here once the back end exists
    if (room > 0 && added.length) onChange([...documents, ...added.slice(0, room)])
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
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
      <input ref={input} type="file" accept={ACCEPTED.join(",")} multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = "" }} />
      {error && <p className="field-error" role="alert">{error}</p>}
      {documents.length > 0 && (
        <ul className="document-list" aria-label="Attached documents">
          {documents.map(doc => {
            const Icon = doc.type.startsWith("image/") ? ImageIcon : FileText
            return (
              <li key={doc.id} className="document-row">
                <span className="document-icon"><Icon aria-hidden="true" /></span>
                <div>
                  <p title={doc.name}>{doc.name}</p>
                  <small>{formatFileSize(doc.size)} · uploaded</small>
                </div>
                <Check className="document-ok" aria-label="Uploaded" />
                <button type="button" className="document-remove" aria-label={`Remove ${doc.name}`} onClick={() => onChange(documents.filter(item => item.id !== doc.id))}><X /></button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
