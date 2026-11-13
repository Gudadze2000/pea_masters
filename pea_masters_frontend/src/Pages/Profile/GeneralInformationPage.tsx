import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ContentScrollbar } from "@/components/layout/ContentScrollbar"
import { Check, Info, Lock, Save } from "lucide-react"
import { WorkspaceSidebarProvider } from "@/components/layout/WorkspaceSidebarProvider"
import { AppSidebar } from "@/components/ui/app-sidebar"
import { AppTopbar, Breadcrumb } from "@/components/layout/AppTopbar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import { useLanguage, type Language } from "@/lib/language-context"
import { BIOGRAPHY_MAX_LENGTH, removePhoto, saveBiography, uploadPhoto, useIdentity, useMyProfile, type MyProfile } from "@/lib/profile"
import { RichTextEditor } from "./RichTextEditor"
import { htmlTextLength } from "./html-text"
import { PhotoUpload } from "./PhotoUpload"
import "./GeneralInformationPage.css"

const languageCopy = {
  EN: { name: "English", other: "ქართული", otherPurpose: "Georgian", htmlLang: "en", key: "en" },
  KA: { name: "Georgian", other: "English", otherPurpose: "English", htmlLang: "ka", key: "ka" },
} as const

/** What the page edits: biography per interface language, and the photo (URL of the saved one, a new image as a
 *  data URL until it's uploaded, or null for none) */
type Draft = { biography: Record<Language, string>; photo: string | null }

function draftOf(profile: MyProfile): Draft {
  return { biography: { EN: profile.biography.en ?? "", KA: profile.biography.ka ?? "" }, photo: profile.photo_url }
}

function formatSaved(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null
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
      <dd>{value || <span className="readonly-empty">Not set</span>}</dd>
    </div>
  )
}

export function GeneralInformationPage() {
  const { status, profile } = useMyProfile()
  const [panel, setPanel] = useState<string | null>(null)

  return (
    <WorkspaceSidebarProvider>
      <AppSidebar onNavigate={setPanel} />
      <main className="dashboard-main">
        <AppTopbar>
          <Breadcrumb items={[{ label: "My profile", to: "/profile/general" }, { label: "General information" }]} />
        </AppTopbar>

        {profile
          ? <GeneralInformationForm profile={profile} />
          : (
            <div className="dashboard-content profile-content">
              <div className="page-heading"><div><h1>General information</h1></div></div>
              <div className="dashboard-card" role={status === "error" ? "alert" : "status"}>
                {status === "error" ? "Your profile couldn't be loaded. Check your connection and reload the page." : "Loading your profile…"}
              </div>
            </div>
          )}
        <ContentScrollbar />
      </main>

      <Sheet open={panel !== null} onOpenChange={open => { if (!open) setPanel(null) }}>
        <SheetContent className="dashboard-panel">
          <SheetHeader>
            <SheetTitle>{panel}</SheetTitle>
            <SheetDescription>This feature will be connected when the rest of the application is built.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </WorkspaceSidebarProvider>
  )
}

function GeneralInformationForm({ profile }: { profile: MyProfile }) {
  const { language } = useLanguage()
  const copy = languageCopy[language]
  const identity = useIdentity()
  const saved = useMemo(() => draftOf(profile), [profile])
  const [draft, setDraft] = useState<Draft>(saved)
  const [editorVersion, setEditorVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const characterCount = useMemo(() => htmlTextLength(draft.biography[language]), [draft.biography, language])
  const overLimit = characterCount > BIOGRAPHY_MAX_LENGTH
  const biographyChanged = (["EN", "KA"] as const).some(lang => draft.biography[lang] !== saved.biography[lang])
  const dirty = draft.photo !== saved.photo || biographyChanged

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const updateBiography = (html: string) => {
    setDraft(current => ({ ...current, biography: { ...current.biography, [language]: html } }))
    setSavedNotice(false)
  }

  const cancel = () => {
    setDraft(saved)
    setEditorVersion(version => version + 1) // reload the editor with the saved content
    setSavedNotice(false)
    setSaveError(null)
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      let latest = profile
      if (draft.photo !== saved.photo) {
        if (draft.photo === null) latest = await removePhoto()
        else if (draft.photo.startsWith("data:")) latest = await uploadPhoto(await (await fetch(draft.photo)).blob())
      }
      if (biographyChanged) latest = await saveBiography({ en: draft.biography.EN, ka: draft.biography.KA })
      // The server cleans the HTML, so show exactly what it kept
      setDraft(draftOf(latest))
      setEditorVersion(version => version + 1)
      setSavedNotice(true)
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : "Something went wrong. Your changes weren't saved.")
    } finally {
      setSaving(false)
    }
  }

  const lastSaved = formatSaved(profile.updated_at)

  return (
    <div className="dashboard-content profile-content">
      <div className="page-heading">
        <div>
          <h1>General information</h1>
          <p>Your biography and photo appear on your profile and CV.</p>
        </div>
        <div className="page-actions">
          <span className="save-status" role="status">{savedNotice && !dirty && <><Check aria-hidden="true" />Changes saved</>}</span>
          <Button variant="outline" className="dashboard-button" disabled={!dirty || saving} onClick={cancel}>Cancel</Button>
          <Button className="dashboard-button" disabled={!dirty || saving || overLimit} onClick={() => void save()}><Save />{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>

      {saveError && <div className="form-error-summary" role="alert">{saveError}</div>}

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
          <span>{dirty ? "Unsaved changes" : lastSaved ? `Saved · ${lastSaved}` : "Not saved yet"}</span>
          <span className={overLimit ? "over-limit" : undefined}>{characterCount} / {BIOGRAPHY_MAX_LENGTH} characters</span>
        </div>
      </section>

      <section className="dashboard-card profile-card" aria-labelledby="photo-heading">
        <div className="card-heading"><h2 id="photo-heading">Photograph</h2></div>
        <PhotoUpload photo={draft.photo} initials={identity.initials} onChange={photo => { setDraft(current => ({ ...current, photo })); setSavedNotice(false) }} />
      </section>

      <section className="dashboard-card profile-card" aria-labelledby="institution-heading">
        <div className="card-heading"><h2 id="institution-heading">Institutional information</h2></div>
        <dl className="readonly-grid">
          <ReadOnlyField className="half" label="Full name" value={identity.fullName} />
          <ReadOnlyField className="half" label="Email" value={identity.email} />
          <ReadOnlyField label="Faculty / School" value={identity.faculty} />
          <ReadOnlyField label="Department" value={identity.department} />
          <ReadOnlyField label="Academic position" value={identity.position} />
        </dl>
        <InfoBanner title="Managed by your organization">
          Your name comes from your university Google account. Your faculty, department and position are set by your
          organization's PEA Admin; contact them to change these.
        </InfoBanner>
      </section>
    </div>
  )
}
