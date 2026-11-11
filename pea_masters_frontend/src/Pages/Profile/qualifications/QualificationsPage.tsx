import { useState } from "react"
import { Navigate, useLocation, useNavigate, useParams } from "react-router"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Check, Eye, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { ProfileEntryForm } from "./ProfileEntryForm"
import { SectionNav } from "./SectionNav"
import { StatusBadge } from "./StatusBadge"
import { useQualifications } from "./qualifications-store"
import { attachmentMeta, capitalize, findSection, sections, type Entry, type SectionDef } from "./sections"
import "./QualificationsPage.css"

const entryTitle = (section: SectionDef, entry: Entry) => section.titleOf(entry.values) || `Untitled ${section.noun}`

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

function ConfirmDelete({ title, onConfirm, onCancel }: { title: string | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <AlertDialog.Root open={title !== null} onOpenChange={open => { if (!open) onCancel() }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="confirm-backdrop" />
        <AlertDialog.Popup className="confirm-dialog">
          <AlertDialog.Title className="confirm-title">Delete this entry?</AlertDialog.Title>
          <AlertDialog.Description className="confirm-description">“{title}” will be removed from your profile. This can't be undone.</AlertDialog.Description>
          <div className="confirm-actions">
            <AlertDialog.Close render={<Button variant="outline" className="dashboard-button" />}>Cancel</AlertDialog.Close>
            <Button className="dashboard-button danger-solid" onClick={onConfirm}>Delete</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

/** /profile/qualifications/:sectionId */
export function QualificationsPage() {
  const { sectionId, entryId } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { entries, deleteEntry, notice, flash } = useQualifications()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // No section in the URL (the sidebar link): show the first one directly. A <Navigate> here would render
  // an empty frame first (router updates are transitions), which shows up as a flicker.
  const section = sectionId === undefined ? sections[0] : findSection(sectionId)
  if (!section) return <Navigate to={`/profile/qualifications/${sections[0].id}`} replace />

  const base = `/profile/qualifications/${section.id}`
  const list = entries[section.id] ?? []
  const editorOpen = pathname.endsWith("/new") || entryId !== undefined
  const editingEntry = entryId ? list.find(entry => entry.id === entryId) : null
  if (section.id === "languages") return <Navigate to="/profile/qualifications/languages" replace />
  if (entryId && !editingEntry) return <Navigate to={base} replace />
  const rejected = list.filter(entry => entry.status === "rejected")
  const deleting = list.find(entry => entry.id === deleteId)

  const confirmDelete = () => {
    if (!deleteId) return
    deleteEntry(section.id, deleteId)
    setDeleteId(null)
    flash(`${capitalize(section.noun)} deleted.`)
  }

  return (
    <WorkspaceLayout breadcrumb={[{ label: "My profile", to: "/profile/general" }, { label: "Professional & qualifications" }]}>
      {openPanel => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>Professional &amp; qualifications</h1>
              <p>Awards, memberships, patents, committees, employment, education, languages, consultancy and more.</p>
            </div>
            <Button variant="outline" className="dashboard-button" onClick={() => openPanel("Preview public profile")}><Eye />Preview public profile</Button>
          </div>

          <div className="qualifications-layout">
            <SectionNav currentId={section.id} />

            <section className="section-panel" aria-labelledby="section-heading">
              <div className="section-heading">
                <div>
                  <h2 id="section-heading">{section.label}</h2>
                  <p>{section.description}</p>
                </div>
                <Button className="dashboard-button" disabled={editorOpen} onClick={() => navigate(`${base}/new`)}><Plus />Add {section.noun}</Button>
              </div>

              <p className="section-notice" role="status">{notice && <><Check aria-hidden="true" />{notice}</>}</p>

              {rejected.length > 0 && (
                <div className="rejected-banner">
                  <TriangleAlert aria-hidden="true" />
                  <div>
                    <p>{rejected.length === 1 ? "1 entry was rejected" : `${rejected.length} entries were rejected`}</p>
                    {rejected.map(entry => (
                      <small key={entry.id}>{entryTitle(section, entry)}: “{entry.adminComment ?? "See the reviewer's comment."}” Edit the entry and resubmit.</small>
                    ))}
                  </div>
                  <Button variant="outline" className="fix-button" disabled={editorOpen} onClick={() => navigate(`${base}/${rejected[0].id}/edit`)}>Fix entry</Button>
                </div>
              )}

              {editorOpen && <ProfileEntryForm key={`${section.id}/${entryId ?? "new"}`} section={section} entry={editingEntry ?? null} onClose={() => navigate(base)} />}

              {list.length === 0 ? (
                <div className="empty-state">
                  <section.icon aria-hidden="true" />
                  <p>No {section.label.toLowerCase()} yet</p>
                  <small>Add your first {section.noun}. It will be reviewed by your faculty admin.</small>
                  <Button variant="outline" className="dashboard-button" disabled={editorOpen} onClick={() => navigate(`${base}/new`)}><Plus />Add {section.noun}</Button>
                </div>
              ) : (
                <div className="entry-list">
                  {list.map(entry => (
                    <EntryCard disabled={editorOpen} key={entry.id} section={section} entry={entry} onEdit={() => navigate(`${base}/${entry.id}/edit`)} onDelete={() => setDeleteId(entry.id)} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <ConfirmDelete title={deleting ? entryTitle(section, deleting) : null} onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />
        </div>
      )}
    </WorkspaceLayout>
  )
}
