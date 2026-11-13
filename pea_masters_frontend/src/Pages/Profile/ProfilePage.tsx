import { useEffect, useMemo, useState } from "react"
import { Navigate, useLocation, useParams } from "react-router"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Check, CircleDashed, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { useMyProfile } from "@/lib/profile"
import { useQualifications } from "./qualifications/qualifications-store"
import { capitalize, sections, type SectionDef } from "./qualifications/sections"
import { AboutSection } from "./sections/AboutSection"
import { LanguagesSection } from "./sections/LanguagesSection"
import { ProfileHeader } from "./sections/ProfileHeader"
import { entryTitle, QualificationSection } from "./sections/QualificationSection"
import { ResearchSection } from "./sections/ResearchSection"
import { TeachingSection } from "./sections/TeachingSection"
import "./ProfilePage.css"

/** Order on the page: background first, then achievements, then service and other activities */
const ORDER = ["education", "employment", "languages", "awards", "patents", "memberships", "committees", "consultancy", "creative", "other"]
const ordered: SectionDef[] = ORDER.map(id => sections.find(section => section.id === id)).filter((s): s is SectionDef => !!s)

type Editor = { sectionId: string; entryId: string | null }
/** Router state for links that open an editor, e.g. from a notification */
export type ProfileLinkState = { add?: string; edit?: Editor }

function scrollToSection(id: string, behavior: ScrollBehavior = "smooth") {
  const element = document.getElementById(id)
  if (!element) return false
  element.scrollIntoView({ behavior, block: "start" })
  history.replaceState(history.state, "", `#${id}`)
  return true
}

/**
 * My profile, on one page: who you are, your biography and photo, the qualification sections you've filled in,
 * one place to add the others, then teaching and research. A contents list on the side jumps to each part.
 */
