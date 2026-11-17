import { useMemo } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { Eye, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/language-context"
import { useIdentity, type MyProfile } from "@/lib/profile"
import { useStore } from "@/lib/store"
import { savedResearch, savedTeachingInterests } from "../profile-data"
import { profileSections, type Entry } from "../qualifications/sections"
import { programmes } from "../teaching/teachingMock"
import { PublicProfile, type PublicProfileData } from "./PublicProfile"

type Props = { open: boolean; onClose: () => void; profile: MyProfile; entries: Record<string, Entry[]> }

/** Visitors only see entries an admin has approved, as on the public CV */
const isPublic = (entry: Entry) => entry.status === "approved"

/**
 * "Preview public profile": the owner's saved profile exactly as other people see it, with a note on what's left out.
 */
export function PublicProfilePreview({ open, onClose, profile, entries }: Props) {
  const identity = useIdentity()
  const { language } = useLanguage()
  const interests = useStore(savedTeachingInterests)
  const research = useStore(savedResearch)

  const data = useMemo<PublicProfileData>(() => {
    // The biography in the interface language, or the other one when that's all there is
    const preferred = language === "KA" ? "ka" : "en"
    const fallback = preferred === "ka" ? "en" : "ka"
    const lang = profile.biography[preferred]?.trim() ? preferred : profile.biography[fallback]?.trim() ? fallback : null
    return {
      name: identity.fullName,
      initials: identity.initials,
      photo: profile.photo_url,
      place: [identity.position, identity.department, identity.faculty].filter(Boolean),
      organization: identity.organization,
      email: identity.email,
      biography: lang ? { html: profile.biography[lang]!, lang } : null,
      qualifications: profileSections
        .map(section => ({ section, entries: (entries[section.id] ?? []).filter(isPublic) }))
        .filter(group => group.entries.length > 0),
      teaching: { interests, programmes },
      research,
    }
  }, [identity, language, profile, entries, interests, research])

  const hidden = Object.values(entries).flat().filter(entry => !isPublic(entry))
  const pending = hidden.filter(entry => entry.status === "submitted").length
  const notShown = hidden.length - pending

  return (
    <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="confirm-backdrop public-preview-backdrop" />
        <Dialog.Popup className="public-preview">
          <div className="public-preview-header">
            <div>
              <Dialog.Title className="public-preview-title"><Eye aria-hidden="true" />Preview of your public profile</Dialog.Title>
              <Dialog.Description className="public-preview-description">
                This is how colleagues see your profile. It shows saved information only.
              </Dialog.Description>
            </div>
            <Dialog.Close render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close preview" />}><X /></Dialog.Close>
          </div>

          {hidden.length > 0 && (
            <p className="public-preview-note">
              Only entries approved by a reviewer appear here.
              {pending > 0 && ` ${pending === 1 ? "1 entry is" : `${pending} entries are`} waiting for review.`}
              {notShown > 0 && ` ${notShown === 1 ? "1 draft or rejected entry is" : `${notShown} drafts or rejected entries are`} hidden.`}
            </p>
          )}

          <div className="public-preview-body">
            <PublicProfile data={data} />
          </div>

          <div className="public-preview-footer">
            <Dialog.Close render={<Button className="dashboard-button" />}>Back to editing</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
