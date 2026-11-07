import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Check, Info, Lock, Save } from "lucide-react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/ui/app-sidebar"
import { AppTopbar, Breadcrumb } from "@/components/layout/AppTopbar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useLanguage } from "@/lib/language-context"
import { RichTextEditor } from "./RichTextEditor"
import { htmlTextLength } from "./html-text"
import { PhotoUpload } from "./PhotoUpload"
import { BIOGRAPHY_MAX_LENGTH, initialGeneralInformation, institutionalInformation as institution, type GeneralInformation } from "./profileMock"
import "./GeneralInformationPage.css"

const AUTOSAVE_DELAY = 1200

const languageCopy = {
  EN: { name: "English", other: "ქართული", otherPurpose: "Georgian", htmlLang: "en" },
  KA: { name: "Georgian", other: "English", otherPurpose: "English", htmlLang: "ka" },
} as const

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function timeAgo(timestamp: number, now: number) {
  const minutes = Math.floor((now - timestamp) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ago`
}

function InfoBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="info-banner">
      <Info aria-hidden="true" />
      <div><p>{title}</p><small>{children}</small></div>
    </div>
  )
}

function ReadOnlyField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`readonly-field ${className ?? ""}`}>
      <dt>{label}<Lock aria-label="Locked" /></dt>
      <dd>{value}</dd>
    </div>
  )
}

export function GeneralInformationPage() {
  const { language } = useLanguage()
  const copy = languageCopy[language]

  const [saved, setSaved] = useState<GeneralInformation>(initialGeneralInformation)
  const [draft, setDraft] = useState<GeneralInformation>(initialGeneralInformation)
  const [editorVersion, setEditorVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)
  const [panel, setPanel] = useState<string | null>(null)

  // Simulated draft autosave (no back end yet)
  const [lastAutoSaved, setLastAutoSaved] = useState(() => Date.now() - 2 * 60000)
  const [autoSaving, setAutoSaving] = useState(false)
  const autosaveTimer = useRef<number | undefined>(undefined)
  const now = useNow(30000)

  const characterCount = useMemo(() => htmlTextLength(draft.biography[language]), [draft.biography, language])
  const overLimit = characterCount > BIOGRAPHY_MAX_LENGTH
  const dirty = draft.photo !== saved.photo || (Object.keys(draft.biography) as (keyof GeneralInformation["biography"])[]).some(lang => draft.biography[lang] !== saved.biography[lang])

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  useEffect(() => () => window.clearTimeout(autosaveTimer.current), [])

  const updateBiography = (html: string) => {
    setDraft(current => ({ ...current, biography: { ...current.biography, [language]: html } }))
    setSavedNotice(false)
    setAutoSaving(true)
    window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      // TODO: persist the draft through the API once the back end exists
      setAutoSaving(false)
      setLastAutoSaved(Date.now())
    }, AUTOSAVE_DELAY)
  }

  const cancel = () => {
    window.clearTimeout(autosaveTimer.current)
    setAutoSaving(false)
    setDraft(saved)
    setEditorVersion(version => version + 1) // reload the editor with the saved content
    setSavedNotice(false)
  }

  const save = () => {
    setSaving(true)
    // TODO: replace with the real API call
    window.setTimeout(() => {
      setSaved(draft)
      setSaving(false)
      setSavedNotice(true)
      setLastAutoSaved(Date.now())
    }, 600)
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "264px" } as CSSProperties}>
      <AppSidebar onNavigate={setPanel} />
      <main className="dashboard-main">
        <AppTopbar onNavigate={setPanel}>
          <Breadcrumb items={[{ label: "My profile", to: "/profile/general" }, { label: "General information" }]} />
        </AppTopbar>

        <div className="dashboard-content profile-content">
          <div className="page-heading">
            <div>
              <h1>General information</h1>
              <p>Your biography and photo appear on your public profile.</p>
            </div>
            <div className="page-actions">
              <span className="save-status" role="status">{savedNotice && !dirty && <><Check aria-hidden="true" />Changes saved</>}</span>
              <Button variant="outline" className="dashboard-button" disabled={!dirty || saving} onClick={cancel}>Cancel</Button>
              <Button className="dashboard-button" disabled={!dirty || saving || overLimit} onClick={save}><Save />{saving ? "Saving…" : "Save changes"}</Button>
            </div>
          </div>

          <section className="dashboard-card profile-card" aria-labelledby="biography-heading">
            <div className="card-heading"><h2 id="biography-heading">Biography</h2></div>
            <InfoBanner title={`You are entering information in ${copy.name}`}>
              Content you enter is saved in the interface language you selected ({language}). Switch to <span lang={language === "EN" ? "ka" : "en"}>{copy.other}</span> in the top bar to enter {copy.otherPurpose} text.
            </InfoBanner>
            <RichTextEditor
              key={`${language}-${editorVersion}`}
              initialHtml={draft.biography[language]}
              onChange={updateBiography}
              maxLength={BIOGRAPHY_MAX_LENGTH}
              label={`Biography (${copy.name})`}
              placeholder={`Write a short biography in ${copy.name}…`}
              lang={copy.htmlLang}
            />
            <div className="editor-footer">
              <span>{autoSaving ? "Saving draft…" : `Saved automatically · last saved ${timeAgo(lastAutoSaved, now)}`}</span>
              <span className={overLimit ? "over-limit" : undefined}>{characterCount} / {BIOGRAPHY_MAX_LENGTH} characters</span>
            </div>
          </section>

          <section className="dashboard-card profile-card" aria-labelledby="photo-heading">
            <div className="card-heading"><h2 id="photo-heading">Photograph</h2></div>
            <PhotoUpload photo={draft.photo} initials={institution.initials} onChange={photo => { setDraft(current => ({ ...current, photo })); setSavedNotice(false) }} />
          </section>

          <section className="dashboard-card profile-card" aria-labelledby="institution-heading">
            <div className="card-heading"><h2 id="institution-heading">Institutional information</h2></div>
            <dl className="readonly-grid">
              <ReadOnlyField className="half" label="Full name" value={institution.fullName} />
              <ReadOnlyField className="half" label="Email" value={institution.email} />
              <ReadOnlyField label="Faculty / School" value={institution.faculty} />
              <ReadOnlyField label="Direction" value={institution.direction} />
              <ReadOnlyField label="Academic position" value={institution.position} />
            </dl>
            <InfoBanner title="Managed by your faculty admin">
              To change your faculty, direction or position, contact your admin.
            </InfoBanner>
          </section>
        </div>
      </main>

      <Sheet open={panel !== null} onOpenChange={open => { if (!open) setPanel(null) }}>
        <SheetContent className="dashboard-panel">
          <SheetHeader>
            <SheetTitle>{panel}</SheetTitle>
            <SheetDescription>This feature will be connected when the rest of the application is built.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
