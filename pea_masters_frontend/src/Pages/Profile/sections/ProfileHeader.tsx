import { Eye, Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useIdentity, useProfile } from "@/lib/profile"

/** Top of the profile: photo, name, position and where the person works. Set by the organization, not editable here. */
export function ProfileHeader({ onPreview }: { onPreview: () => void }) {
  const identity = useIdentity()
  const { photo } = useProfile()
  const place = [identity.position, identity.department, identity.faculty].filter(Boolean)
  return (
    <section className="dashboard-card profile-header" aria-label="Your details">
      <div className="profile-header-avatar" aria-hidden="true">{photo ? <img src={photo} alt="" /> : identity.initials}</div>
      <div className="profile-header-text">
        <h1>{identity.fullName || "My profile"}</h1>
        <p>{place.length ? place.join(" · ") : identity.organization || "No department yet"}</p>
        <small><Mail aria-hidden="true" />{identity.email}</small>
        <small className="profile-header-note"><Lock aria-hidden="true" />Name, department and position are set by your organization's Admin.</small>
      </div>
      <Button variant="outline" className="dashboard-button" onClick={onPreview}><Eye />Preview public profile</Button>
    </section>
  )
}
