import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProfileEntryForm } from "../qualifications/ProfileEntryForm"
import { StatusBadge } from "../qualifications/StatusBadge"
import { attachmentMeta, type Entry, type SectionDef } from "../qualifications/sections"
import "../qualifications/QualificationsPage.css"

export const entryTitle = (section: SectionDef, entry: Entry) => section.titleOf(entry.values) || `Untitled ${section.noun}`

function EntryCard({ section, entry, onEdit, onDelete, disabled }: { section: SectionDef; entry: Entry; onEdit: () => void; onDelete: () => void; disabled: boolean }) {
  const title = entryTitle(section, entry)
  const description = section.descriptionOf(entry.values)
  const meta = [...section.metaOf(entry.values), attachmentMeta(entry.documents.length)].filter(item => item !== undefined)
  return (
    <article className="entry-card">
      <div className="entry-card-heading">
        <h3>{title}</h3>
        <div className="entry-card-actions">
          <StatusBadge status={entry.status} />
          <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${title}`} disabled={disabled} onClick={onEdit}><Pencil /></Button>
          <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Delete ${title}`} disabled={disabled} onClick={onDelete}><Trash2 /></Button>
        </div>
      </div>
      {meta.length > 0 && (
        <ul className="entry-meta">
          {meta.map(({ icon: Icon, text, href }) => (
            <li key={text}>
              <Icon aria-hidden="true" />
              {href ? <a href={href} target="_blank" rel="noopener noreferrer">{text}</a> : text}
            </li>
          ))}
        </ul>
      )}
      {description && <p className="entry-description">{description}</p>}
    </article>
  )
}

type Props = {
  section: SectionDef
  entries: Entry[]
  /** Which entry is open in the editor: null = a new one; undefined = editor closed for this section */
  editing: string | null | undefined
  /** Another editor is open somewhere on the page */
  busy: boolean
  onAdd: () => void
  onEdit: (entryId: string) => void
  onDelete: (entryId: string) => void
  onCloseEditor: () => void
}

/** One profile section (Awards, Education, ...): its entries as cards, edited in place. */
export function QualificationSection({ section, entries, editing, busy, onAdd, onEdit, onDelete, onCloseEditor }: Props) {
  const Icon = section.icon
  const rejected = entries.filter(entry => entry.status === "rejected")
  const editingEntry = editing ? entries.find(entry => entry.id === editing) ?? null : null
  const headingId = `${section.id}-heading`

  return (
    <section id={section.id} className="profile-section" aria-labelledby={headingId}>
      <div className="section-heading">
        <div className="section-title">
          <span className="section-icon" aria-hidden="true"><Icon /></span>
          <div>
            <h2 id={headingId}>{section.label}{entries.length > 0 && <span className="count-badge">{entries.length}</span>}</h2>
            <p>{section.description}</p>
          </div>
        </div>
        <Button variant="outline" className="dashboard-button" disabled={busy} onClick={onAdd}><Plus />Add {section.noun}</Button>
      </div>

      {rejected.length > 0 && (
        <div className="rejected-banner">
          <TriangleAlert aria-hidden="true" />
          <div>
            <p>{rejected.length === 1 ? "1 entry was rejected" : `${rejected.length} entries were rejected`}</p>
            {rejected.map(entry => (
              <small key={entry.id}>{entryTitle(section, entry)}: “{entry.adminComment ?? "See the reviewer's comment."}” Edit the entry and resubmit.</small>
            ))}
          </div>
          <Button variant="outline" className="fix-button" disabled={busy} onClick={() => onEdit(rejected[0].id)}>Fix entry</Button>
        </div>
      )}

      {editing !== undefined && (
        <ProfileEntryForm key={`${section.id}/${editing ?? "new"}`} section={section} entry={editingEntry} onClose={onCloseEditor} />
      )}

      {entries.length > 0 && (
        <div className="entry-list">
          {entries.map(entry => (
            <EntryCard key={entry.id} section={section} entry={entry} disabled={busy}
              onEdit={() => onEdit(entry.id)} onDelete={() => onDelete(entry.id)} />
          ))}
        </div>
      )}
    </section>
  )
}