export function ProfilePage() {
  const { status, profile } = useMyProfile()
  const { entries, deleteEntry, notice, flash } = useQualifications()
  const location = useLocation()
  const linkState = location.state as ProfileLinkState | null
  const [editor, setEditor] = useState<Editor | null>(() =>
    linkState?.edit ?? (linkState?.add ? { sectionId: linkState.add, entryId: null } : null))
  /** Empty sections the person chose to add to, so they show even before the first entry is saved */
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set(linkState?.add ? [linkState.add] : []))
  const [deleting, setDeleting] = useState<Editor | null>(null)
  const [active, setActive] = useState("general")

  const isShown = (section: SectionDef) => (entries[section.id]?.length ?? 0) > 0 || revealed.has(section.id) || editor?.sectionId === section.id
  const shown = ordered.filter(isShown)
  const hidden = ordered.filter(section => !isShown(section))

  // Arriving at /profile#awards (or from an old address): scroll there once the sections exist
  const hash = location.hash.slice(1)
  useEffect(() => {
    if (!hash || !profile) return
    const frame = requestAnimationFrame(() => scrollToSection(hash, "auto"))
    return () => cancelAnimationFrame(frame)
  }, [hash, profile])

  // Highlight the part of the page being read in the contents list
  const ids = useMemo(() => ["general", ...shown.map(s => s.id), ...(hidden.length ? ["add-more"] : []), "teaching", "research"], [shown, hidden.length])
  useEffect(() => {
    const observer = new IntersectionObserver(observed => {
      const visible = observed.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: "-10% 0px -70% 0px" })
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [ids, profile])

  const openEditor = (sectionId: string, entryId: string | null) => {
    setEditor({ sectionId, entryId })
    setRevealed(current => new Set(current).add(sectionId))
    requestAnimationFrame(() => scrollToSection(sectionId))
  }

  const closeEditor = () => {
    const sectionId = editor?.sectionId
    setEditor(null)
    // An empty section goes back to "Add to your profile" when nothing was saved in it
    if (sectionId && (entries[sectionId]?.length ?? 0) === 0) {
      setRevealed(current => { const next = new Set(current); next.delete(sectionId); return next })
    }
  }

  const confirmDelete = () => {
    if (!deleting) return
    const section = ordered.find(s => s.id === deleting.sectionId)
    deleteEntry(deleting.sectionId, deleting.entryId!)
    setDeleting(null)
    flash(`${capitalize(section?.noun ?? "entry")} deleted.`)
  }

  const deletingSection = deleting ? ordered.find(s => s.id === deleting.sectionId) : undefined
  const deletingEntry = deleting && deletingSection ? entries[deleting.sectionId]?.find(e => e.id === deleting.entryId) : undefined

  return (
    <WorkspaceLayout breadcrumb={[{ label: "My profile" }]}>
      {openPanel => !profile ? (
        <div className="dashboard-content">
          <div className="page-heading"><div><h1>My profile</h1></div></div>
          <div className="dashboard-card" role={status === "error" ? "alert" : "status"}>
            {status === "error" ? "Your profile couldn't be loaded. Check your connection and reload the page." : "Loading your profile…"}
          </div>
        </div>
      ) : (
        <div className="dashboard-content profile-page">
          <div className="profile-layout">
            <div className="profile-main">
              <ProfileHeader onPreview={() => openPanel("Preview public profile")} />

              <p className="section-notice profile-notice" role="status">{notice && <><Check aria-hidden="true" />{notice}</>}</p>

              <AboutSection profile={profile} />

              <p className="profile-group-label">Professional &amp; qualifications</p>
              {shown.map(section => section.id === "languages"
                ? <LanguagesSection key={section.id} onEmptied={() => setRevealed(current => { const next = new Set(current); next.delete("languages"); return next })} />
                : (
                  <QualificationSection
                    key={section.id}
                    section={section}
                    entries={entries[section.id] ?? []}
                    editing={editor?.sectionId === section.id ? editor.entryId : undefined}
                    busy={editor !== null}
                    onAdd={() => openEditor(section.id, null)}
                    onEdit={entryId => openEditor(section.id, entryId)}
                    onDelete={entryId => setDeleting({ sectionId: section.id, entryId })}
                    onCloseEditor={closeEditor}
                  />
                ))}

              {hidden.length > 0 && (
                <section id="add-more" className="dashboard-card add-more" aria-labelledby="add-more-heading">
                  <h2 id="add-more-heading">Add to your profile</h2>
                  <p>Sections you haven't filled in yet. Add only what applies to you.</p>
                  <div className="add-more-chips">
                    {hidden.map(section => {
                      const Icon = section.icon
                      return (
                        <button key={section.id} type="button" className="add-chip" disabled={editor !== null}
                          onClick={() => section.id === "languages"
                            ? (setRevealed(current => new Set(current).add("languages")), requestAnimationFrame(() => scrollToSection("languages")))
                            : openEditor(section.id, null)}>
                          <Icon aria-hidden="true" /><span>{section.label}</span><Plus aria-hidden="true" className="add-chip-plus" />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              <p className="profile-group-label">Teaching &amp; research</p>
              <TeachingSection />
              <ResearchSection />
            </div>

            <nav className="dashboard-card profile-contents" aria-label="On this page">
              <p className="profile-contents-title">On this page</p>
              <ul>
                <ContentsLink id="general" label="General information" active={active} done={!!(profile.biography.en || profile.biography.ka || profile.photo_url)} />
              </ul>
              <p className="profile-contents-group">Professional &amp; qualifications</p>
              <ul>
                {shown.map(section => (
                  <ContentsLink key={section.id} id={section.id} label={section.label} active={active} count={entries[section.id]?.length ?? 0} />
                ))}
                {hidden.length > 0 && (
                  <li>
                    <button type="button" className="contents-add" aria-current={active === "add-more" ? "location" : undefined} onClick={() => scrollToSection("add-more")}>
                      <Plus aria-hidden="true" /><span>Add {hidden.length === 1 ? "1 more section" : `${hidden.length} more sections`}</span>
                    </button>
                  </li>
                )}
              </ul>
              <p className="profile-contents-group">Teaching &amp; research</p>
              <ul>
                <ContentsLink id="teaching" label="Teaching" active={active} />
                <ContentsLink id="research" label="Research" active={active} />
              </ul>
            </nav>
          </div>

          <AlertDialog.Root open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null) }}>
            <AlertDialog.Portal>
              <AlertDialog.Backdrop className="confirm-backdrop" />
              <AlertDialog.Popup className="confirm-dialog">
                <AlertDialog.Title className="confirm-title">Delete this entry?</AlertDialog.Title>
                <AlertDialog.Description className="confirm-description">
                  “{deletingSection && deletingEntry ? entryTitle(deletingSection, deletingEntry) : ""}” will be removed from your profile. This can't be undone.
                </AlertDialog.Description>
                <div className="confirm-actions">
                  <AlertDialog.Close render={<Button variant="outline" className="dashboard-button" />}>Cancel</AlertDialog.Close>
                  <Button className="dashboard-button danger-solid" onClick={confirmDelete}>Delete</Button>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      )}
    </WorkspaceLayout>
  )
}

function ContentsLink({ id, label, active, count, done }: { id: string; label: string; active: string; count?: number; done?: boolean }) {
  return (
    <li>
      <button type="button" aria-current={active === id ? "location" : undefined} onClick={() => scrollToSection(id)}>
        {done !== undefined && (done ? <Check aria-label="Filled in" className="contents-done" /> : <CircleDashed aria-label="Not filled in yet" />)}
        <span>{label}</span>
        {count !== undefined && count > 0 && <span className="count-badge">{count}</span>}
      </button>
    </li>
  )
}

/** Old addresses (/profile/general, /profile/qualifications/awards/new, ...) lead to the right place on the one page. */
export function LegacyProfileRedirect({ to }: { to?: string }) {
  const { sectionId, entryId } = useParams()
  const { pathname } = useLocation()
  const target = to ?? sectionId ?? "general"
  const state: ProfileLinkState | undefined = entryId && sectionId
    ? { edit: { sectionId, entryId } }
    : sectionId && pathname.endsWith("/new") ? { add: sectionId } : undefined
  return <Navigate to={`/profile#${target}`} replace state={state} />
}
