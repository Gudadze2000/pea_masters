import { useEffect, useMemo, useState } from "react"
import { Check, Info, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { useLanguage, type Language } from "@/lib/language-context"
import { BIOGRAPHY_MAX_LENGTH, removePhoto, saveBiography, uploadPhoto, useIdentity, type MyProfile } from "@/lib/profile"
import { htmlTextLength } from "../html-text"
import { PhotoUpload } from "../PhotoUpload"
import { RichTextEditor } from "../RichTextEditor"
import "../GeneralInformationPage.css"

const languageCopy = {
  EN: { name: "English", other: "ქართული", otherPurpose: "Georgian", htmlLang: "en" },
  KA: { name: "Georgian", other: "English", otherPurpose: "English", htmlLang: "ka" },
} as const

/** What this section edits: biography per interface language, and the photo (URL of the saved one, a new image as a
 *  data URL until it's uploaded, or null for none) */
type Draft = { biography: Record<Language, string>; photo: string | null }

function draftOf(profile: MyProfile): Draft {
  return { biography: { EN: profile.biography.en ?? "", KA: profile.biography.ka ?? "" }, photo: profile.photo_url }
}

function formatSaved(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null
}

/** General information: biography (English and Georgian) and photo, saved on the server. */
export function AboutSection({ profile }: { profile: MyProfile }) {
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
    <section id="general" className="profile-section" aria-labelledby="general-heading">
      <div className="section-heading">
        <div>
          <h2 id="general-heading">General information</h2>
          <p>Your biography and photo appear on your profile and CV.</p>
        </div>
        <div className="page-actions">
          <span className="save-status" role="status">{savedNotice && !dirty && <><Check aria-hidden="true" />Changes saved</>}</span>
          {dirty && <Button variant="outline" className="dashboard-button" disabled={saving} onClick={cancel}>Cancel</Button>}
          <Button className="dashboard-button" disabled={!dirty || saving || overLimit} onClick={() => void save()}><Save />{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>

      {saveError && <div className="form-error-summary" role="alert">{saveError}</div>}

      <div className="dashboard-card profile-card">
        <div className="card-heading"><h3>Biography</h3></div>
        <div className="info-banner">
          <Info aria-hidden="true" />
          <div>
            <p>You are entering information in {copy.name}</p>
            <small>
              Content you enter is saved in the interface language you selected ({language}). Switch to <span lang={language === "EN" ? "ka" : "en"}>{copy.other}</span> in the top bar to enter {copy.otherPurpose} text.
            </small>
          </div>
        </div>
        <RichTextEditor
          key={`${language}-${editorVersion}`}
          initialHtml={draft.biography[language]}
          onChange={html => { setDraft(current => ({ ...current, biography: { ...current.biography, [language]: html } })); setSavedNotice(false) }}
          maxLength={BIOGRAPHY_MAX_LENGTH}
          label={`Biography (${copy.name})`}
          placeholder={`Write a short biography in ${copy.name}…`}
          lang={copy.htmlLang}
        />
        <div className="editor-footer">
          <span>{dirty ? "Unsaved changes" : lastSaved ? `Saved · ${lastSaved}` : "Not saved yet"}</span>
          <span className={overLimit ? "over-limit" : undefined}>{characterCount} / {BIOGRAPHY_MAX_LENGTH} characters</span>
        </div>
      </div>

      <div className="dashboard-card profile-card">
        <div className="card-heading"><h3>Photograph</h3></div>
        <PhotoUpload photo={draft.photo} initials={identity.initials} onChange={photo => { setDraft(current => ({ ...current, photo })); setSavedNotice(false) }} />
      </div>
    </section>
  )
}
